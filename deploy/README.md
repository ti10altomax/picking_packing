# Deploy — Separa em produção

Deploy do **Separa** na VM `192.168.1.199` via Ansible.

## O que é provisionado

- `redis` (container dedicado, isolado dos outros sistemas) — interno, sem porta exposta
- `backend` (Django + gunicorn + WhiteNoise) — porta **8003** no host
- `celery` (worker) e `celery-beat` (scheduler)
- `frontend` (Next.js standalone) — porta **3003** no host
- **Postgres NÃO é containerizado aqui** — usa o que já existe na VM (porta 5432)

```
┌──────── VM 192.168.1.199 ────────────────────┐
│  postgres (compartilhado, container Swarm)    │
│   :5432 ←──┐                                  │
│            │                                  │
│  ┌─ stack do separa (compose) ──────────┐     │
│  │  redis (próprio, isolado)            │     │
│  │   maxmem 256mb · LRU · mem_limit 320 │     │
│  │  backend  :8003 → :8000  ────────────┼─────┘
│  │  celery / celery-beat                │
│  │  frontend :3003 → :3000              │ ← usuário acessa
│  └──────────────────────────────────────┘
└───────────────────────────────────────────────┘
```

## Decisões arquiteturais

### Postgres compartilhado (não containerizado)
A VM já tem Postgres em container Docker Swarm (`postgres_postgres`). Decidimos **reusar**:
- Postgres tem isolamento real (databases + roles), `FLUSHALL` não existe
- Custo de container próprio (~250MB RAM + setup de backup) só vale com versão/extensão específica
- O deploy cria automaticamente o database `separa` e o usuário `separa` (idempotente)

### Redis dedicado (containerizado, isolado)
Compartilhar Redis é **arriscado**:
- `FLUSHALL` zera tudo (já houve incidente da empresa onde Redis comeu memória da VM inteira)
- Sem ACLs reais (Redis 6+ tem, mas não é trivial)
- Memória compartilhada — bug em um app pressiona o outro

Por isso o Separa tem **Redis próprio** com defesa em profundidade contra crescimento descontrolado:

| Camada | Limite | O que acontece |
|---|---|---|
| Redis `maxmemory 256mb` | Soft | Ao chegar no teto, evicta chaves menos usadas (`allkeys-lru`) — nunca recusa write |
| Docker `mem_limit: 320m` | Hard | Se algo escapar do Redis, OOM mata só o container. VM segue viva. |
| `--save ""` + `--appendonly no` | Sem persistência | Reinício rápido, sem disco crescendo. Tasks Celery em curso podem se perder em crash, mas é raro |
| `restart: unless-stopped` | Auto-recuperação | Container morto reinicia sozinho |

**Pra calibrar (futuro):** se `redis-cli INFO memory | grep evicted_keys` mostrar muita evicção, aumentar `maxmemory` (e `mem_limit` proporcionalmente).

### Static files via WhiteNoise
Em produção (`DEBUG=False`), Django **não serve** `/static/` sozinho. Sem isso o admin do Django fica quebrado (theme.js, nav_sidebar.js dão 404). WhiteNoise serve junto do gunicorn, sem precisar de nginx separado.

### Frontend em modo standalone
`output: 'standalone'` + `next build` + `node server.js`. Imagem ~120MB em vez de ~800MB. Bundle minificado. Pra deploy iterativo, `ignoreBuildErrors` e `ignoreDuringBuilds` estão ativos no `next.config.js` — runtime não é afetado, são só warnings de typecheck/lint.

## Pré-requisitos

### Na sua máquina (de onde você roda Ansible)

```bash
sudo apt install ansible
ansible-galaxy collection install ansible.posix
```

### Na VM `192.168.1.199`

- Docker e docker-compose v2
- Postgres rodando em container Swarm na 5432 (já tem)
- Acesso SSH com o usuário `administrador` (chave pública preferencial)
- Pasta `/home/administrador/separa` já existe (você criou)

### Banco (criação automática)

O playbook cria o banco `separa` e o usuário `separa` **idempotentemente** na primeira execução, usando `docker run --rm --network host postgres:16-alpine` como cliente psql efêmero.

`vars.yml` precisa de:
- `postgres_admin_user` (geralmente `postgres`)
- `postgres_admin_password` — senha do superuser do Postgres da VM

## Setup inicial

```bash
cd deploy

# 1. Inventário
cp inventory.yml.example inventory.yml

# 2. Variáveis sensíveis
cp group_vars/separa_prod/vars.yml.example group_vars/separa_prod/vars.yml
# Edite com as credenciais reais (Postgres admin, Oracle, Senior, etc.)

# 3. Testa conexão SSH
ansible separa_prod -i inventory.yml -m ping

# 4. Roda o deploy
ansible-playbook -i inventory.yml deploy.yml
```

> **Por que `-i inventory.yml` explícito?** Quando o `deploy/` está em `/mnt/d/...` (montagem WSL do Windows), o Linux vê como world-writable e o Ansible **ignora** o `ansible.cfg` por segurança. O `-i` contorna o problema. Alternativamente, copie a pasta `deploy/` pro home do WSL (`~/separa-deploy/`) e rode de lá — aí o `ansible-playbook deploy.yml` direto funciona.

## Re-deploy (após mudar código)

```bash
ansible-playbook -i inventory.yml deploy.yml
```

A playbook é idempotente:
1. Sincroniza código (rsync, ignorando `.git`, `node_modules`, `.next`, `certs`, `.env*`, etc.)
2. Renderiza `.env.prod` na VM a partir do template + `vars.yml`
3. Cria DB/user no Postgres compartilhado se ainda não existirem
4. `docker compose build` (re-build se algo mudou)
5. `docker compose up -d --remove-orphans`

## Operações comuns na VM

```bash
ssh administrador@192.168.1.199
cd /home/administrador/separa

# Ver containers do Separa
docker compose -f docker-compose.prod.yml ps

# Logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f redis

# Reiniciar um serviço
docker compose -f docker-compose.prod.yml restart backend

# Shell Django
docker compose -f docker-compose.prod.yml exec backend python manage.py shell

# Criar superuser
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser

# Saúde do Redis (memória, eviction)
docker compose -f docker-compose.prod.yml exec redis redis-cli INFO memory
docker compose -f docker-compose.prod.yml exec redis redis-cli INFO stats | grep evicted_keys
```

## URLs após deploy

- Frontend: `http://192.168.1.199:3003`
- Backend (API + Django admin): `http://192.168.1.199:8003`
- Django admin: `http://192.168.1.199:8003/admin/`

## Variáveis críticas no `vars.yml`

```yaml
deploy_path: /home/administrador/separa

postgres_host: 192.168.1.199              # IP direto — host.docker.internal não rolou nessa VM
postgres_port: "5432"
postgres_admin_user: postgres
postgres_admin_password: "<senha-do-superuser-do-postgres-da-VM>"
postgres_user: separa                     # criado pelo bootstrap
postgres_password: "<senha-da-app>"
postgres_db: separa                       # criado pelo bootstrap

redis_url: "redis://redis:6379/0"         # DNS interno do compose

django_allowed_hosts: "192.168.1.199,localhost,127.0.0.1,backend"
cors_allowed_origins: "http://192.168.1.199:3003"
```

## Bugs encontrados durante o setup (e fixes)

| Sintoma | Causa | Solução |
|---|---|---|
| `[WARNING] Ansible is being run in a world writable directory` + `no hosts matched` | `/mnt/d/...` (WSL → Windows) é world-writable; Ansible ignora `ansible.cfg` | Rodar com `-i inventory.yml` explícito ou copiar pasta pra `~/separa-deploy/` |
| `'postgres_admin_user' is undefined` | `vars.yml` antigo sem essas vars | Adicionar manualmente no `vars.yml` |
| `sh: --timeout: not found` | YAML `command: >` com indentação extra preservou newlines no shell command | Trocou pra forma de lista (`command: [sh, -c, "<long string>"]`) |
| `could not translate host name "postgres"` | Backend tentando alcançar Docker DNS de outro stack | `postgres_host: 192.168.1.199` |
| `host.docker.internal` não resolve | Docker da VM sem suporte a `host-gateway` | IP direto na LAN |
| `next build` falha por type error | `next dev` é tolerante, `next build` é estrito | Fix do erro real + `ignoreBuildErrors: true` no `next.config.js` |
| Static files 404 (theme.js, nav_sidebar.js) | `DEBUG=False` faz Django não servir `/static/` | WhiteNoise no middleware |

## Pendências

- [ ] HTTPS via reverse proxy (nginx/Caddy + Let's Encrypt)
- [ ] Tags no playbook pra deploy parcial (só env, só rebuild, etc.)
- [ ] Healthchecks nos containers
- [ ] Backup automatizado do Postgres (banco compartilhado já tem? confirmar)
- [ ] Limpar `ignoreBuildErrors` do `next.config.js` quando codebase estiver "limpa"
- [ ] Monitoramento de memória do Redis (alert se evicted_keys disparar)
