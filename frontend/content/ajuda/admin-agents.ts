import type { AjudaTela } from './tipos'

export const adminAgents: AjudaTela = {
  chave: 'admin-agents',
  titulo: 'Print Agents (agentes USB)',
  menu: 'Admin → Agentes USB',
  rota: '/admin/agents',
  perfis: ['admin'],
  resumo:
    'Lista os agentes de impressão USB. O agente é o programa SeparaAgente.exe, que fica no computador com a Zebra ligada por cabo USB, roda como serviço do Windows e imprime as etiquetas enviadas pelo sistema. Use esta tela para pegar o token do agente e ver se ele está online.',
  capturas: [
    { src: '/manual/admin-agents.png', legenda: 'Print Agents sem nenhum agente registrado.' },
  ],
  passos: [
    'No computador com a Zebra USB, com o driver da Zebra instalado, copie SeparaAgente.exe e agente.ini para uma pasta (por exemplo C:\\SeparaAgente).',
    'Abra o Prompt de Comando como administrador nessa pasta e rode "SeparaAgente.exe impressoras". Copie o nome exato da Zebra para o campo nome_windows do agente.ini.',
    'Rode "SeparaAgente.exe registrar". O programa se registra no sistema e mostra o token.',
    'Nesta tela, toque em Atualizar. O agente aparece na lista com o nome do computador. Toque em ver token e em copiar (é o mesmo token que o programa mostrou).',
    'Abra Admin → Impressoras e crie a impressora com tipo USB (ou edite a existente). Cole o token no campo Agent ID e toque em Salvar.',
    'De volta ao computador, rode "SeparaAgente.exe teste" para sair uma etiqueta de teste, depois "SeparaAgente.exe instalar" e "SeparaAgente.exe iniciar". O serviço passa a subir sozinho com o Windows.',
    'Volte aqui e confira se o agente está online.',
  ],
  elementos: [
    { nome: 'online / offline', descricao: 'Verde "online" quando o agente deu sinal nos últimos 2 minutos. Vermelho "offline" quando passou disso. O número mostra há quantos segundos foi o último sinal.' },
    { nome: 'nunca conectou', descricao: 'O agente foi registrado, mas ainda não deu nenhum sinal.' },
    { nome: 'ver token / ocultar', descricao: 'Mostra ou esconde o código completo. Por segurança, ele aparece cortado.' },
    { nome: 'copiar', descricao: 'Copia o token para colar no campo Agent ID da impressora.' },
    { nome: 'v1.0 (selo ao lado do nome)', descricao: 'Versão do programa do agente.' },
  ],
  situacoes: [
    { quando: '"Nenhum agent registrado."', oQueFazer: 'Nenhum computador com Zebra USB foi ligado ao sistema. Se a impressão é por rede ou pelo navegador, não precisa de agente.' },
    { quando: 'Agente "offline"', oQueFazer: 'Confira se o computador da Zebra está ligado e na rede. Nele, rode "SeparaAgente.exe status": mostra se o serviço está rodando, se o servidor responde e se a impressora está pronta. "SeparaAgente.exe iniciar" religa o serviço.' },
    { quando: '"nunca conectou"', oQueFazer: 'O registro foi feito, mas o serviço ainda não subiu. No computador da Zebra, rode "SeparaAgente.exe instalar" e "SeparaAgente.exe iniciar" como administrador e aguarde um minuto.' },
    { quando: 'Agente online, mas a etiqueta não sai e o documento fica "na fila do agente USB" em Gestão → Etiquetas.', oQueFazer: 'A Zebra está desligada, sem etiquetas, com a tampa aberta ou com o cabo solto. O agente espera ela voltar e imprime sozinho. O arquivo agente.log, na pasta do programa, diz o motivo.' },
    { quando: 'Documento com "última tentativa: fila de impressão … não existe neste Windows".', oQueFazer: 'O nome em nome_windows do agente.ini não é o da fila. Rode "SeparaAgente.exe impressoras", corrija o nome, reinicie o serviço e imprima de novo pelo botão Etiqueta.' },
  ],
  dicas: [
    'Só impressora USB usa agente. A Zebra de rede (IP e porta 9100) e a impressão pelo navegador funcionam sem ele.',
    'A etiqueta por agente só conta como impressa quando o agente confirma que ela saiu. Até lá o documento fica em Gestão → Etiquetas com "na fila do agente USB".',
    'Trate o token como senha: quem tem o token controla o agente.',
    'O programa, o arquivo de configuração e as instruções completas estão na pasta agente/ do repositório do Separa (README).',
  ],
  relacionadas: ['admin-agente', 'admin-impressoras', 'admin-saude', 'etiqueta-navegador'],
}
