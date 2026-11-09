'use client'

/**
 * Itens de um documento agrupados por volume (Conferidos, 2026-11-06).
 *
 * Cada volume vira um bloco "Caixa 1 · 12 peças" (ou "Fardo OP 1234567" / "Caixa OP …") com os itens e a
 * quantidade que foi NAQUELE volume; item dividido em mais de um volume mostra "2 de 5".
 * O que não está em volume nenhum (falta, cancelado ou quantidade separada sem lançamento)
 * fica num bloco final "Fora de volume", para nada sumir. Sem volumes (backend antigo ou
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

/** Soma por item do que já está lançado em volumes */
function somaEmVolumes(volumes: VolumeDoc[]) {
  const soma = new Map<number, number>()
  for (const v of volumes) for (const vi of v.itens) soma.set(vi.pedido_item_id, (soma.get(vi.pedido_item_id) ?? 0) + vi.qtd)
  return soma
}

function pecas(n: number) {
  return `${n} ${n === 1 ? 'peça' : 'peças'}`
}

export function ItensPorVolume({ itens, volumes }: { itens: ItemDoc[]; volumes: VolumeDoc[] }) {
  if (!itens.length) return <p className="text-xs text-ink-subtle italic">Sem itens registrados.</p>
  if (!volumes.length) return <ListaSimples itens={itens} />

  const itemMap = new Map(itens.map((i) => [i.id, i]))
  const emVolumes = somaEmVolumes(volumes)
  const foraDeVolume = itens.filter((i) => i.status !== 'ok' || i.qtd_separada > (emVolumes.get(i.id) ?? 0))

  return (
    <div className="space-y-3">
      {volumes.map((v, idx) => {
        const total = v.itens.reduce((s, vi) => s + vi.qtd, 0)
        return (
          <section key={v.id} className="bg-surface-card rounded-lg border border-emerald-100 dark:border-emerald-500/20 shadow-sm overflow-hidden">
            <header className="flex items-center gap-2 px-3 py-2 bg-emerald-100/60 dark:bg-emerald-500/15 border-b border-emerald-100 dark:border-emerald-500/20">
              <span className="text-sm font-semibold text-ink">{tituloVolume(v, idx)}</span>
              {v.op && (
                <span className="text-[10px] uppercase tracking-wide bg-emerald-600 text-white px-1.5 py-0.5 rounded">fábrica</span>
              )}
              <span className="ml-auto text-xs text-ink-muted">
                {v.itens.length} {v.itens.length === 1 ? 'item' : 'itens'} · {pecas(total)}
              </span>
            </header>
            {v.itens.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ink-subtle italic">Volume vazio.</p>
            ) : (
              <ul className="divide-y divide-surface-border/60">
                {v.itens.map((vi) => {
                  const item = itemMap.get(vi.pedido_item_id)
                  // Este volume não leva o item inteiro → "2 de 5"
                  const dividido = item ? vi.qtd !== item.qtd_pedida : false
                  return (
                    <li key={vi.id} className="flex items-start gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink leading-snug">{item ? item.descricao || item.sku : `item #${vi.pedido_item_id}`}</p>
                        {item && (
                          <p className="text-xs text-ink-subtle mt-0.5">
                            {item.sku}
                            {item.ean && (
                              <>
                                <span className="mx-1">·</span>
                                <code className="font-mono">{item.ean}</code>
                              </>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-sm font-bold text-ink">{vi.qtd}</span>
                        {item && dividido && (
                          <span className="text-xs text-ink-subtle"> de {item.qtd_pedida}</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}

      {foraDeVolume.length > 0 && (
        <section className="rounded-lg border border-dashed border-surface-border overflow-hidden">
          <header className="px-3 py-2 bg-surface-elev/60 border-b border-surface-border">
            <span className="text-sm font-semibold text-ink-muted">Fora de volume</span>
          </header>
          <ul className="divide-y divide-surface-border/60">
            {foraDeVolume.map((item) => {
              const semVolume = item.qtd_separada - (emVolumes.get(item.id) ?? 0)
              return (
                <li key={item.id} className={`flex items-start gap-3 px-3 py-2 ${item.status === 'cancelado' ? 'opacity-60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink leading-snug">{item.descricao || item.sku}</p>
                    <p className="text-xs text-ink-subtle mt-0.5">
                      {item.sku}
                      {item.ean && (
                        <>
                          <span className="mx-1">·</span>
                          <code className="font-mono">{item.ean}</code>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right flex flex-col items-end gap-1">
                    {item.status === 'cancelado' && (
                      <span className="text-xs bg-zinc-200 dark:bg-zinc-700 text-ink-muted px-2 py-0.5 rounded-full">cancelado</span>
                    )}
                    {item.status === 'falta' && (
                      <span className="text-xs bg-orange-200 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">em falta</span>
                    )}
                    {item.status === 'ok' && semVolume > 0 && (
                      <span className="text-xs text-ink-muted">{pecas(semVolume)} sem volume</span>
                    )}
                    <span className="text-sm font-bold text-ink">{item.qtd_separada}/{item.qtd_pedida}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Lista plana (comportamento anterior) — usada quando o documento não tem volumes. */
export function ListaSimples({ itens }: { itens: ItemDoc[] }) {
  return (
    <ul className="space-y-1.5">
      {itens.map((item) => {
        const completo = item.status !== 'ok' || item.qtd_separada >= item.qtd_pedida
        return (
          <li
            key={item.id}
            className={`flex items-start gap-3 p-2 rounded-lg ${
              item.status === 'cancelado' ? 'bg-surface-elev/60 opacity-60' :
              item.status === 'falta' ? 'bg-orange-50 dark:bg-orange-500/10' :
              'bg-surface-card shadow-sm border border-emerald-100 dark:border-emerald-500/20'
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink leading-snug">{item.descricao || item.sku}</p>
              <p className="text-xs text-ink-subtle mt-0.5">
                {item.sku}
                {item.ean && (
                  <>
                    <span className="mx-1">·</span>
                    <code className="font-mono">{item.ean}</code>
                  </>
                )}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {item.status === 'cancelado' && (
                <span className="text-xs bg-zinc-200 dark:bg-zinc-700 text-ink-muted px-2 py-0.5 rounded-full">cancelado</span>
              )}
              {item.status === 'falta' && (
                <span className="text-xs bg-orange-200 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">em falta</span>
              )}
              {item.status === 'ok' && (
                <span className={`text-sm font-bold ${completo ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink'}`}>
                  {item.qtd_separada}/{item.qtd_pedida}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
