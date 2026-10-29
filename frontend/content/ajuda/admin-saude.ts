import type { AjudaTela } from './tipos'

export const adminSaude: AjudaTela = {
  chave: 'admin-saude',
  titulo: 'Saúde do sistema',
  menu: 'Admin → Saúde do sistema',
  rota: '/admin/saude',
  perfis: ['admin'],
  resumo:
    'Mostra se o sistema está funcionando: banco, fila, Senior, impressão e as tarefas que rodam sozinhas. Abra quando alguém disser que a lista não atualiza ou que algo parou.',
  capturas: [
    { src: '/manual/admin-saude.png', legenda: 'Semáforo geral e cartões de cada componente.' },
  ],
  passos: [
    'Olhe o quadro do topo. Verde com "Tudo certo", amarelo com "Atenção" e vermelho com "Problema".',
    'Se não estiver verde, leia a lista logo abaixo do título. Ela diz o que está fora do normal.',
    'Confira os cartões de Componentes. Cada um mostra o ponto de cor, o tempo de resposta e uma frase de detalhe.',
    'Em Tarefas (Celery), procure o selo vermelho "atrasada".',
    'Em Erros no web e no coletor, escolha 24 h, 3 d ou 7 d e toque em um erro para ver os detalhes.',
    'Toque em Atualizar para ler de novo. A tela também atualiza sozinha a cada 30 segundos.',
  ],
  elementos: [
    { nome: 'Postgres', descricao: 'O banco de dados do sistema. Sem ele nada funciona.' },
    { nome: 'Redis (fila do Celery)', descricao: 'A fila que distribui o trabalho em segundo plano. Sem ela as tarefas não rodam.' },
    { nome: 'Worker Celery', descricao: 'O programa que executa as tarefas. Se não responder, nada roda em segundo plano.' },
    { nome: 'Oracle do Senior', descricao: 'A conexão de leitura com o Senior. Se cair, os pedidos novos não chegam. A conferência em andamento continua.' },
    { nome: 'Agentes USB de impressão', descricao: 'As estações com Zebra USB. Fica amarelo quando algum agente está sem sinal há mais de 5 minutos. Não para a conferência.' },
    { nome: 'Erros no web e no coletor', descricao: 'Quantos erros as telas e o app relataram nas últimas 24 horas. Não para a conferência.' },
    { nome: 'não para a conferência se cair', descricao: 'Aviso nos componentes que, mesmo parados, deixam o conferente trabalhar.' },
    { nome: 'a cada 1 min, a cada 5 min', descricao: 'De quanto em quanto tempo a tarefa deve rodar.' },
    { nome: 'atrasada', descricao: 'A tarefa passou de 3 vezes o intervalo sem terminar com sucesso. O selo mostra há quanto tempo foi a última execução boa.' },
    { nome: 'última execução com erro', descricao: 'A tarefa rodou, mas terminou com erro. Selo amarelo.' },
    { nome: 'rodando agora', descricao: 'A tarefa está em execução neste momento.' },
  ],
  situacoes: [
    { quando: 'Postgres ou Redis em vermelho', oQueFazer: 'O sistema não funciona direito. Avise a TI na hora.' },
    { quando: 'Worker Celery em vermelho: "nenhum worker respondeu ao ping em 2 s"', oQueFazer: 'As tarefas em segundo plano pararam. Pedidos novos, cancelamentos e impressão automática não andam. Avise a TI.' },
    { quando: 'Oracle do Senior em amarelo', oQueFazer: 'Os pedidos novos não chegam do Senior. Confira se o Senior está no ar e avise a TI. Quem está conferindo continua normalmente.' },
    { quando: 'Agentes USB em amarelo: "sem heartbeat"', oQueFazer: 'Confira se o computador da Zebra USB está ligado e com o agente aberto. Veja a tela Print Agents.' },
    { quando: 'Tarefa com o selo "atrasada"', oQueFazer: 'A tarefa parou de rodar. Veja a mensagem de erro no cartão e avise a TI.' },
    { quando: 'Erros no web e no coletor em amarelo', oQueFazer: 'Abra a lista no fim da tela. Erros do "coletor" mostram a versão do app. Anote a hora, a tela e o usuário e passe para a TI.' },
    { quando: 'Quadro vermelho com "A API respondeu…" ou "Sem resposta da API"', oQueFazer: 'O servidor está fora do ar. Tente Atualizar; se continuar, avise a TI.' },
  ],
  dicas: [
    'O histórico completo das tarefas e dos erros fica no Django Admin, link no rodapé da tela.',
    'A mesma informação aparece resumida na linha Saúde do sistema, no início do admin.',
  ],
  relacionadas: ['admin', 'admin-agents', 'admin-app'],
}
