import type { AjudaTela } from './tipos'

export const etiquetaNavegador: AjudaTela = {
  chave: 'etiqueta-navegador',
  titulo: 'Etiquetas de volume — imprimir pelo navegador',
  menu: 'Conferidos / Gestão → Etiquetas → Etiqueta',
  rota: '/etiquetas/[id]',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Mostra as etiquetas 10x15 de um documento Conferido, uma por volume, prontas para imprimir em qualquer impressora pelo navegador. Chega-se aqui pelo botão Etiqueta em Conferidos ou em Gestão → Etiquetas.',
  capturas: [
    { src: '/manual/etiqueta-navegador.png', legenda: 'Etiqueta do volume 1/2, com Baixar ZPL e Imprimir no alto.' },
  ],
  passos: [
    'Confira o cabeçalho: documento, quantidade de volumes e etiquetas, transportadora e modelo.',
    'Role a página e confira cada etiqueta: VOLUME N / M, cliente, transportadora e itens.',
    'Toque em Imprimir. A impressão é registrada e o navegador abre a janela de impressão.',
    'Na janela, escolha a impressora e o papel 100 × 150 mm.',
    'Confirme a impressão e confira se saiu uma etiqueta por volume.',
    'Para colar nas caixas, siga o número do volume: 1/2 na primeira caixa, 2/2 na segunda.',
  ],
  elementos: [
    { nome: 'VOLUME 1 / 2', descricao: 'Número do volume e total de volumes do documento. Quando o volume tem muitos itens, aparece "pág. N/M" e há mais de uma etiqueta para o mesmo volume.' },
    { nome: 'NF 980509 ao lado do pedido', descricao: 'A nota fiscal já emitida. O código de barras passa a ser o da NF.' },
    { nome: 'Modelo padrão ou compacto', descricao: 'Aparece no cabeçalho. O padrão mostra descrição e SKU; o compacto mostra só o SKU em colunas.' },
    { nome: '(forçado pela URL)', descricao: 'Aparece ao lado do modelo quando o endereço da página tem o parâmetro de modelo.' },
    { nome: 'Baixar ZPL', descricao: 'Baixa o arquivo da etiqueta no formato da Zebra. Use para testar numa Zebra.' },
    { nome: 'Imprimir', descricao: 'Registra a impressão e abre a janela do navegador. Fica desabilitado quando há bloqueio.' },
    { nome: 'última impressão', descricao: 'Mostra quando e por qual canal a etiqueta saiu pela última vez.' },
  ],
  situacoes: [
    { quando: 'Quadro vermelho "Não pode imprimir ainda: pedido ainda sem nota fiscal emitida no Senior…"', oQueFazer: 'O pedido ainda não foi faturado. Aguarde a NF. A etiqueta fica pendente em Gestão → Etiquetas e sai quando a nota chegar.' },
    { quando: 'Quadro vermelho "Não pode imprimir ainda: documento ainda sem transportadora no Senior…"', oQueFazer: 'Falta a transportadora no Senior. Peça ao Sup. Vendas para preencher. A etiqueta fica pendente até ela chegar.' },
    { quando: 'Quadro vermelho "etiqueta só depois da conferência concluída"', oQueFazer: 'O documento ainda não está Conferido. Termine a conferência primeiro.' },
    { quando: 'Quadro vermelho "documento cancelado no Senior — não imprime etiqueta"', oQueFazer: 'Não imprima. O documento foi cancelado.' },
    { quando: '"Nenhum volume com itens para etiquetar."', oQueFazer: 'Os volumes estão vazios. Confira a conferência do documento.' },
    { quando: '"Não foi possível registrar a impressão (a página ainda pode ser impressa)."', oQueFazer: 'A impressão não ficou registrada no sistema, mas a janela do navegador abre mesmo assim. Imprima e avise a TI.' },
    { quando: '"Erro ao carregar as etiquetas"', oQueFazer: 'Feche a página e abra de novo pelo botão Etiqueta.' },
  ],
  dicas: [
    'Para comparar os dois modelos, acrescente ?modelo=padrao ou ?modelo=compacta no fim do endereço da página. Isso não muda a configuração.',
    'Esse caminho funciona com qualquer impressora instalada no computador. Não precisa de agente.',
    'Cada toque em Imprimir fica registrado. Use de novo só quando precisar de segunda via.',
  ],
  relacionadas: ['supervisor-etiquetas', 'supervisor-conferidos', 'admin-impressoras', 'admin-agents'],
}
