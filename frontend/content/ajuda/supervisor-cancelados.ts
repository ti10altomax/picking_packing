import type { AjudaTela } from './tipos'

export const supervisorCancelados: AjudaTela = {
  chave: 'supervisor-cancelados',
  titulo: 'Cancelados — transferir conferência',
  menu: 'Gestão → Cancelados',
  rota: '/supervisor/cancelados',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Lista os documentos cancelados que já tinham conferência. As caixas continuam montadas: o Sup. Pátio aponta o documento reemitido e a conferência passa para ele, sem refazer nada.',
  capturas: [
    {
      src: '/manual/supervisor-cancelados.png',
      legenda: 'Documento cancelado no Senior, com o botão "Transferir conferência…".',
    },
  ],
  passos: [
    'Abra Gestão → Cancelados. Os que ainda esperam destino vêm primeiro.',
    'Confira o cartão: quando foi cancelado, sequência, conferente e quantos itens e volumes tem.',
    'Toque em "Transferir conferência…".',
    'Digite o número do pedido ou da NF nova (mínimo de 2 caracteres) e toque no resultado certo.',
    'Compare as quantidades na tabela. Com "itens batem", o botão "Transferir" libera.',
    'Toque em "Transferir" e confirme. O documento novo assume o status e a sequência do cancelado.',
  ],
  elementos: [
    {
      nome: 'era: …',
      descricao:
        'Status que o documento tinha quando foi cancelado, com a cor correspondente (por exemplo "era: Em conferência").',
    },
    {
      nome: 'Senior / supervisor',
      descricao:
        'Quem cancelou. "Senior" é cancelamento feito no Senior, detectado automaticamente em cerca de 1 minuto.',
    },
    {
      nome: 'Histórico',
      descricao: 'Botão ao lado do número. Mostra, em ordem, tudo o que aconteceu com o documento.',
    },
    {
      nome: 'itens batem / itens diferentes',
      descricao:
        'Comparação do documento novo com o cancelado. Só transfere se todos os itens e quantidades forem iguais.',
    },
    {
      nome: 'Tabela Cancelado / Novo / Conferido',
      descricao:
        'Quantidade em cada documento e quanto já foi conferido. Linhas em vermelho mostram a diferença: "qtd diferente", "falta no novo" ou "só no novo".',
    },
    {
      nome: 'Já transferidos',
      descricao: 'Parte de baixo da tela. Mostra para qual documento cada conferência foi.',
    },
  ],
  situacoes: [
    {
      quando: 'O conferente vê a tela vermelha "Cancelado no Senior"',
      oQueFazer:
        'Ele deixa as caixas como estão e avisa você. Abra esta tela e transfira a conferência para o documento novo.',
    },
    {
      quando: '"Nenhum documento Pendente ou Selecionado com esse número…"',
      oQueFazer:
        'A nota nova ainda não chegou ao Separa. A atualização roda a cada 2 minutos. Espere e busque de novo. O destino precisa estar Pendente ou Selecionado.',
    },
    {
      quando: '"Os itens não batem — a transferência é bloqueada."',
      oQueFazer:
        'A nota nova precisa ser conferida do zero. Não há como transferir. Confira se escolheu o documento certo.',
    },
    {
      quando: '"Transferência é feita pelo Supervisor de Pátio."',
      oQueFazer: 'Seu perfil só consulta. Peça ao Sup. Pátio.',
    },
    {
      quando: 'Mensagem de erro em vermelho ao confirmar',
      oQueFazer: 'Leia o texto. Se o destino mudou de status ou já foi usado, busque de novo e escolha outro.',
    },
    {
      quando: '"Nenhum documento cancelado com conferência."',
      oQueFazer: 'Nada a fazer. Cancelados sem conferência não aparecem aqui.',
    },
  ],
  dicas: [
    'Antes de transferir, confira se o número novo é mesmo a reemissão do cancelado: a tela compara só os itens, não o cliente.',
    'A transferência é sempre confirmada por uma pessoa. O sistema nunca faz sozinho.',
  ],
  relacionadas: ['supervisor-sequencia', 'supervisor-fechamentos', 'supervisor-patio', 'conferencia-pedido'],
}
