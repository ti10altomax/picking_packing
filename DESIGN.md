# Redesenho 2026-08 — Conferência, Sequências e Separadores

> Decisões fechadas em **2026-08-25/26** com direção e supervisão.
> **Espec fechada** — todas as pendências resolvidas (histórico em [Pendências](#pendências-de-definição)).
> **Fases 1 (rename), 2 (cadastro de Separador) e 3 (sequências) implementadas em 2026-08-27** na branch `develop`; Fases 4+ pendentes.

---

## Contexto

O que o sistema chama de **separador** é, na operação real, o **conferente**: valida por
bipagem que a mercadoria separada bate com o pedido/nota e organiza em volumes. Quem pega a
mercadoria no estoque é o **separador** — em grande parte extras temporários (colaboradores
de serviços gerais, nem todos funcionários) que **não usam o sistema**, mas precisam ser
rastreados para gestão de qualidade.

---

## 1. Rename `separador` → `conferente` (Fase 1)

Opção escolhida: **tudo vira conferência** ("Separa" continua o nome do sistema/processo).

| O quê | De | Para |
|---|---|---|
| Perfil de usuário | `separador` | `conferente` (+ migration de dados) |
| Campo do pedido | `Pedido.separador` | `Pedido.conferente` |
| Timestamps | `separacao_iniciada_em` / `separado_em` | `conferencia_iniciada_em` / `conferido_em` |
| Status | `Em separação` / `Separado` | `Em conferência` / `Conferido` (valores no banco migrados) |
| App Django | `apps/separacao/` | `apps/conferencia/` |
| Endpoints | `/api/separacao/...` | `/api/conferencia/...` |
| Rotas web/mobile | `/separacao` | `/conferencia` |

- Módulos congelados e legado `/pedidos` **não são tocados**.
- O rename quebra o APK atual dos coletores → build novo + re-sideload coordenado.

---

## 2. Cadastro de Separador + liberação diária (Fase 2)

```
Separador(id, nome, apelido, documento?, tipo: extra|funcionario, ativo,
          user FK opcional nula, criado_em)
SeparadorLiberacao(id, separador FK, data, liberado_por FK, criado_em)
    unique (separador, data)
Pedido.separado_por → FK Separador (nula)
```

- **Não criar User para separador**: extras não logam. Se contratado / um dia precisar
  logar, cria-se o User e vincula em `user` — histórico preservado.
- **Liberação diária**: Sup. Pátio marca quem está atuando como separador **hoje** (a
  pessoa pode estar em serviços gerais no dia). Tabela por data (não boolean) → histórico
  de dias trabalhados de graça (pagamento de extras, cruzamento com não-conformes).
- **Apontamento**: o conferente registra "separado por ciclano" **ao iniciar** a
  conferência (não na conclusão — assim pedidos que terminam Não conforme já ficam com a
  atribuição gravada, que é o cenário onde mais importa). Picker mostra só os liberados no
  dia. Editável até concluir; log em `PedidoLog`.
- **Apontamento obrigatório** com opção **"Não identificado"** destacada nos relatórios
  (aprovado 2026-08-26) — em vez de permitir pular silenciosamente.
- A lista de Não Conformes passa a exibir também o separador, não só o conferente.

---

## 3. Sequências de separação (Fase 3)

O Sup. Pátio agrupa os pedidos selecionados em **sequências** (ex.: 300 pedidos →
50 + 50 + 200) e, dentro de cada uma, atribui **pedido a pedido** ao conferente — a
supervisora conhece a dificuldade de cada pedido e a capacidade de cada conferente.
O modelo de fila compartilhada (conferente "puxa" o próximo pedido) foi **rejeitado** —
não propor de novo.

```
Sequencia(id, numero, status: aberta|em_andamento|concluida, criado_em, criado_por)
Pedido.sequencia → FK (nula até o pátio montar)
```

- **Tudo passa por sequência** (dia fraco = uma sequência única com tudo dentro).
- Vários conferentes participam da mesma sequência (cada um com seus pedidos);
  a participação é derivada dos pedidos — sem tabela M:N.
- **Trava**: conferente só inicia pedidos da sua **sequência ativa** (a mais antiga com
  pendências dele). Quando ele zera os pedidos dele, a próxima libera — regra
  **configurável**: `ao_terminar_meus_pedidos` (default) | `ao_concluir_sequencia_inteira`
  (ver [Configurações](#configurações-do-sistema)).
- **Sequência concluída** = todos os pedidos `Conferido` **ou** `Não conforme`
  (não conforme não trava a sequência).
- Pátio **pode editar** sequência em andamento (adicionar/remover pedidos), com log.
- Ordenação: FIFO por data/hora de atribuição (sequências e pedidos).
- Estados do pedido não ganham status novo: `Selecionado` (entra na sequência) →
  `Atribuído` (pátio atribui a um conferente) → `Em conferência` → `Conferido` | `Não conforme`.

---

## 4. Conferência — novos recursos (Fase 4)

### 4.1 Divergência de barra autorizada pelo supervisor

Cenário (decisão da direção): mercadoria certa, **etiquetada errado na fábrica** — a barra
lida não bate com o EAN do pedido/nota.

- No coletor, o conferente continua travado (`codigo_divergente`) e chama o supervisor.
- No **web**, o supervisor digita a barra lida, escolhe o item do pedido correspondente e
  **libera** — tudo registrado para gerenciamento posterior:

```
DivergenciaBarra(id, pedido_item FK, codigo_bipado, qtd, vinculado_por FK,
                 criado_em, observacao?)
```

- Gera `PedidoLog`, flag visível no pedido e relatório de etiquetagem errada
  (insumo para cobrar a fábrica).
- **Decidido (2026-08-26)**: o vínculo vale **só para aquela ocorrência** — nunca vira
  alias global da barra. Erro de etiquetagem é por lote; um alias permanente aceitaria a
  barra errada silenciosamente para sempre.

### 4.2 Erro de separação (a mais / a menos)

Na conclusão da conferência, o conferente registra sobras/faltas do que o separador trouxe:

```
ErroSeparacao(id, pedido FK, pedido_item FK, tipo: a_mais|a_menos, qtd,
              separador FK (de Pedido.separado_por), registrado_por FK, criado_em)
```

Fecha o ciclo de qualidade por separador (junto com não-conformes e o apontamento diário).

Regras decididas (2026-08-26):

- **Faltou (a menos)**: o pedido **continua virando Não conforme** — o registro do erro é
  um complemento, não um desfecho alternativo.
- **Sobrou (a mais)**: deixa passar (o pedido conclui) com o erro registrado, **mas quem
  fecha nesse caso é o Sup. Pátio**: o pedido sai da fila do conferente e entra numa fila
  de fechamento para o supervisor confirmar → `Conferido` (o WS Senior é chamado nesse
  fechamento). Comportamento **configurável** (ver [Configurações](#configurações-do-sistema)) —
  pode voltar a ser fechado direto pelo conferente se mudarem de ideia.
- Sugestão de implementação: status novo **`Aguardando fechamento`** para o caso de sobra —
  tira o pedido da sequência ativa do conferente (não trava a próxima sequência dele) e dá
  ao Sup. Pátio uma lista limpa de pedidos a fechar.

### 4.3 Relatório de separação agrupada

Agregação **produto × tipo de volume** (caixa/fardo/...) → total, com recorte **por
sequência** (decidido 2026-08-26). Os dados já existem
(`VolumeItem` → `Volume.tipo` → `PedidoItem` + `Pedido.sequencia`).
Consumidor: **o diretor** — tela web acessível a admin/supervisores; impressão/exportação
a definir na implementação.

---

## 5. Futuros (Fase 6 — sem data)

| Recurso | Ideia | Definição pendente |
|---|---|---|
| Finalizar sem conferência | Ação de supervisor "finalizar sem conferir" com motivo + log | Quem define quais notas dispensam conferência |
| Códigos DOM (kit) | `CodigoEmbalagem(codigo, produto, qtd_multiplicador)` — 1 bip soma a qtd do pacote sem abrir teclado p/ digitar; haverá vários tipos de DOM | De onde vêm os códigos (cadastro manual? Sisplan?) |
| Barra Sisplan | Tradução código Sisplan (ERP da fábrica) → produto Senior | Exemplos reais de barra p/ especificar |
| Imagem do produto | Foto na janela de quantidade; pasta de `.webp` servida pelo backend (match por codpro/SKU) | Pasta-fonte (provável: a mesma do e-commerce interno) |

> **Nota arquitetural**: divergência autorizada, DOM e Sisplan são extensões do mesmo
> ponto — a **resolução do código bipado**. Desenhar o `bipar` como uma cadeia:
> EAN/SKU do item → código de embalagem (DOM) → vínculo autorizado → divergência.
> Cada requisito futuro vira um elo novo, sem retrabalho.

---

## Configurações do sistema

Tabela de configuração nova (não existe ainda), editável pelo admin — nasce com duas chaves:

| Chave | Valores | Default |
|---|---|---|
| Liberação da próxima sequência | `ao_terminar_meus_pedidos` \| `ao_concluir_sequencia_inteira` | `ao_terminar_meus_pedidos` |
| Fechamento de pedido com sobra | `supervisor_patio` \| `conferente` | `supervisor_patio` |

---

## Roadmap

1. **Rename** separador → conferente — ✅ implementado 2026-08-27
2. **Cadastro de Separador** + liberação diária + apontamento na conferência — ✅ implementado 2026-08-27
3. **Sequências** + tela nova do Sup. Pátio — ✅ implementado 2026-08-27
4. **Divergência de barra + erro de separação + relatório agrupado**
5. **Paridade mobile + APK novo** (re-sideload nos coletores)
6. **Futuros** (tabela acima)

---

## Pendências de definição

**Nenhuma** — espec fechada em 2026-08-26. Histórico de resolução:

- [x] **Relatório agrupado** — recorte **por sequência**; consumidor: **o diretor**
- [x] **"Não identificado"** no apontamento de separador — **aprovado** (campo obrigatório com a opção destacada nos relatórios)
- [x] **Vínculo de barra divergente** — vale só para aquela ocorrência, nunca vira alias global
- [x] **Erro "a menos"** — continua Não conforme + registra o erro; **"a mais"** conclui com erro registrado e fechamento pelo Sup. Pátio (configurável)
