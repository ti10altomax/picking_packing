import type { AjudaTela } from './tipos'

/**
 * Abertura do manual: o caminho de um pedido do Senior até a caixa fechada.
 * Não é uma tela — só aparece em /ajuda (rota apontada para a própria página,
 * então nenhum "?" a mostra).
 */
export const visaoGeral: AjudaTela = {
  chave: 'visao-geral',
  titulo: 'Como o Separa funciona',
  rota: '/ajuda',
  perfis: ['conferente', 'supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'O Separa acompanha cada pedido ou nota fiscal do Senior desde a escolha do que vai ser separado até a caixa conferida e etiquetada. Cada perfil cuida de uma etapa, e o status do documento mostra em que ponto ele está.',
  passos: [
    'O sistema lê do Senior, sozinho e de poucos em poucos minutos, os pedidos abertos e as notas fiscais fechadas. Eles entram como Pendente.',
    'A Sup. Vendas escolhe o que vai para separação e envia. O documento vira Selecionado.',
    'A Sup. Pátio monta sequências com os documentos selecionados e, se quiser, já indica o conferente de cada um. Com conferente, o documento vira Atribuído.',
    'O conferente, no coletor, pega o documento (pela lista ou bipando a nota), aponta quem separou a mercadoria e inicia. O documento vira Em conferência.',
    'O conferente abre um volume (caixa, fardo ou outro), bipa cada item na quantidade que está colocando ali e abre volumes novos conforme embala.',
    'Com tudo bipado, o conferente conclui. O documento vira Conferido e, se já tem transportadora e nota fiscal, a etiqueta de cada volume sai na impressora.',
    'Se faltou mercadoria, o conferente marca Não conforme e o pedido vai para a lista de exceções da supervisão. Se sobrou, o pedido fica Aguardando fechamento até a Sup. Pátio fechar.',
    'Se o Senior cancelar o documento no meio do caminho, o coletor bloqueia na hora e a Sup. Pátio pode transferir a conferência para a nota reemitida.',
  ],
  elementos: [
    { nome: 'Pendente', descricao: 'Cinza. Veio do Senior e ainda não foi escolhido para separação.' },
    { nome: 'Selecionado', descricao: 'Laranja. A Sup. Vendas enviou; espera a Sup. Pátio colocar numa sequência.' },
    { nome: 'Atribuído', descricao: 'Amarelo. Está na sequência com um conferente definido, ainda não iniciado.' },
    { nome: 'Em conferência', descricao: 'Azul. O conferente está bipando e montando volumes.' },
    { nome: 'Aguardando fechamento', descricao: 'Roxo. Conferência terminou com sobra; a Sup. Pátio precisa fechar.' },
    { nome: 'Conferido', descricao: 'Verde. Concluído; volumes registrados e etiqueta liberada.' },
    { nome: 'Não conforme', descricao: 'Vermelho. Problema na conferência (falta, produto errado, divergência). Espera ação da supervisão.' },
    { nome: 'Cancelado', descricao: 'Vermelho. Cancelado no Senior ou pela supervisão; o que já foi conferido fica guardado para transferência.' },
    { nome: 'Botão ?', descricao: 'No cabeçalho de qualquer tela, abre a ajuda daquela tela. No coletor, abre este manual no navegador do aparelho.' },
  ],
  dicas: [
    'Os perfis enxergam telas diferentes: o conferente só vê a conferência; a Sup. Vendas vê Vendas e Gestão; a Sup. Pátio vê Pátio, Separadores e Gestão; o admin vê tudo.',
    'Toda mudança de status fica registrada com quem fez e quando. O botão Histórico, nas listas da supervisão, mostra essa linha do tempo.',
  ],
  relacionadas: ['login', 'supervisor-vendas', 'supervisor-patio', 'conferencia'],
}
