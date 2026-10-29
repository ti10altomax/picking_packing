import type { AjudaTela } from './tipos'

export const supervisorEtiquetas: AjudaTela = {
  chave: 'supervisor-etiquetas',
  titulo: 'Etiquetas de volume',
  menu: 'Gestão → Etiquetas',
  rota: '/supervisor/etiquetas',
  perfis: ['supervisor_vendas', 'supervisor_patio', 'admin'],
  resumo:
    'Lista os documentos já conferidos que ainda não tiveram a etiqueta de volume impressa. Aqui você imprime o que está pronto e acompanha o que espera uma informação do Senior.',
  capturas: [
    {
      src: '/manual/supervisor-etiquetas.png',
      legenda: 'Etiquetas prontas para imprimir e as que aguardam o Senior.',
    },
  ],
  passos: [
    'Abra Gestão → Etiquetas. Leia a linha do topo: ela diz se a impressão automática está ligada, qual é a impressora padrão e se a regra "só com NF" está valendo.',
    'Em "Prontas para imprimir", cada linha é um documento conferido com transportadora (e NF, quando a regra exige).',
    'Para imprimir uma só, toque em "Etiqueta" na linha, escolha onde imprimir e toque em "Imprimir".',
    'Para imprimir todas, escolha a impressora na caixa ao lado de "Imprimir todas" e toque no botão. Com "Navegador", o sistema abre uma aba por documento, e você imprime cada uma.',
    'Acompanhe o contador "N/M enviadas" que aparece durante o envio. Falhas aparecem na mesma linha, com o número do documento.',
    'Em "Aguardando Senior", veja o que ainda não pode ser impresso e por quê. Não precisa fazer nada: quando o Senior informar o que falta, a etiqueta sai sozinha na impressora padrão ou passa para "Prontas".',
  ],
  elementos: [
    {
      nome: 'Linha do topo',
      descricao:
        '"Impressão automática ligada/desligada": se ligada, a etiqueta sai sozinha quando o documento é conferido e está liberado. "Padrão": a impressora usada pela impressão automática. "Só com NF: sim/não": se o pedido só imprime depois de faturado.',
    },
    {
      nome: 'impressoras (link)',
      descricao:
        'Só para o admin. Abre Admin → Impressoras, onde se escolhe a impressora padrão e se liga ou desliga a impressão automática e a regra "só com NF". Os outros perfis só leem a linha.',
    },
    {
      nome: 'Prontas para imprimir',
      descricao: 'Têm transportadora e, se a regra "só com NF" estiver ligada, nota fiscal emitida. Entre parênteses fica a quantidade.',
    },
    {
      nome: 'Aguardando Senior',
      descricao:
        'Conferidos sem transportadora no Senior ou, com a regra "só com NF", pedidos ainda não faturados. A linha mostra "sem transportadora" ou "sem NF emitida".',
    },
    {
      nome: 'Etiqueta',
      descricao: 'Botão verde da linha. Imprime as etiquetas do documento: uma por volume. Nas linhas de "Aguardando Senior" ele fica apagado, com o motivo escrito ("Sem transportadora" ou "Sem NF").',
    },
    {
      nome: 'Impressora ou Navegador',
      descricao:
        'Ao escolher "Navegador", o sistema abre a página da etiqueta 10x15 e você imprime em qualquer impressora do computador. A última escolha fica guardada neste computador.',
    },
    {
      nome: 'Dados da linha',
      descricao:
        'Número, badges, quantidade de volumes ("2 vol."), cliente, transportadora, NF quando já existe, quem conferiu, data e sequência. Se uma tentativa falhou, aparece "última tentativa:" com o motivo.',
    },
  ],
  situacoes: [
    {
      quando: 'Nada pendente.',
      oQueFazer: 'Não há etiquetas prontas. Todas as conferidas já foram impressas.',
    },
    {
      quando: 'Botão apagado com "Sem transportadora".',
      oQueFazer: 'O Senior ainda não tem transportadora para o documento. Peça o cadastro no Senior. Quando chegar, a etiqueta sai sozinha, se houver impressora padrão.',
    },
    {
      quando: 'Botão apagado com "Sem NF".',
      oQueFazer: 'O pedido ainda não foi faturado. Fale com o faturamento. A etiqueta sai quando a NF for emitida.',
    },
    {
      quando: 'Impressão automática "desligada" ou padrão "nenhuma".',
      oQueFazer: 'A etiqueta não sai sozinha. Imprima por aqui, ou peça ao admin para ligar em Admin → Impressoras.',
    },
    {
      quando: '"última tentativa:" em vermelho na linha.',
      oQueFazer: 'A impressora recusou o envio. Veja se está ligada e na rede, e tente de novo com "Etiqueta". Se repetir, avise o admin.',
    },
  ],
  dicas: [
    'Documentos de retira ou sem frete e sem transportadora não aparecem aqui: não existe etiqueta para eles.',
    'Para reimprimir uma etiqueta já impressa, use o botão "Reimprimir" em Conferidos.',
  ],
  relacionadas: ['supervisor-conferidos', 'supervisor-cartas', 'admin-impressoras', 'etiqueta-navegador', 'supervisor-vendas'],
}
