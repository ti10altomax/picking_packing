'use client'
import { useEffect, useState } from 'react'
import { cartaCorrecaoApi } from '@/lib/api'

/** O usuário logado pode fazer carta de correção? Lê `Configuracao.cce_perfis` (+ admin)
 *  pelo backend — a lista só muda no Django Admin, de propósito (2026-10-28).
 *  `null` enquanto carrega: quem usa trata como "não mostrar ainda". */
export function useCcePermissao(): boolean | null {
  const [pode, setPode] = useState<boolean | null>(null)
  useEffect(() => {
    let ativo = true
    cartaCorrecaoApi.permissao()
      .then((r) => { if (ativo) setPode(r.pode) })
      .catch(() => { if (ativo) setPode(false) })
    return () => { ativo = false }
  }, [])
  return pode
}
