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
    'Se as peças estão em caixas diferentes do que o sistema mostra (o conferente esqueceu de abrir a caixa nova), toque em "⇄ Mover itens entre volumes", marque os lançamentos, escolha em "Mover para:" um volume existente ou "Novo volume" e toque em "Mover".',
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
      nome: '⇄ Mover itens entre volumes',
      descricao:
        'Ao lado de "Fechar e enviar ao Senior". Antes de fechar, corrige a divisão dos volumes sem devolver o pedido: abre a janela com cada volume e seus lançamentos (SKU, descrição e quantidade). Enquanto carrega, o botão mostra "Carregando…". As quantidades conferidas e as sobras não mudam; só muda em qual volume cada lançamento está. Cada mudança fica no Histórico como "Volumes reorganizados".',
    },
    {
      nome: 'Janela "Mover itens entre volumes"',
      descricao:
        'Marque os lançamentos que vão mudar de volume; a caixa no título do volume marca ou desmarca todos dele. O lançamento vai inteiro: não dá para levar só parte da quantidade. Em "Mover para:", escolha um volume que já existe ou "Novo volume" (Caixa, Fardo ou Outro, com "Identificador (opcional)"; sem nome, ele aparece numerado, ex.: "Caixa 3"). Toque em "Mover N". O volume de onde os lançamentos saíram, se ficar vazio, é apagado sozinho. Caixa ou fardo da fábrica (OP) aparece apagado com "fábrica · não move" e não entra nem como origem nem como destino.',
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
      quando: 'Depois de mover, aviso verde "N lançamento(s) movido(s)".',
      oQueFazer: 'Os volumes foram reorganizados. O cartão não muda (ele mostra só as sobras). Feche o pedido normalmente: quando a etiqueta sair, ela já mostra os volumes novos.',
    },
    {
      quando: 'A janela de mover mostra "Só há caixas/fardos da fábrica (OP) neste documento — eles não podem ser reorganizados."',
      oQueFazer: 'Todos os volumes são de OP. Não há o que mover: feche o pedido como está.',
    },
    {
      quando: 'Aviso amarelo "Os lançamentos marcados já estão nesse volume." e o botão Mover apagado.',
      oQueFazer: 'O destino é o mesmo volume de onde os marcados saíram. Escolha outro volume ou "Novo volume".',
    },
    {
      quando: 'Quero levar só parte de um lançamento para outro volume.',
      oQueFazer: 'Não dá: o lançamento vai inteiro.',
    },
    {
      quando: '"Não foi possível carregar os volumes." ao tocar em mover, ou mensagem em vermelho na janela, como "pedido em status ... — só Conferido ou Aguardando fechamento".',
      oQueFazer: 'O pedido mudou desde que a tela abriu (foi fechado, cancelado ou outra pessoa mexeu). Feche a janela, toque em "Atualizar" e confira de novo.',
    },
    {
      quando: 'O pedido some da lista',
      oQueFazer: 'Foi fechado por outra pessoa ou cancelado no Senior. Veja Gestão → Conferidos ou Cancelados.',
    },
  ],
  dicas: [
    'A sequência não fica presa por causa de um pedido aguardando fechamento: ela pode ser concluída mesmo assim.',
    'Para ver o histórico de sobras e faltas, use Gestão → Erros de separação.',
    'Vai mover volumes? Faça antes de fechar: a etiqueta sai ao fechar e, se mover depois, ela precisa ser reimpressa em Gestão → Conferidos.',
  ],
  relacionadas: ['supervisor-erros', 'supervisor-sequencia', 'supervisor-conferidos', 'conferencia-pedido'],
}
