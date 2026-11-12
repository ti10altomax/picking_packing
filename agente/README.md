# Agente de impressão USB (Windows)

Programa que roda no PC onde a Zebra está plugada por **cabo USB** e imprime as
etiquetas de volume do Separa. O servidor enfileira o ZPL (`PrintJob`); o agente puxa
a fila, manda **RAW** para a fila de impressão do Windows (driver ZDesigner) e **confirma
a saída** — só então a etiqueta conta como impressa no Separa (2026-11-11).

Um arquivo só: `SeparaAgente.exe` (Python + pywin32 empacotados pelo PyInstaller),
configurado pelo `agente.ini` ao lado dele. Roda como **serviço do Windows**
(início automático, sem ninguém logado).

## Distribuição pelo Separa (sem pendrive)

O admin publica o executável em **Admin → Agente de impressão** (`/admin/agente`) e o
backend serve a página pública **`/agente/`** (em produção `http://192.168.1.199:8003/agente/`),
sem login, com dois botões — **Baixar SeparaAgente-X.Y.Z.exe** e **Baixar agente.ini** — e o
passo a passo abaixo. O `agente.ini` sai **gerado pelo servidor** com a `url` já preenchida
(`SEPARA_URL_PUBLICA`), então no PC só falta o `nome_windows`. A mesma tela lista os PCs
registrados (`PrintAgent`) com a versão que mandam no heartbeat e marca "desatualizado";
`SeparaAgente.exe status` também avisa quando há versão mais nova publicada.
Código em `backend/apps/impressao/distribuicao.py` (model `VersaoAgente`, migration `impressao.0003`).

## Instalar no PC da impressora

1. Instalar o driver da Zebra (ZDesigner) e conferir que ela aparece em
   *Dispositivos e Impressoras* e imprime uma página de teste do Windows.
2. No navegador do PC, abrir `http://192.168.1.199:8003/agente/`, baixar os dois arquivos,
   criar a pasta `C:\SeparaAgente\`, mover os dois para lá e renomear o executável para
   `SeparaAgente.exe`. (Sem o Separa: copiar `SeparaAgente.exe` + `agente.ini.exemplo`
   renomeado para `agente.ini` e ajustar a `url`.)
3. Abrir o **Prompt de Comando como administrador** nessa pasta e rodar, nesta ordem:

```bat
SeparaAgente.exe impressoras
```
Mostra as filas do Windows. Copiar o nome exato da Zebra para `agente.ini → [impressora] nome_windows`.

```bat
SeparaAgente.exe registrar
```
Registra o PC no servidor e grava o **token** no `agente.ini`. No Separa, **Admin → Impressoras →
Nova**: tipo **USB**, colar o token em **Agent ID** (o token também aparece em Admin → Print Agents).

```bat
SeparaAgente.exe teste
```
Sai uma etiqueta de teste pela fila configurada. Se saiu inteira, cabo, driver e fila estão certos.

```bat
SeparaAgente.exe instalar
SeparaAgente.exe iniciar
SeparaAgente.exe status
```
Instala o serviço `SeparaAgente` (início automático), inicia e mostra o estado geral: servidor,
token aceito, impressora pronta, serviço rodando. Em Admin → Print Agents o PC deve aparecer **online**.

Pronto: a impressão automática (ou o botão Etiqueta) com essa impressora passa a sair na Zebra.

## Comandos

| Comando | O que faz |
|---|---|
| `registrar [--url URL] [--novo]` | Registra o PC no servidor e grava o token no `agente.ini`. `--novo` gera outro token (exige colar o novo na impressora) |
| `impressoras` | Lista as filas de impressão do Windows com porta, estado e driver |
| `teste [nome da fila]` | Imprime uma etiqueta de teste 10x15 (usa `nome_windows` se não informar) |
| `status` | Configuração, servidor, token, impressora(s) e serviço |
| `rodar` | Roda em primeiro plano, log no console (Ctrl+C sai) — para depurar |
| `instalar` / `remover` | Cria/apaga o serviço do Windows (administrador) |
| `iniciar` / `parar` / `reiniciar` | Controla o serviço |

Sem argumentos o executável tenta rodar como serviço; aberto por duplo clique, mostra a ajuda.

## `agente.ini`

```ini
[servidor]
url = http://192.168.1.199:8003
token = <gravado pelo registrar>

[impressora]
nome_windows = ZDesigner ZD220-203dpi ZPL   ; fila padrão

[impressoras]        ; opcional: um agente para várias impressoras do Separa
3 = ZDesigner ZD220-203dpi ZPL              ; id da impressora no Separa = fila do Windows
4 = ZDesigner ZT231-203dpi ZPL

[agente]
intervalo_jobs = 3          ; s entre consultas à fila do servidor
intervalo_heartbeat = 60    ; s entre sinais de vida (offline no Separa após 120 s)
confirmar_saida_s = 60      ; quanto esperar a etiqueta sair da fila do Windows
log_dias = 14               ; retenção do agente.log
```

## Comportamento

- **Impressora desligada / cabo solto / sem etiquetas / tampa aberta**: o agente **não pega** os
  jobs; eles ficam pendentes no servidor e saem sozinhos quando a impressora voltar. O pedido
  aparece em Gestão → Etiquetas como "na fila do agente USB desde …".
- **Fila do Windows com nome errado** ou **job que não sai no prazo** (`confirmar_saida_s`): o job é
  cancelado na fila do Windows e devolvido ao servidor **com erro**. O pedido volta a "Prontas para
  imprimir" com "última tentativa: …" e o histórico do pedido mostra "Falha ao imprimir etiqueta".
- **Servidor fora**: o agente continua tentando (log sem repetir a cada 3 s). Job impresso cujo
  `ack` falhou é lembrado em memória e confirmado quando o servidor voltar — não reimprime.
- **Sem token** (serviço instalado antes do `registrar`): relê o `agente.ini` a cada minuto.
- Log em `agente.log` ao lado do exe (rotação diária). Início/parada/queda também no Visor de
  Eventos do Windows (origem `SeparaAgente`).
- O serviço roda como *LocalSystem*; impressora instalada para todos os usuários (USB local) é
  visível. Se a fila só existir para um usuário (impressora de rede "conectada"), mude a conta do
  serviço em `services.msc` ou instale a impressora como local.

## Gerar o executável

No Windows com Python 3.12 instalado, nesta pasta:

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

Cria `.venv/`, instala `pywin32` + `pyinstaller` e gera `dist\SeparaAgente.exe` (~9 MB) com
`dist\agente.ini.exemplo`. A versão está em `VERSAO` no `separa_agente.py` e vai no heartbeat
(aparece em Admin → Print Agents e em Admin → Agente de impressão). Depois do build, publicar o
`dist\SeparaAgente.exe` em Admin → Agente de impressão com a mesma versão (precisa ser maior que a
publicada). `.venv/`, `build/`, `dist/`, `*.spec` e `agente.ini` são ignorados pelo git.

Para rodar sem empacotar: `.venv\Scripts\python.exe separa_agente.py <comando>`.

## Como o servidor trata (backend)

- `POST /api/etiquetas/agents/registrar/` → `PrintAgent` (hostname, token).
- `POST .../heartbeat/` a cada minuto → `PrintAgent.ultimo_heartbeat` + `Impressora.ultimo_heartbeat`
  (botão Testar e Admin → Saúde usam 120 s / 5 min).
- `GET .../jobs/` → jobs `pendente` das impressoras cujo `agent_id` = token, ZPL em hex.
- `POST .../jobs/<id>/ack/` `{erro}` → `PrintJob` `retirado` ou `erro` → signal
  `apps/impressao/signals.py` → `ImpressaoEtiqueta` `na_fila` vira `ok` ou `erro`
  (`services.confirmar_job`), com `PedidoLog` `etiqueta_impressa` / `etiqueta_erro` (payload `agente`).
