import type { AjudaTela } from './tipos'

export const login: AjudaTela = {
  chave: 'login',
  titulo: 'Entrar no sistema',
  rota: '/login',
  perfis: ['conferente', 'supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Tela de entrada do Separa. Todo perfil começa aqui; depois de entrar, o sistema abre a tela inicial do seu perfil.',
  capturas: [
    { src: '/manual/login.png', legenda: 'Entrada no app do coletor.', mobile: true },
    { src: '/manual/login-desktop.png', legenda: 'Entrada no navegador do computador.' },
  ],
  passos: [
    'No coletor, abra o app Separa. No computador, abra o endereço do Separa no navegador.',
    'Digite o seu usuário no campo Usuário.',
    'Digite a sua senha no campo Senha.',
    'Toque em Entrar.',
    'Espere a tela inicial abrir. O conferente cai em Atribuídos a mim.',
    'Para sair, toque em Sair, no canto direito do cabeçalho.',
  ],
  elementos: [
    {
      nome: 'Botão "?" do cabeçalho',
      descricao:
        'Aparece em todas as telas depois do login. Abre a ajuda da tela em que você está, que é este manual.',
    },
  ],
  situacoes: [
    {
      quando: 'Usuário ou senha incorretos.',
      oQueFazer:
        'Confira os dois campos e tente de novo. Se não conseguir, peça ao Admin para conferir o seu cadastro.',
    },
    {
      quando: 'A tela de entrada não aparece e o sistema abre direto na tela do perfil.',
      oQueFazer:
        'Você já está logado neste aparelho. Toque em Sair se precisar entrar com outro usuário.',
    },
  ],
  dicas: [
    'Cada pessoa entra com o seu próprio usuário. O sistema registra quem fez cada ação.',
    'Troque de usuário no coletor sempre que outro conferente assumir o aparelho.',
  ],
  relacionadas: ['conferencia'],
}
