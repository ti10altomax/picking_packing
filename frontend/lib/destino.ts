import type { Perfil } from '@/stores/authStore'

export function destinoPorPerfil(perfil?: Perfil | string | null): string {
  switch (perfil) {
    case 'admin': return '/admin'
    case 'supervisor_vendas': return '/supervisor/vendas'
    case 'supervisor_patio': return '/supervisor/patio'
    case 'etiquetador': return '/etiquetador' // CONGELADO
    case 'separador': return '/separacao'
    default: return '/login'
  }
}
