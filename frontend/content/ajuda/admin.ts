import type { AjudaTela } from './tipos'

export const admin: AjudaTela = {
  chave: 'admin',
  titulo: 'Admin — início',
  menu: 'Admin',
  rota: '/admin',
  perfis: ['admin'],
  resumo:
    'Tela inicial do admin. Mostra o que está acontecendo na operação, dá acesso a todas as telas dos supervisores e aos cadastros do sistema. Comece por aqui para ver o que precisa de atenção.',
  capturas: [
    { src: '/manual/admin.png', legenda: 'Início do admin: cards da operação, atalhos de Gestão e saúde do sistema.' },
  ],
  passos: [
    'Olhe os quatro cards grandes: Vendas, Pátio, Pátio (separadores) e Conferência. O número mostra quanto há em cada etapa agora.',
    'Toque em um card para abrir a tela daquela etapa.',
    'Em Gestão, veja os atalhos com contador. Os números em vermelho, roxo ou verde pedem uma ação.',
    'Veja a linha Saúde do sistema. O ponto verde e o texto "Tudo certo" indicam que está tudo funcionando.',
    'Se a saúde mostrar problema, toque na linha para abrir Saúde do sistema.',
    'Use os links de Cadastros no rodapé para impressoras, agentes USB e o app do coletor.',
  ],
  elementos: [
    { nome: 'Vendas — pendentes do Senior', descricao: 'Documentos que ainda não foram selecionados para separação. Leva a Selecionar pedidos.' },
    { nome: 'Pátio — aguardando sequência', descricao: 'Documentos já selecionados que ainda não estão em nenhuma sequência. Leva a Montar sequências.' },
    { nome: 'Pátio — liberados hoje', descricao: 'Separadores liberados para trabalhar hoje. Leva a Separadores do dia.' },
    { nome: 'Conferência — em conferência agora', descricao: 'Documentos que algum conferente está conferindo neste momento. Leva a Conferir pedidos.' },
    { nome: 'Não conformes', descricao: 'Documentos com problema na conferência. O número fica vermelho quando há algum.' },
    { nome: 'Cancelados', descricao: 'Documentos cancelados no Senior cuja conferência ainda não foi transferida. O número fica vermelho.' },
    { nome: 'Fechamentos', descricao: 'Documentos Aguardando fechamento (roxo), esperando o Sup. Pátio decidir. O número fica roxo.' },
    { nome: 'Etiquetas de volume', descricao: 'Documentos Conferidos com etiqueta pronta para imprimir. O número fica verde.' },
    { nome: 'Conferidos', descricao: 'Total de documentos Conferidos na lista.' },
    { nome: 'Agora no galpão, Erros de separação, Divergências de barra', descricao: 'Atalhos sem alerta. Agora no galpão mostra o mesmo número de documentos em conferência.' },
    { nome: 'Saúde do sistema', descricao: 'Ponto verde: tudo certo. Ponto amarelo: atenção. Ponto vermelho: problema. O texto ao lado lista o que está fora do normal.' },
    { nome: 'Cadastros', descricao: 'Links para impressoras de etiqueta, agentes USB e app do coletor (APK).' },
  ],
  situacoes: [
    { quando: 'Número com traço no lugar da contagem', oQueFazer: 'A contagem ainda está carregando. Aguarde alguns segundos.' },
    { quando: 'Saúde do sistema mostra "Backend sem resposta"', oQueFazer: 'O servidor não respondeu. Atualize a página; se continuar, avise a TI.' },
    { quando: 'Preciso criar usuário ou mudar uma configuração geral', oQueFazer: 'Essas opções ficam no Django Admin, no endereço /django-admin/. Não há tela delas neste menu.' },
  ],
  dicas: [
    'O admin enxerga todas as telas dos supervisores. Os textos de ajuda delas valem para você também.',
    'Os contadores atualizam quando a página é aberta; recarregue para ver o número mais recente.',
  ],
  relacionadas: ['admin-saude', 'admin-impressoras', 'admin-agents', 'admin-app', 'supervisor-etiquetas', 'supervisor-conferidos'],
}
