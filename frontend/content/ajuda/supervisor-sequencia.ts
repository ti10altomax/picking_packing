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
      nome: 'Colar lista',
      descricao: 'Recebeu uma relação de notas? Toque em "Colar lista", cole os números (vírgula, espaço ou um por linha; 151281-151290 vale pelo intervalo) ou abra o .txt e toque em "Buscar". O sistema mostra quais estão nesta tela, quais estão em outra (com o botão "Ver") e quais não achou. "Mostrar N na tela" deixa a tela só com essas notas; a faixa azul "Mostrando só a lista colada" tem o botão "Limpar filtro" para voltar ao normal.',
    },
    {
      nome: 'Nome da sequência (ao lado do número)',
      descricao:
        'Texto livre do Pátio — hoje, a aba da planilha paralela. Toque nele (ou em "+ nome") para escrever ou trocar; Enter salva, Esc cancela. Aparece nos cards do Pátio, no seletor de destino, no coletor do conferente e no relatório.',
    },
    {
      nome: 'Sem conferente (laranja)',
      descricao:
        'Documento Selecionado, ainda sem conferente. O conferente pode pegá-lo sozinho bipando a nota, então atribuir é opcional.',
    },
    {
      nome: 'Busca e filtros de status (acima da lista)',
      descricao:
        'Digite parte do número, do cliente, da transportadora ou do conferente para filtrar a lista na hora. Os botões redondos filtram por status e mostram quantos documentos há em cada um; toque de novo para desfazer. "Todos" volta à lista inteira. Nada disso muda o que está no servidor.',
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
      nome: 'Em cotação / Tirar de cotação',
      descricao: 'Use quando a nota foi faturada com uma transportadora que ainda vai mudar (o frete está em cotação). Marcada, a etiqueta de volume não sai e as telas mostram "EM COTAÇÃO". A nota sai de cotação sozinha quando a transportadora mudar (carta de correção ou troca no Senior); se a cotação terminar sem troca, toque em "Tirar de cotação".',
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
      quando: 'Etiqueta âmbar "⚠ Nota já embarcada" na linha.',
      oQueFazer: 'A nota entrou num embarque no Senior com o documento ainda atribuído ou em conferência. Nada muda sozinho: confirme com o conferente se a mercadoria saiu. Quando a conferência for concluída, o documento vai para Gestão → Embarcados.',
    },
    {
      quando: 'Documento com a situação "Embarcado".',
      oQueFazer: 'Estava sem conferente e a nota saiu num embarque. Conta como finalizado na sequência.',
    },
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
