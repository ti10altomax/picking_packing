import type { AjudaTela } from './tipos'

export const supervisorConferidos: AjudaTela = {
  chave: 'supervisor-conferidos',
  titulo: 'Pedidos conferidos',
  menu: 'Gestão → Conferidos',
  rota: '/supervisor/conferidos',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Lista os documentos que os conferentes já concluíram (Conferido, verde). Daqui você confere os itens, imprime ou reimprime a etiqueta de volume, vê o histórico e corrige a NF.',
  capturas: [
    {
      src: '/manual/supervisor-conferidos.png',
      legenda: 'Documento conferido com os botões Etiqueta, Histórico e Corrigir NF.',
    },
  ],
  passos: [
    'Abra Gestão → Conferidos.',
    'Procure por número ou cliente no campo de busca.',
    'Use o filtro ao lado da busca: Todos, Com transportadora ou Sem transportadora. "Sem transportadora" mostra o que ainda não pode sair.',
    'Para ver só o que ainda está sem etiqueta, toque em "Etiqueta não impressa". Os dois filtros funcionam juntos.',
    'Para imprimir as etiquetas de vários documentos de uma vez: marque a caixa à esquerda de cada um (ou "Marcar todos para etiqueta"), escolha a impressora na barra que aparece embaixo e toque em "Imprimir etiquetas".',
    'Leia a linha do documento: data, conferente, separador, quantidade de itens e o tempo da conferência.',
    'Toque na linha para abrir os itens agrupados por volume: cada caixa ou fardo mostra o que foi dentro e quantas peças. Item dividido em mais de um volume aparece como "2 de 5". O que ficou em falta, cancelado ou sem lançamento fica no bloco "Fora de volume".',
    'Para imprimir a etiqueta de volume, toque em "Etiqueta", escolha a impressora e toque em "Imprimir". Se já foi impressa, o botão vira "Reimprimir" e mostra quando.',
    'Para ver o que aconteceu com o documento, toque em "Histórico".',
    'Para trocar transportadora, frete ou volumes da NF, toque em "Corrigir NF".',
    'Se o conferente pôs tudo numa caixa só (ou na caixa errada), abra a linha, toque em "⇄ Mover itens entre volumes", marque os lançamentos, escolha em "Mover para:" um volume existente ou "Novo volume" e toque em "Mover". Depois reimprima a etiqueta. Só Sup. Pátio e admin.',
    'Se você é admin e a conferência não vale (teste, documento conferido por engano), toque em "Devolver para Vendas" e confirme. O documento volta a Pendente do zero.',
    'Se a lista tiver mais documentos, toque em "Carregar mais".',
  ],
  elementos: [
    {
      nome: 'Colar lista',
      descricao: 'Recebeu uma relação de notas? Toque em "Colar lista", cole os números (vírgula, espaço ou um por linha; 151281-151290 vale pelo intervalo) ou abra o .txt e toque em "Buscar". O sistema mostra quais estão nesta tela, quais estão em outra (com o botão "Ver") e quais não achou. "Mostrar N na tela" deixa a tela só com essas notas; a faixa azul "Mostrando só a lista colada" tem o botão "Limpar filtro" para voltar ao normal.',
    },
    {
      nome: 'Relatório sem transportadora',
      descricao:
        'No alto da tela. Abre a lista, pronta para imprimir, dos conferidos que ainda estão sem transportadora — os que precisam ser acertados para a etiqueta sair.',
    },
    {
      nome: 'Linha do documento',
      descricao:
        'Número, badges (NF, Entrega, Retira), NF emitida do pedido ("NF 980509"), cliente e transportadora. Embaixo: data e hora, "por" quem conferiu, "separado por" quem separou, itens e "em" quanto tempo.',
    },
    {
      nome: 'Separador em laranja',
      descricao: 'O conferente não identificou direito quem separou. A informação fica incompleta no relatório.',
    },
    {
      nome: 'Etiqueta (verde)',
      descricao: 'Pronta para imprimir: o documento tem transportadora e, se a regra "só com NF" estiver ligada, NF emitida.',
    },
    {
      nome: 'Reimprimir',
      descricao: 'A etiqueta já saiu. Embaixo do botão fica a data da última impressão. Na janela de impressão (na primeira vez também) dá para escolher "Todos" os volumes ou "Só alguns": digite os números que estão na etiqueta (VOLUME N/M), com traço para intervalo e vírgula para vários, ex.: 12-30 ou 3, 7, 10.',
    },
    {
      nome: 'Sem transportadora',
      descricao: 'Botão apagado. O Senior ainda não tem transportadora para o documento. A etiqueta sai quando ela chegar.',
    },
    {
      nome: 'Sem NF',
      descricao: 'Botão apagado. O pedido ainda não foi faturado e a regra "só com NF" está ligada. A etiqueta sai quando a NF for emitida.',
    },
    {
      nome: 'Volumes ≠ NF',
      descricao:
        'Botão em âmbar (cor de alerta). A quantidade de volumes fechados na conferência é diferente da quantidade de volumes da nota fiscal. Corrija a nota em "Corrigir NF" (volumes). A etiqueta sai sozinha quando a carta é gravada.',
    },
    {
      nome: 'Todos / Com transportadora / Sem transportadora',
      descricao: 'Filtro da lista. "Sem transportadora" junta os documentos que esperam o Senior; "Com transportadora" o que já pode ser etiquetado.',
    },
    {
      nome: 'EM COTAÇÃO (azul-claro, no lugar do botão Etiqueta)',
      descricao: 'A nota está em cotação de frete: a transportadora vai mudar e a etiqueta fica segura até lá. Sai sozinha quando a transportadora mudar; "Tirar de cotação", logo abaixo, libera na hora.',
    },
    {
      nome: 'Em cotação / Tirar de cotação',
      descricao: 'Use quando a nota foi faturada com uma transportadora que ainda vai mudar (o frete está em cotação). Marcada, a etiqueta de volume não sai e as telas mostram "EM COTAÇÃO". A nota sai de cotação sozinha quando a transportadora mudar (carta de correção ou troca no Senior); se a cotação terminar sem troca, toque em "Tirar de cotação".',
    },
    {
      nome: 'Caixa de marcar (à esquerda do documento)',
      descricao: 'Marca o documento para a impressão em massa. Fica apagada quando a etiqueta não pode sair (sem transportadora, sem NF ou volumes diferentes da nota). "Marcar todos para etiqueta", no alto da lista, marca todos os que podem.',
    },
    {
      nome: 'Barra "N marcados para etiqueta"',
      descricao: 'Aparece embaixo com pelo menos um documento marcado. Escolha a impressora e toque em "Imprimir etiquetas"; o sistema pede confirmação e avisa quantos já tinham etiqueta (serão reimpressos). Quem der erro continua marcado, com o motivo na mensagem. "Limpar" desmarca todos.',
    },
    {
      nome: 'Etiqueta: todas / Etiqueta não impressa',
      descricao: 'Filtro da lista. "Etiqueta não impressa" mostra só os documentos que ainda não tiveram etiqueta de volume impressa (os que têm o botão "Etiqueta", e não "Reimprimir").',
    },
    {
      nome: 'Histórico',
      descricao: 'Abre a linha do tempo do documento: quem fez o quê e quando.',
    },
    {
      nome: 'Corrigir NF',
      descricao:
        'Abre a carta de correção da nota: transportadora, frete e quantidade de volumes. Só aparece para os perfis liberados pelo admin. Veja Cartas de correção.',
    },
    {
      nome: '⇄ Mover itens entre volumes (dentro da linha aberta)',
      descricao:
        'Aparece embaixo dos itens agrupados por volume quando você abre a linha. Só para Sup. Pátio e admin (Sup. Vendas não vê) e só se o documento tem pelo menos um volume com lançamento que não seja de OP. Serve para corrigir a montagem dos volumes depois da conferência, sem devolver o documento e sem conferir tudo de novo: o conferente esqueceu de abrir a caixa nova, ou pôs peças na caixa errada. As quantidades conferidas não mudam; só muda em qual volume cada lançamento está.',
    },
    {
      nome: 'Janela "Mover itens entre volumes"',
      descricao:
        'Lista cada volume com seus lançamentos (SKU, descrição e quantidade, ex.: 6×). Marque os lançamentos que vão mudar de volume; a caixa no título do volume marca ou desmarca todos dele. O lançamento vai inteiro: não dá para levar só parte da quantidade. Caixa ou fardo da fábrica (OP) aparece apagado com "fábrica · não move": não sai do lugar nem recebe lançamento. Embaixo, "N marcado(s)".',
    },
    {
      nome: 'Mover para: Novo volume ou volume existente',
      descricao:
        '"Novo volume" cria mais um volume no documento: escolha Caixa, Fardo ou Outro e, se quiser, escreva o nome em "Identificador (opcional)"; sem nome, ele aparece numerado (ex.: "Caixa 3"). Também dá para escolher um volume que já existe. O volume de onde os lançamentos saíram, se ficar vazio, é apagado sozinho. Toque em "Mover N" para gravar ou em "Cancelar" para sair sem mudar nada.',
    },
    {
      nome: 'Devolver para Vendas (vermelho, só admin)',
      descricao:
        'Desfaz a conferência: o documento volta a Pendente na tela de Vendas, os volumes são apagados, as quantidades separadas zeradas e a etiqueta precisa sair de novo quando for conferido outra vez. O histórico guarda quem devolveu, quando e o que havia nos volumes. Use para conferência de teste ou documento conferido por engano.',
    },
  ],
  situacoes: [
    {
      quando: 'Acabou o ribbon ou o papel no meio das etiquetas (ou uma etiqueta rasgou).',
      oQueFazer: 'Troque o ribbon/papel, toque em "Reimprimir" (ou "Etiqueta", se a impressão deu erro e não ficou marcada), escolha "Só alguns" e digite a partir do volume que falhou (ex.: 12-30). Só esses saem de novo, com a mesma numeração.',
    },
    {
      quando: 'Depois de mover, aviso verde "N lançamento(s) movido(s)" com "A etiqueta impressa ficou velha — reimprima pelo botão Etiqueta."',
      oQueFazer: 'A etiqueta colada nas caixas mostra os volumes antigos. Toque em "Reimprimir" (é o botão Etiqueta depois da primeira impressão), troque as etiquetas das caixas e descarte as velhas. A etiqueta não sai sozinha depois de mover.',
    },
    {
      quando: 'Depois de mover, o aviso diz "Volumes agora diferem da NF — a etiqueta espera a carta de correção." e o botão vira "Volumes ≠ NF" (âmbar).',
      oQueFazer: 'A quantidade de volumes mudou e não bate mais com a nota fiscal. Toque em "Corrigir NF" e ajuste a quantidade de volumes. Se a etiqueta ainda não tinha sido impressa, ela sai sozinha quando a carta for autorizada. Se já tinha, toque em "Reimprimir" depois da carta: o sistema nunca reimprime sozinho.',
    },
    {
      quando: 'Antes estava "Volumes ≠ NF" e, depois de mover, os volumes passaram a bater com a NF.',
      oQueFazer: 'O botão Etiqueta volta a ficar liberado, mas mover não imprime sozinho. Toque em "Etiqueta" (ou "Reimprimir") e imprima.',
    },
    {
      quando: 'Não aparece "⇄ Mover itens entre volumes" na linha aberta.',
      oQueFazer: 'Seu perfil não é Sup. Pátio nem admin, ou o documento só tem caixas/fardos da fábrica (OP), que não podem ser reorganizados.',
    },
    {
      quando: 'Quero levar só parte de um lançamento para outro volume.',
      oQueFazer: 'Não dá: o lançamento vai inteiro. Se a divisão das peças for muito diferente, a saída é o admin usar "Devolver para Vendas" e o documento ser conferido de novo.',
    },
    {
      quando: 'Mensagem em vermelho na janela de mover, como "pedido em status ... — só Conferido ou Aguardando fechamento" ou "algum lançamento não pertence a este documento".',
      oQueFazer: 'O documento mudou desde que a tela abriu (foi devolvido, cancelado ou outra pessoa mexeu nos volumes). Feche a janela, toque em "Atualizar" e confira de novo.',
    },
    {
      quando: 'Um documento conferido sumiu da lista.',
      oQueFazer: 'A nota dele entrou num embarque no Senior e o documento foi para Gestão → Embarcados. Lá continuam o Histórico, a reimpressão da etiqueta e o Corrigir NF.',
    },
    {
      quando: 'Nenhum pedido conferido.',
      oQueFazer: 'Nada foi concluído ainda, ou a busca não achou nada. Apague a busca e toque em "Atualizar".',
    },
    {
      quando: 'Botão "Etiqueta" apagado.',
      oQueFazer: 'Passe o mouse sobre o botão para ler o motivo. Transportadora ou faturamento se resolvem no Senior; "Volumes ≠ NF" se resolve em "Corrigir NF", ajustando a quantidade de volumes da nota.',
    },
    {
      quando: 'Documento sem "Corrigir NF" na linha.',
      oQueFazer: 'Seu perfil não está liberado para corrigir NF. Fale com o admin.',
    },
    {
      quando: '"sem conferente registrado"',
      oQueFazer: 'O documento foi concluído sem conferente gravado. Veja o Histórico para saber quem fez.',
    },
  ],
  dicas: [
    '"Devolver para Vendas" não mexe no Senior: a conferência ainda não é gravada lá. Se a etiqueta já estava colada na caixa, descarte-a — ao conferir de novo sai uma etiqueta nova.',
    'Depois de uma carta de correção que troca a transportadora, use "Reimprimir" para a etiqueta sair com o nome novo.',
    'Conferente esqueceu de abrir a caixa nova? Antes de pensar em "Devolver para Vendas", use "⇄ Mover itens entre volumes": a conferência continua valendo e só a divisão em volumes muda. Cada mudança fica no Histórico como "Volumes reorganizados".',
    'O código de barras da etiqueta é a chave de acesso do DANFE (44 dígitos), a mesma que a transportadora bipa na nota. A mesma chave sai em QR Code no canto direito do rodapé, para leitores 2D e câmeras.',
  ],
  relacionadas: ['supervisor-conferidos-sem-transportadora', 'supervisor-embarcados', 'supervisor-etiquetas', 'supervisor-cartas', 'supervisor-agora', 'admin-impressoras'],
}
