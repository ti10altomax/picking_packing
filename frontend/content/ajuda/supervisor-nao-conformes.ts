import type { AjudaTela } from './tipos'

export const supervisorNaoConformes: AjudaTela = {
  chave: 'supervisor-nao-conformes',
  titulo: 'Não conformes',
  menu: 'Gestão → Não conformes',
  rota: '/supervisor/nao-conformes',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Lista os documentos que o conferente marcou como Não conforme (vermelho) por algum problema na conferência. Cada um espera uma decisão sua: retomar a conferência de onde parou ou cancelar.',
  capturas: [
    {
      src: '/manual/supervisor-nao-conformes.png',
      legenda: 'Documento Não conforme com o motivo, o detalhe escrito pelo conferente e as ações.',
    },
  ],
  passos: [
    'Abra Gestão → Não conformes. Cada cartão é um documento parado.',
    'Leia o motivo (a etiqueta colorida ao lado do número) e, abaixo do cliente, o detalhe que o conferente escreveu.',
    'Veja quem conferiu, quem separou e em qual sequência está na linha "Marcado em… · conferente… · separado por… · Seq.…".',
    'Toque no cartão para abrir os itens. Cada item mostra o que foi separado sobre o que foi pedido. Itens "em falta" aparecem em laranja.',
    'Se precisar do que aconteceu passo a passo, toque em "Histórico".',
    'Problema resolvido: toque em "Retomar conferência". O documento volta para o mesmo conferente, que continua de onde parou.',
    'Se o conferente não está mais no turno, toque em "Soltar na sequência": outro conferente pega bipando a nota.',
    'Se o documento não vai mais sair, toque em "Cancelar pedido".',
    'Confirme na janela que abre. A lista é atualizada e o cartão sai.',
  ],
  elementos: [
    {
      nome: 'Colar lista',
      descricao: 'Recebeu uma relação de notas? Toque em "Colar lista", cole os números (vírgula, espaço ou um por linha; 151281-151290 vale pelo intervalo) ou abra o .txt e toque em "Buscar". O sistema mostra quais estão nesta tela, quais estão em outra (com o botão "Ver") e quais não achou. "Mostrar N na tela" deixa a tela só com essas notas; a faixa azul "Mostrando só a lista colada" tem o botão "Limpar filtro" para voltar ao normal.',
    },
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
      nome: 'Retomar conferência',
      descricao:
        'O documento volta para o mesmo conferente, na mesma sequência, com os volumes e as quantidades já bipadas. Aparece de novo em "Atribuídos a mim" dele. Não passa por Vendas nem precisa de sequência nova. O botão não aparece quando o conferente foi desativado.',
    },
    {
      nome: 'Soltar na sequência',
      descricao:
        'O documento continua na sequência, mas fica sem conferente. Qualquer conferente pega bipando a nota (ou em "Disponíveis na sequência"), ou o Pátio atribui na tela da sequência. Volumes e quantidades ficam. Quem pegar aponta o separador de novo ao iniciar.',
    },
    {
      nome: 'Cancelar pedido',
      descricao:
        'Cancela o documento de forma definitiva. Os volumes e os itens já conferidos ficam guardados. Se já houver volumes montados, o documento passa a aparecer em Cancelados, onde dá para transferir a conferência para um documento novo.',
    },
    {
      nome: 'Devolver para Vendas (só admin)',
      descricao:
        'O documento volta para Pendente e começa o caminho de novo: o Sup. Vendas precisa enviá-lo outra vez. Ele perde sequência, conferente e separador. É para o caso raro de a nota precisar sair do Pátio.',
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
      quando: 'Etiqueta âmbar "⚠ Nota já embarcada" no cartão.',
      oQueFazer: 'A nota saiu num embarque do Senior com o documento ainda parado aqui. Confirme se a mercadoria foi mesmo. Se foi, decida: retomar e concluir a conferência, soltar na sequência (o documento vai sozinho para Embarcados) ou cancelar.',
    },
    {
      quando: 'Confirmação "Retomar conferência?".',
      oQueFazer: 'Toque em "Retomar". Avise o conferente: o documento volta para a lista dele, no ponto em que parou.',
    },
    {
      quando: 'Confirmação "Soltar na sequência?".',
      oQueFazer: 'Toque em "Soltar". O documento fica disponível na sequência para quem bipar a nota. Se ele não tinha sequência, volta para o Pátio colocar em uma.',
    },
    {
      quando: 'Mensagem "o conferente deste documento não está mais ativo".',
      oQueFazer: 'Use "Soltar na sequência" para outro conferente pegar.',
    },
    {
      quando: 'A sequência do documento já estava concluída.',
      oQueFazer: 'Nada. Ao retomar, a sequência volta sozinha para "Em andamento" até o documento ser conferido.',
    },
    {
      quando: 'Confirmação "Cancelar pedido?".',
      oQueFazer: 'Toque em "Cancelar pedido" para confirmar, ou em "Voltar" para desistir. Depois de cancelado, não dá para desfazer por aqui.',
    },
    {
      quando: 'Mensagem vermelha "Erro ao cancelar" ou "Não foi possível retomar".',
      oQueFazer: 'A lista é recarregada. Se o documento já saiu da lista, outra pessoa já decidiu. Se continuar na lista, tente de novo e avise o admin.',
    },
  ],
  dicas: [
    'Quando o motivo é falta de mercadoria, a falta também fica registrada em Erros de separação, por separador. Ela continua lá depois de retomar, e não é lançada de novo se o documento voltar a ser marcado.',
    'Antes de cancelar, abra o Histórico: ele mostra se o documento já passou por outra conferência.',
  ],
  relacionadas: ['supervisor-erros', 'supervisor-cancelados', 'supervisor-sequencia', 'supervisor-agora'],
}
