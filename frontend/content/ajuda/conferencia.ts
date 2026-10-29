import type { AjudaTela } from './tipos'

export const conferencia: AjudaTela = {
  chave: 'conferencia',
  titulo: 'Atribuídos a mim',
  rota: '/conferencia',
  perfis: ['conferente'],
  resumo:
    'Lista dos pedidos e notas fiscais que você vai conferir. É a primeira tela do conferente: dela você abre um documento ou pega o próximo da sequência.',
  capturas: [
    {
      src: '/manual/conferencia.png',
      legenda: 'Lista no coletor, com a barra de bipagem da nota e os documentos disponíveis.',
      mobile: true,
    },
  ],
  passos: [
    'Confira o número da sequência no badge ao lado do título.',
    'Para abrir um documento seu, toque no cartão ou bipe a nota na barra "Bipe a nota para pegar…".',
    'Para pegar um documento novo, bipe a chave do DANFE ou digite o número da NF ou do pedido na mesma barra.',
    'Ou toque num cartão da seção "Disponíveis na sequência N".',
    'Na tela que abrir, siga a conferência por bipagem.',
    'Ao terminar, volte para esta lista e pegue o próximo.',
  ],
  elementos: [
    {
      nome: 'Sequência N (badge azul)',
      descricao:
        'Sequência em que você está trabalhando agora. Você só confere documentos dela até terminar.',
    },
    {
      nome: 'Atribuído (amarelo)',
      descricao: 'O documento é seu e a conferência ainda não começou.',
    },
    {
      nome: 'Em conferência (azul) e porcentagem',
      descricao: 'Conferência começada. A porcentagem mostra quanto já foi bipado.',
    },
    {
      nome: 'Ordem da lista',
      descricao: 'Os documentos aparecem do mais antigo para o mais novo, pela hora em que foram atribuídos.',
    },
    {
      nome: 'Barra "Bipe a nota para pegar…"',
      descricao:
        'Fica sempre pronta para o leitor do coletor. Aceita a chave do DANFE ou o número da NF ou do pedido. Abre o documento se ele já é seu e pega se ainda não tem conferente.',
    },
    {
      nome: 'Disponíveis na sequência N',
      descricao:
        'Documentos da sua sequência que ainda não têm conferente. Toque no cartão ou bipe a nota para pegar. A transportadora aparece embaixo do cliente.',
    },
    {
      nome: '↻ e "sync"',
      descricao: 'O botão recarrega a lista. O horário ao lado mostra a última atualização. A lista também se atualiza sozinha.',
    },
    {
      nome: 'NF, Entrega, Retira',
      descricao: 'NF indica nota fiscal em vez de pedido. Entrega ou Retira mostra como o cliente recebe.',
    },
  ],
  situacoes: [
    {
      quando: 'Mais de um documento com esse número — qual é?',
      oQueFazer:
        'Escolha na lista o que tem o número, a série e o cliente certos. Toque em Cancelar para voltar.',
    },
    {
      quando: 'Dois conferentes bipam a mesma nota. A barra mostra "já está com" e o nome do outro.',
      oQueFazer: 'O primeiro que bipou leva a nota. Pegue outro documento da lista.',
    },
    {
      quando: 'A barra mostra "termine a sequência X primeiro".',
      oQueFazer:
        'O documento é de outra sequência. Termine os seus documentos da sequência X antes de pegar este.',
    },
    {
      quando: 'A barra mostra "aguarde a conclusão da sequência X para pegar da próxima".',
      oQueFazer:
        'Você terminou os seus, mas a sequência X ainda não acabou. Espere ela ser concluída.',
    },
    {
      quando: 'A lista mostra "Você terminou os seus pedidos" e "Aguardando a conclusão da sequência N".',
      oQueFazer: 'Não há mais nada para você agora. Avise o Sup. Pátio se precisar de mais trabalho.',
    },
    {
      quando: 'A barra mostra "documento já está em" e um status.',
      oQueFazer: 'O documento já passou dessa etapa. Fale com o Sup. Pátio se achar que ainda é seu.',
    },
    {
      quando: 'A barra mostra "ainda não foi selecionado para separação (Sup. Vendas)".',
      oQueFazer: 'O documento ainda não foi liberado. Peça ao Sup. Vendas.',
    },
    {
      quando: 'A barra mostra "ainda não entrou em sequência — fale com o Pátio".',
      oQueFazer: 'Peça ao Sup. Pátio para colocar o documento em uma sequência.',
    },
    {
      quando: 'A barra mostra "documento cancelado no Senior".',
      oQueFazer: 'Não confira este documento. Avise o Sup. Pátio.',
    },
    {
      quando: 'A barra mostra "documento não encontrado no Separa".',
      oQueFazer: 'Bipe de novo ou digite o número. Se continuar, avise o Sup. Pátio.',
    },
  ],
  dicas: [
    'Deixe o cursor na barra de bipagem. O leitor do coletor já escreve nela.',
    'A mensagem de erro na barra some sozinha em poucos segundos.',
  ],
  relacionadas: ['conferencia-pedido', 'login'],
}
