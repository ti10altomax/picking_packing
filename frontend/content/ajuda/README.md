# Manual do usuário embutido — como escrever a ajuda de uma tela

Cada tela do Separa tem um arquivo `content/ajuda/<chave>.ts` exportando um `AjudaTela`
(tipos em `tipos.ts`, registro em `index.ts`). O mesmo conteúdo aparece em dois lugares:

- **botão "?"** no cabeçalho da tela → painel lateral (`components/Ajuda.tsx`);
- **página `/ajuda`** → manual completo, navegável por perfil, imprimível. O coletor
  abre essa página no navegador do aparelho (`?perfil=…#chave`).

`npm run ajuda:checar` lista rotas sem ajuda e arquivos ainda em rascunho.
Capturas ficam em `public/manual/<chave>.png` (web desktop 1180×640 capturado em ~1,25× =
1475×800; conferente e login direto do coletor, 720×1184 — marcar `mobile: true`). Na página
`/ajuda` cada captura de desktop ocupa a largura toda da coluna e as do coletor ficam lado a
lado com ~340 px; qualquer uma amplia ao clicar. No painel lateral elas encolhem para a largura
do painel. Por isso, capture sempre no tamanho cheio — nunca reduza a imagem para "caber".

## Para quem é

Quem opera no galpão e no escritório: conferente no coletor, supervisoras de Vendas e
Pátio no navegador, admin da TI. Não é documentação técnica. Nada de nome de endpoint,
campo do banco, status interno em inglês (`conferindo`) ou nome de arquivo. O leitor
conhece o negócio (pedido, NF, transportadora, volume, bipagem), não o sistema.

## Regras de texto

- **pt-BR, frases curtas, verbo no imperativo** nos passos ("Toque em…", "Marque…").
- Nomes de botões, filtros, badges e cores **exatamente como aparecem na tela** — confira
  na captura e no `page.tsx`, não invente botão nem comportamento. Se o código faz algo
  que a captura não mostra (um modal, uma confirmação), pode descrever; se não tem certeza,
  não escreva.
- Um passo = uma ação. Até ~8 passos; se precisar de mais, a tela merece ser dividida em
  "situações".
- `resumo`: 1 a 3 frases. Para que a tela serve e quando a pessoa chega nela.
- `elementos`: só o que precisa de explicação (badge, cor, botão cujo efeito não é óbvio,
  filtro). Não liste "Atualizar recarrega a lista" em toda tela — uma vez na primeira tela
  do perfil basta.
- `situacoes`: mensagens, bloqueios e casos fora do normal, em pares "o que aparece" →
  "o que fazer". As mensagens de erro vêm do backend (`apps/*/views.py`, campo `erro` e
  `resultado`); use o texto que o usuário realmente vê no front.
- `dicas`: opcional, 1 a 3 itens; atalhos, hábitos que evitam erro.
- Sem emojis, sem exclamação, sem "simplesmente", sem "basta".
- Status do pedido sempre com a cor da paleta: Pendente (cinza), Selecionado (laranja),
  Atribuído (amarelo), Em conferência (azul), Aguardando fechamento (roxo), Conferido
  (verde), Não conforme (vermelho), Cancelado (vermelho).

## Glossário obrigatório (use estes termos)

| Use | Não use |
|---|---|
| documento, pedido, nota fiscal (NF) | registro, item (para pedido) |
| conferente | separador (no sentido de usuário), operador |
| separador | extra, ajudante |
| sequência | onda, lote |
| volume (caixa, fardo, outro) | embalagem, pacote |
| bipar, bipagem, leitor | escanear, scanner |
| coletor | celular, aparelho, TC21 |
| Sup. Vendas, Sup. Pátio | supervisora, gerente |
| Senior | ERP, Oracle |
| transportadora | transp., carrier |

## Estrutura do arquivo

```ts
import type { AjudaTela } from './tipos'

export const supervisorPatio: AjudaTela = {
  chave: 'supervisor-patio',            // não mudar
  titulo: 'Pátio — fila e sequências',  // pode ajustar se o da tela for melhor
  menu: 'Pátio',                        // onde fica no menu
  rota: '/supervisor/patio',            // não mudar
  perfis: ['supervisor_patio', 'admin'],
  resumo: '…',
  capturas: [{ src: '/manual/supervisor-patio.png', legenda: '…' }],
  passos: ['…'],
  elementos: [{ nome: 'Em andamento', descricao: '…' }],
  situacoes: [{ quando: '…', oQueFazer: '…' }],
  dicas: ['…'],
  relacionadas: ['supervisor-sequencia', 'supervisor-separadores'],
}
```

Apóstrofo dentro de string: use aspas duplas na string ou `\'`. Sem JSX, sem markdown
dentro das strings — o componente renderiza texto puro.

## Fontes para escrever

1. A captura em `public/manual/<chave>.png` (abra a imagem).
2. O `page.tsx` da rota e os componentes que ele importa (`components/…`).
3. `CLAUDE.md` (fluxos por perfil, estados, glossário) e `DESIGN.md` (regras de negócio:
   sequência, separador, divergência, sobra/falta).
4. As views do backend para as mensagens de erro e os códigos 409.
