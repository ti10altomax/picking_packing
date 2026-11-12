import type { AjudaTela } from './tipos'

export const adminAgente: AjudaTela = {
  chave: 'admin-agente',
  titulo: 'Agente de impressão USB',
  menu: 'Admin → Agente de impressão',
  rota: '/admin/agente',
  perfis: ['admin'],
  resumo:
    'Publique aqui o programa SeparaAgente.exe, que roda no computador da Zebra ligada por cabo USB. O computador baixa o programa e o arquivo de configuração pelo navegador, sem pendrive nem pasta compartilhada. A tela também mostra quais computadores têm o agente e em que versão.',
  capturas: [],
  passos: [
    'Gere o executável no seu computador com o build.ps1 da pasta agente/ do repositório. Ele sai em agente/dist/SeparaAgente.exe.',
    'Em Arquivo SeparaAgente.exe, toque em Escolher arquivo e selecione o executável.',
    'Confira Versão (formato X.Y.Z, igual ao VERSAO do separa_agente.py). O campo pode vir preenchido pelo nome do arquivo.',
    'Em O que mudou, escreva uma linha por novidade. O texto aparece na página de download.',
    'Toque em Publicar.',
    'Copie o link da seção Versão atual e abra no navegador do computador da impressora. Baixe o programa e o agente.ini, mova os dois para C:\\\\SeparaAgente e siga os comandos que a página lista: impressoras, registrar, teste, instalar, iniciar.',
    'Volte aqui: o computador aparece em Computadores com o agente, online e na versão publicada.',
  ],
  elementos: [
    { nome: 'Versão atual', descricao: 'Versão publicada, tamanho, quem publicou e quando. Abaixo, o link da página de download para abrir no PC da impressora, com Copiar e Abrir, e os links diretos do executável e do agente.ini.' },
    { nome: 'Publicar nova versão', descricao: 'Arquivo, versão e notas. O botão só libera com arquivo e versão. A versão precisa ser maior que a atual.' },
    { nome: 'Computadores com o agente', descricao: 'Cada PC que rodou "registrar": nome, versão que o programa manda a cada minuto, online/offline e último sinal. "desatualizado" em âmbar quando a versão do PC é menor que a publicada.' },
    { nome: 'agente.ini que a página entrega', descricao: 'O arquivo de configuração é gerado pelo servidor com o endereço certo já preenchido. "ver conteúdo" mostra o que será baixado. No PC só falta o nome da fila da Zebra.' },
    { nome: 'Versões anteriores', descricao: 'Histórico com download e apagar. Apagar tira o arquivo do servidor; os PCs que já instalaram continuam como estão.' },
  ],
  situacoes: [
    { quando: '"Nenhuma versão publicada ainda."', oQueFazer: 'Gere o executável com o build.ps1 e publique. Até lá, a página /agente/ só diz que não há versão.' },
    { quando: 'Erro "a versão X não é maior que a atual".', oQueFazer: 'Suba o VERSAO no separa_agente.py, gere de novo e publique. Para repetir a mesma versão, apague a publicada antes.' },
    { quando: 'Erro "o arquivo não é um executável do Windows".', oQueFazer: 'Selecione o SeparaAgente.exe de agente/dist/, não o .py nem o .ini.' },
    { quando: 'Computador "desatualizado".', oQueFazer: 'No PC: abra a página de download, baixe o .exe novo, rode "SeparaAgente.exe parar", troque o arquivo e rode "SeparaAgente.exe iniciar". O agente.ini com o token fica.' },
    { quando: 'Computador "offline".', oQueFazer: 'Veja se está ligado e na rede. Nele, "SeparaAgente.exe status" mostra serviço, servidor e impressora; "SeparaAgente.exe iniciar" religa o serviço.' },
  ],
  dicas: [
    'O link /agente/ não pede login: qualquer PC da rede abre e baixa. O token de cada agente continua protegido em Print Agents.',
    'O comando "SeparaAgente.exe status" no PC avisa quando há versão mais nova publicada aqui.',
    'A impressora precisa estar cadastrada em Admin → Impressoras com tipo USB e o token do agente em Agent ID. Só então os jobs chegam a esse PC.',
  ],
  relacionadas: ['admin-agents', 'admin-impressoras', 'supervisor-etiquetas', 'admin-app'],
}
