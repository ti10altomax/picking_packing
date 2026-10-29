import type { AjudaTela } from './tipos'

export const supervisorSequenciaRelatorio: AjudaTela = {
  chave: 'supervisor-sequencia-relatorio',
  titulo: 'Relatório da sequência',
  menu: 'Pátio → sequência → Relatório',
  rota: '/supervisor/patio/[id]/relatorio',
  perfis: ['supervisor_patio', 'admin'],
  resumo:
    'Resume uma sequência: cada documento com status, conferente, quem separou, volumes e unidades, e o total de cada produto por tipo de volume. Serve para acompanhar e para imprimir.',
  capturas: [
    {
      src: '/manual/supervisor-sequencia-relatorio.png',
      legenda: 'Relatório da Sequência 6: documentos no alto e "Produtos por tipo de volume" abaixo.',
    },
  ],
  passos: [
    'Na tela da sequência, toque em "Relatório".',
    'Confira a linha do topo: data de criação e total de volumes por tipo.',
    'Em "Documentos", veja o status e o andamento de cada um.',
    'Em "Produtos por tipo de volume", veja quanto de cada produto foi para caixa, fardo ou outro.',
    'Toque em "Imprimir" para levar o relatório em papel. Use a seta no canto para voltar à sequência.',
  ],
  elementos: [
    {
      nome: 'Volumes (cx, fd, out)',
      descricao:
        'Quantos volumes o documento tem. "2 cx · 1 fd" é 2 caixas e 1 fardo; "out" é outro. Traço quer dizer sem volume ainda.',
    },
    {
      nome: 'Unid.',
      descricao: 'Unidades conferidas sobre unidades pedidas. "48/60" é 48 conferidas de 60 pedidas.',
    },
    {
      nome: 'Separado por',
      descricao:
        'Quem separou a mercadoria, apontado pelo conferente. "não identificado" quer dizer que o conferente não soube informar.',
    },
    {
      nome: 'transferido p/',
      descricao: 'Aparece sob o documento cancelado cuja conferência foi passada para outro documento.',
    },
    {
      nome: 'Linha de total',
      descricao: 'Soma de documentos, volumes e unidades da sequência.',
    },
    {
      nome: 'Caixa, Fardo, Outro, Total',
      descricao: 'Em "Produtos por tipo de volume": unidades do produto em cada tipo de volume. Traço quer dizer zero.',
    },
  ],
  situacoes: [
    {
      quando: '"Nenhuma bipagem registrada nesta sequência."',
      oQueFazer: 'Nenhum conferente começou. A tabela de produtos só aparece depois das primeiras bipagens.',
    },
    {
      quando: '"Erro ao carregar o relatório"',
      oQueFazer: 'Volte e abra de novo. Se repetir, avise a TI.',
    },
    {
      quando: 'Documento Cancelado em cinza claro',
      oQueFazer: 'Foi cancelado, mas os volumes montados ficam registrados. Veja Gestão → Cancelados.',
    },
  ],
  dicas: [
    'Na impressão, as cores somem e fica só o texto do status.',
    'As unidades só sobem conforme os conferentes bipam. Abra o relatório de novo para ver o número atual.',
  ],
  relacionadas: ['supervisor-sequencia', 'supervisor-patio', 'supervisor-erros', 'supervisor-cancelados'],
}
