import type { AjudaTela } from './tipos'

export const supervisorEmbarcados: AjudaTela = {
  chave: 'supervisor-embarcados',
  titulo: 'Embarcados',
  menu: 'Gestão → Embarcados',
  rota: '/supervisor/embarcados',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Lista os documentos cuja nota já saiu num embarque lançado no Senior (Embarcado, azul-claro). O sistema lê os embarques sozinho a cada 2 minutos; aqui é só consulta, agrupada por caminhão.',
  passos: [
    'Abra Gestão → Embarcados. Cada bloco é um embarque: número, placa, motorista e hora da saída.',
    'Dentro do bloco, cada linha é uma nota ou pedido que saiu naquele caminhão.',
    'Procure por número da nota, do pedido, cliente, número do embarque, placa, motorista ou transportadora.',
    'Use o filtro: Todos, Conferidos (passaram pela conferência antes de sair) ou Sem conferência (saíram sem passar pelo Separa).',
    'Toque na linha para ver os itens e, se houve conferência, em que volume cada um foi.',
    'Para ver o caminho do documento, toque em "Histórico".',
    'Se a nota precisa de carta de correção depois de sair, toque em "Corrigir NF".',
  ],
  elementos: [
    {
      nome: 'Cabeçalho do embarque',
      descricao:
        'Número do embarque no Senior, placa do veículo, motorista e data e hora da saída. À direita, quantos documentos do embarque estão na tela.',
    },
    {
      nome: 'Embarcado (azul-claro)',
      descricao:
        'A nota do documento está num embarque do Senior. O documento saiu das outras listas (Vendas, Pátio, Conferidos, Etiquetas).',
    },
    {
      nome: 'Sem conferência (âmbar)',
      descricao:
        'A nota embarcou sem ter sido conferida no Separa: estava Pendente em Vendas ou Selecionada na fila do Pátio. Não tem volumes nem etiqueta.',
    },
    {
      nome: 'conferido … por …',
      descricao: 'Quando e por quem o documento foi conferido antes de sair.',
    },
    {
      nome: 'Reimprimir / Etiqueta',
      descricao:
        'Só nos documentos que foram conferidos. Serve para refazer uma etiqueta de volume perdida no transporte. Nada sai sozinho depois do embarque.',
    },
    {
      nome: 'Histórico',
      descricao: 'Linha do tempo do documento. O embarque aparece como "Embarcado", com embarque, placa, motorista e saída.',
    },
    {
      nome: 'Corrigir NF',
      descricao: 'Carta de correção da nota (transportadora, frete, volumes). Só para os perfis liberados pelo admin.',
    },
  ],
  situacoes: [
    {
      quando: 'A nota saiu agora e ainda não aparece aqui.',
      oQueFazer:
        'O embarque precisa estar lançado no Senior com a nota dentro. Depois disso o Separa leva até 2 minutos para ler. Toque em "Atualizar".',
    },
    {
      quando: 'Um documento sumiu de Vendas, do Pátio ou de Conferidos.',
      oQueFazer: 'Procure o número aqui. Se a nota entrou num embarque, o documento veio para esta lista sozinho.',
    },
    {
      quando: 'A nota foi lançada no embarque errado.',
      oQueFazer:
        'Corrija o embarque no Senior. Em até 2 minutos o documento volta sozinho para a situação em que estava (Pendente, Selecionado ou Conferido) e o Histórico registra "Embarque desfeito no Senior". Vale para embarques dos últimos 3 dias.',
    },
    {
      quando: 'Aviso "⚠ Nota já embarcada" em outra tela (sequência, Não conformes, conferência).',
      oQueFazer:
        'A nota entrou num embarque com o documento ainda na mão de um conferente ou como Não conforme. A situação não muda sozinha nesses casos. Confirme se a mercadoria saiu mesmo; quando a conferência for concluída, o documento vem para Embarcados.',
    },
    {
      quando: 'Muitas linhas "Sem conferência".',
      oQueFazer: 'São notas que saíram do galpão sem passar pelo Separa. Use o filtro "Sem conferência" para levantar quais e de qual caminhão.',
    },
    {
      quando: 'Nenhum documento embarcado ainda.',
      oQueFazer: 'Nenhuma nota do Separa entrou num embarque do Senior nos últimos 30 dias, ou o filtro não achou nada.',
    },
  ],
  dicas: [
    'O Separa só lê o embarque; quem lança (placa, motorista, notas) continua sendo o Senior.',
    'Pedido já faturado embarca pela nota dele: procure pelo número do pedido ou da NF.',
    'Documento Embarcado continua contando como conferido nos números do dia em Gestão → Agora, se foi conferido antes de sair.',
  ],
  relacionadas: ['supervisor-conferidos', 'supervisor-vendas', 'supervisor-patio', 'supervisor-cartas', 'supervisor-agora'],
}
