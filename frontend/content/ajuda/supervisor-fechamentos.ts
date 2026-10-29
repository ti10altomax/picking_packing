import type { AjudaTela } from './tipos'

export const supervisorFechamentos: AjudaTela = {
  chave: 'supervisor-fechamentos',
  titulo: 'Fechamentos — pedidos com sobra',
  menu: 'Gestão → Fechamentos',
  rota: '/supervisor/fechamentos',
  perfis: ['supervisor_patio', 'admin'],
  resumo:
    'Lista os pedidos em que o conferente terminou com sobra, isto é, mais mercadoria do que o pedido. O pedido fica esperando aqui até o Sup. Pátio fechar.',
  capturas: [
    {
      src: '/manual/supervisor-fechamentos.png',
      legenda: 'Pedido com "Sobras registradas" e o botão "Fechar e enviar ao Senior".',
    },
  ],
  passos: [
    'Abra Gestão → Fechamentos.',
    'Leia cada cartão: número, cliente, sequência, conferente e quem separou.',
    'Confira o quadro "Sobras registradas": mostra a quantidade e o produto que passaram do pedido.',
    'Resolva a sobra no galpão, conforme a regra da empresa.',
    'Toque em "Fechar e enviar ao Senior" e confirme em "Fechar".',
  ],
  elementos: [
    {
      nome: 'Aguardando fechamento (roxo)',
      descricao: 'O conferente terminou, mas há sobra. Enquanto estiver assim, o pedido não vai para o Senior.',
    },
    {
      nome: 'Seq. N',
      descricao: 'Sequência à qual o pedido pertence.',
    },
    {
      nome: 'Sobras registradas',
      descricao: 'Lista "2× produto". A sobra também fica registrada em Gestão → Erros de separação.',
    },
    {
      nome: 'Fechar e enviar ao Senior',
      descricao:
        'Marca o pedido como Conferido (verde) e envia os volumes ao Senior. A etiqueta de volume sai como ao concluir uma conferência: na impressora padrão, se o documento tem transportadora e, com a regra "Só imprimir com NF emitida" ligada, se já foi faturado.',
    },
  ],
  situacoes: [
    {
      quando: '"Nenhum pedido aguardando fechamento."',
      oQueFazer: 'Não há nada a fechar.',
    },
    {
      quando: 'Aviso "Não foi possível fechar." ou outro erro em vermelho',
      oQueFazer:
        'Leia o texto. Se o Senior recusou, o pedido continua na lista: tente de novo em alguns minutos e, se persistir, avise a TI.',
    },
    {
      quando: 'O pedido some da lista',
      oQueFazer: 'Foi fechado por outra pessoa ou cancelado no Senior. Veja Gestão → Conferidos ou Cancelados.',
    },
  ],
  dicas: [
    'A sequência não fica presa por causa de um pedido aguardando fechamento: ela pode ser concluída mesmo assim.',
    'Para ver o histórico de sobras e faltas, use Gestão → Erros de separação.',
  ],
  relacionadas: ['supervisor-erros', 'supervisor-sequencia', 'supervisor-conferidos', 'conferencia-pedido'],
}
