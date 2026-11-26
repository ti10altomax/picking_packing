import type { AjudaTela } from './tipos'

export const adminDesempenho: AjudaTela = {
  chave: 'admin-desempenho',
  titulo: 'Desempenho',
  menu: 'Admin → Desempenho',
  rota: '/admin/desempenho',
  perfis: ['admin'],
  resumo:
    'Mostra, dia a dia, quanto se trabalhou (bips, caixas fechadas lidas, conferências concluídas) e quão rápido o sistema respondeu. Abra quando alguém disser que o sistema está lento: a tela diz a hora, a ação e de quem foi a demora.',
  passos: [
    'Escolha o dia no alto: as setas andam um dia e o campo de data abre o calendário. A tela abre no dia de hoje.',
    'Leia os seis quadros do topo. Eles resumem o dia: conferências, bips, quantos conferentes trabalharam, o tempo do bip, quantas respostas saíram em até 0,3 segundo e os erros de servidor.',
    'Veja o gráfico "Hora a hora". As barras são os bips de cada hora e a linha é o tempo do bip. Se a linha sobe ao longo do dia, o sistema foi ficando lento.',
    'Em "O que o conferente faz", confira o tempo de cada ação. Verde é até 0,3 segundo, amarelo até 1 segundo e vermelho acima disso.',
    'Em "Requisições lentas", procure a hora da reclamação: a lista diz o que foi, de quem e quanto demorou.',
    'Toque em Imprimir para levar o dia em papel ou salvar em PDF.',
  ],
  elementos: [
    { nome: 'Tempo do bip (mediana)', descricao: 'Metade dos bips do dia respondeu em até esse tempo. É o número que melhor diz como o conferente sentiu o sistema.' },
    { nome: '95% em até', descricao: 'De cada 100 vezes, 95 responderam em até esse tempo. As outras 5 demoraram mais.' },
    { nome: 'Pior caso', descricao: 'A resposta mais demorada do dia para aquela ação.' },
    { nome: 'Respostas em até 0,3 s', descricao: 'Porcentagem de todas as chamadas ao servidor que voltaram em até 0,3 segundo.' },
    { nome: 'Erros de servidor', descricao: 'Chamadas que o servidor não conseguiu atender. O normal é zero.' },
    { nome: 'concl. e conf. (sob o gráfico)', descricao: 'Conferências concluídas naquela hora e quantos conferentes estavam bipando.' },
    { nome: 'Telas de gestão e carga de fundo', descricao: 'O que mais ocupou o servidor além dos conferentes: telas dos supervisores, carta de correção e o agente de impressão.' },
    { nome: 'Tempo somado', descricao: 'Quanto tempo o servidor gastou no dia inteiro com aquele tipo de chamada.' },
    { nome: 'Requisições lentas', descricao: 'Cada demora guardada uma a uma: acima de 1 segundo para o conferente e de 2 segundos para os demais.' },
  ],
  situacoes: [
    { quando: 'Aviso amarelo "Não há tempos de resposta guardados para este dia"', oQueFazer: 'É um dia anterior à entrada desta tela em produção. Os bips e as conferências aparecem; os tempos não existem para essa data.' },
    { quando: 'A linha do gráfico sobe ao longo do dia', oQueFazer: 'O sistema foi ficando lento. Veja em "Requisições lentas" o que demorou e avise a TI com a hora.' },
    { quando: 'Carta de correção aparece entre as lentas', oQueFazer: 'É esperado: a carta depende da resposta do Senior e leva alguns segundos.' },
    { quando: 'Erros de servidor acima de zero', oQueFazer: 'Abra Admin → Saúde do sistema para ver o que está fora do normal.' },
  ],
  dicas: [
    'Os tempos são do servidor. Não entram a rede Wi-Fi do galpão nem o tempo do coletor para desenhar a tela.',
    'A mediana e o "95% em até" são estimativas; o pior caso é exato.',
  ],
  relacionadas: ['admin-saude', 'admin'],
}
