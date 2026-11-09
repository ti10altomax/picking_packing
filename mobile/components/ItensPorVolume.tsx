import { View, Text } from 'react-native'

/**
 * Itens de um documento agrupados por volume (Conferidos, 2026-11-06) — paridade com
 * `frontend/components/pedidos/ItensPorVolume.tsx`.
 *
 * Um bloco por volume ("Caixa 1 · 12 peças", "Fardo OP 1234567") com a quantidade que foi
 * NAQUELE volume; item dividido mostra "2 de 5". O que não está em volume (falta, cancelado
 * ou separado sem lançamento) vai para "Fora de volume". Sem volumes (backend antigo ou
 * documento sem lançamentos) cai na lista simples de antes.
 */

export type ItemDoc = {
  id: number
  sku: string
  descricao: string
  ean: string
  qtd_pedida: number
  qtd_separada: number
  status: 'ok' | 'cancelado' | 'falta'
}

export type VolumeDoc = {
  id: number
  tipo: 'caixa' | 'fardo' | 'outro'
  identificador: string
  op?: string
  fechado_em?: string | null
  itens: { id: number; pedido_item_id: number; qtd: number }[]
}

const TIPO_LABEL: Record<string, string> = { caixa: 'Caixa', fardo: 'Fardo', outro: 'Volume' }

export function tituloVolume(v: VolumeDoc, indice: number) {
  if (v.op) return `${TIPO_LABEL[v.tipo] ?? 'Volume'} OP ${v.op}`
  const base = TIPO_LABEL[v.tipo] ?? 'Volume'
  if (v.identificador && v.identificador.toLowerCase().startsWith(base.toLowerCase())) return v.identificador
  return v.identificador ? `${base} ${v.identificador}` : `${base} ${indice + 1}`
}

function somaEmVolumes(volumes: VolumeDoc[]) {
  const soma = new Map<number, number>()
  for (const v of volumes) for (const vi of v.itens) soma.set(vi.pedido_item_id, (soma.get(vi.pedido_item_id) ?? 0) + vi.qtd)
  return soma
}

function pecas(n: number) {
  return `${n} ${n === 1 ? 'peça' : 'peças'}`
}

function LinhaItem({ item, direita, apagado }: { item?: ItemDoc; direita: React.ReactNode; apagado?: boolean }) {
  return (
    <View className={`flex-row items-start gap-3 px-3 py-2 ${apagado ? 'opacity-60' : ''}`}>
      <View className="flex-1">
        <Text className="text-sm text-ink font-medium" numberOfLines={2}>
          {item ? item.descricao || item.sku : '—'}
        </Text>
        {item ? (
          <Text className="text-xs text-ink-subtle">
            {item.sku}{item.ean ? ` · ${item.ean}` : ''}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-1">{direita}</View>
    </View>
  )
}

export function ItensPorVolume({ itens, volumes }: { itens: ItemDoc[]; volumes: VolumeDoc[] }) {
  if (!itens.length) return <Text className="text-xs text-ink-subtle italic">Sem itens.</Text>
  if (!volumes.length) return <ListaSimples itens={itens} />

  const itemMap = new Map(itens.map((i) => [i.id, i]))
  const emVolumes = somaEmVolumes(volumes)
  const foraDeVolume = itens.filter((i) => i.status !== 'ok' || i.qtd_separada > (emVolumes.get(i.id) ?? 0))

  return (
    <View className="gap-3">
      {volumes.map((v, idx) => {
        const total = v.itens.reduce((s, vi) => s + vi.qtd, 0)
        return (
          <View key={v.id} className="bg-surface-card rounded-lg border border-emerald-500/20 overflow-hidden">
            <View className="flex-row items-center gap-2 px-3 py-2 bg-emerald-500/15 border-b border-emerald-500/20">
              <Text className="text-sm font-semibold text-ink">{tituloVolume(v, idx)}</Text>
              {v.op ? (
                <View className="bg-emerald-600 px-1.5 py-0.5 rounded">
                  <Text className="text-[10px] text-white uppercase">fábrica</Text>
                </View>
              ) : null}
              <Text className="ml-auto text-xs text-ink-muted">
                {v.itens.length} {v.itens.length === 1 ? 'item' : 'itens'} · {pecas(total)}
              </Text>
            </View>
            {v.itens.length === 0 ? (
              <Text className="px-3 py-2 text-xs text-ink-subtle italic">Volume vazio.</Text>
            ) : (
              v.itens.map((vi, i) => {
                const item = itemMap.get(vi.pedido_item_id)
                const dividido = item ? vi.qtd !== item.qtd_pedida : false
                return (
                  <View key={vi.id} className={i > 0 ? 'border-t border-surface-border/60' : ''}>
                    <LinhaItem
                      item={item}
                      direita={
                        <Text className="text-sm font-bold text-ink">
                          {vi.qtd}
                          {item && dividido ? <Text className="text-xs font-normal text-ink-subtle"> de {item.qtd_pedida}</Text> : null}
                        </Text>
                      }
                    />
                  </View>
                )
              })
            )}
          </View>
        )
      })}

      {foraDeVolume.length > 0 ? (
        <View className="rounded-lg border border-dashed border-surface-border overflow-hidden">
          <View className="px-3 py-2 bg-surface-elev/60 border-b border-surface-border">
            <Text className="text-sm font-semibold text-ink-muted">Fora de volume</Text>
          </View>
          {foraDeVolume.map((item, i) => {
            const semVolume = item.qtd_separada - (emVolumes.get(item.id) ?? 0)
            return (
              <View key={item.id} className={i > 0 ? 'border-t border-surface-border/60' : ''}>
                <LinhaItem
                  item={item}
                  apagado={item.status === 'cancelado'}
                  direita={
                    <>
                      {item.status === 'cancelado' ? (
                        <Text className="text-xs text-ink-muted">cancelado</Text>
                      ) : item.status === 'falta' ? (
                        <Text className="text-xs text-orange-300">em falta</Text>
                      ) : semVolume > 0 ? (
                        <Text className="text-xs text-ink-muted">{pecas(semVolume)} sem volume</Text>
                      ) : null}
                      <Text className="text-sm font-bold text-ink">{item.qtd_separada}/{item.qtd_pedida}</Text>
                    </>
                  }
                />
              </View>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

/** Lista plana (comportamento anterior) — usada quando o documento não tem volumes. */
export function ListaSimples({ itens }: { itens: ItemDoc[] }) {
  return (
    <View className="gap-1.5">
      {itens.map((it) => {
        const completo = it.status !== 'ok' || it.qtd_separada >= it.qtd_pedida
        return (
          <View
            key={it.id}
            className={`p-2 rounded-lg ${
              it.status === 'cancelado' ? 'bg-surface-elev/60 opacity-60' :
              it.status === 'falta' ? 'bg-orange-500/10' :
              'bg-surface-card border border-emerald-500/20'
            }`}
          >
            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <Text className="text-sm text-ink font-medium" numberOfLines={2}>
                  {it.descricao || it.sku}
                </Text>
                <Text className="text-xs text-ink-subtle">
                  {it.sku}{it.ean ? ` · ${it.ean}` : ''}
                </Text>
              </View>
              {it.status === 'ok' ? (
                <Text className={`text-sm font-bold ${completo ? 'text-emerald-400' : 'text-ink'}`}>
                  {it.qtd_separada}/{it.qtd_pedida}
                </Text>
              ) : (
                <Text className="text-xs text-ink-muted">{it.status}</Text>
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}
