import type { AjudaTela } from './tipos'

export const supervisorPatio: AjudaTela = {
  chave: 'supervisor-patio',
  titulo: 'Pátio — fila e sequências',
  menu: 'Pátio',
  rota: '/supervisor/patio',
  perfis: ['supervisor_patio', 'admin'],
  resumo:
    'Tela inicial do Sup. Pátio. Em cima ficam as sequências em aberto; embaixo, os documentos que o Sup. Vendas enviou para separação e ainda não estão em nenhuma sequência. Aqui você monta as sequências.',
  capturas: [
    {
      src: '/manual/supervisor-patio.png',
      legenda: 'Sequências em aberto e "Pedidos aguardando sequência", agrupados por transportadora.',
    },
  ],
  passos: [
    'Veja em "Pedidos aguardando sequência" os documentos Selecionados que ainda não têm sequência.',
    'Use a busca "Buscar por número ou cliente" para achar um documento específico.',
    'Marque os documentos que vão juntos. A caixa do topo da lista marca todos os que estão na tela.',
    'Na barra que aparece embaixo, escolha o destino: "Nova sequência" ou uma sequência já aberta.',
    'Toque em "Criar sequência" (ou "Adicionar à sequência"). Ao criar uma nova, a tela da sequência abre sozinha.',
    'Para dar andamento, toque no card da sequência e atribua os pedidos a um conferente.',
  ],
  elementos: [
    {
      nome: 'Cabeçalho da transportadora',
      descricao:
        'A fila vem agrupada por transportadora, começando pela que tem mais documentos. À direita aparece a quantidade. Documentos sem transportadora ficam em "Sem transportadora".',
    },
    {
      nome: 'NF e Entrega / Retira',
      descricao: 'Selos ao lado do número: NF indica nota fiscal; Entrega ou Retira indica o frete do documento.',
    },
    {
      nome: 'Aberta (laranja)',
      descricao: 'Sequência criada, sem nenhum pedido em conferência ainda.',
    },
    {
      nome: 'Em andamento (azul)',
      descricao: 'Sequência com pedido sendo conferido ou ainda pendente.',
    },
    {
      nome: 'Concluída (verde)',
      descricao: 'Todos os documentos da sequência terminaram. Ela sai da lista desta tela.',
    },
    {
      nome: 'Contagens do card',
      descricao:
        '"pedido(s)" é o total da sequência; "sem conferente" são os que ainda não têm conferente; "finalizado(s)" são os que já terminaram.',
    },
    {
      nome: 'Carregar mais',
      descricao: 'Aparece quando a fila tem mais documentos do que cabem na tela. Mostra quantos faltam.',
    },
    {
      nome: 'Atualizar',
      descricao: 'Recarrega sequências e fila. Use quando o Sup. Vendas acabou de enviar documentos.',
    },
  ],
  situacoes: [
    {
      quando: '"Nenhuma sequência em aberto — selecione pedidos abaixo e crie a primeira."',
      oQueFazer: 'Marque documentos na fila e toque em "Criar sequência".',
    },
    {
      quando: '"Nenhum pedido aguardando sequência."',
      oQueFazer: 'Não há documentos Selecionados livres. Peça ao Sup. Vendas para enviar mais para separação.',
    },
    {
      quando: 'Mensagem "N pedido(s) adicionados à sequência · M ignorado(s)"',
      oQueFazer:
        'Os ignorados não puderam entrar, por exemplo porque já estavam em outra sequência. Toque em "Atualizar" e confira a fila.',
    },
    {
      quando: '"Erro ao montar a sequência"',
      oQueFazer: 'Toque em "Atualizar" e tente de novo. Se repetir, avise a TI.',
    },
  ],
  dicas: [
    'Documentos da mesma transportadora ficam juntos na fila. Marque o grupo inteiro para montar uma sequência por transportadora.',
    'Os documentos de uma sequência só podem ser conferidos pelo conferente na ordem das sequências: a mais antiga primeiro.',
  ],
  relacionadas: ['supervisor-sequencia', 'supervisor-vendas', 'supervisor-separadores', 'conferencia'],
}
