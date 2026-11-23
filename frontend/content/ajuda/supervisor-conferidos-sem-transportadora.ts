import type { AjudaTela } from './tipos'

export const supervisorConferidosSemTransportadora: AjudaTela = {
  chave: 'supervisor-conferidos-sem-transportadora',
  titulo: 'Relatório: conferidos sem transportadora',
  menu: 'Gestão → Conferidos → Relatório sem transportadora',
  rota: '/supervisor/conferidos/sem-transportadora',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Lista os documentos já conferidos que ainda estão sem transportadora. Sem ela a etiqueta de volume não sai. Serve para imprimir e entregar a quem define a transportadora de cada nota.',
  passos: [
    'Em Gestão → Conferidos, toque em "Relatório sem transportadora".',
    'Confira a linha do topo: quantos documentos de entrega aguardam transportadora e a hora em que a lista foi gerada.',
    'Use "Ordenar por" para ver as mais antigas primeiro ou juntar as notas do mesmo cliente.',
    'Toque em "Imprimir". No papel sai uma coluna "Transportadora" em branco para anotar a de cada nota.',
    'Para corrigir uma nota, volte a Conferidos, filtre "Sem transportadora" e use "Corrigir NF". Quando a transportadora entra, a nota sai deste relatório.',
  ],
  elementos: [
    {
      nome: 'Entrega — precisam de transportadora',
      descricao: 'Documentos com frete de entrega e sem transportadora. São os que precisam ser acertados.',
    },
    {
      nome: 'Retira ou sem frete',
      descricao:
        'Não saem por transportadora, então não precisam dela. Aparecem à parte para conferência: se alguma deveria ser de entrega, o frete também precisa ser corrigido.',
    },
    {
      nome: 'Volumes',
      descricao:
        'Volumes montados na conferência. "(NF 1)" em âmbar quer dizer que a nota está com outra quantidade: a mesma carta de correção pode acertar a transportadora e os volumes.',
    },
    {
      nome: 'ped. N / NF N',
      descricao: 'Sob o número da nota, o pedido de onde ela saiu. Sob o número do pedido, a nota emitida para ele.',
    },
    {
      nome: 'Atualizar',
      descricao: 'Gera a lista de novo, consultando o Senior na hora.',
    },
  ],
  situacoes: [
    {
      quando: '"N notas já estavam com transportadora no Senior e saíram da lista."',
      oQueFazer: 'Nada. Alguém já acertou essas notas direto no Senior e o Separa acabou de atualizar.',
    },
    {
      quando: 'Aviso âmbar "Não consegui consultar o Senior agora".',
      oQueFazer:
        'A lista usa a última leitura automática e pode trazer nota que já foi acertada. Toque em "Atualizar" daqui a alguns minutos antes de imprimir.',
    },
    {
      quando: '"Nenhum documento de entrega conferido está sem transportadora."',
      oQueFazer: 'Está tudo em dia: não há nota de entrega esperando transportadora.',
    },
    {
      quando: '"Erro ao carregar o relatório"',
      oQueFazer: 'Volte e abra de novo. Se repetir, avise a TI.',
    },
  ],
  dicas: [
    'A nota sai da lista sozinha quando ganha transportadora, pelo Separa ou direto no Senior.',
    'Na impressão, as cores somem e o menu do sistema não aparece.',
  ],
  relacionadas: ['supervisor-conferidos', 'supervisor-cartas', 'supervisor-etiquetas'],
}
