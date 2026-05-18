# Sistema de Separação Interna — Altomax

## Visão geral

Sistema interno para **separação de pedidos no galpão da Altomax**. Não é mais um fluxo de expedição com etiquetagem por marketplace/transportadora — o foco atual é apoiar o trabalho do separador no chão de fábrica, garantindo que cada item bipado bate com o pedido e organizando o conteúdo em **volumes** (caixas, fardos, etc.).

> Pivot do projeto: este sistema **era** um fluxo de expedição multi-marketplace com VTEX/CLICK/etiquetagem. Esses módulos **continuam no código preservados** (não apagar) mas estão fora do MVP atual. Ver "Módulos congelados".

Atores principais: **Supervisor de Vendas**, **Supervisor de Pátio**, **Separador** e **Admin**.

### Fluxo geral

```
1. [Senior]            Pedidos pendentes existem no Senior (Oracle, leitura).
2. [Sup. Vendas]       Sincroniza pedidos; seleciona quais entram para separação.
3. [Sup. Pátio]        Atribui cada pedido selecionado a um separador específico.
4. [Separador]         Lista pedidos atribuídos a ele → inicia separação:
   - cria um volume (caixa / fardo / outro);
   - para cada item: seleciona, informa qtd, bipa o código de barras
     → sistema valida produto + quantidade;
   - botão "Novo volume" sempre disponível;
   - conclui → chama WS Senior (a definir) avisando os volumes;
   - se houver problema → marca como Não conforme.
5. [Não conforme]      Pedido entra na lista de Não Conformes para ação posterior
                       (cancelar, retornar à fila, escalar — ações TBD).
```

---

## Glossário

| Termo | Significado |
|---|---|
| Pedido | Unidade de venda originada no Senior; contém 1..N itens |
| Volume | Embalagem física (caixa, fardo etc.) que agrupa parte dos itens separados de um pedido |
| Conferência por bipagem | Operador escolhe item, informa qtd e bipa o código de barras; sistema verifica se bate com o item esperado |
| Não conforme | Pedido com problema na separação (qtd divergente, produto errado, item ausente) |
| Senior | ERP da empresa — fonte dos pedidos (Oracle, leitura) e destino do status pós-separação (SOAP, escrita via WS a definir) |

---

## Atores e perfis

| Perfil | Permissões |
|---|---|
| **Supervisor de Vendas** | Lista pedidos pendentes do Senior; seleciona pedidos que vão para separação |
| **Supervisor de Pátio** | Lista pedidos selecionados; atribui cada pedido a um separador |
| **Separador** | Lista pedidos atribuídos a ele; executa separação por bipagem em volumes |
| **Admin** | Tudo acima + cadastros, usuários, relatórios |

A autenticação associa usuário → perfil. Telas são filtradas pelo perfil.

---

## Estados do pedido

```
Pendente
  → [Sup. Vendas seleciona]   → Selecionado
  → [Sup. Pátio atribui]      → Atribuído
  → [Separador inicia]        → Em separação
  → [Separador conclui]       → Separado          (chama WS Senior)
                                ou
                                Não conforme       (entra na lista de exceções)
```

Cores sugeridas no front:
- Pendente — **cinza**
- Selecionado — **laranja**
- Atribuído — **amarelo**
- Em separação — **azul**
- Separado — **verde**
- Não conforme — **vermelho**

Toda transição grava em `PedidoLog` (quem, quando, ação, payload).

---

## Fluxo 1 — Supervisor de Vendas

1. **Lista de pedidos pendentes**
   - Sincroniza com o Senior (snapshot no Postgres local).
   - Filtros: data, cliente, número.
2. **Selecionar pedidos**
   - Multi-seleção via checkbox.
   - Botão "Enviar para separação" → status `Selecionado`, registra `selecionado_em`/`selecionado_por`.

---

## Fluxo 2 — Supervisor de Pátio

1. **Lista de pedidos selecionados**
   - Pedidos com status `Selecionado` ainda não atribuídos.
2. **Atribuir a separador**
   - Para cada pedido (ou em lote), escolher um separador da lista de usuários ativos com perfil `separador`.
   - Status passa para `Atribuído`, registra `atribuido_em`/`atribuido_para`.

---

## Fluxo 3 — Separador

1. **Lista "Atribuídos a mim"**
   - Pedidos com status `Atribuído` ou `Em separação` cujo `atribuido_para` é o usuário logado.
   - FIFO por `atribuido_em`.
2. **Selecionar pedido**
   - Status passa para `Em separação` na primeira ação relevante (abrir volume).
3. **Tela de separação**
   - Header: número do pedido, cliente, contagem de itens (qtd_separada / qtd_pedida agregada), botão fixo "**Novo volume**".
   - Lista de itens do pedido: SKU, descrição, qtd_pedida, qtd_separada.
   - Painel "Volume atual": tipo, identificador, lista de itens já alocados nele.
4. **Abrir primeiro volume**
   - Tipo: caixa / fardo / outro (string livre por enquanto, mapeamento Senior TBD).
   - Identificador opcional (texto livre).
5. **Bipar item**
   - Operador toca em um item da lista do pedido.
   - Informa **quantidade** que está colocando no volume atual.
   - Bipa o código de barras → sistema valida:
     - Match (EAN/SKU bate com o item escolhido) → soma a qtd ao item, feedback verde + som curto.
     - Mismatch → feedback vermelho, não soma, log.
     - Excesso (`qtd_separada` ficaria > `qtd_pedida`) → bloqueia ou pede confirmação.
6. **Novo volume** (botão sempre disponível)
   - Pode abrir outro volume sem precisar fechar o atual (a confirmar se múltiplos volumes podem ficar simultaneamente abertos).
7. **Concluir separação**
   - Habilita quando `qtd_separada == qtd_pedida` para todos os itens.
   - Chama WS Senior (a definir) com a lista de volumes.
   - Sucesso → `Separado`.
   - Falha no WS → registra erro, mantém `Em separação`, alerta admin.
8. **Marcar como Não conforme**
   - Botão alternativo a "Concluir".
   - Operador escolhe motivo: divergência de quantidade, produto errado, item ausente.
   - Status passa para `Não conforme` com payload do motivo.

---

## Fluxo 4 — Lista de Não Conformes

- Página separada (admin/supervisor de pátio). Mostra pedidos `Não conforme` com motivo, separador, data.
- Ações **a definir** (placeholder no MVP): cancelar pedido, retornar para fila de atribuição, escalar.

---

## Telas (mínimo viável)

1. **Login**
2. **Sup. Vendas — Lista (a selecionar)**
3. **Sup. Pátio — Lista (a atribuir)** + dropdown de separador
4. **Separador — Lista (atribuídos a mim)**
5. **Separador — Separação por bipagem (volumes)**
6. **Lista de Não Conformes** (com placeholder de ações)
7. **Admin** (cadastros, usuários — futuro)

Todas mobile-first (coletor Android com leitor embutido). Campo de bipagem sempre em foco; alvos de toque ≥ 44px; alto contraste.

---

## Modelo de dados (proposta)

```
User(id, username, perfil, ...)
  perfil: separador | supervisor_vendas | supervisor_patio | admin

Pedido(id, numero_externo, status, criado_em, cliente,
       selecionado_em, selecionado_por_id,
       atribuido_em, atribuido_para_id,
       separacao_iniciada_em,
       separado_em,
       senior_atualizado_em, senior_tentativas, senior_ultimo_erro,
       nao_conforme_em, nao_conforme_motivo)

PedidoItem(id, pedido_id, sku, descricao, ean, qtd_pedida, qtd_separada, status)

Volume(id, pedido_id, tipo, identificador,
       criado_em, criado_por_id, fechado_em)

VolumeItem(id, volume_id, pedido_item_id, qtd, criado_em)

PedidoLog(id, pedido_id, user_id, acao, payload, criado_em)
```

> O `Pedido` ganha campos novos (`selecionado_em`, `atribuido_para_id`, etc.) e perde a relevância dos campos de etiquetagem (`embalagem_*`, `etiqueta_vtex_*`, `etiqueta_impressa_em`) para o fluxo principal — esses ficam no schema (módulos congelados) mas não são tocados.

---

## Integrações

- **Senior (Oracle, leitura)** — origem dos pedidos. Read-only. Polling periódico ou consulta sob demanda.
  - Critério de "pedido pendente" no Oracle: a definir (filtros, status, empresa).
- **Senior (SOAP, escrita)** — atualizar volumes após separação.
  - **WS exato a definir.** Tipicamente espera identificador do pedido + lista de volumes (tipo + qtd_itens? a confirmar).
  - Idempotência por `numero_externo`; backoff em falha; alertar admin após N tentativas.

VTEX, CLICK, marketplaces e o `embalagempfa` **saíram do escopo** — ver "Módulos congelados".

---

## Stack (mantida)

| Camada | Tecnologia |
|---|---|
| Frontend | **Next.js** (App Router) + **Zustand** |
| UI | Mobile-first; Tailwind/shadcn |
| Backend | **Django REST Framework** |
| Auth | **JWT** (`djangorestframework-simplejwt`) |
| Banco local | **PostgreSQL** |
| Banco origem (read-only) | **Oracle** (Senior) |
| Tempo real | WebSocket via Django Channels (ou polling curto) |
| Containers | Docker + docker-compose |
| Hospedagem | VM Linux em Proxmox |

### Estrutura de repositório

```
separa/
├── backend/
│   ├── apps/
│   │   ├── core/           # User, perfis, auth
│   │   ├── pedidos/        # Pedido, PedidoItem, PedidoLog (+ Volume, VolumeItem — a criar)
│   │   ├── separacao/      # fluxo do separador (atualizar para volumes)
│   │   ├── senior/         # leitura Oracle + saída SOAP (operação a definir)
│   │   ├── patio/          # NOVO — fluxos de Sup. Vendas e Sup. Pátio
│   │   ├── etiquetagem/    # CONGELADO — Lote, LotePedido (não tocar)
│   │   ├── etiquetas/      # CONGELADO — Impressora, PrintAgent, PrintJob (não tocar)
│   │   └── vtex/           # CONGELADO — VTEX API
├── frontend/
│   ├── app/
│   │   ├── (separador)/
│   │   ├── (supervisor)/   # NOVO — telas de Sup. Vendas e Sup. Pátio
│   │   ├── (admin)/
│   │   │   └── admin/
│   │   │       ├── impressoras/   # CONGELADO — fora do menu
│   │   │       └── agents/        # CONGELADO — fora do menu
│   │   └── (etiquetador)/  # CONGELADO — fora do menu
└── docker-compose.yml
```

---

## Princípios de UI

- **Mobile-first**: validar a 360px antes de pensar em desktop.
- **Alvos de toque** ≥ 44px.
- **Foco no input de bipagem** sempre que a tela de separação estiver visível.
- **Cores fortes** para status (paleta acima).
- **Operação com uma mão** — separador segura o coletor; UI cabe na metade superior da tela.

---

## Requisitos não-funcionais

- Tempo real nas listas (Sup. Pátio precisa ver imediatamente o que Sup. Vendas selecionou; Separador idem).
- Auditoria: toda transição grava em `PedidoLog`.
- Idempotência no WS Senior (não mandar duas vezes).
- Resiliência: separador não perde progresso de separação se cair a rede.

---

## Módulos congelados (não apagar)

Estes módulos foram desenvolvidos para o escopo anterior (expedição multi-marketplace com etiquetagem VTEX) e permanecem no código **preservados, fora do menu/navegação atual**:

- `apps/etiquetas/` — Lote, LotePedido, EtiquetaVtex, Impressora, PrintAgent, PrintJob (CRUD, agent USB, fila de jobs).
- `apps/vtex/` — integração com VTEX API (resgate de etiquetas).
- `apps/senior/soap.py` — operação `Gerar` do `embalagempfa` (cliente SOAP base pode ser reaproveitado, a operação específica não).
- Frontend: `app/(etiquetador)/`, `app/(admin)/admin/impressoras/`, `app/(admin)/admin/agents/`.

Não tocar nesses arquivos durante o trabalho do escopo atual. Podem voltar ao fluxo principal mais tarde.

---

## Pontos abertos

- [ ] Nome e contrato do **WS Senior** para atualizar volumes pós-separação
- [ ] Como o Senior identifica os tipos de volume (caixa/fardo/outro) — código próprio? string livre?
- [ ] Critério no Oracle para "pedido pendente" (filtros, status, empresa) — possivelmente diferente do critério usado antes (CODEMP=8 era para o fluxo marketplace)
- [ ] Comportamento esperado quando a separação termina parcial (alguns itens em falta) — chama o WS mesmo assim ou só Não Conforme?
- [ ] Lista completa de ações disponíveis na lista de Não Conformes
- [ ] Múltiplos volumes podem ficar abertos simultaneamente, ou só um por vez?
- [ ] Bipar item para um item já completo (`qtd_separada == qtd_pedida`) — bloqueia ou avisa?
- [ ] Senior tem cadastro de "embalagem"? Os tipos de volume vêm de lá ou são livres no nosso lado?
- [ ] Cadência de sincronização Senior → Postgres da lista de pendentes

---

## Roadmap (novo escopo)

**Fase A — Fundação**
- Refatorar perfis: `separador`, `supervisor_vendas`, `supervisor_patio`, `admin`
- Refatorar `Pedido` (novos campos de seleção/atribuição/separação)
- Modelar `Volume` e `VolumeItem`
- Esconder etiquetagem/impressoras do menu (sem apagar)

**Fase B — Sup. Vendas**
- Tela de listagem de pendentes
- Seleção em lote → status `Selecionado`

**Fase C — Sup. Pátio**
- Tela de listagem de selecionados
- Atribuição a separador → status `Atribuído`

**Fase D — Separador (núcleo)**
- Lista "atribuídos a mim"
- Tela de separação por bipagem com volumes
- Concluir separação (chama WS Senior — placeholder enquanto contrato não vem)
- Marcar Não Conforme

**Fase E — Não Conformes**
- Lista
- Ações (definir conforme avança)

**Fase F — Refinos**
- Tempo real, relatórios, auditoria visível por pedido

---

## Setup de desenvolvimento

Tudo em **Docker desde o primeiro dia**.

```bash
docker compose up --build
```

Serviços: `backend` (8000), `frontend` (3000), `postgres`, `redis`, `nginx` (prod).

Variáveis em `.env`:
- `ORACLE_*` — credenciais read-only do Senior
- `POSTGRES_*` — banco local
- `JWT_SECRET`, `DJANGO_SECRET_KEY`
- `SENIOR_WS_*` — auth do web service (a definir)

---

## Convenções para Claude Code

- Manter UI em **pt-BR**.
- Cores de status seguem a paleta acima.
- Toda transição grava em `PedidoLog`.
- **Mobile-first sempre**: validar a 360px antes de pensar em desktop.
- **Tudo em Docker**: novas dependências entram via `docker-compose.yml`.
- **Oracle é read-only**: nenhum INSERT/UPDATE/DELETE no Senior.
- **Não apagar nada** dos módulos congelados (etiquetagem/VTEX/embalagempfa) — apenas não usar no fluxo atual.
- Antes de criar nova stack/dependência, perguntar.
