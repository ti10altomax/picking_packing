import type { AjudaTela } from './tipos'

export const supervisorNaoConformes: AjudaTela = {
  chave: 'supervisor-nao-conformes',
  titulo: 'Não conformes',
  menu: 'Gestão → Não conformes',
  rota: '/supervisor/nao-conformes',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Lista os documentos que o conferente marcou como Não conforme (vermelho) por algum problema na conferência. Cada um espera uma decisão sua: devolver para a fila ou cancelar.',
  capturas: [
    {
      src: '/manual/supervisor-nao-conformes.png',
      legenda: 'Documento Não conforme com o motivo, o detalhe escrito pelo conferente e as duas ações.',
    },
  ],
  passos: [
    'Abra Gestão → Não conformes. Cada cartão é um documento parado.',
    'Leia o motivo (a etiqueta colorida ao lado do número) e, abaixo do cliente, o detalhe que o conferente escreveu.',
    'Veja quem conferiu e quem separou na linha "Marcado em… · conferente… · separado por…".',
    'Toque no cartão para abrir os itens. Cada item mostra o que foi separado sobre o que foi pedido. Itens "em falta" aparecem em laranja.',
    'Se precisar do que aconteceu passo a passo, toque em "Histórico".',
    'Decida: "Retornar para fila" quando o problema foi resolvido, ou "Cancelar pedido" quando o documento não vai mais sair.',
    'Confirme na janela que abre. A lista é atualizada e o cartão sai.',
  ],
  elementos: [
    {
      nome: 'Motivo',
      descricao:
        'Divergência de quantidade, produto errado ou item ausente. É o que o conferente escolheu ao marcar o documento.',
    },
    {
      nome: 'conferente / separado por',
      descricao:
        'Conferente é quem bipou no coletor. Separado por é o separador que juntou a mercadoria no estoque.',
    },
    {
      nome: '⚠ Separador não identificado',
      descricao: 'O conferente não apontou quem separou. A falta não entra na conta de nenhum separador.',
    },
    {
      nome: 'Retornar para fila',
      descricao:
        'O documento volta para Pendente e começa o caminho de novo: o Sup. Vendas precisa enviá-lo outra vez. Ele perde sequência, conferente e separador. O motivo anterior fica no Histórico.',
    },
    {
      nome: 'Cancelar pedido',
      descricao:
        'Cancela o documento de forma definitiva. Os volumes e os itens já conferidos ficam guardados. Se já houver volumes montados, o documento passa a aparecer em Cancelados, onde dá para transferir a conferência para um documento novo.',
    },
    {
      nome: 'Itens do cartão',
      descricao:
        'Número separado/pedido por item. Âmbar: quantidade diferente do pedido. "em falta": o item foi dado como falta. "cancelado": o item saiu do documento.',
    },
  ],
  situacoes: [
    {
      quando: 'Nenhum pedido não conforme.',
      oQueFazer: 'Não há nada esperando decisão. Tela em dia.',
    },
    {
      quando: 'Confirmação "Cancelar pedido?".',
      oQueFazer: 'Toque em "Cancelar pedido" para confirmar, ou em "Voltar" para desistir. Depois de cancelado, não dá para desfazer por aqui.',
    },
    {
      quando: 'Confirmação "Retornar para fila?".',
      oQueFazer: 'Toque em "Retornar" para confirmar. Avise o Sup. Vendas, que vai precisar enviar o documento de novo.',
    },
    {
      quando: 'Mensagem vermelha "Erro ao cancelar" ou "Erro ao retornar para fila".',
      oQueFazer: 'Toque em "Atualizar". Se o documento já saiu da lista, outra pessoa já decidiu. Se continuar na lista, tente de novo e avise o admin.',
    },
  ],
  dicas: [
    'Quando o motivo é falta de mercadoria, a falta também fica registrada em Erros de separação, por separador. Não é preciso lançar de novo.',
    'Antes de cancelar, abra o Histórico: ele mostra se o documento já passou por outra conferência.',
  ],
  relacionadas: ['supervisor-erros', 'supervisor-cancelados', 'supervisor-vendas', 'supervisor-agora'],
}
