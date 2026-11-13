import type { AjudaTela } from './tipos'

export const supervisorVendas: AjudaTela = {
  chave: 'supervisor-vendas',
  titulo: 'Vendas — pedidos pendentes',
  menu: 'Vendas',
  rota: '/supervisor/vendas',
  perfis: ['supervisor_vendas', 'admin'],
  resumo:
    'Lista os pedidos e as notas fiscais que chegaram do Senior e ainda não foram para o galpão. É aqui que você escolhe o que entra na conferência. Depois do envio, o Sup. Pátio monta as sequências.',
  capturas: [
    {
      src: '/manual/supervisor-vendas.png',
      legenda: 'Pedidos pendentes com busca, filtros e a transportadora de cada documento.',
    },
  ],
  passos: [
    'Abra Vendas. A lista já vem atualizada: o sistema busca no Senior sozinho, a cada poucos minutos, só os documentos dos últimos dias.',
    'Procure um documento pelo número do pedido, pelo número da NF ou pelo nome do cliente no campo "Buscar por pedido, NF ou cliente". O número do pedido também acha as notas que saíram dele.',
    'Recebeu a relação das notas de outro setor? Toque em "Colar lista", cole os números (separados por vírgula ou um por linha) ou toque em "Abrir arquivo .txt", e depois em "Buscar". O que não estiver no Separa é trazido do Senior na hora. As notas pendentes já vêm marcadas: confira e toque em "Enviar para conferência".',
    'Buscou um número e não achou? Se a nota for mais antiga que a janela do sistema, toque em "Buscar … no Senior" embaixo da mensagem: ela entra na lista na hora.',
    'Use os filtros para reduzir a lista: Pedidos ou Notas fiscais, Entrega, Retira ou Sem frete, Com transportadora ou Sem transportadora.',
    'Marque a caixa de cada documento que vai para o galpão. A caixa do cabeçalho marca todos os documentos que estão na tela.',
    'Confira a barra de baixo: ela mostra quantos documentos você marcou. Para desfazer, toque em "Limpar".',
    'Toque em "Enviar para conferência". Os documentos saem desta lista e passam para o Sup. Pátio como Selecionado (laranja).',
    'Se a lista tiver mais documentos do que a tela mostra, toque em "Carregar mais".',
  ],
  elementos: [
    {
      nome: 'Colar lista',
      descricao:
        'Abre a caixa para colar a relação de notas que vem de outro setor (ou abrir um .txt). Aceita números separados por vírgula, ponto e vírgula, espaço ou um por linha; o que não for número é ignorado. O sistema separa o resultado em "Prontas para enviar" (já marcadas), "Já em outra etapa" (com o botão Ver) e "Não encontradas".',
    },
    {
      nome: 'trazida do Senior agora (azul)',
      descricao: 'Na lista colada: a nota não estava no Separa e foi importada do Senior nesse momento, com os itens dela.',
    },
    {
      nome: 'Buscar … no Senior',
      descricao:
        'Aparece quando a busca por um número não acha nada. Consulta o Senior na hora e, se a nota estiver fechada lá, traz para a lista. A busca normal não faz isso sozinha para não importar nota a cada número digitado pela metade.',
    },
    {
      nome: 'Pedidos / Notas fiscais',
      descricao:
        'Filtra pelo tipo do documento. Nota fiscal é uma venda já faturada: pode ter vindo de um pedido ou não. "Todos" mostra os dois.',
    },
    {
      nome: 'Badge NF',
      descricao: 'Aparece ao lado do número quando o documento é uma nota fiscal. Pedido não tem badge de tipo.',
    },
    {
      nome: 'ped. 169992',
      descricao:
        'Ao lado do badge NF: o pedido de onde a nota saiu. Um pedido pode ser faturado em várias notas, e cada nota é conferida com os itens dela.',
    },
    {
      nome: 'NF 150250 (âmbar)',
      descricao:
        'Ao lado de um pedido: a nota que já saiu dele e também está na lista. Envie a nota, não o pedido — o sistema não deixa conferir os dois.',
    },
    {
      nome: 'Entrega / Retira / Sem frete',
      descricao:
        'Filtro e badge. Entrega: o frete é por conta da Altomax e a mercadoria vai por transportadora. Retira: o cliente busca. Sem frete: o documento não tem frete.',
    },
    {
      nome: 'Com transportadora / Sem transportadora',
      descricao: 'Filtra pelo que o Senior já informou. Use "Sem transportadora" para achar documentos que ainda precisam de cadastro.',
    },
    {
      nome: 'Sem transportadora (laranja)',
      descricao:
        'Aviso embaixo do cliente. A etiqueta de volume só sai quando o documento tem transportadora. Acerte no Senior antes ou logo depois de enviar; quando ela chegar, a etiqueta sai sem espera.',
    },
    {
      nome: 'Tempo e itens',
      descricao: 'O tempo ("há 13 minutos") conta desde que o documento apareceu no sistema. À direita fica a quantidade de itens.',
    },
    {
      nome: '50 de 16455',
      descricao: 'No cabeçalho da lista: quantos documentos estão na tela e quantos existem com os filtros atuais.',
    },
  ],
  situacoes: [
    {
      quando: 'Nenhum documento pendente com esses filtros.',
      oQueFazer: 'Tire algum filtro ou apague a busca. Se ainda assim estiver vazio, toque em "Atualizar" e espere o próximo ciclo do Senior.',
    },
    {
      quando: 'Mensagem verde "N pedido(s) enviado(s) para conferência · M ignorado(s)".',
      oQueFazer:
        'Os ignorados já tinham sido enviados por outra pessoa ou não estão mais pendentes. Não precisa fazer nada; a lista já foi recarregada.',
    },
    {
      quando: 'Na mensagem aparece "a NF … desse pedido já está na conferência" ou "o pedido … dessa NF já está na conferência".',
      oQueFazer:
        'É a mesma venda: o pedido e a nota que saiu dele. Só um dos dois vai para o galpão. Na dúvida, mande a nota, que tem os itens que estão saindo agora.',
    },
    {
      quando: 'Mensagem vermelha "Erro ao enviar pedidos".',
      oQueFazer: 'Toque em "Enviar para conferência" de novo. Se repetir, avise o admin.',
    },
    {
      quando: 'Um documento que você espera não aparece.',
      oQueFazer:
        'O sistema só importa sozinho os últimos dias do Senior. Digite o número na busca e toque em "Buscar … no Senior": se a nota estiver fechada lá, ela entra na lista na hora. Se não achar, confira o número — a nota pode não ter sido fechada ainda ou ter sido cancelada.',
    },
    {
      quando: 'Na lista colada, uma nota ficou em "Não encontradas".',
      oQueFazer:
        'Ela não está no Separa nem no Senior como nota fechada. Confira o número com quem mandou a lista; se a nota ainda vai ser fechada, cole de novo mais tarde.',
    },
    {
      quando: 'Na lista colada, uma nota ficou em "Já em outra etapa".',
      oQueFazer:
        'Alguém já enviou, ou a nota é de um pedido que já está em conferência. Não precisa enviar de novo; toque em "Ver" para abrir a lista onde ela está.',
    },
    {
      quando: 'Na lista colada aparece em vermelho "O Senior não respondeu".',
      oQueFazer:
        'As notas que já estavam no Separa foram encontradas normalmente; só as outras não puderam ser consultadas. Toque em "Buscar" de novo daqui a pouco. Se repetir, avise o admin.',
    },
  ],
  dicas: [
    'A relação de notas pode vir por e-mail ou de outro sistema: selecione, copie e cole em "Colar lista" — não precisa digitar uma a uma.',
    'Filtre por "Sem transportadora" antes de enviar: dá tempo de acertar o cadastro no Senior e a etiqueta sai sem espera.',
    'Documento cancelado no Senior some da lista sozinho.',
  ],
  relacionadas: ['supervisor-patio', 'supervisor-etiquetas', 'supervisor-agora'],
}
