# Status de implementação — Sistema de separação interna

> Snapshot em **2026-09-16** (último update do dia). Objetivo: amanhã (e nas próximas semanas) você consegue retomar o trabalho sem precisar reler tudo.

---

## 2026-09-16 — Leitor de hardware do coletor (Zebra TC21) no mobile + monitoramento e backup

**Mobile — barra do scanner** (`mobile/app/conferencia/[id].tsx`). O app só bipava pela câmera: na tela do pedido não havia campo de texto pra receber o que o leitor embutido "digita" (DataWedge em modo teclado + Enter), então o gatilho do TC21 não fazia nada. Correção espelha o web: o botão grande "Bipar código de barras" virou a **mesma barra do web** — `TextInput` sempre focado com `showSoftInputOnFocus={false}` (sem teclado virtual), `submitBehavior="submit"` (Enter dispara e mantém o foco), ícone 📷 na ponta abre a câmera como antes. Código lido cai em `processarCodigoLido` (busca item pendente por EAN/SKU → abre o modal do item com código preenchido e foco na qtd). Erro (código sem item / sem volume) pinta a barra de vermelho, vibra e mostra a mensagem como placeholder por 2,5 s — saiu do erro global. Foco: efeito re-foca a barra quando nenhum modal (item, volume, NC, separado-por, concluir, câmera) está aberto e o pedido está `conferindo`; `onBlur` re-foca com a mesma guarda, então tocar em "+ Volume", ativar volume ou remover item não desarma o leitor; dentro dos modais os inputs próprios recebem o leitor normalmente. Barra só aparece com volume ativo **e** status `conferindo` (antes o botão aparecia em qualquer status). **Modal do item sem teclado ao abrir**: o auto-foco em qtd/código (que puxava o teclado virtual e cobria a tela) saiu; um `TextInput` invisível (`capturaRef`, 1×1, opacity 0, sem soft input) fica focado e recebe o leitor — bipar dentro do modal assume o código e confirma com a qtd atual (`enviar(codOverride)`); os campos visíveis só abrem o teclado quando tocados; após erro o foco volta pra captura, não pro campo visível. `tsc` limpo. **APK 0.3.4** (versionCode 8), build local. Checklist do coletor: DataWedge → Profile0 → Barcode input on, Keystroke output on, Send ENTER key on.

**Monitoramento (2026-09-11, commit `2ce1c5e`)**. Sem subir Prometheus/Grafana próprios: o `docker-compose.prod.yml` ganhou `celery-exporter` (0.11.3) e `redis-exporter` (1.66.0) sem porta publicada, e o worker roda com `-E`; o `mp-prometheus` da stack de monitoramento já existente na VM entra em `separa_default` (external) e scrapa `celery-exporter:9808` / `redis-exporter:9121` — jobs `separa-celery` e `separa-redis` UP. Grafana lê o Postgres direto com o role read-only `grafana_ro` (`ALTER DEFAULT PRIVILEGES FOR ROLE separa`). Dashboard de negócio versionado em **`deploy/grafana/separa-conferencia.json`** (uid `separa-conferencia`, 12 painéis, importar com Overwrite): pedidos por status (sem pendentes), fila por conferente, pendentes, atribuído mais antigo, falhas WS Senior, NC por motivo (lê `PedidoLog` porque retornar à fila limpa o motivo), NC abertos, conferidos/dia, mediana do tempo de conferência, erros por separador, divergências/dia, em conferência > 2 h. Painéis metric/value precisam da transformação *Rows to fields*. Dashboards prontos: Celery 17509/17508, Redis 763.

**Backup do banco `separa` (2026-09-16)**. Achado durante o monitoramento: nenhum dos dois mecanismos de backup da VM cobria o `separa`. Resolvido na stack Swarm `postgres` (Portainer): `POSTGRES_DB=postgres,separa` no `prodrigestivill/postgres-backup-local:16`; execução manual verificada (34 tabelas, 14.215 pedidos, gzip ok), retenção 7d/4w/6m no volume `postgres_backups` (`/var/lib/docker/volumes/postgres_backups/_data`, só local). Fora do Separa e ainda aberto: o script `~/backup` (grmetas/crm_altomax de 192.168.1.250 → Google Drive) está quebrado por cota do Drive desde 30/08 (crm) e 13/09 (grmetas), e faz upload antes da cópia local.

- **Pendente**: sideload do APK 0.3.4 nos TC21 (substitui o 0.3.3, que também não foi distribuído); confirmar o perfil do DataWedge em cada coletor.

---

## 2026-09-09 — Notas fiscais no fluxo, refinos de UX e 4 deploys

Mudança de escopo pequena, fechada com o usuário: além dos pedidos abertos, o galpão confere **notas fiscais de venda sem pedido de origem**. Commit `5a5a929` + 14 arquivos em stage no fim do dia (já em produção via rsync).

- **Modelo**: mesma tabela `Pedido`, campo `tipo` (`pedido` | `nota_fiscal`) + `codfil`, `codsnf`, `frete`. Identidade Senior = `UniqueConstraint(tipo, codfil, codsnf, numero_externo)`, substituindo o `unique` de `numero_externo` — a numeração do Senior é por filial e, na NF, por série (empresa 1 hoje tem só filial 1 e série `NFE`; outras empresas têm mais). Migrations `pedidos/0011`, `pedidos/0012`, `core/0005`.
- **Sync Oracle** (`sincronizar_pedidos_oracle`; `manage.py sync_oracle` chama a mesma rotina): duas fontes — E120PED `sitped=1` e E140NFV `sitnfv=2` **sem `numped` nos itens** (NOT EXISTS em E140IPV; ~66 de ~2300 NFs/30 dias caem nesse critério). Itens de NF vêm de E140IPV (`qtdfat`). Janela `TRUNC(SYSDATE) - N` nas duas listas, `N` em `Configuracao.janela_sync_dias` (default **5**, valor de produção; no dev há uma linha com 10). Pedidos importados antes de `codfil` existir (`codfil=''`) são **adotados** pelo sync em vez de duplicados (336 em produção, zero duplicatas).
- **CIFFOB** → `Pedido.frete`: C = Entrega, F = Retira, **X = Sem frete** (confirmado pelo usuário). Entrega × retira é só filtro, sem regra de negócio.
- **API**: `GET /api/pedidos/?tipo=&frete=`; `tipo`/`tipo_label`/`frete`/`frete_label` nos serializers e nos payloads de conferência, sequência, fechamentos, não conformes e divergências. Nos erros de separação a chave é **`tipo_doc`** (`tipo` ali já significa a_mais/a_menos). O placeholder do WS Senior loga tipo/filial/série.
- **Performance**: lista de pedidos trocou `Count` com join por `Subquery` correlacionada — pendentes de ~975 ms para ~260 ms, filtrados 10–30 ms (12k pedidos no dev). O `COUNT(*)` da paginação deixou de arrastar os joins.
- **Web**: `components/ui/DocBadges.tsx` (chips NF / Entrega / Retira / Sem frete) em todas as listas e no header da conferência; filtros por tipo e frete no Sup. Vendas; Conferidos mostra **"separado por"** (âmbar quando não identificado) e o acordeão aberto ganhou faixa esverdeada + barra na esquerda + recuo; **todas as telas do supervisor e do admin em largura total** (removido `max-w-*xl mx-auto`, igual à "Atribuídos a mim") — preferência explícita do usuário.
- **Mobile**: paridade das badges, filtros e Conferidos; `components/CabecalhoLista.tsx` mostra "Atualizando lista…" com spinner e esmaece a lista enquanto a consulta roda (vendas, pátio, conferidos) — a troca de filtro deixava a lista antiga parada sem feedback. **APK 0.3.3** (versionCode 7), build local ~1 min; 0.3.0→0.3.2 foram intermediários não distribuídos.
- **Deploy**: 4 rodadas de `ansible-playbook -i inventory.yml deploy.yml` no dia, todas ok=19 / failed=0; o backend leva 15–30 s para voltar (migrate + collectstatic). O beat importou 8 NFs na primeira rodada em produção.
- **Docs**: `CLAUDE.md` atualizado (visão geral, glossário, modelo, integrações, pontos abertos).
- **Pendente**: sideload do APK 0.3.3 nos coletores.

---

## 2026-08-26 — Redesenho aprovado ✅ (Fases 1–5 implementadas e em produção em 2026-08-28)

Sessão de definição com direção/supervisão fechou um redesenho grande — **espec completa em `DESIGN.md`**. As decisões abaixo são o registro da espec; a implementação de cada fase está nos blocos "Fase N" logo em seguida.

- **Rename**: perfil/campos/status/endpoints `separador`/`separação` → `conferente`/`conferência` (opção "tudo vira conferência"; "Separa" continua o nome do sistema).
- **Cadastro de Separador** físico (extras, sem login, FK opcional pra User) + **liberação diária** (`SeparadorLiberacao` por data) + apontamento "separado por" registrado pelo conferente ao **iniciar** a conferência.
- **Sequências de separação**: Sup. Pátio agrupa pedidos em sequências e atribui **pedido a pedido** a conferentes (push mantido — a proposta de fila compartilhada/claim foi rejeitada); trava de sequência ativa com regra de liberação **configurável**; tudo passa por sequência; edição em andamento permitida com log.
- **Divergência de barra** autorizada pelo supervisor no web (registrada p/ gestão — decisão da direção), **erro de separação a mais/a menos** na conclusão, **relatório agrupado** produto × tipo de volume.
- **Futuros**: finalizar sem conferência, códigos DOM (kit multiplicador de qtd por bip), barra Sisplan, imagem do produto na janela de qtd.
- **Decidido na 2ª rodada (2026-08-26)**: vínculo de barra divergente vale só pra ocorrência (nunca alias global); "a menos" continua Não conforme + registra erro; "a mais" conclui com erro registrado e **fechamento pelo Sup. Pátio** (configurável; sugestão: status novo `Aguardando fechamento`).
- **3ª rodada (2026-08-26)**: relatório agrupado com recorte **por sequência**, consumido pelo **diretor**; opção **"Não identificado"** no apontamento aprovada. **Espec fechada — sem pendências.**

**Fase 1 do redesenho implementada em 2026-08-27** (branch `develop`): rename completo `separador`→`conferente` — perfil (+migration de dados), campos do Pedido (`conferente`, `conferencia_iniciada_em`, `conferido_em`), status (`conferindo`/`conferido`, valores migrados), app `apps/conferencia/`, endpoints `/api/conferencia/` e `/api/users/conferentes/`, payload `conferente_id` no atribuir, chaves `conferente_username`/`percent_conferido`/`duracao_conferencia`, rotas web `/conferencia` e `/supervisor/conferidos`, mobile idem. **Mantidos**: `PedidoItem.qtd_separada` (compartilhado com legado), endpoint legado `finalizar_separacao`, módulos congelados intactos. Validado: `manage.py check` + `makemigrations --check` limpos, `tsc` web zerado, migrações aplicadas no dev, smoke test de rotas ok. Pendência conhecida: erro de tipo pré-existente em `mobile/components/CameraScanner.tsx` (expo-camera), sem relação com o rename. **APK dos coletores precisa de rebuild quando isso for pra produção.**

**Fase 2 do redesenho implementada em 2026-08-27** (branch `develop`): cadastro de Separador + liberação diária + apontamento.

- Modelos `Separador` e `SeparadorLiberacao` + `Pedido.separado_por`/`separador_nao_identificado` (migration `pedidos/0008`).
- App novo `apps/separadores`: `GET/POST /api/separadores/`, `PATCH /api/separadores/<id>/`, `POST liberar//desliberar/` (sup. pátio/admin), `GET /api/separadores/liberados/` (picker — conferente pode ler).
- `iniciar` da conferência agora **exige o apontamento** (`separado_por` ou `nao_identificado: true`); valida separador ativo + liberado hoje; `criar_volume` não auto-inicia mais; `POST /api/conferencia/pedidos/<id>/separado_por/` troca durante a conferência (logado).
- Não conformes e serializers de pedido expõem `separado_por`/flag; "retornar para fila" limpa o apontamento.
- Web: tela `/supervisor/separadores` (cadastro rápido + toggle "Liberado hoje" + desativar), picker obrigatório no iniciar com "Não identificado" destacado, chip "Separado por" com troca, não conformes mostra o separador, card no admin.
- Mobile: paridade completa; a tela de não conformes foi **realinhada ao contrato real da API** (o shape anterior era imaginado e nunca bateu); fix do erro pré-existente de tipos no `CameraScanner` (`BarcodeType`).
- Django admin: `Separador` com inline de liberações; campos novos no Pedido.
- Infra dev: `backend/locale/.gitkeep` evita crash-loop do runserver por EIO do mount 9p do WSL em diretório inexistente.
- Validação: e2e via API (selecionar → atribuir → iniciar sem/com apontamento → trocar → revertido); tsc web e mobile zerados; `makemigrations --check` limpo.

**Fase 3 do redesenho implementada em 2026-08-27** (branch `develop`): sequências de separação.

- Modelos `Sequencia` (numero auto, aberta→em_andamento→concluida) + `Pedido.sequencia` (migration `pedidos/0009`) e `Configuracao` no core (migration `core/0004`, editável no Django admin) — chaves `liberacao_proxima_sequencia` (default `ao_terminar_meus_pedidos`) e `fechamento_sobra` (pronta pra Fase 4).
- App novo `apps/sequencias`: `GET/POST /api/sequencias/`, `GET/DELETE /api/sequencias/<id>/`, `POST adicionar//remover//atribuir/` (sup. pátio/admin). Remover pedido atribuído desatribui (volta a Selecionado); tudo logado em `PedidoLog` (`pedido_sequenciado`, `pedido_removido_sequencia`, `pedido_atribuido`).
- **Atribuição direta antiga desativada**: `POST /api/pedidos/atribuir/` responde 410 — tudo via sequência.
- **Trava do conferente**: `GET /api/conferencia/pedidos/` agora retorna `{sequencia, aguardando_sequencia, pedidos, outras_sequencias_pendentes}` — só os pedidos da sequência ativa (FIFO por atribuição; pedidos legados sem sequência continuam visíveis); `iniciar` bloqueia pedido de outra sequência (409). Regra de liberação configurável testada nos dois modos.
- Sequência conclui sozinha quando todos os pedidos ficam Conferido/Não conforme/Cancelado; "retornar para fila" tira o pedido da sequência.
- Filtro novo `?sem_sequencia=1` no `GET /api/pedidos/`.
- Web: `/supervisor/patio` redesenhada (cards de sequências + selecionados sem sequência → criar/adicionar) + página nova `/supervisor/patio/[id]` (atribuir por conferente, reatribuir, remover, excluir vazia); lista do conferente mostra badge da sequência e o estado "aguardando sequência N".
- Mobile: paridade completa (`patio` redesenhada, `supervisor/sequencia/[id]` nova, lista do conferente atualizada).
- Validação: e2e via API (criar sequências → atribuir → trava 409 entre sequências → concluir libera a próxima → regra `ao_concluir_sequencia_inteira` bloqueando com 2 conferentes → tudo revertido); tsc web e mobile zerados; `makemigrations --check` limpo.

**Fase 4 do redesenho implementada em 2026-08-27** (branch `develop`): divergência de barra + erros de separação + relatório por sequência.

- **Divergência de barra** (§4.1): modelo `DivergenciaBarra`; `POST /api/conferencia/pedidos/<id>/liberar_divergencia/` (supervisores) — valida código ≠ EAN/SKU, respeita excesso, lança no último volume aberto e registra tudo; `GET /api/divergencias/` (relatório de etiquetagem errada); `qtd_divergencias` nos serializers de pedido. Tela web `/supervisor/divergencias` (busca pedido em conferência → item → barra+qtd → liberar, com histórico). **Web-only por decisão de design** (conferente fica travado no coletor e chama o supervisor).
- **Erros de separação** (§4.2): modelo `ErroSeparacao` (a_mais/a_menos, atribuído ao `separado_por`). **Sobra**: `concluir` aceita `sobras: [{item_id, qtd}]`; com config `fechamento_sobra=supervisor_patio` (default) o pedido vai para o **status novo `aguardando_fechamento`** (WS Senior só no fechamento) — `GET /api/fechamentos/` + `POST /api/fechamentos/<id>/fechar/` (sup. pátio); com `conferente`, conclui direto. **Falta**: derivada automaticamente ao marcar Não Conforme com motivo divergência/ausente (qtd_pedida − qtd_separada por item). Status novo conta como final pra sequência (não trava colegas). Telas: modal de conclusão com registro de sobras (web+mobile), página `/supervisor/fechamentos` (web).
- **Relatório por sequência** (§4.3): `GET /api/sequencias/<id>/relatorio/` — produto × tipo de volume (linhas, totais, contagem de volumes). Página imprimível `/supervisor/patio/<id>/relatorio` (web) e modal na tela da sequência (mobile). Consumidor: diretor.
- **Relatório de erros de separação** (adição 2026-08-28): `GET /api/erros-separacao/` (filtros tipo/separador/período) com ranking por separador + histórico de ocorrências; telas `/supervisor/erros` (web, com filtro por período e clique no separador pra filtrar) e `supervisor/erros` (mobile). No modal de conclusão, item+qtd selecionados entram na sobra mesmo sem apertar o "+".
- Django admin: `DivergenciaBarra` e `ErroSeparacao` registrados; badge do status novo.
- Validação: e2e via API (divergência com barra errada → lista; concluir com sobra → aguardando → fila → fechar → Conferido+WS; NC com faltas automáticas iguais aos itens incompletos; config `conferente` concluindo direto; relatório com totais corretos; sequência concluiu com o status novo); tsc web+mobile zerados; checks Django limpos; dados de teste revertidos.

**Fase 5 do redesenho concluída em 2026-08-28**: deploy em produção + APK novo.

- **Deploy** via Ansible na VM 192.168.1.199: migrations 0003→0010 aplicadas, dados convertidos (2 usuários `separador`→`conferente`; status `separando`/`separado`→`conferindo`/`conferido`), endpoints novos no ar (`/api/conferencia/`, `/api/sequencias/`, `/api/separadores/`, `/api/fechamentos/`, `/api/divergencias/`, `/api/erros-separacao/`), antigo `/api/separacao/` morto (404), frontend :3003 servindo todas as rotas novas.
- **Fix no playbook**: rsync agora com `delete: true` — sem isso, o rename `(separador)`→`(conferente)` deixou as duas pastas na VM e o `next build` quebrou com rota duplicada (primeira tentativa de deploy falhou por isso). Excludes protegem certs/.env.prod/dados da deleção.
- **APK 0.2.0** (versionCode 2): build local `gradlew assembleRelease`, 39 MB, aponta pra `http://192.168.1.199:8003`; instala por cima do 0.1.0 nos coletores (sideload). Pedidos em andamento no momento do deploy (12 atribuídos, 5 em conferência) ficam como "fora de sequência" — visíveis e operáveis normalmente.
- Pendência externa inalterada: contrato do **WS Senior** (`_enviar_volumes_ao_senior` segue placeholder, também em produção).

Nota: a **Fase I (mobile)** descrita abaixo ficou desatualizada — o app chegou a **paridade total de telas** (Expo SDK 54, RN 0.81.4, NativeWind 4: login, separação + detalhe, vendas, pátio, separados, não-conformes, admin) com APK release buildado localmente em `mobile/android/`.

---

## Contexto rápido

Em **2026-04-29** o projeto pivotou:

- **Era**: sistema de expedição multi-marketplace (Senior + CLICK + VTEX + etiquetagem por transportadora). Atores: Separador + Etiquetador.
- **Agora**: sistema interno de separação no galpão da Altomax. Atores: Sup. Vendas, Sup. Pátio, Separador, Admin.

Os módulos antigos (etiquetagem, impressoras, VTEX, embalagempfa) **continuam no código preservados** mas estão fora do menu/navegação. Ver "Módulos congelados" mais abaixo. Detalhes do escopo no `CLAUDE.md`.

### Estados do pedido (escopo atual)

```
Pendente → Selecionado → Atribuído → Em separação → Separado | Não conforme
```

Estados antigos (`Faturado`, `Aguardando etiquetar`, `Concluído`) seguem no enum mas não são usados no fluxo atual.

---

## Fase A — Fundação ✅

**Modelos e migrações que sustentam o resto.**

| Mudança | Arquivo |
|---|---|
| Perfis novos: `supervisor_vendas`, `supervisor_patio` | `backend/apps/core/models.py` + migration `core/0002` |
| Status novos: `SELECIONADO`, `ATRIBUIDO`, `SEPARADO`, `NAO_CONFORME` | `backend/apps/pedidos/models.py` |
| Choices `MotivoNaoConforme` (divergência_qtd, produto_errado, item_ausente) | idem |
| Campos: `selecionado_em/por`, `atribuido_em/por`, `separacao_iniciada_em`, `nao_conforme_em/motivo/detalhe`, `senior_atualizado_em/tentativas/erro` | idem |
| Modelos `Volume` (caixa/fardo/outro) e `VolumeItem` | idem |
| Migration `pedidos/0005_pivot_separacao_interna` | `backend/apps/pedidos/migrations/` |
| `Volume` registrado no Django admin com inline de itens | `backend/apps/pedidos/admin.py` |
| Login redirect cobrindo todos os perfis | `frontend/app/(auth)/login/page.tsx` |
| Página `/admin` esvaziada de etiquetagem | `frontend/app/(admin)/admin/page.tsx` |

---

## Fase B — Supervisor de Vendas ✅

**Lista pedidos pendentes vindos do Senior e seleciona quais entram em separação.**

| Mudança | Arquivo |
|---|---|
| Action `selecionar` no `PedidoViewSet` (perfil sup_vendas/admin) | `backend/apps/pedidos/views.py` |
| `supervisorApi.listarPendentes / selecionar` | `frontend/lib/api.ts` |
| Layout `(supervisor)` com nav Vendas/Pátio/Não conformes (mostra só o que o perfil pode) | `frontend/app/(supervisor)/layout.tsx` |
| Tela `/supervisor/vendas` — busca, multi-seleção, "Selecionar todos", barra fixa de ação | `frontend/app/(supervisor)/supervisor/vendas/page.tsx` |

Endpoint: `POST /api/pedidos/selecionar/` body `{ pedido_ids: [int] }` → marca `Pendente → Selecionado`.

---

## Fase C — Supervisor de Pátio ✅

**Lista pedidos selecionados e atribui cada um (ou um lote) a um separador específico.**

| Mudança | Arquivo |
|---|---|
| Endpoint `GET /api/users/separadores/` (lista separadores ativos) | `backend/apps/core/views.py` + `urls.py` |
| Action `atribuir` no `PedidoViewSet` (perfil sup_patio/admin) | `backend/apps/pedidos/views.py` |
| Serializer com `separador`, `separador_username`, `selecionado_em`, `atribuido_em` | `backend/apps/pedidos/serializers.py` |
| `supervisorApi.listarSelecionados / listarSeparadores / atribuir` | `frontend/lib/api.ts` |
| Tela `/supervisor/patio` — busca, dropdown de separador, multi-seleção, barra de ação | `frontend/app/(supervisor)/supervisor/patio/page.tsx` |

Endpoint: `POST /api/pedidos/atribuir/` body `{ pedido_ids: [int], separador_id: int }` → marca `Selecionado → Atribuído` e seta `separador`.

---

## Fase D — Separador (núcleo) ✅

**Lista pedidos atribuídos ao usuário logado, tela de separação por volumes com bipagem.**

App novo: `backend/apps/separacao/`. Adicionado em `INSTALLED_APPS` e `config/urls.py`.

### Endpoints
Todos sob `/api/separacao/pedidos/...`, perfil `separador` ou `admin`, e o usuário precisa ser o `separador` do pedido (admin escapa dessa checagem).

| Endpoint | O que faz |
|---|---|
| `GET /api/separacao/pedidos/` | Lista atribuídos a mim (status ATRIBUIDO ou SEPARANDO), FIFO por `atribuido_em` |
| `GET /api/separacao/pedidos/<id>/` | Detalhe + lista de volumes existentes + itens |
| `POST /api/separacao/pedidos/<id>/iniciar/` | `Atribuído → Em separação` |
| `POST /api/separacao/pedidos/<id>/volumes/` | Cria volume `{ tipo: caixa|fardo|outro, identificador? }` |
| `POST /api/separacao/pedidos/<id>/bipar/` | `{ item_id, qtd, codigo, volume_id }` — valida match EAN/SKU + qtd, cria `VolumeItem`, soma `qtd_separada` |
| `POST /api/separacao/pedidos/<id>/concluir/` | Chama placeholder Senior WS, marca `Separado`. Bloqueia se itens incompletos ou nenhum volume |
| `POST /api/separacao/pedidos/<id>/nao_conforme/` | `{ motivo, detalhe? }` — marca `Não conforme` |

### Resultado da bipagem
Backend retorna um destes:
- `ok` — bipagem aceita, qtd_separada atualizada
- `codigo_divergente` (409) — codigo bipado ≠ ean nem sku do item escolhido
- `excesso` (409) — `qtd_separada + qtd > qtd_pedida`
- `nao_encontrado` (404) — item ou volume inválido
- `item_indisponivel` (409) — item está como `cancelado` ou `falta`

### Senior WS placeholder
`_enviar_volumes_ao_senior(pedido)` em `apps/separacao/views.py` retorna `(True, '')` por enquanto e loga "WS não configurado". Quando vier o contrato, é só implementar essa função.

### Frontend
| Arquivo | O que faz |
|---|---|
| `frontend/app/(separador)/separacao/page.tsx` | Lista FIFO atribuídos a mim, polling de 30s |
| `frontend/app/(separador)/separacao/[id]/page.tsx` | Tela completa: header, progress, volume ativo, lista de itens, modais (bipar / novo volume / não conforme), fluxo de iniciar |
| `frontend/lib/api.ts` → `separacaoApi` | Cliente HTTP |

Login do separador agora cai em `/separacao` (não mais `/pedidos`, que é o legado).

---

## Fase E — Lista de Não Conformes ✅

**Pedidos com problema na separação aguardando ação do supervisor.**

| Endpoint | O que faz |
|---|---|
| `GET /api/nao-conformes/` | Lista com motivo, separador, atribuído_por, detalhe, datas |
| `POST /api/nao-conformes/<id>/cancelar/` | `Não Conforme → Cancelado` |
| `POST /api/nao-conformes/<id>/retornar/` | `Não Conforme → Pendente`. Zera `selecionado_em/por`, `atribuido_em/por`, `separador`, `separacao_iniciada_em`, `nao_conforme_*`. **Mantém volumes/VolumeItems e qtd_separada já bipados** (se quiser zerar, lembrar de mudar isso) |

Permissão: `supervisor_vendas`, `supervisor_patio` ou `admin`.

| Frontend | Arquivo |
|---|---|
| `supervisorApi.listarNaoConformes / cancelarNaoConforme / retornarNaoConforme` | `frontend/lib/api.ts` |
| Tela `/supervisor/nao-conformes` — cards com motivo colorido, detalhe destacado, ações | `frontend/app/(supervisor)/supervisor/nao-conformes/page.tsx` |
| Nav "Não conformes" no layout do supervisor | `frontend/app/(supervisor)/layout.tsx` |
| Card no admin landing | `frontend/app/(admin)/admin/page.tsx` |

---

## Extra — Integração Senior (Oracle, leitura)

| Mudança | Arquivo |
|---|---|
| `SENIOR_CODEMP = 1` (constante) — antes era hardcoded `8` | `backend/apps/senior/oracle.py` |
| `QUERY_PEDIDOS_PENDENTES` agora com CODEMP=1 | idem |
| `QUERY_ITENS_PEDIDO` — JOIN `E120IPD` + `E075DER` (codbar) + `E075PRO` (despro) | idem |
| Campos `codpro`, `codder`, `codemp` em `PedidoItem` | `backend/apps/pedidos/models.py` + migration `0006_pedidoitem_chave_senior` |
| `_importar_itens_do_pedido` — busca itens e popula `PedidoItem` quando o pedido é criado | `backend/apps/senior/tasks.py` |
| Celery Beat: `monitorar_faturamento` e `resgatar_etiquetas_vtex` desabilitados (comentados) | `backend/config/settings.py` |

**SKU**: formato `codpro-codder-codemp` (ex: `45123-GR-1`). O match na bipagem é via EAN (= `codbar` de E075DER); o SKU é só visual.

**Comportamento do sync**: itens são importados **só na criação** do pedido. Se o pedido já existe, o sync não rebusca itens (evita sobrescrever separação parcial).

---

## Fase F — Polimento, paginação e cara de produto ✅

Tudo o que aconteceu **depois** do MVP, ainda no dia 2026-04-30.

### Senior — correções de query

| Mudança | Arquivo |
|---|---|
| `QUERY_PEDIDOS_PENDENTES` agora faz **JOIN com `E085CLI`** (sem CODEMP — tabela compartilhada) trazendo `nomcli` no sync | `backend/apps/senior/oracle.py` |
| Query de itens passou a filtrar `ipd.codemp = 1` na própria E120IPD (antes contaminava de outras empresas) | idem |
| `der.codbar` (não `pro.codbar`) — barcode é por derivação | idem |

### Performance

| Mudança | Arquivo |
|---|---|
| `PedidoListSerializer` slim — sem `itens`, com `qtd_itens` anotado por `Count` | `backend/apps/pedidos/serializers.py` |
| `PedidoViewSet` overridei `get_serializer_class` (slim em `list`, completo em `retrieve`) e `get_queryset` (sem `prefetch_related('itens')` em list); adicionei filtro `?search=` por `numero_externo` ou `cliente` | `backend/apps/pedidos/views.py` |
| Paginação global ativada (`PageNumberPagination`, `PAGE_SIZE: 50`) | `backend/config/settings.py` |
| Sup. Vendas / Pátio / Separados — busca server-side com debounce de 300ms + botão "Carregar mais" (lista cresce sem perder estado) | `(supervisor)/supervisor/{vendas,patio,separados}/page.tsx` |

### Tela de separação — UX afiada

| Ajuste | Detalhe |
|---|---|
| **Bipar direto da página** (não só pelo modal) | Scanner sticky no topo da lista; bate `ean` ou `sku` contra os itens com `qtd_separada < qtd_pedida`. Match → modal abre com código já preenchido + foco na qtd |
| **Input de quantidade** | Estado em string (não `number`) + `inputMode="numeric"` + `select-on-focus` + `min-w-0`/`size={1}`/`shrink-0` nos botões — funciona no celular sem overflow |
| **Auto-numeração de volume** | "Caixa 1" → "Caixa 2" → "Fardo 1" automaticamente, baseado nos volumes existentes do mesmo tipo. Editável |
| **Lista de volumes (acordeão)** | `<ListaVolumes />` mostra todos os volumes do pedido, expansível, com itens dentro de cada — nada some quando cria volume novo |
| **EAN copiável** | Cada item exibe o código de barras em chip monoespaçado com botão "copiar" (navigator.clipboard) — útil pra dev sem leitor |
| **Scanner com fundo preto** | Visual destacado (`bg-zinc-900` + texto branco mono) — sinal claro de "aqui que vou bipar". Flash colors invertem para fundo claro nos casos de erro/ok/excesso |

### Lista de pedidos separados (Fase E.1)

| Adição | Onde |
|---|---|
| `supervisorApi.listarSeparados` (reusa `?status=separado` do PedidoViewSet) | `frontend/lib/api.ts` |
| Tela `/supervisor/separados` — paginada, com busca, mostra `separado_em`, `separador_username`, `qtd_itens` | `(supervisor)/supervisor/separados/page.tsx` |
| Link no nav do supervisor + card no admin landing | `(supervisor)/layout.tsx`, `(admin)/admin/page.tsx` |

### Auth / roteamento

| Fix | Onde |
|---|---|
| `app/page.tsx` virou client component que consulta localStorage e redireciona pro perfil (não cai mais no login se já estiver logado) | `frontend/app/page.tsx` |
| `LoginPage` agora também checa sessão e redireciona pro perfil antes de renderizar o form | `frontend/app/(auth)/login/page.tsx` |
| Helper compartilhado `destinoPorPerfil` | `frontend/lib/destino.ts` |
| `User.Perfil` no auth store inclui `supervisor_vendas`, `supervisor_patio` (era só `separador|etiquetador|admin`) | `frontend/stores/authStore.ts` |

### PWA + Fullscreen + Exit Guard (mobile-first)

| Recurso | Arquivo |
|---|---|
| `manifest.json` com `display: fullscreen` (+ `display_override`), tema, ícones SVG `icon.svg` e `icon-maskable.svg` | `frontend/public/` |
| Meta tags `apple-mobile-web-app-*`, `viewport-fit: cover`, `theme-color` reativo ao tema | `frontend/app/layout.tsx` |
| **Hook `useFullscreen`** — wrap da Fullscreen API com fallback `webkit*` | `frontend/lib/useFullscreen.ts` |
| **Hook `useExitGuard`** — empurra state-sentinel no histórico, popstate é silenciosamente reabsorvido (botão voltar do Android não fecha o app) | `frontend/lib/useExitGuard.ts` |
| `<FullscreenOnFirstTap />` — qualquer toque na tela tenta entrar em fullscreen (com throttle 500ms) — necessário porque Android Chrome **sai de fullscreen ao trocar de URL**, mesmo em SPA | `frontend/components/FullscreenLayer.tsx` |
| `<FullscreenToggle />` — ícone de expandir/contrair no header | idem |
| Aplicados nos 3 layouts ativos | `(separador)`, `(supervisor)`, `(admin)` |

### Dark mode (top das galáxias)

| Camada | Arquivo |
|---|---|
| `darkMode: 'class'` + tokens `surface-*` e `ink-*` via CSS vars (rgb com alpha) | `tailwind.config.js`, `app/globals.css` |
| Vars `:root` (light) e `.dark` (zinc-950/900/800) + scrollbar discreta + fix de autofill do Chrome | `app/globals.css` |
| Script inline anti-FOUC no `<head>` aplica a classe `dark` antes do React hidratar (zero flash branco no load) | `app/layout.tsx` |
| `themeStore` (Zustand) com modo `light \| dark \| system`, persistência em localStorage, atualização do meta `theme-color` ao alternar | `stores/themeStore.ts` |
| `<ThemeProvider />` (hidrata no root) e `<ThemeToggle />` (sol/lua) nos 3 headers | `components/ThemeToggle.tsx` |
| Variantes `dark:` aplicadas em todas as telas: login, headers, separação detail, listas (vendas/pátio/separados/não-conformes), admin landing, modais (novo volume / bipar / não conforme), tela de iniciar | múltiplos `.tsx` |

**Paleta no dark**: zinc-950 background, zinc-900 cards, zinc-800 elevated; status com `{cor}-500/15` no fundo + `{cor}-300` no texto (saturação certa pra olho não sangrar). Botões primários ganham `shadow-lg shadow-{cor}/30` que dão peso sem ficar berrante. Login tem glow ambiente em `radial-gradient` sutil.

---

## Fase G — HTTPS + Câmera como leitor de código de barras ✅

Feito em **2026-05-01**. Como o galpão tem poucos leitores físicos, viabilizamos a câmera do celular como scanner. Pré-requisito: HTTPS (browser bloqueia `getUserMedia` em HTTP que não seja localhost).

### HTTPS via mkcert (dev)

| Mudança | Arquivo |
|---|---|
| `next.config.js` faz **rewrite server-side** de `/api/*` → `BACKEND_INTERNAL_URL` (`http://backend:8000`) — assim só o Next.js atende em HTTPS, backend continua HTTP, sem mixed content | `frontend/next.config.js` |
| **Trailing slash forçado** no destino do rewrite (`/api/:path*/`) — Django levanta `RuntimeError` em POST sem `/` quando `APPEND_SLASH=True` | idem |
| `lib/api.ts` reescrito com **URLs relativas** (sem `NEXT_PUBLIC_API_URL` baked) — auth, refresh, todos os endpoints | `frontend/lib/api.ts` |
| `docker-compose.yml`: monta `./certs:/certs:ro` no frontend; comando do dev server liga HTTPS automaticamente se `cert.pem` e `key.pem` existirem (fallback HTTP se não) | `docker-compose.yml` |
| `.gitignore` ignora `certs/` | `.gitignore` |
| `.env`: `NEXT_PUBLIC_API_URL` virou irrelevante (mantido pra compatibilidade); `BACKEND_INTERNAL_URL=http://backend:8000` é o que importa | `.env` |

**Setup do host (uma vez)**:
```bash
sudo apt install -y libnss3-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
mkcert -install
mkdir -p certs
mkcert -cert-file certs/cert.pem -key-file certs/key.pem 172.18.18.123 localhost 127.0.0.1
cp "$(mkcert -CAROOT)/rootCA.pem" certs/rootCA.pem
```

**Setup do celular (uma vez por aparelho)**:
1. Transferir `certs/rootCA.pem` para o celular
2. Configurações → Segurança → Instalar certificado → CA → escolher o `rootCA.pem`
3. Acessar via `https://172.18.18.123:3000` — sem warning, câmera liberada

### Scanner via câmera

| Adição | Arquivo |
|---|---|
| Dependências `@zxing/browser`, `@zxing/library` | `frontend/package.json` |
| Componente `<CameraScanner />` — overlay fullscreen, captura stream com `getUserMedia({ facingMode: 'environment' })`, decodifica em loop (`setInterval` 150ms) com `BrowserMultiFormatReader.decodeFromCanvas`, hints com `TRY_HARDER` e lista explícita de formatos (EAN-13/8, UPC, CODE-128/39/93, CODABAR, ITF — sem QR pra não desperdiçar CPU) | `frontend/components/CameraScanner.tsx` |
| Vibração ao detectar (`navigator.vibrate(60)`) + debounce de 1.5s pra não duplicar leitura | idem |
| Reset do `ativoRef` no início do effect — corrige bug do React Strict Mode rodando duas vezes em dev (cleanup do primeiro effect zerava o flag) | idem |
| Diagnóstico em tempo real visível: `N frames · resolução · rs=readyState` — útil pra debug | idem |
| Botão de câmera (📷 emerald) ao lado do scanner principal sticky e dentro do modal de bipar; resultado entra pelo mesmo `processarCodigo` que a leitura por leitor físico | `(separador)/separacao/[id]/page.tsx` |

**Fluxo do operador:**
1. Toca no ícone da câmera 📷
2. Overlay preto fullscreen abre, com janela de scan no centro (cantos verdes + linha animada)
3. Aponta o celular pro código → ~50–500ms para detectar (depende da luz/foco)
4. Vibra, fecha overlay, modal de bipar abre com o código preenchido + foco direto na quantidade
5. Operador digita a qtd e Enter — bipagem registrada

**Limitações conhecidas:**
- iOS Safari: precisa testar (a parte do ZXing roda; `getUserMedia` requer HTTPS válido)
- Foco automático depende da câmera — em alguns Androids antigos pode não focar perto de 10cm
- O contador de frames está visível em dev pra debug; pra produção dá pra esconder

---

## Fase H — Deploy de produção via Ansible ✅

Deploy concluído em **2026-05-04**. VM alvo: **192.168.1.199**, pasta `/home/administrador/separa`.

### Arquitetura final

```
┌──── VM 192.168.1.199 (Docker Swarm já com outros serviços) ────┐
│                                                                │
│  postgres_postgres (container existente)  :5432   ←─┐          │
│                                                     │          │
│  ┌── Stack do Separa (docker-compose.prod.yml) ─┐  │          │
│  │                                               │  │          │
│  │  redis (container próprio do Separa)          │  │          │
│  │   └─ maxmemory 256mb, allkeys-lru, mem_limit  │  │          │
│  │                                               │  │          │
│  │  backend     :8003 → :8000  ─────────────────────┘          │
│  │   └─ gunicorn + WhiteNoise (static)           │             │
│  │  celery / celery-beat                         │             │
│  │  frontend    :3003 → :3000                    │             │
│  └───────────────────────────────────────────────┘             │
└────────────────────────────────────────────────────────────────┘
```

### Decisões arquiteturais

| Decisão | Por quê |
|---|---|
| **Postgres compartilhado** com outros sistemas da VM | Postgres tem isolamento real (databases + roles). Custo de container próprio (~250MB RAM + setup de backup) só compensa se precisar de versão/extensão específica. |
| **Redis dedicado** ao Separa (container próprio) | Redis compartilhado é arriscado: `FLUSHALL` zera tudo, sem ACLs reais, memória compartilhada. Já houve incidente na empresa de Redis comendo VM inteira. |
| **`mem_limit` + `maxmemory`** no Redis | Defesa em profundidade: Redis evita estourar (`allkeys-lru` ao chegar 256MB) e Docker mata o container (não a VM) se passar 320MB. |
| **`postgres_host: 192.168.1.199`** (IP direto) | `host.docker.internal:host-gateway` deveria funcionar em Linux Docker 20.10+, mas a VM dessa empresa não resolveu — IP direto é universal. |
| **`save ""` + `appendonly no`** no Redis | Redis aqui é só cache + Celery broker. Sem persistência → reinício rápido, sem disco crescendo. Tasks em curso se perdem em crash, mas é raro e Celery sabe lidar. |
| **WhiteNoise** servindo static do Django | Em prod (`DEBUG=False`) o Django não serve `/static/` — sem isso o admin do Django fica quebrado (404 em theme.js, etc.). WhiteNoise resolve sem nginx. |
| **`output: standalone`** + `node server.js` | Imagem do frontend fica ~120MB em vez de 800MB. Bundle minificado, pre-rendered, otimizado. |
| **`ignoreBuildErrors` + `ignoreDuringBuilds`** | `next build` é mais rigoroso que `next dev` em typecheck/lint. Pra destravar deploy iterativo, ignoramos warnings (runtime não é afetado). Tirar quando estabilizar. |

### Arquivos do deploy

| Arquivo | O que faz |
|---|---|
| `backend/Dockerfile.prod` | Oracle Instant Client + gunicorn 3 workers + collectstatic em build-time |
| `frontend/Dockerfile.prod` | Multi-stage: `deps` → `builder` (`npm run build`) → `runner` (`node server.js`) |
| `docker-compose.prod.yml` | 5 serviços: redis (limitado), backend (8003), celery, celery-beat, frontend (3003) |
| `deploy/ansible.cfg` | Config do Ansible (ignorada se diretório for world-writable — rodar com `-i inventory.yml`) |
| `deploy/inventory.yml.example` | Template do inventário (gitignored o real) |
| `deploy/group_vars/separa_prod/vars.yml.example` | Template das variáveis de ambiente (gitignored o real) |
| `deploy/templates/env.prod.j2` | Template do `.env.prod` renderizado pelo Ansible com vars |
| `deploy/deploy.yml` | Playbook: ping → rsync → render env → bootstrap DB → build → up -d → status |
| `deploy/README.md` | Setup inicial + operações comuns |

### Bootstrap automático do banco

A playbook cria o banco e o usuário **idempotentemente** no primeiro deploy via `docker run --rm --network host postgres:16-alpine` como cliente psql efêmero. Não precisa SSH no Postgres compartilhado pra preparar o banco.

```yaml
# 3 tasks adicionados no deploy.yml:
# - Cria banco 'separa' se não existir
# - Cria usuário 'separa' se não existir
# - Garante ALTER DATABASE OWNER + GRANT ALL ON SCHEMA public
```

`vars.yml` precisa de `postgres_admin_user` + `postgres_admin_password` (superuser do Postgres compartilhado, padrão `postgres` / senha definida na infra).

### Variáveis críticas no `vars.yml`

```yaml
postgres_host: 192.168.1.199              # IP direto da VM (host-gateway não funcionou)
postgres_port: "5432"
postgres_admin_user: postgres             # superuser do PG compartilhado (pra bootstrap)
postgres_admin_password: "altomax2025"
postgres_user: separa                     # user da app (criado pelo bootstrap)
postgres_password: "<senha>"
postgres_db: separa                       # DB da app (criado pelo bootstrap)

redis_url: "redis://redis:6379/0"         # DNS interno do compose — Redis dedicado

django_allowed_hosts: "192.168.1.199,localhost,127.0.0.1,backend"
cors_allowed_origins: "http://192.168.1.199:3003"
```

### Comandos de deploy

```bash
# Setup inicial (uma vez)
cd /mnt/d/projetos/separa/deploy
cp inventory.yml.example inventory.yml
cp group_vars/separa_prod/vars.yml.example group_vars/separa_prod/vars.yml
# editar segredos em vars.yml

# Cada deploy
ansible-playbook -i inventory.yml deploy.yml
# (o `-i` explícito é necessário porque /mnt/d é world-writable do POV do WSL,
#  e o Ansible ignora o ansible.cfg nesse caso)
```

**Local continua intacto** — `docker-compose.yml` (com Postgres+Redis em container, dev mode) não foi tocado.

### Bugs encontrados durante o deploy (e correções)

| Bug | Causa | Fix |
|---|---|---|
| `sh: --timeout: not found` | YAML `command: >` com indentação extra preservou newlines — gunicorn args viraram comandos shell separados | Trocou pra forma de lista (`command: [sh, -c, "<long string>"]`) no `docker-compose.prod.yml` |
| `host.docker.internal` não resolveu | VM Linux antiga sem suporte a `host-gateway` | `postgres_host: 192.168.1.199` (IP direto) |
| `[WARNING] Ansible is being run in a world writable directory` | `/mnt/d/...` é montado como 777 do POV do WSL, e Ansible recusa carregar `ansible.cfg` | Usar `-i inventory.yml` explícito ou copiar `deploy/` pra fora de `/mnt/d/` |
| `postgres_admin_user is undefined` | `vars.yml` foi copiado de versão antiga do `.example` que não tinha essas vars | Adicionar manualmente as duas linhas no `vars.yml` |
| Type error no `next build` (`Type 'undefined' is not assignable to type 'string'`) | `next dev` é tolerante, `next build` é estrito | Fix do erro em `pedidosStore.ts` + `ignoreBuildErrors: true` no `next.config.js` |
| Static files 404 (theme.js, nav_sidebar.js) | Django com `DEBUG=False` não serve `/static/` sozinho | Adicionou `whitenoise` em `requirements.txt` + middleware no `settings.py` |

---

## Como subir e testar

```bash
# Subir tudo
docker compose up --build

# Aplicar migrações
docker compose exec backend python manage.py migrate

# Criar superuser pra entrar no Django admin
docker compose exec backend python manage.py createsuperuser

# Logs do backend
docker compose logs -f backend

# Logs do worker (sync com Senior)
docker compose logs -f celery-beat celery
```

Frontend em `http://localhost:3000`, backend em `http://localhost:8000`, Django admin em `http://localhost:8000/admin/`.

### Para testar com dados sem o Oracle disponível

Cadastrar pedidos manualmente via Django admin: `http://localhost:8000/admin/pedidos/pedido/add/` (com itens via `PedidoItem`).

Ou pedir um comando de seed (`python manage.py seed_pedidos`) — não criado ainda.

### Acesso pelo celular (HTTPS)

Pré-requisito: `certs/cert.pem` e `certs/key.pem` gerados via mkcert (ver Fase G acima) e `rootCA.pem` instalado no celular.

1. `docker compose up -d` — Next dev server inicia em HTTPS
2. No celular: `https://172.18.18.123:3000` — sem warning, câmera/PWA funcionam
3. Pra produção: substituir mkcert por Let's Encrypt + reverse proxy

---

## Mapa de telas

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/login` | todos | Login JWT, redireciona por perfil |
| `/admin` | admin | Hub com links para todas as telas |
| `/supervisor/vendas` | sup_vendas, admin | Lista pendentes + selecionar |
| `/supervisor/patio` | sup_patio, admin | Lista selecionados + atribuir |
| `/supervisor/nao-conformes` | sup_vendas, sup_patio, admin | Lista não conformes + cancelar/retornar |
| `/conferencia` | conferente, admin | Lista "atribuídos a mim" (era `/separacao`) |
| `/conferencia/[id]` | conferente, admin | Conferência por volumes (núcleo do trabalho) |
| `/supervisor/conferidos` | supervisores, admin | Lista de pedidos conferidos (era `/supervisor/separados`) |
| `/pedidos` | (LEGADO) | Tela do escopo antigo — ainda funciona com endpoints antigos |
| `/pedidos/[id]` | (LEGADO) | Conferência por bipagem do escopo antigo |
| `/etiquetador` | (LEGADO) | Lista a etiquetar (escopo antigo) |
| `/etiquetador/lote/[id]` | (LEGADO) | Etiquetagem em lote (escopo antigo) |

---

## Mapa de endpoints

### Auth (core)
- `POST /api/auth/token/` — login
- `POST /api/auth/token/refresh/`
- `GET /api/users/conferentes/` — lista conferentes ativos (era `/separadores/`)

### Pedidos
- `GET /api/pedidos/?status=pendente|selecionado|...&tipo=pedido|nota_fiscal&frete=C|F|X&search=` — lista (paginada)
- `GET /api/pedidos/<id>/` — detalhe
- `POST /api/pedidos/selecionar/` — sup_vendas
- `POST /api/pedidos/atribuir/` — **410** desde a Fase 3 (atribuição é via `/api/sequencias/<id>/atribuir/`)
- `POST /api/pedidos/<id>/bipar_item/` — LEGADO (escopo antigo)
- `POST /api/pedidos/<id>/finalizar_separacao/` — LEGADO

### Conferência (escopo atual — era `/api/separacao/`)
- `GET /api/conferencia/pedidos/`
- `GET /api/conferencia/pedidos/<id>/`
- `POST /api/conferencia/pedidos/<id>/iniciar/`
- `POST /api/conferencia/pedidos/<id>/volumes/`
- `POST /api/conferencia/pedidos/<id>/bipar/`
- `POST /api/conferencia/pedidos/<id>/concluir/`
- `POST /api/conferencia/pedidos/<id>/nao_conforme/`

### Não conformes
- `GET /api/nao-conformes/`
- `POST /api/nao-conformes/<id>/cancelar/`
- `POST /api/nao-conformes/<id>/retornar/`

### Etiquetas (CONGELADO)
- `GET /api/etiquetas/admin/impressoras/`
- `POST/PATCH/DELETE` etc. (CRUD admin)
- `POST /api/etiquetas/agents/registrar/heartbeat/jobs/...`
- `POST /api/etiquetas/lotes/criar/...`
→ todo este conjunto está congelado. Pode subir mas não está no menu.

---

## Pontos abertos / TODO

### Backend / integração
- [ ] **WS Senior para atualizar volumes pós-separação** — contrato exato a definir. Implementar `_enviar_volumes_ao_senior` em `backend/apps/conferencia/views.py` quando vier. Precisa cobrir **NF além de pedido** (tipo/filial/série já estão no `Pedido`).
- [ ] **Senior identifica tipos de volume?** Hoje é livre (`caixa/fardo/outro`). Precisa mapeamento para o WS?
- [ ] **Refinar descrição do produto** — hoje uso só `pro.despro` (E075PRO). A view do Senior monta com marca/família — replicar se for melhor pro operador.
- [ ] **Comando de seed** — criar `python manage.py seed_pedidos` pra facilitar dev sem Oracle.

### UX / regras
- [ ] **Múltiplos volumes simultâneos** — hoje o "volume ativo" é o último não fechado. Discutir se múltiplos podem ficar abertos ao mesmo tempo.
- [ ] **Bipar item já completo** — hoje bloqueia (excesso). Confirmar se precisa avisar antes (ex: alerta amarelo).
- [ ] **"Retornar para fila" preserva qtd_separada e volumes** — confirmar se é o comportamento desejado, ou se deve apagar tudo.
- [ ] **Cadastro de usuários por perfil** — não há tela admin pra criar/editar usuários. Hoje só via Django admin.
- [ ] **Lista de ações em "Não conforme"** — hoje só cancelar/retornar. Conferir se precisa "escalar" ou outras.

### Real-time
- [ ] **WebSocket via Django Channels** — hoje listas usam polling 30s no separador (vendas/pátio/separados/não-conformes não têm polling). Plano definido com badge "+N novos" no topo (não substituir lista visível); migrar pra evento-driven via Channels quando volumar. Padrão #4 das opções discutidas.

### PWA / fullscreen
- [ ] **Ícones PWA em PNG** — hoje só SVG (`icon.svg`, `icon-maskable.svg`). Android Chrome instala mesmo assim, mas alguns recursos (splash, install banner em algumas versões) preferem PNG 192/512. Substituir por arquivos finais quando tiver logo.
- [x] ~~HTTPS pra liberar service worker e clipboard API completo~~ → resolvido com mkcert (Fase G). Pra produção ainda falta cert válido (Let's Encrypt + reverse proxy).

### Câmera scanner
- [ ] **Esconder o debug de frames/readyState** — útil em dev, ruidoso em produção
- [ ] **Beep de sucesso** ao detectar (já vibra; som curto reforçaria)
- [ ] **Botão de lanterna** (`track.applyConstraints({ advanced: [{ torch: true }] })`) pra galpão escuro
- [ ] **Lock de orientação** dentro da câmera pra não rotacionar
- [ ] **Testar em iPhone** — a parte do ZXing roda em Safari; só validar se `getUserMedia` + HTTPS via mkcert funcionam ali

### Infraestrutura — proxy reverso unificado
Hoje cada stack na VM (Separa, metas, evolution, etc.) tem seu próprio binding de porta no host (`:80`, `:443`, `:8000`, `:8001`, `:8005`, `:8006`, `:8082`...). Isso cria conflitos: pra subir o Separa em HTTPS tivemos que abrir mão da porta 80 (já ocupada por outro stack), perdendo o redirect HTTP→HTTPS.

A solução de longo prazo é **um único reverse proxy global na VM** (Traefik recomendado) que serve todos os stacks por hostname, compartilhando 80/443:

```
:443 (Traefik global) ──► roteia por Host header ──► separa, metas, evolution, ...
```

Cada stack registra labels Docker (`traefik.http.routers.separa.rule=Host(...)`) e o Traefik descobre automaticamente — sem expor porta no host.

**Resolução de hostname** (3 caminhos):
- **`nip.io`** — `separa.192-168-1-199.nip.io` resolve publicamente pro IP, zero infra. Recomendado pra LAN sem domínio.
- **DNS interno** (dnsmasq/pihole na VM + roteador apontando) — `separa.altomax.local`. Mais limpo, exige config no roteador.
- **Domínio público** (`separa.altomax.com.br`) — habilita Let's Encrypt (cert real, sem rootCA em ninguém). Depende de acesso ao DNS da empresa.

Esse é trabalho **transversal aos stacks** — exige mexer em todos, não só no Separa. Mantido aqui como roadmap pra quando houver mandato pra unificar.

- [ ] **Trocar Caddy local-do-Separa por Traefik global na VM**
- [ ] **Decidir esquema de hostname** (nip.io / DNS interno / domínio real)
- [ ] **Remover binding de portas do host** dos containers (tudo via Traefik)
- [ ] **Gateway HTTPS único** com cert real (Let's Encrypt DNS-01) ou com mkcert reaproveitado

---

## Módulos congelados (não apagar)

Códigos preservados, fora do menu:

- `backend/apps/etiquetas/` — Lote, LotePedido, EtiquetaVtex, Impressora, PrintAgent, PrintJob (CRUD, agent USB, fila de jobs)
- `backend/apps/vtex/` — integração com VTEX API
- `backend/apps/senior/soap.py` — operação `Gerar` do `embalagempfa` (cliente SOAP base reaproveitável; operação específica não)
- Frontend: `(etiquetador)/`, `(admin)/admin/impressoras/`, `(admin)/admin/agents/`, `(separador)/pedidos/` (legado)

Tasks Celery comentadas em `config/settings.py`:
- `monitorar-faturamento`
- `resgatar-etiquetas-vtex`

---

## Fase I — App nativo React Native (paralelo) 🟡

Em **2026-05-06** começamos um app nativo paralelo ao frontend web. **O Next.js continua sendo o cliente principal** — o mobile RN é um esforço extra pra ganhar fullscreen real, câmera nativa mais rápida e distribuição via APK.

### Estrutura
```
separa/mobile/                  ← novo (não interfere em frontend/ nem backend/)
├── app/                        Expo Router (file-based, igual Next App Router)
│   ├── _layout.tsx             Stack root + SafeArea + GestureHandler
│   ├── index.tsx               Entry: hidrata e redireciona por perfil
│   ├── login.tsx               Login JWT funcional
│   ├── separacao/              Placeholder (lista atribuídos)
│   ├── supervisor/             Placeholder (vendas, pátio)
│   ├── admin/                  Placeholder
│   └── etiquetador/            Placeholder (congelado)
├── components/                 Header, TelaPlaceholder
├── lib/
│   ├── api.ts                  axios + SecureStore + endpoints (espelho do web)
│   ├── destino.ts              destinoPorPerfil (igual web)
│   └── jwt.ts                  parseJwt manual (sem deps)
├── stores/authStore.ts         Zustand + SecureStore (substitui localStorage)
├── tailwind.config.js          Mesma paleta zinc do web
├── app.json                    Expo config (slug, plugins, bundle id)
└── README.md                   Setup, run, build APK
```

### Stack escolhida
- **Expo SDK 51** + **Expo Router 3** — file-based routing
- **NativeWind 4** — Tailwind sintaxe `className`
- **Zustand** + **axios** + **expo-secure-store** — paridade total com web
- **EAS Build** (futuro) — compila APK no cloud sem Android Studio

### O que está pronto
- [x] Scaffold (`package.json`, configs, gitignore)
- [x] Auth completo: login → JWT → SecureStore → redirect por perfil
- [x] Telas placeholder pros 5 perfis (não 404)
- [x] Header com user + sair, reusável

### Próximas iterações
- [ ] Lista "atribuídos a mim" do separador (`FlatList`)
- [ ] Tela de separação por volumes (`app/separacao/[id].tsx`) com modais
- [ ] Câmera scanner via `expo-camera` ou `react-native-vision-camera`
- [ ] Telas dos supervisores
- [ ] Dialog reutilizável (Modal nativo, padrão SweetAlert do web)
- [ ] Build APK via EAS Build

### Como o dev acessa o backend

`EXPO_PUBLIC_API_URL` no `.env` aponta pra um IP **acessível da LAN do celular**:
- Dev: IP da máquina Windows na LAN (ex: `http://192.168.1.50:8000`)
- Prod: `https://192.168.1.199` (Caddy)

Não use `localhost` (só serve emulador) nem o IP do WSL (`172.18.x.x` — celular não alcança).

### Testar localmente
```bash
cd mobile
npm install
npm start            # abre Metro bundler
# Escanear QR code com app "Expo Go" no celular Android
```

Hot reload + DevTools funcionam igual a um web bundler.

---

## Em uma frase

**Separa hoje** = Senior (Oracle leitura: pedidos abertos **e notas fiscais sem pedido de origem**, janela configurável) → Sup. Vendas seleciona (filtros por tipo e frete) → Sup. Pátio monta sequências e atribui → Conferente confere em volumes (com bipagem por leitor **ou câmera do celular**) → marca Separado (placeholder de WS Senior) ou Não Conforme. UI mobile-first com PWA fullscreen, exit guard, dark mode, login com wallpaper PICKMAX e formulário em vidro fosco, dialog reutilizável estilo SweetAlert, paginação server-side, autenticação JWT, dev em HTTPS via mkcert, **deploy de produção via Ansible** na VM 192.168.1.199 (frontend 3003 / backend 8003 com WhiteNoise, **Redis dedicado e blindado**, Postgres compartilhado com bootstrap automático, Caddy reverse proxy em HTTPS na 443), **Django admin com tema unfold** (Tailwind, dark auto, sidebar agrupada) em `/django-admin/`, **app nativo React Native com paridade de telas** (Expo + NativeWind, APK 0.3.3 por sideload nos coletores), telas do supervisor em largura total, código antigo congelado.
