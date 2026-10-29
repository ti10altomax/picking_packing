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
        'O Separa grava a carta e já transmite para a SEFAZ. Não tem volta. Avise o fiscal antes de usar. O admin escolhe o modo nesta tela.',
    },
    {
      nome: 'simulação (dry-run)',
      descricao: 'Etiqueta azul na faixa. O sistema monta e registra tudo, mas não chama o Senior e a nota não muda. O botão vira "Simular".',
    },
    {
      nome: 'Texto: montado pelo sistema',
      descricao:
        'O sistema escreve a carta no formato "onde se lê… leia-se…" com o que você escolheu. Você só pode acrescentar um "Complemento (opcional)".',
    },
    {
      nome: 'Texto: livre',
      descricao:
        'O sistema põe o texto montado no campo "Texto da carta" e você pode editar, apagar tudo ou escrever outro. O campo é obrigatório. "Remontar pelo sistema" volta ao texto original. Transportadora, frete e volumes continuam sendo alterados pelos campos acima.',
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
        'Gravada (amarelo): está no Senior, falta transmitir. Transmitida (verde): enviada. Erro ao gravar (vermelho): o Senior recusou. Erro ao transmitir (laranja): gravou, mas a transmissão falhou. Simulada (cinza): só teste.',
    },
  ],
  situacoes: [
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
