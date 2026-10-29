import type { AjudaTela } from './tipos'

export const adminImpressoras: AjudaTela = {
  chave: 'admin-impressoras',
  titulo: 'Impressoras e etiqueta de volume',
  menu: 'Admin → Impressoras',
  rota: '/admin/impressoras',
  perfis: ['admin'],
  resumo:
    'Define como a etiqueta de volume 10x15 é impressa e cadastra as impressoras. Use quando for ligar a impressão automática, trocar de impressora ou mudar o modelo da etiqueta.',
  capturas: [
    { src: '/manual/admin-impressoras.png', legenda: 'Bloco Etiqueta de volume e a lista de impressoras cadastradas.' },
  ],
  passos: [
    'Toque em + Nova impressora para cadastrar. Preencha Nome, Modelo e Tipo de conexão.',
    'Para impressora de rede, informe IP e Porta (em geral 9100). Para USB, cole o token no campo Agent ID.',
    'Confira DPI (203 ou 300), Largura (mm) 100 e Altura (mm) 150, que é a etiqueta 10x15. Informe a Mesa / estação, se houver. Toque em Salvar.',
    'Toque em Testar no cartão da impressora. O resultado aparece abaixo do cartão.',
    'No bloco Etiqueta de volume, escolha a Impressora padrão.',
    'Marque ou desmarque Imprimir automaticamente ao concluir e Só imprimir com NF emitida.',
    'Escolha o Modelo da etiqueta. Cada mudança é salva na hora e aparece "Salvo." ao lado.',
  ],
  elementos: [
    { nome: 'Impressora padrão', descricao: 'A que imprime a etiqueta sozinha. Em "nenhuma (só pelo botão)", nada sai sozinho: a etiqueta é impressa pelo botão em Gestão → Etiquetas.' },
    { nome: 'Imprimir automaticamente ao concluir', descricao: 'Marcado: a etiqueta sai quando o documento vira Conferido, se houver impressora padrão e transportadora. Desmarcado: só pelo botão.' },
    { nome: 'Só imprimir com NF emitida', descricao: 'Marcado: o pedido só imprime depois de faturado. Até lá o botão fica desabilitado e o documento espera em Gestão → Etiquetas. Documento que já é NF não muda. Desmarcado: basta ter transportadora.' },
    { nome: 'Modelo — Padrão', descricao: 'Descrição e SKU de cada item, 10 itens por etiqueta. Use para volumes com poucos itens, quando a descrição ajuda a achar o produto.' },
    { nome: 'Modelo — Compacta', descricao: 'Só o SKU, em 2 ou 3 colunas, até 54 itens por etiqueta. Use para volumes com muitos itens, para gastar menos etiquetas.' },
    { nome: 'Rede / USB', descricao: 'Rede: o sistema fala direto com a impressora pelo IP. USB: a impressão passa por um agente instalado no computador da impressora.' },
    { nome: 'ZPL / PDF', descricao: 'Formato enviado à impressora. Para Zebra, use ZPL.' },
    { nome: 'online / offline', descricao: 'Só em impressora USB: mostra se o agente deu sinal nos últimos 2 minutos. Sem sinal, aparece "sem heartbeat".' },
    { nome: 'Testar', descricao: 'Verifica se a impressora responde. Não imprime nada.' },
    { nome: 'Editar', descricao: 'Abre os dados da impressora para alterar.' },
    { nome: 'Desativar', descricao: 'Tira a impressora de uso, depois de confirmar. Ela continua na lista com o selo Inativa.' },
  ],
  situacoes: [
    { quando: 'Teste: "offline — TCP … sem resposta"', oQueFazer: 'A impressora de rede não respondeu. Confira se está ligada, na rede e se o IP e a porta estão certos.' },
    { quando: 'Teste: "offline — IP não configurado"', oQueFazer: 'Edite a impressora e preencha o IP.' },
    { quando: 'Teste: "offline — agent_id não configurado"', oQueFazer: 'Edite a impressora e cole o token do agente em Agent ID.' },
    { quando: 'Teste: "offline — agent não registrado ou sem heartbeat"', oQueFazer: 'O token não bate com nenhum agente ou o agente está parado. Confira em Print Agents.' },
    { quando: 'Teste: "offline — último heartbeat há …"', oQueFazer: 'O agente parou de dar sinal. Ligue o computador da impressora e abra o agente.' },
    { quando: 'Documento Conferido não imprime sozinho', oQueFazer: 'Confira se há Impressora padrão, se Imprimir automaticamente ao concluir está marcado, se o documento tem transportadora e, com Só imprimir com NF emitida marcado, se já foi faturado.' },
    { quando: 'Impressora padrão aparece como "nenhuma"', oQueFazer: 'Só aparecem no seletor as impressoras ativas. Cadastre ou reative uma e escolha de novo.' },
  ],
  dicas: [
    'O modelo vale para Zebra de rede, agente USB e impressão pelo navegador.',
    'Para comparar os modelos sem mudar a configuração, abra a página da etiqueta com o modelo escolhido na hora.',
    'A Zebra de rede e a impressão pelo navegador não precisam de agente.',
  ],
  relacionadas: ['admin-agents', 'etiqueta-navegador', 'supervisor-etiquetas', 'supervisor-conferidos'],
}
