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
    'Leia a linha do documento: data, conferente, separador, quantidade de itens e o tempo da conferência.',
    'Toque na linha para abrir os itens com a quantidade separada sobre a pedida.',
    'Para imprimir a etiqueta de volume, toque em "Etiqueta", escolha a impressora e toque em "Imprimir". Se já foi impressa, o botão vira "Reimprimir" e mostra quando.',
    'Para ver o que aconteceu com o documento, toque em "Histórico".',
    'Para trocar transportadora, frete ou volumes da NF, toque em "Corrigir NF".',
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
      descricao: 'A etiqueta já saiu. Embaixo do botão fica a data da última impressão.',
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
      nome: 'Histórico',
      descricao: 'Abre a linha do tempo do documento: quem fez o quê e quando.',
    },
    {
      nome: 'Corrigir NF',
      descricao:
        'Abre a carta de correção da nota: transportadora, frete e quantidade de volumes. Só aparece para os perfis liberados pelo admin. Veja Cartas de correção.',
    },
  ],
  situacoes: [
    {
      quando: 'Nenhum pedido conferido.',
      oQueFazer: 'Nada foi concluído ainda, ou a busca não achou nada. Apague a busca e toque em "Atualizar".',
    },
    {
      quando: 'Botão "Etiqueta" apagado.',
      oQueFazer: 'Passe o mouse sobre o botão para ler o motivo. Resolva no Senior (transportadora ou faturamento) e a etiqueta libera.',
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
    'Depois de uma carta de correção que troca a transportadora, use "Reimprimir" para a etiqueta sair com o nome novo.',
  ],
  relacionadas: ['supervisor-etiquetas', 'supervisor-cartas', 'supervisor-agora', 'admin-impressoras'],
}
