'use client'
import { useEffect, useState, useCallback } from 'react'
import { adminApi } from '@/lib/api'

type Impressora = {
  id: number
  nome: string
  modelo: string
  tipo_conexao: 'rede' | 'usb'
  formato_preferido: 'zpl' | 'pdf'
  ip: string | null
  porta: number
  agent_id: string
  dpi: number
  largura_mm: number
  altura_mm: number
  mesa: string
  ativa: boolean
  ultimo_heartbeat: string | null
}

const VAZIO: Omit<Impressora, 'id' | 'ativa' | 'ultimo_heartbeat'> = {
  nome: '',
  modelo: '',
  tipo_conexao: 'rede',
  formato_preferido: 'zpl',
  ip: '',
  porta: 9100,
  agent_id: '',
  dpi: 203,
  largura_mm: 100,
  altura_mm: 150,
  mesa: '',
}

export default function ImpressorasPage() {
  const [lista, setLista] = useState<Impressora[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Impressora | null>(null)
  const [form, setForm] = useState({ ...VAZIO })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [testando, setTestando] = useState<number | null>(null)
  const [resultadoTeste, setResultadoTeste] = useState<Record<number, { online: boolean; motivo: string | null }>>({})

  const carregar = useCallback(async () => {
    try {
      const data = await adminApi.listarImpressoras()
      setLista(data)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function abrirCriar() {
    setEditando(null)
    setForm({ ...VAZIO })
    setErro('')
    setModalAberto(true)
  }

  function abrirEditar(imp: Impressora) {
    setEditando(imp)
    setForm({
      nome: imp.nome,
      modelo: imp.modelo,
      tipo_conexao: imp.tipo_conexao,
      formato_preferido: imp.formato_preferido,
      ip: imp.ip ?? '',
      porta: imp.porta,
      agent_id: imp.agent_id,
      dpi: imp.dpi,
      largura_mm: imp.largura_mm,
      altura_mm: imp.altura_mm,
      mesa: imp.mesa,
    })
    setErro('')
    setModalAberto(true)
  }

  async function salvar() {
    setErro('')
    setSalvando(true)
    try {
      if (editando) {
        await adminApi.editarImpressora(editando.id, form)
      } else {
        await adminApi.criarImpressora(form)
      }
      setModalAberto(false)
      await carregar()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErro(msg ?? 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function desativar(imp: Impressora) {
    if (!confirm(`Desativar "${imp.nome}"?`)) return
    await adminApi.desativarImpressora(imp.id)
    await carregar()
  }

  async function testar(imp: Impressora) {
    setTestando(imp.id)
    try {
      const res = await adminApi.testarImpressora(imp.id)
      setResultadoTeste((prev) => ({ ...prev, [imp.id]: res }))
    } finally {
      setTestando(null)
    }
  }

  function statusHeartbeat(imp: Impressora) {
    if (imp.tipo_conexao === 'rede') return null
    if (!imp.ultimo_heartbeat) return <span className="text-xs text-gray-400">sem heartbeat</span>
    const diff = Math.floor((Date.now() - new Date(imp.ultimo_heartbeat).getTime()) / 1000)
    const online = diff < 120
    return (
      <span className={`text-xs ${online ? 'text-green-600' : 'text-red-500'}`}>
        {online ? `online (${diff}s)` : `offline (${diff}s)`}
      </span>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Impressoras</h1>
        <button
          onClick={abrirCriar}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium min-h-[44px]"
        >
          + Nova impressora
        </button>
      </div>

      {carregando ? (
        <p className="text-gray-500">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-gray-400">Nenhuma impressora cadastrada.</p>
      ) : (
        <div className="space-y-3">
          {lista.map((imp) => {
            const teste = resultadoTeste[imp.id]
            return (
              <div
                key={imp.id}
                className={`bg-white rounded-xl border p-4 ${!imp.ativa ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{imp.nome}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{imp.modelo}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${imp.tipo_conexao === 'rede' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {imp.tipo_conexao === 'rede' ? 'Rede' : 'USB'}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase">{imp.formato_preferido}</span>
                      {!imp.ativa && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Inativa</span>}
                    </div>
                    <div className="mt-1 text-sm text-gray-500 space-y-0.5">
                      {imp.tipo_conexao === 'rede' ? (
                        <p>{imp.ip}:{imp.porta}</p>
                      ) : (
                        <p>agent_id: {imp.agent_id || '—'}</p>
                      )}
                      {imp.mesa && <p>Mesa: {imp.mesa}</p>}
                      <p>{imp.dpi} DPI · {imp.largura_mm}×{imp.altura_mm} mm</p>
                      {statusHeartbeat(imp)}
                    </div>
                    {teste && (
                      <p className={`mt-1 text-xs font-medium ${teste.online ? 'text-green-600' : 'text-red-500'}`}>
                        Teste: {teste.online ? 'online ✓' : `offline — ${teste.motivo}`}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => testar(imp)}
                      disabled={testando === imp.id}
                      className="text-xs border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] hover:bg-gray-50 disabled:opacity-50"
                    >
                      {testando === imp.id ? '…' : 'Testar'}
                    </button>
                    <button
                      onClick={() => abrirEditar(imp)}
                      className="text-xs border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] hover:bg-gray-50"
                    >
                      Editar
                    </button>
                    {imp.ativa && (
                      <button
                        onClick={() => desativar(imp)}
                        className="text-xs border border-red-200 text-red-500 rounded-lg px-3 py-2 min-h-[44px] hover:bg-red-50"
                      >
                        Desativar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal criar/editar */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-4">{editando ? 'Editar impressora' : 'Nova impressora'}</h2>

            <div className="space-y-3">
              <Campo label="Nome">
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={INPUT} />
              </Campo>
              <Campo label="Modelo">
                <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} className={INPUT} />
              </Campo>
              <Campo label="Tipo de conexão">
                <select value={form.tipo_conexao} onChange={(e) => setForm({ ...form, tipo_conexao: e.target.value as 'rede' | 'usb' })} className={INPUT}>
                  <option value="rede">Rede (TCP/IP)</option>
                  <option value="usb">USB (via agent)</option>
                </select>
              </Campo>
              <Campo label="Formato preferido">
                <select value={form.formato_preferido} onChange={(e) => setForm({ ...form, formato_preferido: e.target.value as 'zpl' | 'pdf' })} className={INPUT}>
                  <option value="zpl">ZPL</option>
                  <option value="pdf">PDF</option>
                </select>
              </Campo>

              {form.tipo_conexao === 'rede' ? (
                <>
                  <Campo label="IP">
                    <input value={form.ip ?? ''} onChange={(e) => setForm({ ...form, ip: e.target.value })} className={INPUT} placeholder="192.168.1.100" />
                  </Campo>
                  <Campo label="Porta">
                    <input type="number" value={form.porta} onChange={(e) => setForm({ ...form, porta: Number(e.target.value) })} className={INPUT} />
                  </Campo>
                </>
              ) : (
                <Campo label="Agent ID (token do agent)">
                  <input value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })} className={INPUT} placeholder="Cole o token gerado pelo agent" />
                </Campo>
              )}

              <div className="grid grid-cols-3 gap-3">
                <Campo label="DPI">
                  <input type="number" value={form.dpi} onChange={(e) => setForm({ ...form, dpi: Number(e.target.value) })} className={INPUT} />
                </Campo>
                <Campo label="Largura (mm)">
                  <input type="number" value={form.largura_mm} onChange={(e) => setForm({ ...form, largura_mm: Number(e.target.value) })} className={INPUT} />
                </Campo>
                <Campo label="Altura (mm)">
                  <input type="number" value={form.altura_mm} onChange={(e) => setForm({ ...form, altura_mm: Number(e.target.value) })} className={INPUT} />
                </Campo>
              </div>

              <Campo label="Mesa / estação">
                <input value={form.mesa} onChange={(e) => setForm({ ...form, mesa: e.target.value })} className={INPUT} placeholder="ex: Mesa 1" />
              </Campo>
            </div>

            {erro && <p className="mt-3 text-sm text-red-500">{erro}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalAberto(false)}
                className="flex-1 border border-gray-300 rounded-xl py-3 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
              >
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
