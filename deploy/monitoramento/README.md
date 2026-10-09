# Monitoramento do Separa — o que fica fora do compose do Separa

Observabilidade, 2026-10-08. O que o Separa já exporta sozinho (compose de produção):

| Serviço | O que dá | Porta (rede Docker) |
|---|---|---|
| `celery-exporter` | tarefas: enviadas, ok, falhas, duração | `celery-exporter:9808` |
| `redis-exporter` | memória, evictions, clientes | `redis-exporter:9121` |
| `backend` (`django-prometheus`) | requisições por view/status, latência, queries no Postgres | `backend:8000/metrics/` **(novo)** |
| `backend` (`/api/health/`) | Postgres + Redis, 200/503 — usado pelo `healthcheck` do Docker | `backend:8000/api/health/` **(novo)** |
| Postgres (`grafana_ro`) | `core_execucaotarefa` (heartbeat das tarefas), `core_errocliente` (erros do web/coletor), o resto do negócio | `192.168.1.199:5432` |

O Prometheus, o Grafana e agora o Loki moram na **stack de monitoramento da VM** (`mp-*`, gerida no Portainer), não neste repositório. Esta pasta guarda o que precisa ser colado lá.

## 1. Prometheus: scrape do backend

No `prometheus.yml` da stack `mp-*`, ao lado de `separa-celery` e `separa-redis`:

```yaml
  - job_name: "separa-backend"
    metrics_path: /metrics/
    static_configs:
      - targets: ["backend:8000"]
```

O `mp-prometheus` já entra na rede `separa_default`, então `backend` resolve. A view só responde para IPs da rede Docker (`10.`, `172.x`); da LAN direto em `:8003/metrics/` dá 403.

Depois de recarregar (`docker kill -s HUP mp-prometheus` ou restart), conferir em `http://192.168.1.199:9090/targets` — `separa-backend` deve ficar UP.

## 2. Loki + Promtail (logs)

`docker-compose.loki.yml` traz os dois serviços; `loki-config.yml` e `promtail-config.yml` são montados por ele.

1. Copiar a pasta para a VM (ex.: `/opt/monitoramento/`) ou colar os dois serviços na stack do Portainer, apontando os volumes para os dois YAML.
2. Redes: dentro da stack `menor_preco_v2` (Portainer) os serviços usam `default`, `detran-monitor-net` e `separa_default`, iguais aos outros serviços dela — foi assim que subiu em 2026-10-09. Fora da stack, as duas últimas são externas (já declaradas no fim do YAML).
3. `docker compose -f docker-compose.loki.yml up -d`.
4. No Grafana: **Connections → Data sources → Loki**, URL `http://mp-loki:3100`. Save & test.
5. Explorar: `{compose_project="separa", compose_service="backend"} | json` — os campos do JSON (`metodo`, `caminho`, `status_http`, `duracao_ms`, `usuario`, `tarefa`, `pedido`) viram colunas. `nivel` e `logger` já são labels: `{compose_service="backend", nivel="ERROR"}`.

O Promtail lê **todos** os containers da VM, não só o Separa — os outros sistemas ganham logs no Grafana de brinde. Retenção: 30 dias (`retention_period` no `loki-config.yml`).

## 3. Grafana: dashboard

`../grafana/separa-conferencia.json` ganhou 10 painéis em 2026-10-08 (heartbeat das tarefas, erros, cancelamentos, atribuição Pátio × bipagem, etiquetas, e três do django-prometheus). Reimportar: **Dashboards → New → Import → Upload**, escolher o datasource Postgres (`DS_SEPARA`) **e** o Prometheus (`DS_PROMETHEUS`), marcar *overwrite*.

Dashboards prontos para o django-prometheus: procurar "django-prometheus" na galeria do Grafana (filtrar pelo datasource Prometheus).

## 4. Alertas sugeridos (Grafana Alerting)

Regras simples, todas em cima do que já existe. Canal: o Evolution/n8n da VM pode entregar no WhatsApp (contact point do tipo webhook).

| Alerta | Fonte | Expressão | Dispara |
|---|---|---|---|
| Sync Senior parado | Postgres | `SELECT EXTRACT(EPOCH FROM now() - max(iniciada_em))/60 FROM core_execucaotarefa WHERE tarefa='apps.senior.tasks.sincronizar_pedidos_oracle' AND status='ok'` | `> 10` (min) |
| Oracle fora | Postgres | `SELECT count(*) FROM core_execucaotarefa WHERE status='erro' AND iniciada_em > now() - interval '15 minutes'` | `>= 3` |
| Worker sumiu | Prometheus | `up{job="separa-celery"} == 0` ou `celery_workers == 0` | 2 min |
| Backend fora | Prometheus | `up{job="separa-backend"} == 0` | 2 min |
| 5xx na API | Prometheus | `sum(rate(django_http_responses_total_by_status_view_method_total{status=~"5.."}[5m])) > 0` | 5 min |
| Erros no coletor | Postgres | `SELECT count(*) FROM core_errocliente WHERE origem='mobile' AND criado_em > now() - interval '1 hour'` | `>= 3` |
| Atribuído sem iniciar | Postgres | painel "Atribuído mais antigo sem iniciar" | `> 60` (min) |
| Redis cheio | Prometheus | `redis_memory_used_bytes / redis_memory_max_bytes > 0.9` | 5 min |

Dentro do próprio Separa, **Admin → Saúde** (`/admin/saude`) mostra a mesma coisa sem Grafana: componentes, heartbeat das tarefas e erros do web/coletor.
