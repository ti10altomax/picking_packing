'use client'
import { useEffect, useState, useCallback } from 'react'
import { adminApi } from '@/lib/api'

type Agent = {
  id: number
  hostname: string
  token: string
  versao: string
  criado_em: string
  ultimo_heartbeat: string | null
}

export default function AgentsPage() {
  const [lista, setLista] = useState<Agent[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tokenVisivel, setTokenVisivel] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    try {
      const data = await adminApi.listarAgents()
      setLista(data)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function statusAgent(agent: Agent) {
    if (!agent.ultimo_heartbeat) return { online: false, label: 'nunca conectou' }
    const diff = Math.floor((Date.now() - new Date(agent.ultimo_heartbeat).getTime()) / 1000)
    return { online: diff < 120, label: diff < 120 ? `online (${diff}s atrás)` : `offline (${diff}s atrás)` }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Print Agents</h1>
        <button onClick={carregar} className="text-sm text-blue-600 min-h-[44px] px-2">
          Atualizar
        </button>
      </div>

      <div className="mb-4 p-4 bg-blue-50 rounded-xl text-sm text-blue-800">
        Para registrar um novo agent, execute o binário na estação com Zebra USB.
        O token gerado aparecerá aqui — copie e cole no campo <strong>Agent ID</strong> da impressora correspondente.
      </div>

      {carregando ? (
        <p className="text-gray-500">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-gray-400">Nenhum agent registrado.</p>
      ) : (
        <div className="space-y-3">
          {lista.map((agent) => {
            const { online, label } = statusAgent(agent)
            return (
              <div key={agent.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{agent.hostname}</span>
                      {agent.versao && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">v{agent.versao}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded ${online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      Registrado em {new Date(agent.criado_em).toLocaleString('pt-BR')}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                        {tokenVisivel === agent.id ? agent.token : `${agent.token.slice(0, 8)}…`}
                      </code>
                      <button
                        onClick={() => setTokenVisivel(tokenVisivel === agent.id ? null : agent.id)}
                        className="text-xs text-blue-600 min-h-[44px] px-1"
                      >
                        {tokenVisivel === agent.id ? 'ocultar' : 'ver token'}
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(agent.token)}
                        className="text-xs text-gray-500 min-h-[44px] px-1"
                      >
                        copiar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
