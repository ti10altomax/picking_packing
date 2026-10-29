import type { AjudaTela } from './tipos'

export const supervisorDivergencias: AjudaTela = {
  chave: 'supervisor-divergencias',
  titulo: 'Divergências de barra',
  menu: 'Gestão → Divergências',
  rota: '/supervisor/divergencias',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Use quando a mercadoria está certa, mas a etiqueta de barras da fábrica está errada e o coletor não aceita a bipagem. Você informa a barra lida e libera, e o sistema registra a ocorrência para cobrar a fábrica.',
  capturas: [
    {
      src: '/manual/supervisor-divergencias.png',
      legenda: 'Busca do pedido em conferência e a lista de divergências registradas recentemente.',
    },
  ],
  passos: [
    'Quando o conferente chamar com um código divergente, abra Gestão → Divergências.',
    'No passo "1. Pedido em conferência", busque o documento por número ou cliente e toque nele. Só aparecem documentos em conferência (azul).',
    'No passo "2. Item correto e barra lida", toque no item que o conferente está bipando. Itens já completos ficam apagados.',
    'Digite o código que o coletor leu em "Barra lida (divergente)". Peça ao conferente para ler o código do coletor ou da etiqueta.',
    'Confira a quantidade em "Qtd". O padrão é 1. Digite a quantidade que foi bipada com esse código.',
    'Se quiser, escreva uma "Observação", por exemplo "Etiqueta da fábrica com EAN antigo".',
    'Toque em "Liberar e registrar". A quantidade entra no volume aberto do pedido e o conferente segue bipando.',
    'Confira o registro em "Registradas recentemente".',
  ],
  elementos: [
    {
      nome: 'Barra lida (divergente)',
      descricao: 'O código impresso na etiqueta errada, exatamente como o coletor leu. Campo obrigatório.',
    },
    {
      nome: 'Qtd',
      descricao: 'Quantas unidades daquele item entram no volume com essa liberação. Obrigatório, no mínimo 1.',
    },
    {
      nome: 'Liberar e registrar',
      descricao:
        'Soma a quantidade ao item, no volume que está aberto, e grava a divergência. Fica habilitado quando há item, código e quantidade.',
    },
    {
      nome: 'Vale só para esta ocorrência',
      descricao:
        'A barra errada não passa a valer para o produto. Na próxima vez que ela aparecer, o conferente será travado de novo e você precisará liberar de novo.',
    },
    {
      nome: 'Registradas recentemente',
      descricao:
        'Mostra a barra lida, o item a que foi ligada (SKU), a quantidade, o documento, a data, quem liberou e a observação.',
    },
  ],
  situacoes: [
    {
      quando: '"o código bate com o item — não é divergência, bipe normalmente no coletor"',
      oQueFazer: 'A barra que você digitou já é a do item. Peça ao conferente para bipar de novo no coletor.',
    },
    {
      quando: '"quantidade excede o pedido"',
      oQueFazer: 'Essa quantidade, somada ao que já foi separado, passa do pedido. Diminua o valor em "Qtd".',
    },
    {
      quando: '"nenhum volume aberto — peça ao conferente para abrir um volume"',
      oQueFazer: 'O conferente precisa abrir um volume no coletor. Depois, toque em "Liberar e registrar" de novo.',
    },
    {
      quando: '"só é possível liberar durante a conferência"',
      oQueFazer: 'O documento não está mais em conferência (azul). Confira o status em Agora ou no Histórico.',
    },
    {
      quando: 'Nenhum documento aparece na busca.',
      oQueFazer: 'O conferente ainda não abriu o documento. Só documentos em conferência aparecem aqui.',
    },
  ],
  dicas: [
    'Use esta tela só quando a mercadoria está certa. Se o produto é outro, o conferente deve marcar o documento como Não conforme.',
    'O registro serve para cobrar a fábrica pela etiquetagem errada. Escreva uma observação clara, com o lote quando souber.',
  ],
  relacionadas: ['supervisor-agora', 'supervisor-nao-conformes', 'supervisor-erros', 'conferencia-pedido'],
}
