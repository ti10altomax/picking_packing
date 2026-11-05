import { useEffect, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { supervisorApi, type Localizacao } from '@/lib/api'

/**
 * "Não está nesta lista, mas está ali" (paridade com o web, 2026-11-05). Cada lista só
 * busca no seu status, e procurar em Vendas um pedido que já está em conferência voltava
 * vazio, sem explicação. Vai no ListEmptyComponent quando a busca é um número.
 */

// Paleta de status do CLAUDE.md (tema escuro do app)
const COR: Record<string, { fundo: string; texto: string }> = {
  pendente: { fundo: 'bg-zinc-700', texto: 'text-zinc-200' },
  selecionado: { fundo: 'bg-orange-500/15', texto: 'text-orange-300' },
  atribuido: { fundo: 'bg-yellow-500/15', texto: 'text-yellow-300' },
  conferindo: { fundo: 'bg-blue-500/15', texto: 'text-blue-300' },
  aguardando_fechamento: { fundo: 'bg-violet-500/15', texto: 'text-violet-300' },
  conferido: { fundo: 'bg-emerald-500/15', texto: 'text-emerald-300' },
  nao_conforme: { fundo: 'bg-red-500/15', texto: 'text-red-300' },
  cancelado: { fundo: 'bg-red-500/15', texto: 'text-red-300' },
}

// telas que existem no app (Fechamentos é só no web)
const ROTA: Record<string, (l: Localizacao) => string> = {
  vendas: () => '/supervisor/vendas',
  patio: () => '/supervisor/patio',
  sequencia: (l) => (l.sequencia ? `/supervisor/sequencia/${l.sequencia}` : '/supervisor/patio'),
  conferidos: () => '/supervisor/conferidos',
  nao_conformes: () => '/supervisor/nao-conformes',
  cancelados: () => '/supervisor/cancelados',
}

export function OndeEsta({ busca, lista }: { busca: string; lista: Localizacao['lista'] }) {
  const router = useRouter()
  const [achados, setAchados] = useState<Localizacao[] | null>(null)
  const numero = busca.trim()

  useEffect(() => {
    setAchados(null)
    if (!/^\d+$/.test(numero)) return
    let vivo = true
    supervisorApi.localizar(numero).then((r) => { if (vivo) setAchados(r) }).catch(() => {})
    return () => { vivo = false }
  }, [numero])

  // o que está nesta própria lista já teria aparecido na busca
  const fora = (achados ?? []).filter((l) => l.lista !== lista)
  if (!fora.length) return null

  return (
    <View className="mx-4 mt-2 rounded-2xl border-2 border-blue-500/40 bg-blue-500/10 p-4">
      <Text className="text-base font-bold text-ink">{numero} não está nesta lista — está em outra etapa:</Text>
      {fora.map((l) => {
        const rota = ROTA[l.lista]?.(l)
        const cor = COR[l.status] ?? COR.pendente
        return (
          <View key={l.id} className="mt-3 rounded-xl bg-surface-card border border-surface-border px-3 py-2.5">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-mono font-bold text-ink">
                {l.tipo === 'nota_fiscal' ? 'NF ' : 'Pedido '}{l.numero_externo}
              </Text>
              <View className={`rounded-full px-2.5 py-0.5 ${cor.fundo}`}>
                <Text className={`text-xs font-bold ${cor.texto}`}>{l.status_label}</Text>
              </View>
            </View>
            <Text className="text-sm text-ink-muted mt-1">{l.descricao}</Text>
            {l.via ? <Text className="text-xs text-ink-subtle mt-0.5">{l.via}</Text> : null}
            {rota ? (
              <Pressable
                onPress={() => router.push(rota as never)}
                className="self-start mt-2 h-10 px-4 rounded-lg bg-blue-600 items-center justify-center active:bg-blue-500"
              >
                <Text className="text-sm font-semibold text-white">Ver</Text>
              </Pressable>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
