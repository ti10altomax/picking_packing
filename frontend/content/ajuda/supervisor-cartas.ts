import type { AjudaTela } from './tipos'

export const supervisorCartas: AjudaTela = {
  chave: 'supervisor-cartas',
  titulo: 'Cartas de correção',
  menu: 'Gestão → Cartas de correção',
  rota: '/supervisor/cartas',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Corrige a transportadora, o frete (entrega ou retira) e a quantidade de volumes de uma NF já autorizada, por meio de uma carta de correção gravada no Senior. Vale para nota fiscal e também para pedido que já foi faturado.',
  capturas: [
    {
      src: '/manual/supervisor-cartas.png',
      legenda: 'Estado da configuração, busca da nota e lista das cartas feitas.',
    },
  ],
  passos: [
    'Abra Gestão → Cartas de correção. Leia a faixa do topo: "Modo", "Texto" e "Quem pode". Se o modo for "Desligado", a carta não pode ser gravada.',
    'Em "Corrigir uma nota", digite o número da NF, o número do pedido ou o cliente.',
    'Na lista que aparece, toque em "Corrigir NF" no documento certo. O sistema consulta o Senior e abre a janela "Corrigir nota fiscal".',
    'Confira no quadro de cima a NF, a situação dela no Senior e como está hoje: transportadora, frete e volumes.',
    'Escolha o que corrigir. Em "Transportadora", toque em "trocar" e busque pelo nome ou código. Em "Frete", escolha Entrega ou Retira. Em "Quantidade de volumes", digite o número certo, ou toque em "usar N do Separa" para pegar o que foi montado na conferência.',
    'Leia o "Texto da carta". É exatamente o que vai para a nota. O contador mostra o tamanho e o limite.',
    'Toque no botão de baixo ("Gravar no Senior", "Gravar e transmitir" ou "Simular", conforme o modo) e confirme na janela.',
    'Leia o resultado na janela e toque em "Fechar". A carta aparece em "Cartas feitas pelo Separa".',
  ],
  elementos: [
    {
      nome: 'Filtro da lista "Cartas feitas pelo Separa"',
      descricao:
        'Campo de texto ao lado do seletor de status: filtra por NF, pedido, cliente ou transportadora. Quando você digita na busca "Corrigir uma nota", a lista de baixo acompanha o mesmo número; dá para editar o filtro à parte.',
    },
    {
      nome: 'Reenviar carta completa (no modal)',
      descricao:
        'Cria uma carta NOVA, na sequência seguinte, repetindo transportadora, frete, volumes e as cartas anteriores que a nota tem hoje, mesmo sem mudar nada. Use quando a SEFAZ ficou com uma carta incompleta (por exemplo, a transportadora foi mas os volumes não). Passa pelos mesmos bloqueios de sequência.',
    },
    {
      nome: 'Reimportar carta no Senior (no bloqueio)',
      descricao:
        'Aparece quando uma carta do Separa já autorizada na SEFAZ foi apagada no Senior. Grava a carta de volta na E140CCE como "Autorizada", com o protocolo. Nada é transmitido. Sem isso, a próxima carta nasceria com a sequência errada e a SEFAZ recusaria.',
    },
    {
      nome: 'Aguardando transmissão (SDE)',
      descricao:
        'Chip azul: a carta foi enviada, mas a autorização da SEFAZ ainda não chegou (o serviço de documentos eletrônicos do Senior não a recebeu na hora, ou demorou). O Separa confere a cada 2 minutos e muda para Transmitida (ou Erro) sozinho. A nota só é alterada depois da autorização. Não refaça a correção.',
    },
    {
      nome: 'Modo: Desligado',
      descricao: 'A carta não é gravada. A janela abre, mas o botão de gravar fica apagado.',
    },
    {
      nome: 'Modo: Só gravar',
      descricao:
        'O Separa grava a carta no Senior como "Não enviada" e atualiza a NF. Quem transmite a carta para a SEFAZ é o faturamento, dentro do Senior.',
    },
    {
      nome: 'Modo: Gravar e transmitir',
      descricao:
        'O Separa transmite a carta para a SEFAZ e, com a autorização, atualiza a nota no Senior (transportadora, frete, volumes). Se a transmissão falhar, a nota não muda. Não tem volta. Avise o fiscal antes de usar. O admin escolhe o modo nesta tela.',
    },
    {
      nome: 'simulação (dry-run)',
      descricao: 'Etiqueta azul na faixa. O sistema monta e registra tudo, mas não chama o Senior e a nota não muda. O botão vira "Simular".',
    },
    {
      nome: 'Texto: montado pelo sistema',
      descricao:
        'O sistema escreve a carta no formato "ALTERA-SE TRANSPORTADORA PARA: …" / "ALTERA-SE QUANTIDADE PARA: …" com o que você escolheu. Você só pode acrescentar um "Complemento (opcional)".',
    },
    {
      nome: 'Texto: livre',
      descricao:
        'O sistema põe o texto montado no campo "Texto da carta" e você pode editar, apagar tudo ou escrever outro. O campo é obrigatório. "Remontar pelo sistema" volta ao texto original. Transportadora, frete e volumes continuam sendo alterados pelos campos acima.',
    },
    {
      nome: 'Gerar sozinha a carta dos volumes',
      descricao: 'Caixa de marcar na faixa de configuração (só o admin muda; aparece no modo "Gravar e transmitir"). Ligada, toda nota concluída dali em diante com quantidade de volumes diferente da NF, que já tenha transportadora e não esteja em cotação, ganha a carta de correção sozinha, em segundo plano. É uma carta por conferência: se o Senior recusar, ou se os volumes mudarem depois, o acerto volta a ser feito pelo "Corrigir NF". Na lista, essas cartas aparecem como "automática" no lugar do nome do usuário.',
    },
    {
      nome: 'Quem pode',
      descricao:
        'Perfis liberados para corrigir NF. Só o admin muda isso, em outra tela do sistema. Aqui você só lê.',
    },
    {
      nome: 'N carta(s) anterior(es) nesta nota',
      descricao:
        'A última carta substitui as anteriores. Por isso o texto novo repete todas elas. Toque em "ver" para ler.',
    },
    {
      nome: 'Cartas feitas pelo Separa',
      descricao:
        'Histórico das cartas. O filtro da direita tem Todas, Gravadas, Transmitidas, Erro ao gravar, Erro ao transmitir e Simuladas. Toque numa linha para ver o texto e o protocolo.',
    },
    {
      nome: 'Chips de status',
      descricao:
        'Gravada (amarelo): está no Senior, falta transmitir. Transmitida (verde): autorizada na SEFAZ. Erro ao gravar (vermelho): o Senior recusou. Erro ao transmitir (laranja): a transmissão falhou e a nota não foi alterada. Simulada (cinza): só teste.',
    },
  ],
  situacoes: [
    {
      quando: '"Carta autorizada na SEFAZ. Falta o Senior atualizar a nota."',
      oQueFazer: 'A carta já vale. O Separa tenta atualizar a nota no Senior sozinho a cada 2 minutos, e a etiqueta libera quando conseguir. Não refaça a correção. Se passar de uma hora, avise a TI.',
    },
    {
      quando: '"A carta N desta nota está Não enviada no Senior — ainda não foi transmitida/autorizada."',
      oQueFazer: 'A SEFAZ só aceita a próxima carta depois que a anterior é autorizada. Peça ao faturamento para transmitir (ou apagar) a carta N no Senior. Depois toque em "Já foi resolvido no Senior? Conferir de novo".',
    },
    {
      quando: '"A carta N desta nota já foi autorizada na SEFAZ …, mas o Senior ainda a mostra como Não enviada."',
      oQueFazer: 'A carta anterior valeu na SEFAZ, mas o Senior não registrou. Uma nova carta agora seria recusada como duplicata e ainda trocaria os dados da nota. Avise a TI ou o fiscal para acertar a carta N no Senior. Depois toque em "Já foi resolvido no Senior? Conferir de novo".',
    },
    {
      quando: '"A nota tem no Senior uma sobra de transmissão: a carta N, com erro…"',
      oQueFazer: 'Ficou no Senior uma linha de carta com erro. Se você corrigir agora, o Senior envia essa linha antiga no lugar da carta nova. Avise a TI ou o fiscal para apagar a carta N no Senior. Depois toque em "Já foi resolvido no Senior? Conferir de novo".',
    },
    {
      quando: '"A carta do Separa de … foi AUTORIZADA na SEFAZ … e não está mais na E140CCE do Senior."',
      oQueFazer: 'Alguém apagou a carta no Senior depois de transmitida. Apagar não desfaz nada na SEFAZ. Toque em "Reimportar carta no Senior" e depois corrija normalmente.',
    },
    {
      quando: '"A carta do Separa de … foi enviada à transmissão … e não está mais na E140CCE."',
      oQueFazer: 'O Separa não sabe se a SEFAZ recebeu essa carta. Confirme com o fiscal (log do SDE ou portal da SEFAZ). Se foi autorizada, ela precisa ser reimportada no Senior; se não foi, o admin marca a carta como "Erro ao gravar" no Django Admin para o Separa desconsiderá-la.',
    },
    {
      quando: 'Erro "Senior/SDE 10011: o SDE … não recebeu a carta agora".',
      oQueFazer: 'Não é erro definitivo. A carta ficou gravada no Senior e sai depois. Não refaça a correção: isso gera carta duplicada. Acompanhe o chip "Aguardando transmissão (SDE)".',
    },
    {
      quando: 'Erro "Senior/SDE 10021: a SEFAZ já tem uma carta com esta sequência (duplicata)".',
      oQueFazer: 'A carta anterior desta nota já foi transmitida (ou foi apagada no Senior depois de transmitida). Não repita a correção. Abra "Corrigir NF" de novo: o Separa mostra o bloqueio certo e o que fazer.',
    },
    {
      quando: '"Pedido ainda sem nota fiscal emitida no Senior…"',
      oQueFazer:
        'O pedido ainda não foi faturado. A carta só existe depois da NF. Enquanto é pedido, altere a transportadora no próprio pedido, no Senior. Tente de novo depois do faturamento.',
    },
    {
      quando: '"A NF está \'…\' no Senior; só NF Autorizada aceita carta de correção."',
      oQueFazer: 'A nota ainda não foi autorizada ou foi cancelada. Espere a autorização ou fale com o faturamento.',
    },
    {
      quando: '"Documento cancelado no Senior."',
      oQueFazer: 'Não dá para corrigir nota cancelada. O botão "Corrigir NF" fica apagado.',
    },
    {
      quando: 'Faixa amarela "Carta de correção está desligada".',
      oQueFazer: 'Peça ao admin para ligar o modo nesta tela.',
    },
    {
      quando: '"Seu perfil não está liberado para corrigir NF."',
      oQueFazer: 'Fale com o admin. A lista de perfis liberados não muda por esta tela.',
    },
    {
      quando: 'Contador do texto em vermelho (tamanho maior que o limite).',
      oQueFazer: 'O texto passou do tamanho permitido. Encurte o complemento ou o texto livre. O botão de gravar só libera quando o texto cabe.',
    },
    {
      quando: '"Carta apagada no Senior."',
      oQueFazer: 'A carta feita antes foi apagada no Senior. A janela já vem preenchida para refazer: confira e grave.',
    },
    {
      quando: '"O Senior não aceitou a carta." (Erro ao gravar)',
      oQueFazer: 'Leia o motivo na linha da carta. Corrija o dado e tente de novo. Se não entender o motivo, avise o admin.',
    },
    {
      quando: 'Resultado "Carta gravada, mas a transmissão falhou."',
      oQueFazer: 'A carta está no Senior. Peça ao faturamento para transmitir por lá.',
    },
  ],
  dicas: [
    'Depois de trocar a transportadora, reimprima a etiqueta de volume em Conferidos, para sair com a transportadora nova.',
    'Se você digitar um número de NF que o Separa ainda não conhece, o sistema procura no Senior de qual pedido ela saiu.',
  ],
  relacionadas: ['supervisor-conferidos', 'supervisor-etiquetas', 'supervisor-vendas', 'admin-impressoras'],
}
