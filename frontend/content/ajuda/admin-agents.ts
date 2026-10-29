import type { AjudaTela } from './tipos'

export const adminAgents: AjudaTela = {
  chave: 'admin-agents',
  titulo: 'Print Agents (agentes USB)',
  menu: 'Admin → Agentes USB',
  rota: '/admin/agents',
  perfis: ['admin'],
  resumo:
    'Lista os agentes de impressão USB. O agente é um programa que fica no computador com a Zebra ligada por cabo USB e imprime as etiquetas enviadas pelo sistema. Use esta tela para pegar o token do agente.',
  capturas: [
    { src: '/manual/admin-agents.png', legenda: 'Print Agents sem nenhum agente registrado.' },
  ],
  passos: [
    'No computador com a Zebra USB, abra o programa do agente. Ele se registra sozinho no sistema.',
    'Nesta tela, toque em Atualizar. O agente aparece na lista com o nome do computador.',
    'No cartão do agente, toque em ver token para mostrar o código completo.',
    'Toque em copiar.',
    'Abra Admin → Impressoras e edite a impressora USB, ou crie uma nova. Cole o token no campo Agent ID e toque em Salvar.',
    'Volte aqui e confira se o agente está online.',
  ],
  elementos: [
    { nome: 'online / offline', descricao: 'Verde "online" quando o agente deu sinal nos últimos 2 minutos. Vermelho "offline" quando passou disso. O número mostra há quantos segundos foi o último sinal.' },
    { nome: 'nunca conectou', descricao: 'O agente foi registrado, mas ainda não deu nenhum sinal.' },
    { nome: 'ver token / ocultar', descricao: 'Mostra ou esconde o código completo. Por segurança, ele aparece cortado.' },
    { nome: 'copiar', descricao: 'Copia o token para colar no campo Agent ID da impressora.' },
    { nome: 'v1.0 (selo ao lado do nome)', descricao: 'Versão do programa do agente.' },
  ],
  situacoes: [
    { quando: '"Nenhum agent registrado."', oQueFazer: 'Nenhum computador com Zebra USB foi ligado ao sistema. Se a impressão é por rede ou pelo navegador, não precisa de agente.' },
    { quando: 'Agente "offline"', oQueFazer: 'Confira se o computador da Zebra está ligado, com internet e com o programa do agente aberto.' },
    { quando: '"nunca conectou"', oQueFazer: 'Abra o programa do agente no computador da Zebra e aguarde um minuto.' },
  ],
  dicas: [
    'Só impressora USB usa agente. A Zebra de rede (IP e porta 9100) e a impressão pelo navegador funcionam sem ele.',
    'Trate o token como senha: quem tem o token controla o agente.',
  ],
  relacionadas: ['admin-impressoras', 'admin-saude', 'etiqueta-navegador'],
}
