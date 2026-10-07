'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { DocBadges } from '@/components/ui/DocBadges'
import { ImprimirEtiqueta, escolhaInicial, guardarUltimaImpressora } from '@/components/etiquetas/ImprimirEtiqueta'
import { impressaoApi, type EtiquetaPendente, type ImpressoraEtiqueta } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

/**
 * Etiquetas de volume pendentes — conferidos (janela do sync) ainda sem
 * impressão `ok`. "Prontas" têm transportadora; "Aguardando transportadora"
 * saem sozinhas quando o Senior preencher (beat), se houver impressora padrão.
 */

function fmt(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function EtiquetasPendentesPage() {
  const { user } = useAuthStore()
  const [prontas, setProntas] = useState<EtiquetaPendente[]>([])
  const [aguardando, setAguardando] = useState<EtiquetaPendente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [impressoras, setImpressoras] = useState<ImpressoraEtiqueta[]>([])
  const [padrao, setPadrao] = useState<number | null>(null)
  const [automatica, setAutomatica] = useState(true)
  const [destinoLote, setDestinoLote] = useState<number | 'navegador'>('navegador')
  const [lote, setLote] = useState<{ total: number; feitas: number; erros: string[] } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [p, i] = await Promise.all([impressaoApi.pendentes(), impressaoApi.impressoras()])
      setProntas(p.prontas)
      setAguardando(p.aguardando_transportadora)
      setImpressoras(i.impressoras)
      setPadrao(i.impressora_padrao)
      setAutomatica(i.automatica)
      setDestinoLote(escolhaInicial(i.impressoras))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function imprimirTodas() {
    if (destinoLote === 'navegador') {
      // Navegador: abre uma aba por pedido — o usuário imprime cada uma
      prontas.forEach((p) => window.open(`/etiquetas/${p.id}`, '_blank', 'noopener'))
      return
    }
    guardarUltimaImpressora(String(destinoLote))
    setLote({ total: prontas.length, feitas: 0, erros: [] })
    for (const p of prontas) {
      try {
        await impressaoApi.imprimir(p.id, { impressora_id: destinoLote })
        setLote((l) => l && { ...l, feitas: l.feitas + 1 })
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro ?? 'falha'
        setLote((l) => l && { ...l, feitas: l.feitas + 1, erros: [...l.erros, `${p.numero_externo}: ${msg}`] })
      }
    }
    await carregar()
  }

  const nomePadrao = impressoras.find((i) => i.id === padrao)?.nome

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Etiquetas de volume</h1>
          <p className="text-sm text-ink-muted">
            Conferidos ainda sem etiqueta impressa · impressão automática{' '}
            <strong className="text-ink">{automatica ? 'ligada' : 'desligada'}</strong>
            {' · '}padrão: <strong className="text-ink">{nomePadrao ?? 'nenhuma'}</strong>
            {user?.perfil === 'admin' && (
              <> · <Link href="/admin/impressoras" className="underline underline-offset-2 hover:text-ink">impressoras</Link></>
            )}
          </p>
        </div>
        <button onClick={carregar} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">Atualizar</button>
      </div>

      {carregando ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : (
        <>
          {/* Prontas */}
          <section className="mb-8">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <h2 className="text-base font-semibold text-ink">
                Prontas para imprimir <span className="text-ink-subtle font-normal">({prontas.length})</span>
              </h2>
              {prontas.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={String(destinoLote)}
                    onChange={(e) => setDestinoLote(e.target.value === 'navegador' ? 'navegador' : Number(e.target.value))}
                    className="bg-surface-card border border-surface-border text-ink rounded-lg px-2 min-h-[40px] text-sm"
                  >
                    {impressoras.map((i) => <option key={i.id} value={i.id}>{i.nome}{i.padrao ? ' (padrão)' : ''}</option>)}
                    <option value="navegador">Navegador</option>
                  </select>
                  <button
                    onClick={imprimirTodas}
                    disabled={!!lote && lote.feitas < lote.total}
                    className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 min-h-[40px] rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    Imprimir todas
                  </button>
                </div>
              )}
            </div>
            {lote && (
              <p className="text-xs text-ink-muted mb-2">
                {lote.feitas}/{lote.total} enviadas{lote.erros.length > 0 && ` · erros: ${lote.erros.join(' · ')}`}
              </p>
            )}
            {prontas.length === 0 ? (
              <p className="text-ink-subtle text-sm py-6 text-center bg-surface-card border border-surface-border rounded-xl">Nada pendente.</p>
            ) : (
              <ul className="bg-surface-card rounded-xl border border-surface-border divide-y divide-surface-border">
                {prontas.map((p) => <Linha key={p.id} p={p} onImpresso={carregar} />)}
              </ul>
            )}
          </section>

          {/* Aguardando transportadora */}
          <section>
            <h2 className="text-base font-semibold text-ink mb-2">
              Aguardando transportadora <span className="text-ink-subtle font-normal">({aguardando.length})</span>
            </h2>
            <p className="text-xs text-ink-muted mb-2">
              Entregas conferidas cujo documento ainda não tem transportadora no Senior. Quando ela chegar, a etiqueta
              sai na impressora padrão automaticamente (ou aparece em "Prontas").
            </p>
            {aguardando.length === 0 ? (
              <p className="text-ink-subtle text-sm py-6 text-center bg-surface-card border border-surface-border rounded-xl">Nenhuma.</p>
            ) : (
              <ul className="bg-surface-card rounded-xl border border-surface-border divide-y divide-surface-border">
                {aguardando.map((p) => <Linha key={p.id} p={p} onImpresso={carregar} />)}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Linha({ p, onImpresso }: { p: EtiquetaPendente; onImpresso: () => void }) {
  return (
    <li className="px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink">{p.numero_externo}</span>
          <DocBadges tipo={p.tipo} frete={p.frete} />
          <span className="text-xs text-ink-subtle">{p.qtd_volumes} vol.</span>
        </div>
        <p className="text-sm text-ink-muted truncate">{p.cliente || '—'}</p>
        <p className="text-xs text-ink-subtle mt-0.5">
          {p.transportadora
            ? <strong className="text-ink">{p.transportadora}</strong>
            : <span className="text-amber-600 dark:text-amber-400">sem transportadora</span>}
          {p.conferido_em && <> · conferido {fmt(p.conferido_em)}</>}
          {p.conferente && <> por <strong className="text-ink">{p.conferente}</strong></>}
          {p.sequencia_numero && <> · seq. {p.sequencia_numero}</>}
        </p>
        {p.ultimo_erro && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">última tentativa: {p.ultimo_erro}</p>
        )}
      </div>
      <ImprimirEtiqueta
        pedidoId={p.id}
        bloqueio={p.pronta ? null : 'Sem transportadora no Senior'}
        onImpresso={onImpresso}
      />
    </li>
  )
}
