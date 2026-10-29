import type { AjudaTela } from './tipos'

export const supervisorAgora: AjudaTela = {
  chave: 'supervisor-agora',
  titulo: 'Agora no galpão',
  menu: 'Gestão → Agora',
  rota: '/supervisor/agora',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Mostra o que está acontecendo no galpão neste momento: quem está conferindo o quê, quem parou de bipar, o tamanho de cada fila e o andamento das sequências. Deixe esta tela aberta durante o turno.',
  capturas: [
    {
      src: '/manual/supervisor-agora.png',
      legenda: 'Conferentes em ação e as filas, atualizadas a cada 15 segundos.',
    },
  ],
  passos: [
    'Abra Gestão → Agora. A tela atualiza sozinha a cada 15 segundos. Veja "lido há N s" no topo para saber a idade da informação.',
    'Em "Conferentes em ação", veja o cartão de cada conferente: o documento que ele está conferindo, o cliente, quem separou e a barra de progresso.',
    'Procure cartões com borda vermelha e o aviso "sem bip há N min". Eles estão parados há 20 minutos ou mais. Chame o conferente e veja o que travou.',
    'Se aparecer o quadro amarelo "Atribuídos há mais de 30 min sem iniciar", fale com o Sup. Pátio: há documentos entregues a um conferente que ainda não começou.',
    'Em "Filas", toque em um quadro para ir direto à tela daquele assunto.',
    'Em "Sequências abertas", veja o avanço de cada sequência. Toque no cartão para abrir a sequência no Pátio.',
    'Para entender o que aconteceu com um documento, toque em "Histórico" no cartão do conferente.',
  ],
  elementos: [
    {
      nome: 'Conferentes em ação',
      descricao:
        'Um cartão por conferente. À direita, os bips da última hora ("5 bips/h") e os documentos concluídos hoje. A barra azul mostra as unidades já bipadas sobre o total do documento.',
    },
    {
      nome: 'sem bip há N min (vermelho)',
      descricao: 'O conferente está com o documento aberto e não bipa há 20 minutos ou mais. A barra de progresso também fica vermelha.',
    },
    {
      nome: '+ N atribuído(s) na fila dele',
      descricao: 'Documentos já entregues àquele conferente que ele ainda não abriu.',
    },
    {
      nome: 'Histórico',
      descricao: 'Abre a linha do tempo do documento: quem fez o quê e quando.',
    },
    {
      nome: 'Selecionados sem sequência (amarelo)',
      descricao: 'Documentos enviados pelo Sup. Vendas que ainda não entraram em nenhuma sequência. Leva ao Pátio.',
    },
    {
      nome: 'Atribuídos sem iniciar',
      descricao: 'Documentos com conferente definido que ainda não começaram. A borda fica vermelha quando o mais antigo passa de 30 minutos.',
    },
    {
      nome: 'Em conferência',
      descricao: 'Documentos abertos agora nos coletores.',
    },
    {
      nome: 'Aguardando fechamento (roxo)',
      descricao: 'Documentos concluídos com sobra. O Sup. Pátio precisa fechar. Leva a Fechamentos.',
    },
    {
      nome: 'Não conformes (vermelho)',
      descricao: 'Documentos com problema na conferência esperando uma decisão. Leva a Não conformes.',
    },
    {
      nome: 'Cancelados a transferir (vermelho)',
      descricao: 'Documentos cancelados no Senior que já tinham volumes montados. Leva a Cancelados.',
    },
    {
      nome: 'Etiquetas prontas (verde)',
      descricao:
        'Conferidos com etiqueta pronta para imprimir. Embaixo, quantas estão esperando o Senior (transportadora ou NF). Leva a Etiquetas.',
    },
    {
      nome: 'Conferidos hoje',
      descricao: 'Documentos concluídos desde a meia-noite e, embaixo, os da última hora.',
    },
    {
      nome: 'Sequências abertas',
      descricao:
        'A barra mostra o avanço: verde para finalizados, azul para em conferência, amarelo para atribuídos. O texto embaixo conta cada grupo e lista os conferentes.',
    },
    {
      nome: 'Ritmo de hoje',
      descricao:
        'Gráfico por hora com os bips (verde) e os documentos conferidos (azul). O título soma o dia, inclusive os códigos divergentes e os cancelados.',
    },
  ],
  situacoes: [
    {
      quando: 'Ninguém com documento na mão agora.',
      oQueFazer: 'Nenhum conferente tem documento atribuído ou aberto. Veja em Pátio se há pedidos esperando sequência.',
    },
    {
      quando: 'Sem resposta da API.',
      oQueFazer: 'A tela perdeu a conexão com o sistema. Toque em "Atualizar". Se continuar, avise o admin.',
    },
    {
      quando: 'Cartão do conferente com "Sem documento aberto".',
      oQueFazer:
        'O conferente tem documentos na fila, mas ainda não abriu nenhum. Veja "+ N atribuído(s)" e, se passar de 30 minutos, procure por ele.',
    },
  ],
  dicas: [
    'Um conferente parado nem sempre é problema: ele pode estar esperando o separador. Pergunte antes de reatribuir.',
  ],
  relacionadas: ['supervisor-patio', 'supervisor-sequencia', 'supervisor-nao-conformes', 'supervisor-fechamentos', 'supervisor-etiquetas'],
}
