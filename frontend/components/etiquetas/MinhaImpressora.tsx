'use client'
import { useCallback, useEffect, useState } from 'react'
import { impressaoApi, type ImpressoraEtiqueta, type ConferenteImpressora } from '@/lib/api'
import { useDialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'

/**
 * Impressora de etiquetas por conferente (2026-11-26). O Pátio tem mais de uma impressora e cada
 * conferente imprime na que está perto; com a dele definida, a etiqueta sai sozinha ao concluir
 * (e quando fica para depois: NF/transportadora que chega, carta dos volumes, fim da cotação).
 *
 * - `MinhaImpressora`: o seletor do próprio conferente, na lista "Atribuídos a mim".
 * - `ImpressorasDosConferentes`: a gestão em Admin → Impressoras, com o "passar todos de uma
 *   impressora para outra" para quando uma delas para.
 */

const SELECT = 'bg-surface-card border border-surface-border text-ink rounded-lg px-2 min-h-[40px] text-sm'

export function MinhaImpressora() {
  const [lista, setLista] = useState<ImpressoraEtiqueta[] | null>(null)
  const [minha, setMinha] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const toast = useToast()

  useEffect(() => {
    impressaoApi.impressoras()
      .then((d) => { setLista(d.impressoras); setMinha(d.minha ?? null) })
      .catch(() => setLista([]))
  }, [])

  async function trocar(valor: string) {
    const id = valor ? Number(valor) : null
    setSalvando(true)
    try {
      const r = await impressaoApi.definirMinhaImpressora(id)
      setMinha(r.impressora?.id ?? null)
      if (r.impressora) toast.ok(`Sua impressora: ${r.impressora.nome}`, { detalhe: 'As etiquetas saem nela ao concluir.' })
      else toast.info('Sem impressora fixa', { detalhe: 'O sistema volta a perguntar ao concluir.' })
    } catch {
      toast.erro('Não deu para trocar a impressora')
    } finally {
      setSalvando(false)
    }
  }

  if (!lista || lista.length === 0) return null
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted" title="As etiquetas das suas conferências saem nesta impressora sozinhas, sem perguntar">
      <span className="whitespace-nowrap">Minha impressora</span>
      <select value={minha ?? ''} disabled={salvando} onChange={(e) => trocar(e.target.value)} className={SELECT}>
        <option value="">Perguntar sempre</option>
        {lista.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
      </select>
    </label>
  )
}

export function ImpressorasDosConferentes({ impressoras }: { impressoras: { id: number; nome: string }[] }) {
  const [conferentes, setConferentes] = useState<ConferenteImpressora[] | null>(null)
  const [salvando, setSalvando] = useState<number | 'todos' | null>(null)
  const [de, setDe] = useState('')
  const [para, setPara] = useState('')
  const dialog = useDialog()
  const toast = useToast()

  const carregar = useCallback(async () => {
    try {
      setConferentes((await impressaoApi.conferentesImpressoras()).conferentes)
    } catch {
      setConferentes([])
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function definir(c: ConferenteImpressora, valor: string) {
    setSalvando(c.id)
    try {
      const r = await impressaoApi.definirImpressoraConferente(c.id, valor ? Number(valor) : null)
      setConferentes((prev) => prev && prev.map((x) => (x.id === c.id ? r : x)))
    } catch {
      toast.erro('Não deu para trocar a impressora')
    } finally {
      setSalvando(null)
    }
  }

  async function trocarTodos() {
    if (!de || !para || de === para) return
    const nomeDe = impressoras.find((i) => String(i.id) === de)?.nome
    const nomePara = impressoras.find((i) => String(i.id) === para)?.nome
    const quantos = (conferentes ?? []).filter((c) => String(c.impressora_id) === de).length
    const ok = await dialog.confirm({
      title: 'Passar todos para outra impressora?',
      message: `${quantos} conferente(s) que imprimem em ${nomeDe} passam a imprimir em ${nomePara}.`,
      confirmText: 'Passar',
      cancelText: 'Voltar',
    })
    if (!ok) return
    setSalvando('todos')
    try {
      const r = await impressaoApi.trocarImpressoraConferentes(Number(de), Number(para))
      toast.ok(`${r.trocados} conferente(s) agora imprimem em ${nomePara}`)
      setDe('')
      setPara('')
      await carregar()
    } catch (e: unknown) {
      toast.erro('Não deu para passar', { detalhe: (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro })
    } finally {
      setSalvando(null)
    }
  }

  if (!conferentes) return null
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-4 mb-6">
      <h2 className="text-sm font-semibold text-ink mb-1">Impressora de cada conferente</h2>
      <p className="text-xs text-ink-muted mb-3">
        Com a impressora definida, a etiqueta sai nela sozinha quando o conferente conclui — mesmo com a impressão automática
        acima desligada. Ele mesmo escolhe e troca na tela "Atribuídos a mim"; aqui é para acertar por ele. "Perguntar sempre" =
        o sistema pergunta ao concluir (e guarda a primeira que ele escolher).
      </p>
      {conferentes.length === 0 ? (
        <p className="text-sm text-ink-subtle">Nenhum conferente ativo.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {conferentes.map((c) => (
            <li key={c.id} className="flex items-center gap-2 border border-surface-border rounded-lg px-3 py-2">
              <span className="flex-1 min-w-0 text-sm text-ink truncate" title={c.nome || c.username}>
                <strong>{c.username}</strong>{c.nome ? <span className="text-ink-subtle"> · {c.nome}</span> : null}
              </span>
              <select
                value={c.impressora_id ?? ''}
                disabled={salvando !== null}
                onChange={(e) => definir(c, e.target.value)}
                className={`${SELECT} max-w-[55%] ${c.impressora_id && c.impressora_ativa === false ? 'border-amber-400' : ''}`}
                title={c.impressora_id && c.impressora_ativa === false ? 'Esta impressora está inativa: o sistema pergunta ao concluir' : undefined}
              >
                <option value="">Perguntar sempre</option>
                {impressoras.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                {c.impressora_id && !impressoras.some((i) => i.id === c.impressora_id) && (
                  <option value={c.impressora_id}>{c.impressora} (inativa)</option>
                )}
              </select>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 pt-3 border-t border-surface-border flex items-center gap-2 flex-wrap text-sm">
        <span className="text-ink-muted">Impressora parada? Passar todos de</span>
        <select value={de} onChange={(e) => setDe(e.target.value)} className={SELECT}>
          <option value="">—</option>
          {impressoras.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
        <span className="text-ink-muted">para</span>
        <select value={para} onChange={(e) => setPara(e.target.value)} className={SELECT}>
          <option value="">—</option>
          {impressoras.filter((i) => String(i.id) !== de).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
        <button
          type="button"
          onClick={trocarTodos}
          disabled={!de || !para || de === para || salvando !== null}
          className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 min-h-[40px] rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          Passar
        </button>
      </div>
    </div>
  )
}
