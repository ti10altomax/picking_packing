'use client'
import { useState } from 'react'
import { supervisorApi, type BloqueioEtiqueta } from '@/lib/api'
import { useToast } from '@/components/Toast'

/**
 * Nota "em cotação" de frete (2026-11-26): a nota tem transportadora, mas ela vai mudar.
 * Enquanto marcada, a etiqueta de volume não sai. Sup. Vendas, Sup. Pátio e admin marcam e
 * tiram; sai sozinha quando a transportadora da nota muda (regra no servidor,
 * apps/pedidos/cotacao.py). O botão serve às três telas: Vendas, sequência e Conferidos.
 */

export type RespostaCotacao = {
  id: number
  em_cotacao: boolean
  codtra?: string
  transportadora?: string
  etiqueta_bloqueio: BloqueioEtiqueta | null
}

/** Selo para a linha do documento (listas em que não há botão Etiqueta) */
export function SeloCotacao() {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-semibold tracking-wide bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"
      title="Em cotação de frete: a transportadora vai mudar e a etiqueta de volume fica segura até lá"
    >
      EM COTAÇÃO
    </span>
  )
}

export function CotacaoBotao({
  pedidoId, numero, emCotacao, onMudou,
}: {
  pedidoId: number
  numero: string
  emCotacao: boolean
  onMudou: (r: RespostaCotacao) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const toast = useToast()

  async function alternar(e: React.MouseEvent) {
    e.stopPropagation()   // a linha inteira é clicável em Vendas e na sequência
    setEnviando(true)
    try {
      const r = await supervisorApi.cotacao(pedidoId, !emCotacao)
      onMudou(r)
      if (r.em_cotacao) toast.ok(`${numero} em cotação`, { detalhe: 'A etiqueta fica segura até a transportadora mudar ou você tirar de cotação.' })
      else toast.ok(`${numero} saiu de cotação`, { detalhe: 'A etiqueta volta a poder ser impressa.' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      toast.erro('Não deu para mudar a cotação', { detalhe: msg })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={enviando}
      title={emCotacao
        ? 'A cotação terminou sem trocar a transportadora? Tire de cotação para liberar a etiqueta'
        : 'A transportadora desta nota vai mudar? Marque em cotação para a etiqueta não sair com a transportadora errada'}
      className={`inline-flex items-center gap-1 text-xs rounded-lg px-2 min-h-[32px] border whitespace-nowrap transition-colors disabled:opacity-50 ${
        emCotacao
          ? 'border-sky-300 text-sky-800 bg-sky-50 hover:bg-sky-100 dark:border-sky-500/40 dark:text-sky-300 dark:bg-sky-500/10'
          : 'border-surface-border text-ink-muted hover:text-ink hover:bg-surface-elev'
      }`}
    >
      {enviando ? '…' : emCotacao ? 'Tirar de cotação' : 'Em cotação'}
    </button>
  )
}
