import type { AjudaTela } from './tipos'

export const supervisorSequencia: AjudaTela = {
  chave: 'supervisor-sequencia',
  titulo: 'Sequência — atribuir pedidos',
  menu: 'Pátio → card da sequência',
  rota: '/supervisor/patio/[id]',
  perfis: ['supervisor_patio', 'admin'],
  resumo:
    'Mostra todos os documentos de uma sequência, com status e conferente. Aqui você escolhe quem confere cada pedido, troca o conferente ou tira um documento da sequência.',
  capturas: [
    {
      src: '/manual/supervisor-sequencia.png',
      legenda: 'Sequência 6: conferente escolhido em "Atribuir a:" e a lista de documentos com status.',
    },
  ],
  passos: [
    'Abra a sequência pelo card na tela Pátio.',
    'Em "Atribuir a:", escolha o conferente.',
    'Marque os documentos que ele vai conferir. Só dá para marcar os "Sem conferente" e os "Atribuído".',
    'Toque em "Atribuir" na barra de baixo. O documento passa para "Atribuído" e aparece na lista do conferente.',
    'Para trocar o conferente, marque o documento, escolha outro em "Atribuir a:" e toque em "Atribuir".',
    'Para tirar um documento da sequência, marque e toque em "Remover da sequência". Confirme em "Remover".',
    'Toque em "Relatório" para ver o resultado da sequência.',
  ],
  elementos: [
    {
      nome: 'Sem conferente (laranja)',
      descricao:
        'Documento Selecionado, ainda sem conferente. O conferente pode pegá-lo sozinho bipando a nota, então atribuir é opcional.',
    },
    { nome: 'Atribuído (amarelo)', descricao: 'Tem conferente, que ainda não começou a conferir.' },
    { nome: 'Em conferência (azul)', descricao: 'O conferente já abriu volume. Não dá mais para atribuir nem remover.' },
    {
      nome: 'Aguard. fechamento (roxo)',
      descricao: 'Conferência terminada com sobra. Falta o Sup. Pátio fechar em Gestão → Fechamentos.',
    },
    { nome: 'Conferido (verde)', descricao: 'Conferência concluída e enviada ao Senior.' },
    { nome: 'Não conforme (vermelho)', descricao: 'O conferente encontrou problema no documento.' },
    {
      nome: 'Cancelado (cinza)',
      descricao: 'O documento foi cancelado. Veja o que fazer em Gestão → Cancelados.',
    },
    {
      nome: 'Nome à direita do documento',
      descricao: 'Conferente do documento e quantidade de itens. Sem nome, ninguém pegou ainda.',
    },
    {
      nome: 'Contagem sob o título',
      descricao:
        '"sem conferente" são os que não têm dono; "pendente(s)" ainda não terminaram; "finalizado(s)" já terminaram.',
    },
    {
      nome: 'Excluir',
      descricao: 'Só aparece em sequência aberta e vazia.',
    },
  ],
  situacoes: [
    {
      quando: 'Documento sem caixa de marcação',
      oQueFazer:
        'O documento já está em conferência ou terminou. Só dá para mexer enquanto estiver "Sem conferente" ou "Atribuído".',
    },
    {
      quando: '"Nenhum conferente disponível"',
      oQueFazer: 'Não há conferente ativo cadastrado. Peça ao admin para cadastrar ou reativar.',
    },
    {
      quando: 'Mensagem "N pedido(s) atribuído(s) a … · M ignorado(s)"',
      oQueFazer:
        'Os ignorados já tinham entrado em conferência no meio do caminho. Toque em "Atualizar" para ver o status atual.',
    },
    {
      quando: 'Aviso "Remover da sequência?"',
      oQueFazer:
        'Os documentos voltam para "aguardando sequência" e a atribuição é desfeita. Confirme só se for isso mesmo.',
    },
    {
      quando: '"Sequência vazia — adicione pedidos pela tela do Pátio."',
      oQueFazer: 'Volte ao Pátio, marque documentos e use "Adicionar à sequência". Ou toque em "Excluir".',
    },
    {
      quando: 'Sequência "Concluída"',
      oQueFazer: 'Não aceita mais mudanças. Use "Relatório" para consultar.',
    },
  ],
  dicas: [
    'O conferente só trabalha na sua sequência ativa: a mais antiga que ainda tem pedido dele. A próxima só é liberada depois, conforme a regra definida pela TI.',
    'Não precisa atribuir tudo. O conferente pode bipar a nota no coletor e pegar sozinho um documento "Sem conferente" da sequência.',
  ],
  relacionadas: ['supervisor-patio', 'supervisor-sequencia-relatorio', 'supervisor-fechamentos', 'supervisor-cancelados', 'conferencia'],
}
