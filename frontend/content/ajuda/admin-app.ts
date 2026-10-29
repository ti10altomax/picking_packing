import type { AjudaTela } from './tipos'

export const adminApp: AjudaTela = {
  chave: 'admin-app',
  titulo: 'App do coletor',
  menu: 'Admin → App do coletor',
  rota: '/admin/app',
  perfis: ['admin'],
  resumo:
    'Publique aqui a versão nova do app do coletor. O coletor baixa pelo navegador e o app avisa quando há versão nova. A tela também mostra quem usa qual versão.',
  capturas: [
    { src: '/manual/admin-app.png', legenda: 'Versão atual e formulário para publicar nova versão.' },
  ],
  passos: [
    'Em Arquivo .apk, toque em Escolher arquivo e selecione o APK novo.',
    'Confira Versão. Use o formato X.Y.Z, por exemplo 0.9.0. O campo pode vir preenchido pelo nome do arquivo.',
    'Preencha versionCode com o número do build do app (por exemplo 15).',
    'Em O que mudou, escreva uma linha por novidade. O texto aparece no coletor.',
    'Marque Obrigatória só se o app precisa bloquear até atualizar. Sem marcar, o aviso pode ser fechado.',
    'Toque em Publicar. O botão só libera com arquivo, versão e versionCode preenchidos.',
    'Em Versão atual, confira o número e o link. Toque em Copiar para levar o link.',
  ],
  elementos: [
    { nome: 'Versão atual', descricao: 'A versão que os coletores recebem. Mostra número, versionCode, tamanho e quem publicou. Aparece o selo "obrigatória" quando for o caso.' },
    { nome: 'Link para abrir no navegador do coletor', descricao: 'Endereço que termina em /apk/. Serve para a primeira instalação. Copiar leva o link; Abrir mostra a página de download.' },
    { nome: 'Obrigatória', descricao: 'O app bloqueia a tela inteira até o conferente atualizar.' },
    { nome: 'Aparelhos', descricao: 'Lista de quem usou o app: usuário, aparelho, versão e último acesso. Só aparece a partir da versão 0.9.0 do app.' },
    { nome: 'desatualizado', descricao: 'Selo amarelo ao lado da versão: o aparelho está numa versão mais antiga que a atual.' },
    { nome: 'Versões anteriores', descricao: 'Histórico com baixar e apagar. Apagar tira o arquivo do servidor; os coletores que já instalaram continuam como estão.' },
  ],
  situacoes: [
    { quando: '"Nenhuma versão publicada ainda. Suba o primeiro APK abaixo."', oQueFazer: 'Ainda não há APK no sistema. Publique o primeiro pelo formulário.' },
    { quando: '"Escolha o arquivo .apk."', oQueFazer: 'Selecione o arquivo antes de publicar.' },
    { quando: '"o arquivo não é um APK válido"', oQueFazer: 'O arquivo escolhido não é um APK do app. Confira se é o arquivo gerado no build e escolha de novo.' },
    { quando: '"versão no formato X.Y.Z (ex.: 0.9.0)"', oQueFazer: 'Escreva a versão com três números separados por ponto.' },
    { quando: '"a versão … não é maior que a atual"', oQueFazer: 'A versão nova precisa ser maior que a publicada. Corrija o número.' },
    { quando: '"a versão … já foi publicada" ou "o versionCode … já foi publicado"', oQueFazer: 'Use uma versão e um versionCode que ainda não existam. Se publicou errado, apague a versão antiga e envie de novo.' },
    { quando: 'No coletor aparece uma faixa "Nova versão … disponível" com o botão Atualizar', oQueFazer: 'É a publicação normal. O conferente toca em Atualizar, baixa o arquivo e instala por cima. Não precisa desinstalar.' },
    { quando: 'No coletor aparece a tela "Atualize o Separa"', oQueFazer: 'É a publicação obrigatória. O conferente só volta a usar o app depois de tocar em Baixar e instalar.' },
  ],
  dicas: [
    'Na primeira instalação, digite o endereço do link no navegador do coletor e toque em Baixar. Depois, o próprio app avisa as atualizações.',
    'Se o coletor não abrir o link, confira se está na mesma rede do sistema.',
    'Use Obrigatória só quando a versão antiga não funciona mais.',
  ],
  relacionadas: ['admin', 'admin-saude'],
}
