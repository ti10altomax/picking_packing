import type { Perfil } from '@/stores/authStore'

/** Rota destino baseada no perfil do usuário (mesma lógica do web). */
export function destinoPorPerfil(perfil?: Perfil | string | null): string {
  switch (perfil) {
    case 'admin': return '/admin'
    case 'supervisor_vendas': return '/supervisor/vendas'
    case 'supervisor_patio': return '/supervisor/patio'
    case 'conferente': return '/conferencia'
    case 'etiquetador': return '/etiquetador'  // CONGELADO
    default: return '/login'
  }
}
