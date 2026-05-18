# Status de implementação — Sistema de separação interna

> Snapshot em **2026-05-01** (último update do dia). Objetivo: amanhã (e nas próximas semanas) você consegue retomar o trabalho sem precisar reler tudo.

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
| `/separacao` | separador, admin | Lista "atribuídos a mim" |
| `/separacao/[id]` | separador, admin | Separação por volumes (núcleo do trabalho) |
| `/pedidos` | (LEGADO) | Tela do escopo antigo — ainda funciona com endpoints antigos |
| `/pedidos/[id]` | (LEGADO) | Conferência por bipagem do escopo antigo |
| `/etiquetador` | (LEGADO) | Lista a etiquetar (escopo antigo) |
| `/etiquetador/lote/[id]` | (LEGADO) | Etiquetagem em lote (escopo antigo) |

---

## Mapa de endpoints

### Auth (core)
- `POST /api/auth/token/` — login
- `POST /api/auth/token/refresh/`
- `GET /api/users/separadores/` — lista separadores ativos

### Pedidos
- `GET /api/pedidos/?status=pendente|selecionado|...` — lista
- `GET /api/pedidos/<id>/` — detalhe
- `POST /api/pedidos/selecionar/` — sup_vendas
- `POST /api/pedidos/atribuir/` — sup_patio
- `POST /api/pedidos/<id>/bipar_item/` — LEGADO (escopo antigo)
- `POST /api/pedidos/<id>/finalizar_separacao/` — LEGADO

### Separação (escopo atual)
- `GET /api/separacao/pedidos/`
- `GET /api/separacao/pedidos/<id>/`
- `POST /api/separacao/pedidos/<id>/iniciar/`
- `POST /api/separacao/pedidos/<id>/volumes/`
- `POST /api/separacao/pedidos/<id>/bipar/`
- `POST /api/separacao/pedidos/<id>/concluir/`
- `POST /api/separacao/pedidos/<id>/nao_conforme/`

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
- [ ] **WS Senior para atualizar volumes pós-separação** — contrato exato a definir. Implementar `_enviar_volumes_ao_senior` em `backend/apps/separacao/views.py` quando vier.
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

**Separa hoje** = Senior (Oracle leitura) → Sup. Vendas seleciona → Sup. Pátio atribui → Separador separa em volumes (com bipagem por leitor **ou câmera do celular**) → marca Separado (placeholder de WS Senior) ou Não Conforme. UI mobile-first com PWA fullscreen, exit guard, dark mode, login com wallpaper PICKMAX e formulário em vidro fosco, dialog reutilizável estilo SweetAlert, paginação server-side, autenticação JWT, dev em HTTPS via mkcert, **deploy de produção via Ansible** na VM 192.168.1.199 (frontend 3003 / backend 8003 com WhiteNoise, **Redis dedicado e blindado**, Postgres compartilhado com bootstrap automático, Caddy reverse proxy em HTTPS na 443), **Django admin com tema unfold** (Tailwind, dark auto, sidebar agrupada) em `/django-admin/`, **app nativo React Native em paralelo** (Expo + NativeWind, login funcionando, próximas telas vão sendo replicadas do web), código antigo congelado.
