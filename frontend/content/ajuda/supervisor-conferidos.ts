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
    'Leia a linha do documento: data, conferente, separador, quantidade de itens e o tempo da conferência.',
    'Toque na linha para abrir os itens agrupados por volume: cada caixa ou fardo mostra o que foi dentro e quantas peças. Item dividido em mais de um volume aparece como "2 de 5". O que ficou em falta, cancelado ou sem lançamento fica no bloco "Fora de volume".',
    'Para imprimir a etiqueta de volume, toque em "Etiqueta", escolha a impressora e toque em "Imprimir". Se já foi impressa, o botão vira "Reimprimir" e mostra quando.',
    'Para ver o que aconteceu com o documento, toque em "Histórico".',
    'Para trocar transportadora, frete ou volumes da NF, toque em "Corrigir NF".',
    'Se você é admin e a conferência não vale (teste, documento conferido por engano), toque em "Devolver para Vendas" e confirme. O documento volta a Pendente do zero.',
    'Se a lista tiver mais documentos, toque em "Carregar mais".',
  ],
  elementos: [
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
      descricao: 'A etiqueta já saiu. Embaixo do botão fica a data da última impressão. Ao reimprimir dá para escolher "Todos" os volumes ou "Só alguns": digite os números que estão na etiqueta (VOLUME N/M), com traço para intervalo e vírgula para vários, ex.: 12-30 ou 3, 7, 10.',
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
      nome: 'Histórico',
      descricao: 'Abre a linha do tempo do documento: quem fez o quê e quando.',
    },
    {
      nome: 'Corrigir NF',
      descricao:
        'Abre a carta de correção da nota: transportadora, frete e quantidade de volumes. Só aparece para os perfis liberados pelo admin. Veja Cartas de correção.',
    },
    {
      nome: 'Mover itens entre volumes (dentro da linha aberta)',
      descricao:
        'O conferente esqueceu de abrir um volume novo e concluiu com tudo numa caixa só? Abra a linha, toque em "Mover itens entre volumes", marque os lançamentos (vão inteiros, sem dividir quantidade) e escolha um volume existente ou "Novo volume". Caixa ou fardo da fábrica (OP) não entra. Volume que ficar vazio some. A etiqueta já impressa fica velha: reimprima pelo botão Etiqueta. Se a quantidade de volumes ficar diferente da NF, o botão vira "Volumes ≠ NF" até a carta de correção. Sup. Pátio e admin.',
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
      oQueFazer: 'Troque o ribbon/papel, toque em "Reimprimir", escolha "Só alguns" e digite a partir do volume que falhou (ex.: 12-30). Só esses saem de novo, com a mesma numeração.',
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
    'O código de barras da etiqueta é a chave de acesso do DANFE (44 dígitos), a mesma que a transportadora bipa na nota. A mesma chave sai em QR Code no canto direito do rodapé, para leitores 2D e câmeras.',
  ],
  relacionadas: ['supervisor-etiquetas', 'supervisor-cartas', 'supervisor-agora', 'admin-impressoras'],
}
