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
    'Use os filtros para reduzir a lista: Pedidos ou Notas fiscais, Entrega, Retira ou Sem frete, Com transportadora ou Sem transportadora.',
    'Marque a caixa de cada documento que vai para o galpão. A caixa do cabeçalho marca todos os documentos que estão na tela.',
    'Confira a barra de baixo: ela mostra quantos documentos você marcou. Para desfazer, toque em "Limpar".',
    'Toque em "Enviar para conferência". Os documentos saem desta lista e passam para o Sup. Pátio como Selecionado (laranja).',
    'Se a lista tiver mais documentos do que a tela mostra, toque em "Carregar mais".',
  ],
  elementos: [
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
        'O sistema só importa os últimos dias do Senior. Confirme que o documento está aberto no Senior e espere alguns minutos pela próxima atualização.',
    },
  ],
  dicas: [
    'Filtre por "Sem transportadora" antes de enviar: dá tempo de acertar o cadastro no Senior e a etiqueta sai sem espera.',
    'Documento cancelado no Senior some da lista sozinho.',
  ],
  relacionadas: ['supervisor-patio', 'supervisor-etiquetas', 'supervisor-agora'],
}
