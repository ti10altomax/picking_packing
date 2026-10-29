import type { AjudaTela } from './tipos'

export const supervisorSeparadores: AjudaTela = {
  chave: 'supervisor-separadores',
  titulo: 'Separadores — cadastro e liberação do dia',
  menu: 'Separadores',
  rota: '/supervisor/separadores',
  perfis: ['supervisor_patio', 'admin'],
  resumo:
    'Cadastro de quem separa a mercadoria no estoque. O separador não tem login: o conferente aponta o nome dele ao iniciar a conferência. Todo dia você libera quem trabalha hoje.',
  capturas: [
    {
      src: '/manual/supervisor-separadores.png',
      legenda: 'Cadastro rápido no alto, busca e a lista com "Liberado hoje" e "Desativar".',
    },
  ],
  passos: [
    'Preencha o "Nome" (obrigatório). Se quiser, preencha o "Apelido", o nome pelo qual é chamado.',
    'Escolha o "Tipo": Extra ou Funcionário.',
    'Toque em "Cadastrar". O nome aparece na lista.',
    'Todo dia, toque em "Liberar hoje" no nome de cada separador que vai trabalhar. O botão vira "✓ Liberado hoje".',
    'Para desfazer a liberação do dia, toque em "✓ Liberado hoje".',
    'Para achar alguém, digite na busca "Buscar por nome, apelido ou documento…".',
  ],
  elementos: [
    {
      nome: 'N liberados hoje',
      descricao: 'Verde, sob o título. Conta só os separadores ativos liberados para o dia.',
    },
    {
      nome: 'Extra / Funcionário',
      descricao: 'Tipo do separador. Serve só para você se organizar.',
    },
    {
      nome: 'Liberar hoje / ✓ Liberado hoje',
      descricao: 'A liberação vale só para o dia. Amanhã é preciso liberar de novo.',
    },
    {
      nome: 'Desativar / Reativar',
      descricao:
        'Desativar tira a pessoa das listas. O histórico de quem separou o quê é mantido. Reativar traz de volta.',
    },
    {
      nome: 'inativo',
      descricao: 'Selo vermelho de quem foi desativado. Esses não têm botão de liberar.',
    },
  ],
  situacoes: [
    {
      quando: 'O conferente avisa "separador … não está liberado hoje — peça ao Sup. Pátio"',
      oQueFazer: 'Toque em "Liberar hoje" no nome dessa pessoa. O conferente tenta de novo.',
    },
    {
      quando: 'O conferente não acha o nome do separador no coletor',
      oQueFazer: 'Veja se a pessoa foi cadastrada, está ativa e está liberada hoje.',
    },
    {
      quando: 'Ao desativar aparece "Desativar separador?"',
      oQueFazer: 'Confirme em "Desativar" ou volte em "Voltar".',
    },
    {
      quando: '"Nenhum separador cadastrado."',
      oQueFazer: 'Use o cadastro do alto da tela para incluir o primeiro.',
    },
  ],
  dicas: [
    'Libere os separadores logo cedo, antes de os conferentes começarem.',
    'Preencha o apelido: ele é o nome que aparece nas listas e no relatório.',
  ],
  relacionadas: ['supervisor-patio', 'supervisor-sequencia-relatorio', 'supervisor-erros', 'conferencia-pedido-iniciar'],
}
