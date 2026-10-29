import type { AjudaTela } from './tipos'

export const supervisorErros: AjudaTela = {
  chave: 'supervisor-erros',
  titulo: 'Erros de separação',
  menu: 'Gestão → Erros de separação',
  rota: '/supervisor/erros',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Mostra as sobras e as faltas que os conferentes registraram ao conferir, somadas por separador. Serve para acompanhar a qualidade da separação no estoque.',
  capturas: [
    {
      src: '/manual/supervisor-erros.png',
      legenda: 'Ranking por separador e a lista de ocorrências.',
    },
  ],
  passos: [
    'Abra Gestão → Erros de separação.',
    'Escolha o tipo: "Tudo", "Sobras" ou "Faltas".',
    'Se quiser um período, preencha as duas datas, de início e de fim, separadas por "até".',
    'Em "Por separador", veja quantas unidades de sobra e de falta cada separador teve e o total. A linha com "⚠ Não identificado" reúne os casos em que o conferente não apontou o separador.',
    'Toque no nome de um separador para ver só as ocorrências dele. Toque de novo para voltar a todos.',
    'Em "Ocorrências", leia cada caso: tipo, quantidade, produto, documento, separador, data e quem registrou.',
    'Para limpar período e separador, toque em "limpar".',
  ],
  elementos: [
    {
      nome: 'Sobra (amarelo)',
      descricao: 'Veio mais mercadoria do estoque do que o pedido pedia. O documento é concluído, mas fica Aguardando fechamento (roxo) até o Sup. Pátio fechar.',
    },
    {
      nome: 'Falta (vermelho)',
      descricao: 'Veio menos mercadoria do que o pedido pedia. O documento fica Não conforme (vermelho).',
    },
    {
      nome: 'Por separador',
      descricao:
        'Soma em unidades, não em ocorrências. O quadro sempre soma o período inteiro: o filtro Tudo/Sobras/Faltas muda só a lista de ocorrências.',
    },
    {
      nome: 'Ocorrências (filtradas)',
      descricao: 'O título ganha "(filtradas)" quando você escolheu um separador.',
    },
  ],
  situacoes: [
    {
      quando: 'Nenhum erro registrado no período.',
      oQueFazer: 'Nenhum conferente registrou sobra ou falta nessas datas. Mude o período ou tire as datas.',
    },
    {
      quando: 'Nenhuma ocorrência com esses filtros.',
      oQueFazer: 'Tire o filtro de tipo ou de separador, ou amplie o período.',
    },
    {
      quando: '"⚠ Não identificado" com muitos casos.',
      oQueFazer: 'Os conferentes estão deixando de apontar o separador ao iniciar o documento. Reforce o apontamento diário com eles.',
    },
  ],
  dicas: [
    'Esta tela mede o trabalho do separador. Mercadoria certa com etiqueta de fábrica errada não entra aqui: isso é divergência de barra.',
    'Use as faltas junto com Não conformes para ver se o problema é de estoque ou de separação.',
  ],
  relacionadas: ['supervisor-divergencias', 'supervisor-nao-conformes', 'supervisor-fechamentos', 'supervisor-separadores'],
}
