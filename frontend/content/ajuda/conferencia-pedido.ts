import type { AjudaTela } from './tipos'

export const conferenciaPedido: AjudaTela = {
  chave: 'conferencia-pedido',
  titulo: 'Conferência por bipagem',
  rota: '/conferencia/[id]',
  perfis: ['conferente'],
  resumo:
    'Tela onde você confere o documento item a item, bipando o código de barras e montando os volumes. Chega aqui ao tocar num documento em Atribuídos a mim.',
  capturas: [
    {
      src: '/manual/conferencia-pedido-iniciar.png',
      legenda: 'Antes de começar: escolha quem separou o pedido.',
      mobile: true,
    },
    {
      src: '/manual/conferencia-pedido.png',
      legenda: 'Conferência em andamento: progresso, volumes e barra de bipagem.',
      mobile: true,
    },
    {
      src: '/manual/conferencia-pedido-itens.png',
      legenda: 'Mais abaixo na mesma tela: lista de itens com código de barras e progresso de cada um.',
      mobile: true,
    },
  ],
  passos: [
    'Em "Quem separou este pedido?", toque no nome do separador. Sem essa escolha o botão fica cinza.',
    'Toque em Iniciar conferência.',
    'Toque em + Volume, escolha caixa, fardo ou outro, confira o identificador e toque em Criar.',
    'Bipe o produto na barra "Bipe o código…". Cada leitura soma 1 unidade no volume ativo, sem abrir nada.',
    'Para pôr várias unidades de uma vez (caixa fechada), toque em Qtd antes de bipar, ou toque no item na lista. Informe a quantidade e toque em Confirmar.',
    'Caixa ou fardo fechado da fábrica: bipe a etiqueta da OP (só números, menos de 13 dígitos). Se a OP bate com o que falta, o sistema cria o volume "OP N" já fechado com todos os itens, e decide sozinho se é caixa ou fardo pelo produto. Não precisa abrir volume antes.',
    'Repita até todos os itens ficarem com ✓. Abra outro volume com + Volume sempre que precisar.',
    'Quando o botão ficar verde, toque em Concluir ✓ e confirme.',
  ],
  elementos: [
    {
      nome: 'Quem separou este pedido?',
      descricao:
        'Obrigatório. Só aparecem os separadores liberados hoje pelo Sup. Pátio. Sem nenhum nome na lista, peça a liberação ao Sup. Pátio.',
    },
    {
      nome: 'Não identificado',
      descricao:
        'Use só quando não souber quem separou. Fica destacado em amarelo e aparece assim nos relatórios.',
    },
    {
      nome: 'Separado por / trocar',
      descricao: 'Mostra quem foi apontado. Toque em trocar para corrigir durante a conferência.',
    },
    {
      nome: 'Barra de progresso e unidades',
      descricao: 'Mostra quantas unidades já foram bipadas do total e quantos volumes existem. Fica verde com tudo bipado.',
    },
    {
      nome: 'Volume atual e ativo',
      descricao:
        'As bipagens entram no volume marcado como ativo. Para mudar, abra o volume na lista e toque em Tornar este o volume ativo.',
    },
    {
      nome: 'Lixeira',
      descricao:
        'Ao lado de cada lançamento do volume. Remove o lançamento e a quantidade volta para a fila. Um volume vazio tem o botão Apagar volume.',
    },
    {
      nome: 'Qtd',
      descricao:
        'Na barra de bipagem. Toque antes de bipar e a próxima leitura abre a tela de quantidade. A barra fica amarela enquanto estiver armado. Depois dessa leitura volta sozinho para 1 em 1. Toque de novo para cancelar.',
    },
    {
      nome: 'Volume "OP N" (caixa ou fardo)',
      descricao:
        'Criado sozinho ao bipar a OP de uma caixa ou fardo fechado da fábrica. O tipo vem do produto. Já vem fechado, sem lixeira nos lançamentos. Para corrigir, abra o volume e toque em Desfazer OP: as quantidades voltam e a OP pode ser lida de novo.',
    },
    {
      nome: 'Ícone da câmera',
      descricao:
        'Na barra de bipagem. Um toque liga a câmera, que fica lendo um código atrás do outro (cada leitura soma 1, OP lança o volume inteiro). Toque em × Desligar para fechar. O mesmo código só vale de novo depois de 3 segundos, para não lançar duas vezes a peça que ficou na frente da lente; outro código vale na hora. A câmera fecha sozinha quando a leitura abre a tela de quantidade (Qtd armado) ou quando falta criar um volume.',
    },
    {
      nome: 'copiar',
      descricao: 'Ao lado do código de barras do item. Copia o número do código.',
    },
    {
      nome: 'Item com ✓ (verde)',
      descricao: 'Item completo. Não aceita mais bipagem. Item incompleto mostra bipado/pedido, como 6/18.',
    },
    {
      nome: 'Falta N unid.',
      descricao: 'Botão cinza no rodapé. Mostra quantas unidades faltam bipar. Vira Concluir ✓ quando tudo foi bipado.',
    },
    {
      nome: 'Não conforme',
      descricao: 'Botão vermelho no rodapé. Use quando o pedido tem problema e não dá para concluir.',
    },
  ],
  situacoes: [
    {
      quando: 'A barra de bipagem mostra "Crie um volume antes de bipar".',
      oQueFazer: 'Toque em + Volume e crie o volume. Depois bipe de novo.',
    },
    {
      quando: 'Aviso verde "+1" com o SKU e "N de M".',
      oQueFazer: 'A leitura entrou: 1 unidade no volume ativo. Siga bipando.',
    },
    {
      quando: 'Aparece "Este código não é de nenhum item pendente" ou "Este item já está completo".',
      oQueFazer: 'O produto não está neste pedido ou o item já está completo. Confira o produto na mão.',
    },
    {
      quando: 'Vermelho: "OP não confere — nada foi lançado", com a lista do que diverge.',
      oQueFazer:
        'A caixa ou fardo tem produto que não é deste documento ou mais peças do que falta. Nada entrou. Separe o volume e avise o Sup. Pátio, ou confira peça a peça.',
    },
    {
      quando: 'Aparece "Esta OP já foi lida".',
      oQueFazer: 'Essa OP já entrou neste ou em outro documento (o aviso diz qual). Cada OP só entra uma vez.',
    },
    {
      quando: 'Aparece "OP não encontrada".',
      oQueFazer: 'A fábrica ainda não publicou essa OP. Confira a etiqueta ou confira peça a peça.',
    },
    {
      quando: 'Bipou uma unidade a mais por engano.',
      oQueFazer: 'Abra o volume e toque na lixeira ao lado do lançamento de 1×.',
    },
    {
      quando: 'Vermelho: "Código não corresponde ao item escolhido".',
      oQueFazer:
        'Você bipou outro produto. Separe o produto certo e bipe de novo. Se o produto está certo mas o código não passa, só o supervisor libera, pelo web.',
    },
    {
      quando: 'Amarelo: "Só restam N unidade(s)" ou "Excede a quantidade pedida".',
      oQueFazer: 'Diminua a quantidade para o que falta. O sistema não deixa passar do pedido.',
    },
    {
      quando: 'Verde ao confirmar.',
      oQueFazer: 'A bipagem foi aceita e entrou no volume ativo. Siga para o próximo item.',
    },
    {
      quando: 'Lançou no volume errado.',
      oQueFazer: 'Abra o volume, toque na lixeira ao lado do lançamento e bipe de novo no volume certo.',
    },
    {
      quando: 'Sobrou mercadoria. Ao tocar em Concluir ✓, a tela pergunta "Sobrou mercadoria?".',
      oQueFazer:
        'Escolha o item, informe a quantidade e toque em +. Depois toque em Concluir ✓. A tela avisa "Sobra registrada" e o pedido fica em Aguardando fechamento (roxo) até o Sup. Pátio fechar.',
    },
    {
      quando: 'Falta mercadoria e não dá para bipar tudo.',
      oQueFazer:
        'Toque em Não conforme, escolha o motivo (Divergência de quantidade, Produto errado ou Item ausente), escreva o detalhe se quiser e toque em Confirmar. O que ficou sem bipar vira falta registrada para o Sup. Pátio.',
    },
    {
      quando: 'Ao concluir, aparece "Etiquetas enviadas".',
      oQueFazer: 'Cole uma etiqueta em cada volume. Elas saem na impressora padrão quando o documento tem transportadora.',
    },
    {
      quando: 'Aparece "Etiqueta pendente".',
      oQueFazer: 'Nada a fazer. A etiqueta sai sozinha quando a transportadora ou a nota fiscal chegar do Senior.',
    },
    {
      quando: 'Tela vermelha "Cancelado no Senior" com "Pare a conferência."',
      oQueFazer:
        'Deixe as caixas como estão e avise o Sup. Pátio. Toque em Voltar à lista. Se a nota for reemitida, o Sup. Pátio transfere a conferência.',
    },
    {
      quando: 'Aparece "Nenhum separador liberado hoje — peça ao Supervisor de Pátio."',
      oQueFazer: 'Peça ao Sup. Pátio para liberar os separadores do dia.',
    },
    {
      quando: 'Aparece "termine a sequência X primeiro" ao iniciar.',
      oQueFazer: 'Volte à lista e termine antes os documentos da sequência X.',
    },
  ],
  dicas: [
    'Peça a peça, só bipe. Caixa fechada com muitas unidades: toque em Qtd e bipe uma vez.',
    'Apague só volumes vazios. Com itens, remova os lançamentos antes.',
  ],
  relacionadas: ['conferencia', 'login'],
}
