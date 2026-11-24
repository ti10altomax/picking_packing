# Sistema de Separação Interna — Altomax

## Visão geral

Sistema interno para **separação de pedidos no galpão da Altomax**. Não é mais um fluxo de expedição com etiquetagem por marketplace/transportadora — o foco atual é apoiar o trabalho do **conferente** no chão de fábrica, garantindo que cada item bipado bate com o pedido e organizando o conteúdo em **volumes** (caixas, fardos, etc.).

> Pivot do projeto: este sistema **era** um fluxo de expedição multi-marketplace com VTEX/CLICK/etiquetagem. Esses módulos **continuam no código preservados** (não apagar) mas estão fora do MVP atual. Ver "Módulos congelados".

> **Redesenho 2026-08 (aprovado)** — ver `DESIGN.md` para a espec completa. **Fases 1, 2 e 3 implementadas em 2026-08-27**: o papel do sistema agora é o **conferente** (rename completo); o **separador físico** tem cadastro próprio com **liberação diária** e é apontado pelo conferente ao iniciar; o Sup. Pátio monta **sequências** e atribui pedido a pedido dentro delas (atribuição direta antiga desativada — 410), com **trava de sequência ativa** no conferente (regra de liberação configurável em `Configuracao`). **Fase 4 também implementada**: divergência de barra liberada pelo supervisor no web (`DivergenciaBarra`, só por ocorrência), erros de separação (`ErroSeparacao` — sobra com status novo `Aguardando fechamento` e fechamento pelo Sup. Pátio configurável; falta derivada automaticamente no Não Conforme) e relatório produto × volume por sequência. **Fase 5 concluída em 2026-08-28**: tudo em produção (VM 192.168.1.199) e APK 0.2.0 buildado — o redesenho está completo.

> **Faturamento parcial — NF que sai de pedido vira documento (2026-11-05)** — um pedido pode ser faturado em várias notas (168 pedidos com 2+ NFs em 30 dias) e o galpão confere, na maioria das vezes, pela nota. O sync passou a importar **também a NF que saiu de pedido** (`QUERY_NF_PENDENTES` traz `pedidos_origem` = LISTAGG da E140IPV → `Pedido.pedidos_origem`, migration `pedidos.0017`), com os itens e quantidades da nota. **Exceção**: se a NF é o faturamento de um pedido que o Separa já está conferindo (Selecionado em diante e sem NF vinculada, ou já vinculado a ela), ela só é vinculada ao pedido (`Pedido.nf_*`, como antes) — a nota seguinte do mesmo pedido (o saldo) vira documento. `vincular_nfs_pedidos`/`descobrir_nf` ignoram NF que já é documento. `POST /api/pedidos/selecionar/` barra conferência dupla (pedido × NF dele: `conflitos` com motivo, `nf_vinculo.conflito_conferencia_dupla`). Busca de `/api/pedidos/` acha pelo nº do pedido, da NF (`numero_externo`, `nf_numero`) e, pelo nº do pedido, as NFs que saíram dele; listas mostram "ped. N" na NF e "NF N" (âmbar, `nfs_documento`) no pedido que já tem nota na lista. Bipagem do DANFE sem documento local traz a NF na hora pela mesma regra (`apps.senior.tasks.importar_nf`). Regra em `apps/pedidos/nf_vinculo.py`.

> **Vendas: lista de notas colada + "Buscar no Senior" (2026-11-13)** — quem envia para o Pátio recebe a relação das NFs de outro setor. Botão **Colar lista** em Vendas (`components/pedidos/ListaNotas.tsx`): cola os números (vírgula, `;`, espaço ou um por linha) ou abre um .txt (lido no navegador) → `POST /api/pedidos/buscar_lote/` (`{numeros}`, Sup. Vendas/admin, até 500) acha cada número no Separa (`numero_externo`, `nf_numero`, `pedidos_origem`, como o `localizar`) e, **se não está aqui, traz do Senior na hora** (`apps.senior.tasks.importar_nf`, mesma regra do sync) → blocos "Prontas para enviar" (pendentes já marcadas; pedido e NF dele nunca os dois), "Já em outra etapa" (Ver) e "Não encontradas"; envia pelo mesmo `selecionar`. O mesmo endpoint atende o botão **"Buscar N no Senior"** que aparece na busca vazia de Vendas. **A busca normal não vai ao Senior de propósito** (debounce importaria nota pela metade). Oracle fora → `senior_falhou`, sem insistir nos próximos. Só web.

> **Cancelamento no Senior + transferência (2026-09-30)** — o beat `monitorar_cancelamentos` (60 s) detecta documento cancelado no Senior (`sitped=5` / `sitnfv=9`) e o marca `Cancelado` preservando volumes e progresso; todo endpoint da conferência devolve `409 pedido_cancelado` e a tela do conferente (polling de 15 s no detalhe, web e mobile) vira um bloqueio vermelho. O Sup. Pátio transfere a conferência para o documento reemitido em `/supervisor/cancelados` (só com itens 100% iguais; sempre confirmado por pessoa). Serviço em `apps/pedidos/cancelamento.py`. Sem WebSocket de propósito — reavaliar junto com os pontos 1 e 8 da diretoria (ver `STATUS.md` 2026-09-30).

> **Notas fiscais (2026-09-09)** — além dos pedidos abertos (E120PED, sitped=1), o sync importa **NFs de venda fechadas sem pedido de origem** (E140NFV sitnfv=2, sem `numped` nos itens). Mesma tabela e mesmo fluxo: `Pedido.tipo` = `pedido` | `nota_fiscal`. Identidade Senior = (`tipo`, `codfil`, `codsnf`, `numero_externo`) — numeração é por filial e, na NF, por série. `CIFFOB` vai para `Pedido.frete` (C = entrega, F = retira, X = sem frete). Janela do sync (pedidos e NFs) em `Configuracao.janela_sync_dias` (default 5, valor de produção). Web e mobile mostram badge **NF** e **Entrega/Retira**; Sup. Vendas filtra por tipo e frete.

> **Transportadora (2026-10-05)** — o sync traz `codtra` + nome (`E073TRA.nomtra`) de pedidos e NFs para `Pedido.codtra` / `Pedido.transportadora` (vazios em retira/sem frete). O beat `monitorar_cancelamentos` preenche de carona os documentos em andamento que ainda não têm. Pré-requisito dos pontos 3, 6 e 7 da diretoria. O ponto 3 está feito em cima disso: `GET /api/pedidos/?ordem=transportadora` ordena a fila do Pátio pela transportadora com mais documentos (contagem sobre a fila, sem a busca), e web/mobile mostram cabeçalho de grupo por transportadora.

> **Conferente pega a nota bipando (2026-10-05, ponto 4 da diretoria, leitura B)** — o Pátio continua montando sequências, mas atribuir conferente virou **opcional**: a lista "Atribuídos a mim" tem uma barra de bipagem (chave do DANFE ou número da NF/pedido; desde 2026-10-30 a chave de 44 dígitos também acha o pedido já faturado pela `Pedido.nf_numero`/`nf_codsnf` e, se não achar nada, consulta a E140IPV na hora e vincula a NF ao pedido — sem esperar o beat; o número solto continua só no `numero_externo`) e uma seção "Disponíveis na sequência N". `POST /api/conferencia/pegar/` abre o que já é dele ou pega um pedido sequenciado sem conferente (Selecionado → Atribuído, log `pedido_atribuido` com `via: bipagem`), respeitando a trava de sequência; dois coletores na mesma nota → o primeiro leva. Pendente, sem sequência, de outro conferente ou cancelado → 409 com motivo.

> **Etiqueta de volume 10x15 (2026-10-07, ponto 7 da diretoria)** — não existia etiqueta (escreviam a pincel na caixa + folha A4 "carta de transporte"). Agora, ao virar **Conferido** e **só com transportadora**, sai uma etiqueta por volume com itens (marca, VOLUME N/M, documento + Code 128, cliente, transportadora grande, itens × qtd, carta de transporte como rodapé). App `apps/impressao`: dados neutros (`etiqueta.py`), ZPL para Zebra (`zpl.py`, ASCII + truncamento em Python), página HTML `/etiquetas/[id]` para qualquer impressora via navegador, agente USB (`PrintJob`, módulo congelado reaproveitado). Impressora padrão + liga/desliga em `Configuracao` (`impressora_padrao`, `etiqueta_automatica`); **dois modelos** desde 2026-10-23 em `Configuracao.etiqueta_modelo`: `padrao` (descrição + SKU, 10 itens por etiqueta) e `compacta` (só SKU em 18 linhas × 2 ou 3 colunas — 3 só quando toda quantidade do volume tem até 2 dígitos e todo SKU até 16 caracteres, sem diminuir a fonte —, pedido da supervisão; cliente e transportadora em 1 linha). Ajustes de 2026-10-26 depois da aprovação: margem de 3 mm (`MARGEM_IMPRESSORA_MM`), "pág. N/M", NF ao lado do pedido e no Code 128 quando já vinculada (`Pedido.nf_numero`) com "NF/PEDIDO nº" pequeno sob a barra, rodapé sem as 2 linhas de endereço/telefone — `?modelo=` na página/ZPL força um para comparar; impressão automática via Celery; sem padrão ou sem transportadora o pedido fica em **Gestão → Etiquetas** (`/api/impressao/pendentes/`) e o beat dispara quando a transportadora chega. **Desde 2026-10-27, pedido só imprime depois de faturado** (NF vinculada pela E140IPV, `Pedido.nf_*`): regra em `Configuracao.etiqueta_exige_nf` (`sim` default | `nao`, checkbox "Só imprimir com NF emitida" em Admin → Impressoras), aplicada no backend (`verificar_elegivel` → bloqueio `sem_nf`) para a automática, o botão (listas trazem `etiqueta_bloqueio` e ficam só desabilitadas) e a página do navegador; o beat `vincular_nfs_pedidos` dispara a impressão quando a NF chega (`disparar_se_pendente`, nunca reimprime). Documento do tipo NF não é afetado. Reimpressão em Conferidos (web e mobile). `Impressora`/`PrintAgent`/`PrintJob` e `/admin/impressoras` voltaram ao uso. Quantidade/modelo de impressoras ainda indefinidos — por isso todos os caminhos estão prontos.

> **Observabilidade (2026-10-08)** — logs em **JSON** em produção (`config/logging.py`, `LOG_NIVEL`/`LOG_FORMATO`; `logger.info('…', extra={'pedido': id})` vira campo), uma linha por requisição `/api/` (`apps/core/middleware.py`). `GET /api/health/` (sem auth, Postgres+Redis) alimenta o `healthcheck` do compose. Toda task Celery leva `@registrar_execucao()` (`apps/core/tarefas.py`) → `ExecucaoTarefa` (heartbeat; "atrasada" = 3× o intervalo do beat). `GET /api/saude/` + tela **Admin → Saúde** (`/admin/saude`): componentes, tarefas e erros do web/coletor (`ErroCliente`, `POST /api/erros-cliente/` sem auth obrigatória; web `app/error.tsx` + `components/ErroReporter.tsx`; mobile `ErrorBoundary` + `ErrorUtils`). `GET /api/pedidos/<id>/historico/` traduz o `PedidoLog` (`apps/pedidos/historico.py`) → botão **Histórico** nas listas do supervisor. `GET /api/agora/` (`apps/pedidos/agora.py`) → **Gestão → Agora** (web e app): quem confere o quê, parados (20 min sem bip), filas, sequências, ritmo. `django-prometheus` em `/metrics/` (só rede Docker; `PROMETHEUS_MULTIPROC_DIR` no compose prod). Loki/Promtail + scrape job + alertas sugeridos em `deploy/monitoramento/` — aplicação manual na stack `mp-*` da VM.

> **Carta de correção — transportadora, frete e volumes (2026-10-22, ponto 6 da diretoria)** — app `apps/carta_correcao`. Sup. Vendas, Sup. Pátio e admin corrigem a transportadora, o frete C/F e/ou a **quantidade de volumes** (`qtdEmb`, pré-sugerida pelos volumes do Separa) de uma **NF autorizada** pelo web (botão **Corrigir NF** em Conferidos e página **Gestão → Cartas de correção**, com busca por nº da NF, do pedido ou cliente). Vale para NF importada como documento **e para pedido já faturado**: a NF que nasce de um pedido não entra como documento (é a mesma venda), então `apps/pedidos/nf_vinculo.py` descobre a nota pela `E140IPV.filped/numped` e guarda em `Pedido.nf_codfil/nf_codsnf/nf_numero` (beat `vincular_nfs_pedidos` a cada 5 min para pedidos em andamento e Conferidos dentro da janela do sync, e sob demanda ao clicar em Corrigir NF, sem limite de janela; de carona preenche transportadora/frete vazios). O sistema monta o texto da carta (repetindo as cartas anteriores lidas de `E140CCE`, porque a última substitui as outras) e chama o WS Senior `cartadecorrecao.Gravar`, que grava a carta "Não enviada" e atualiza `codTra`/`cifFob` da própria NF. Modo em `Configuracao.cce_modo`: `desligado` (default) | `gravar` (faturamento transmite no Senior) | `gravar_e_transmitir` (`documentofiscal.EmitirCartaCorrecao`, `cce_tipger`). Texto em `Configuracao.cce_texto` (2026-10-27, migration `core.0012`): `montado` (default, o sistema escreve "ONDE SE LE…" + complemento) | `livre` (o sistema põe o texto montado no campo editável — `previa` devolve `sugestao` — e o usuário edita, apaga tudo ou escreve outro; obrigatório; transportadora/frete/volumes continuam indo nos campos do `Gravar`) — a diretoria ainda discute o formato; select em Gestão → Cartas de correção e no Django Admin. **Quem pode corrigir** (2026-10-28, migration `core.0013`): `Configuracao.cce_perfis` (`supervisor_vendas,supervisor_patio` default; admin sempre pode), **editável só no Django Admin de propósito** — não entra em Gestão → Cartas de correção para um supervisor não se liberar sozinho; `GET /api/carta-correcao/permissao/` + hook `useCcePermissao` escondem menu e botão Corrigir NF no web. **`SENIOR_WS_DRY_RUN`** (default True) monta tudo e não chama o Senior — **produção já está com False desde 22/10 à noite** (`senior_ws_dry_run` no `vars.yml`); o que manda lá é o modo no painel. O primeiro `Gravar` real (volumes 1 → 2) funcionou em 22/10. Situação eletrônica vem de `E140IDE.sitdoe` (3 = Autorizada); volumes atuais de `E140NFV.qtdemb`. Pedido ainda sem NF fechada não tem CC-e (bloqueio `sem_nf`). Rastro em `CartaCorrecao` + `PedidoLog`. Ver `STATUS.md` 2026-10-22 e `docs_pessoais/carta-correcao.html`.

> **Etiqueta: barra do DANFE + volumes iguais aos da NF; OP vira caixa ou fardo; filtro em Conferidos (2026-11-09)** — quatro pedidos do usuário feitos juntos. (1) O código de barras da etiqueta de volume passou a ser a **chave de acesso do DANFE** (`Pedido.nf_chave`, E140IDE.chvdoe, 44 dígitos, Code 128 C `>;` no ZPL) **ao lado do número do documento, ocupando tudo que sobra até a borda** (o "NF nº" que ficava entre os dois saiu — já está sob a barra; com chave o número cai de 64 para 48 dots e a barra sai em módulo 2, `code128(..., largura_max=...)` cai para módulo 1 só se não couber); sem chave, NF/pedido na coluna original. Capacidade (10 itens / 18 linhas) inalterada — o usuário pediu só a troca da barra. **2026-11-10**: a barra lia mal no TC21 e na câmera (8,6 mm de altura para 69 mm de largura, fim a 1,5 mm do corte, zona branca encostando no número) → barra de 84 dots (10,3 mm), posição/módulo calculados em dots reais (`_Canvas.code128_geometria`, zona branca de 10 módulos dos dois lados, número encolhe 44→40→36 antes de cair o módulo) e **QR Code com a mesma chave no canto direito do rodapé** (15,6 mm, `^BQ` ECC M; HTML com o pacote npm `qrcode`), só quando há chave. Prévia no Labelary (`reference_previa_zpl_labelary`). Ao imprimir pelo botão (web) sai um toast "Etiquetas enviadas à impressora" para ninguém mandar duas vezes (a impressora fica longe). (2) **Nova regra de impressão** `Configuracao.etiqueta_exige_volumes` (`sim` default, checkbox em Admin → Impressoras): a quantidade de volumes com itens do Separa tem que ser igual ao `qtdemb` da NF (`Pedido.nf_volumes`); diferente → bloqueio `volumes_divergentes` (botão "Volumes ≠ NF", pendente em Gestão → Etiquetas) até a **carta de correção** ajustar a nota — o próprio `executar` da CC-e espelha `nf_volumes` e chama `disparar_se_pendente`. `nf_chave`/`nf_volumes` (migration `pedidos.0019`) chegam pelo sync da NF (`_SELECT_NF`), pelo vínculo do pedido (`QUERY_NFS_DOS_PEDIDOS`), pelo beat `monitorar_cancelamentos` (60 s; NF documento **e** NF vinculada de pedido, `QUERY_SITUACAO_NFS` com E140IDE) e pela prévia da CC-e; página HTML, ZPL e `imprimir()` releem no Senior na hora se ainda não tem (`services.completar_dados_nf` → `nf_vinculo.atualizar_nf_senior`). `qtdemb` desconhecido não bloqueia. (3) **OP não é sempre fardo**: `conferencia/fardo.py::tipo_volume_da_op` — posições 4-5 do CODPRO em `RP`/`AL` = fardo, senão caixa (regra da TI, só o primeiro item da OP); textos web/mobile falam "OP", e o toast diz "Caixa OP N" ou "Fardo OP N". (4) **Conferidos** (web e coletor) ganhou o filtro Todos / Com transportadora / Sem transportadora (`?transportadora=com|sem`, que já existia no backend). (5) **Câmera contínua** no coletor (`CameraScanner continuo`): um toque liga, "× Desligar" fecha, mesmo código só repete depois de 3 s (`INTERVALO_REPETIR_MS`), toasts por cima da câmera via `ToastHost` montado no Modal. APK **0.13.1**. Migrations `pedidos.0019`, `core.0014`. **2026-11-10 — leitor contínuo no coletor (APK 0.14.0; 0.14.1 com a espera do scanner)**: botão **Leitor** na barra de bipagem, só em aparelho com o DataWedge instalado (`modules/datawedge`, módulo Expo local em Kotlin: `temDataWedge` via `PackageManager` + `<queries>` no manifest; critério é o pacote `com.symbol.datawedge`, não a marca). Ligar = `GET_ACTIVE_PROFILE` → `SET_CONFIG` no perfil ativo (só `aim_type` 5 Continuous Read, `beam_timer` 0, `same_barcode_timeout` = `INTERVALO_REPETIR_MS`, `different_barcode_timeout` 0, `RESET_CONFIG` false) → `REGISTER_FOR_NOTIFICATION SCANNER_STATUS` → espera `WAITING` → `SOFT_SCAN_TRIGGER START_SCANNING` → confirma `SCANNING` (o DataWedge recarrega o perfil ~15 ms depois do SUCCESS do SET_CONFIG e desliga/religa o scanner por ~750 ms; um START nesse intervalo é engolido — visto no logcat do TC21, DW 11.3.28, Android 11); desligar = `STOP_SCANNING` + perfil de volta a `aim_type` 0 / `beam_timer` 5000 (padrões do DataWedge). A leitura continua chegando como teclado na mesma barra. Desliga sozinho com modal aberto, fim da conferência, app no fundo ou saída da tela. `X-App-Dispositivo` passou a levar fabricante + modelo (`Platform.constants`).

> **Agente de impressão USB (2026-11-11)** — a Zebra atual (ZD220) não tem rede e a nova vai demorar, então o programa do PC existe: pasta **`agente/`** (`separa_agente.py` → `SeparaAgente.exe` via PyInstaller, `build.ps1`, `agente.ini.exemplo`, README). Serviço do Windows (`instalar`/`iniciar`), heartbeat 60 s, puxa `GET /api/etiquetas/agents/jobs/` a cada 3 s, imprime **RAW pela fila do Windows** (win32print, driver ZDesigner), espera o job sair do spooler e dá `ack`. Impressora offline/sem papel → não pega (job espera); fila inexistente ou não saiu no prazo → `ack` com erro. Comandos: `registrar`, `impressoras`, `teste`, `status`, `rodar`. **Backend**: `ImpressaoEtiqueta.Status.NA_FILA` (migration `impressao.0002`) — USB nasce `na_fila` (log `etiqueta_enfileirada`) e o signal `apps/impressao/signals.py` (`services.confirmar_job`, sem tocar na view congelada `ack_job`) fecha em `ok`/`erro` pelo `PrintJob`; só `ok` conta como impressa (pendentes mostram "na fila do agente USB", `na_fila` em `/api/impressao/pendentes/`, "Imprimir todas" pula, beats não redisparam). API do agente continua a do módulo congelado, sem alteração. **Distribuição (2026-11-12, pedido do usuário, igual à do APK)**: o admin publica o exe em **Admin → Agente de impressão** (`/admin/agente`; `VersaoAgente`, migration `impressao.0003`, `apps/impressao/distribuicao.py`), o backend serve a página pública **`/agente/`** (botões Baixar exe + `agente.ini` **gerado** com a `SEPARA_URL_PUBLICA` preenchida + passo a passo) e os arquivos `/agente/SeparaAgente-X.Y.Z.exe` e `/agente/agente.ini`; Caddy roteia `/agente/*`; `GET /api/impressao/agente/versao/` (sem login) alimenta o `status` do agente ("versão X publicada"); a tela lista os `PrintAgent` com versão/online/desatualizado. Tela nova tem ajuda `admin-agente`. **1.0.1 (2026-11-12)**: a fila tem que ser a USB local do próprio PC — impressora compartilhada por outro PC (porta `\\PC\fila`) falha com "erro no job" no serviço (LocalSystem) e em prompt "como administrador" (o Local Port usa a sessão de rede de quem mandou o job; a sessão elevada não tem as conexões do usuário); `teste`/`status`/`impressoras`/log avisam (`porta_remota`, `aviso_compartilhada`). Só `instalar`/`iniciar` pedem administrador. A ZD220 está plugada no **ALT0092** (172.18.18.119). **Em produção desde 2026-11-13.** **1.0.2 (2026-11-13)**: todo job sai com `~JX` na frente (`PREFIXO_ZPL` em `imprimir_raw`) — um formato ZPL parcial preso no buffer da Zebra faz ela engolir todo `^XA…^XZ` em silêncio com a luz verde (EPL e `~WC`/`~PH` continuam saindo); visto numa GC420t que "estava em EPL" (descritor USB) mas respondia `hybrid_xml_zpl`. `~JX` não faz nada sem formato preso.

> **Distribuição do APK (2026-10-28)** — app `apps/app_mobile`. O admin publica o APK em **Admin → App do coletor** (`/admin/app`; `VersaoApp`, validação de zip/AndroidManifest, versão X.Y.Z crescente); o backend serve a página **`/apk/`** (botão Baixar, sem login, para abrir no navegador do aparelho na primeira instalação) e o arquivo `/apk/separa-X.Y.Z.apk`; `GET /api/app/versao/` (sem login) alimenta o aviso no app (`components/AvisoAtualizacao.tsx`: faixa "Atualizar" ou bloqueio se obrigatória; abre a URL no navegador e o Android instala por cima). Inventário: o app manda `X-App-Versao`/`X-App-Dispositivo` em toda requisição → `DispositivoApp` (quem está em qual versão, badge "desatualizado" na mesma tela). Arquivo em `MEDIA_ROOT` (volume `media_data` em prod); Caddy roteia `/apk/*` pro backend; `SEPARA_URL_PUBLICA` (`.env`, prod `http://192.168.1.199:8003`) é o host do link de download. Instalação silenciosa não existe sem EMM (StageNow da Zebra, fora do Separa).

> **Manual do usuário embutido (2026-10-29)** — botão **"?"** no cabeçalho de toda tela (web: `components/Ajuda.tsx` nos três layouts; coletor: `Header.tsx` abre o manual no navegador) e página pública **`/ajuda`** (sem login, índice por perfil, `#chave`, imprimível). Conteúdo em **`frontend/content/ajuda/<chave>.ts`** (`AjudaTela`: resumo, capturas, passos, elementos, situações, dicas, relacionadas), capturas em `public/manual/`, guia de estilo em `content/ajuda/README.md`. **Tela nova = arquivo novo em `content/ajuda` + registro em `index.ts`**; `npm run ajuda:checar` aponta rotas sem ajuda. Capturas com dados fictícios (documentos 9801xx em dev).

> **"Devolver para Vendas" em Conferidos (2026-11-16, só admin)** — no primeiro dia de uso real, as conferências de teste (logins `maria`/`jose`) estavam esbarrando nas notas reais e foram devolvidas a Pendente à mão pelo `manage.py shell` (51 docs + 4 selecionados antigos; `PedidoLog` `conferido_retornado`/`selecao_retornada`, usuario=None). O caminho virou botão: **Devolver para Vendas** (vermelho) na linha de Gestão → Conferidos, só para `perfil == 'admin'`, sempre com confirmação → `POST /api/conferidos/<id>/devolver/` (`{motivo}` opcional; 403 fora do admin, 400 se não é Conferido). Faz o documento voltar a **Pendente do zero**: apaga `Volume`/`VolumeItem`, zera `qtd_separada`, limpa seleção/sequência/conferente/separador/`conferido_em`/`senior_*` e **apaga as `ImpressaoEtiqueta`** (senão o botão diria "Reimprimir" e `disparar_se_pendente`/pendentes pulariam a próxima etiqueta); recalcula a sequência; log `conferido_retornado` com o estado anterior inteiro (volumes, quantidades, conferente, etiquetas) → "Devolvido para Vendas" no Histórico. Nada a desfazer no Senior (WS de volumes é placeholder). Só web — admin não opera no coletor.

> **Colar lista: intervalo com traço + versão do Pátio; seletor de impressora em portal (2026-11-16)** — (1) `analisarLista` em `components/pedidos/ListaNotas.tsx`: "151281-151290" (com ou sem espaços ao redor do traço, também en/em-dash) vira os dez números; vírgula, `;`, espaço e linha continuam separando; intervalo com mais de `LOTE_MAX` (500) números é ignorado e avisado (erro de digitação); lista com mais de 500 trava o Buscar. (2) O mesmo modal serve o **Pátio** (`modo="patio"`, botão **Colar lista** ao lado de Atualizar em `/supervisor/patio`): `POST /api/pedidos/buscar_lote/` ganhou `para` = `vendas` (default, Sup. Vendas, vai ao Senior) | `patio` (Sup. Pátio, **não** consulta o Senior — o que não está no Separa não foi enviado por Vendas, não há o que sequenciar); "pronto" no Pátio = Selecionado sem sequência; o rodapé do modal recebe o seletor "Nova sequência / Sequência N" da própria tela (`rodape`) e `onEnviar` reaproveita `enviarIdsParaSequencia` (criar → abre a sequência; adicionar → toast). (3) **Bug**: o popover de impressoras do `ImprimirEtiqueta` era `absolute` dentro da linha e o card de Conferidos tem `overflow-hidden` — com uma linha só (busca por um pedido) ficava cortado. Agora sai por `createPortal` em `document.body` com `position: fixed` calculada do botão (abre para cima se não cabe embaixo, recalcula em scroll/resize), fechamento por clique fora considera o portal. Só web.

> **Código de barras alternativo — etiqueta errada da fábrica em série (2026-11-17)** — um produto vem com a barra impressa errada desde a China há 3 anos (lê `7908323601146`, o Senior e o Separa têm `7908323114615`) e nunca vai ser corrigido; a `DivergenciaBarra` (liberação por ocorrência) travaria o conferente a cada peça. Novo `CodigoBarrasAlias` em `apps/pedidos` (migration `pedidos.0020`): `codigo_lido` (único) → `codigo_certo` (EAN do Senior), `ativo`, observação, quem criou. **Cadastro só no Django Admin de propósito** (`/django-admin/pedidos/codigobarrasalias/`, não é para qualquer um); o `clean` barra lido == certo e **barra código lido que já é EAN de algum `PedidoItem`** (senão bipar o produto verdadeiro viraria o outro em silêncio), e a lista mostra o produto do EAN certo + quantos bips passaram. Resolvedor único em `apps/pedidos/alias_barra.py` (`alias_para`, `codigo_bate`, `alternativos_por_ean`): EAN/SKU exatos primeiro, alias só depois e só para o item cujo EAN é o `codigo_certo`. Como web e coletor casam o código **localmente** (`itemPendente`/`ehOp`), o detalhe do documento devolve `codigos_alternativos: []` em cada item e os dois usam `codigoDoItem(i, cod)`; `bipar` aceita e **cria `DivergenciaBarra` com `alias` preenchido** (sem `vinculado_por`) para a cobrança da fábrica continuar — relatório `/api/divergencias/` traz `origem: alias|supervisor`, tela de Divergências mostra "aceito automaticamente", Histórico diz "barra errada N (código alternativo)", toast do +1 avisa "barra errada da fábrica (registrada)". `liberar_divergencia` recusa (400) código que já tem alias. Alias inativo volta a ser divergente. OP/fardo não precisa (o CODBAR da view vem do Senior, certo). APK **0.15.1** (versionCode 27; o 0.15.0 nunca foi buildado — em 17/11 o APK de 10/11 foi publicado em prod com o rótulo 0.15.0/26, por isso a versão seguinte pulou). Nada do fluxo de divergência antigo foi alterado.

> **Tela cheia opcional + nome da sequência (2026-11-17)** — (1) A equipe pediu para tirar a **tela cheia automática** do web (atrapalhava), mas o usuário gosta dela: virou preferência **por navegador** (`localStorage.telaCheia`, `lib/useFullscreen.ts` expõe `manter`), **desligada por padrão**. O botão de tela cheia do cabeçalho liga a preferência ao entrar e desliga ao sair; `FullscreenOnFirstTap` só re-entra a cada toque quando ela está ligada. Nenhum ajuste no servidor. (2) **`Sequencia.descricao`** (120 chars, migration `pedidos.0021`): nome livre do Pátio — hoje, a aba da planilha Excel que eles mantêm em paralelo até confiarem 100% no Separa. `POST /api/sequencias/` aceita `descricao`; `PATCH /api/sequencias/<id>/` `{descricao}` renomeia (Sup. Pátio/admin; espaços normalizados, corte em 120). Todo lugar que devolvia `{id, numero}` de sequência (atribuídos do conferente, detalhe, pegar, agora) leva `descricao`. Web: campo "Nome (ex.: aba da planilha)" aparece no seletor de destino quando é "Nova sequência" (barra inferior e rodapé do Colar lista), cards e opções mostram "Sequência N · nome" (`lib/sequencia.ts::rotuloSequencia`), cabeçalho da sequência tem o nome **editável inline** ("+ nome", Enter salva/Esc cancela), relatório e Agora mostram. Coletor (APK 0.15.1, mesma versão do alias): campo de nome no picker "Enviar para…", cards/picker/header/Atribuídos a mim/Disponíveis/Agora com o nome. Django Admin lista e busca por descrição.

> **Publicar APK lê o manifest + botão Etiqueta em âmbar quando Volumes ≠ NF (2026-11-17, tarde)** — (1) O APK de 10/11 (0.14.2/25) foi publicado em produção rotulado 0.15.0/26 e o coletor nunca parava de pedir atualização: a publicação só pedia os números digitados. Agora `apps/app_mobile/manifest.py` (`versao_do_apk`, parser do AndroidManifest.xml binário sem dependência nova) lê `versionCode`/`versionName` do arquivo; em `services.publicar` os campos digitados viraram **opcionais** (vazios = o que está no APK) e, se preenchidos e diferentes, recusa com "o arquivo é a versão X (versionCode N), não Y (M)". Formulário de Admin → App libera o Publicar só com o arquivo. (2) O botão **Etiqueta** desabilitado por `volumes_divergentes` ficava verde apagado e passava despercebido: agora é **âmbar** (alerta — alguém precisa fazer a carta de correção), web (`ImprimirEtiqueta.tsx`) e coletor (Conferidos, rótulo "Volumes ≠ NF"); os outros bloqueios (sem transportadora / sem NF) ficam neutros em cinza. O 0.15.1 (code 27, só alias + nome da sequência) já estava publicado em produção quando o botão ficou pronto, então o botão âmbar do coletor saiu no APK **0.15.2** (versionCode 28).

> **Coletor: volumes dentro da área que rola (2026-11-17, APK 0.15.3)** — chamado de um conferente: com 7 volumes o botão Concluir sumia e a tela não rolava. A `ListaVolumes` ficava **fora** do `ScrollView` dos itens, empilhada no bloco fixo (cabeçalho, progresso, volume atual, barra do leitor); passando da altura da tela do TC21 a lista de itens ficava com altura zero e o rodapé (Não conforme / Concluir) saía da tela. Agora volumes e itens rolam juntos dentro do mesmo `ScrollView`; cabeçalho, barra do leitor e rodapé continuam fixos. Só coletor (o web rola a página inteira).

> **Linha do item dentro do volume mostra o SKU (2026-11-18, APK 0.15.4)** — no acordeão de volumes (web e coletor), a linha ao lado da lixeira mostrava a descrição, que é igual entre as derivações do mesmo produto (`sku` = `codpro-codder`): não dava para saber qual lançamento apagar. Agora mostra o SKU em mono. A lista de itens do pedido continua com descrição + SKU.

> **Concluir recusa volume vazio (2026-11-18)** — a NF 150297 saiu Conferida com uma "Caixa 4" sem lançamento (ninguém viu; o volume vazio não entra na etiqueta nem na contagem de volumes, mas confunde quem olha Conferidos). `concluir` agora devolve 400 `volumes_vazios` (`[{id, rotulo}]`, rótulo igual ao das telas: "Caixa 2", "Fardo F-7", "Caixa OP N") e o conferente apaga pelo botão "Apagar volume" que já existia no web e no coletor, ou lança itens. Só backend — os dois clientes já mostram o `erro` do concluir em diálogo; sem APK novo.

> **Leitura em voo — aviso imediato e trava do mesmo código até a resposta (2026-11-18, APK 0.15.5)** — com a rede lenta o conferente ficava mirando a mesma barra achando que não leu; os 3 s de repetição do leitor/câmera venciam antes de o `bipar` responder e a peça entrava duas vezes. Em `registrarUm` (web e coletor): na leitura sai `toast.info("Lido SKU · registrando…", chave 'leitor')` e o código entra em `emVoo`; nova leitura do mesmo código é ignorada enquanto não há resposta; ao responder (ok ou erro) o código fica em `bloqueioCodigo` por `INTERVALO_REPETIR_MS` (3 s) a partir da resposta, e o toast vira o verde "+1" de sempre. Códigos diferentes continuam em rajada pela `filaBip`. Não pausa a câmera nem o leitor de propósito (cortaria a rajada). OP e modal de quantidade não mudaram.

> **Conferente move itens entre volumes + leitura repetida em 1 s (2026-11-20, APK 0.15.9)** — estão esquecendo de abrir a caixa nova. Botão **⇄ Mover itens** ao lado de "Volumes" na tela de conferência (web e coletor): marca lançamentos (inteiros) e manda para um volume existente ou **+ Novo volume** (nasce **aberto**, nome sugerido "Caixa N"); o destino vira o volume ativo. `POST /api/conferencia/pedidos/<id>/mover_lancamentos/` (conferente dono ou admin, só `conferindo`; mesmo corpo do mover do Pátio). A regra foi extraída para `_executar_mover(..., fechar_novo)` em `apps/conferencia/views.py`, usada também pelo mover de Conferidos (volume novo fechado) — OP não entra, origem vazia some, log `volumes_reorganizados` com `durante_conferencia`. Web reaproveita `MoverLancamentos` (props `mover` e `sugerirIdentificador`); coletor tem `ModalMover`. **`INTERVALO_REPETIR_MS` 3000 → 1000** (web e coletor; vale para câmera contínua, leitor DataWedge `same_barcode_timeout` e a trava pós-resposta da leitura em voo).

> **Multiplicador no botão Qtd (2026-11-20, APK 0.15.8)** — cada toque no **Qtd** da barra de bipagem (web e coletor) avança um passo: desligado → **Qtd** (âmbar, próxima leitura abre o modal, desarma sozinho — igual a antes) → **×2 → ×4 → ×6 → ×12** (azul, fixos em `MULTIPLICADORES`) → desligado. Com multiplicador cada leitura lança N direto pelo mesmo `bipar` (`registrarUm(cod, volume, qtd)`), sem modal, e **fica ligado** até tocar de novo; desliga sozinho ao trocar de volume ou sair da tela. Toast "+N SKU"; `itemPendente` prefere o item (G1/G2 com o mesmo código) onde N cabe inteiro; excesso → "Passa do pedido — nada foi lançado" (o backend já recusava). OP não muda. Só front.

> **Três pedidos do Pátio (2026-11-19, APK 0.15.6)** — (1) **Confirmar ao pegar + Devolver**: tocar num documento em "Disponíveis na sequência" (web e coletor) abre confirmação antes do `pegar` (bipar a nota continua direto — bipar é intencional); card Atribuído ganhou **Devolver** → `POST /api/conferencia/pedidos/<id>/devolver_atribuicao/` (conferente dono ou admin; só `atribuido` sem volume; volta a Selecionado **na mesma sequência**, sem conferente; log `atribuicao_devolvida` → "Devolvido pelo conferente" no Histórico). Vale para documento que o Pátio atribuiu também. (2) **Filtro na tela da sequência** (web `/supervisor/patio/[id]` e coletor): busca sem acento por nº/cliente/transportadora/conferente/pedidos de origem + chips de status com contagem; tudo local (a tela já recebe a sequência inteira), "N de M" quando filtrando. (3) **Mover itens entre volumes depois da conferência**: `POST /api/conferidos/<id>/mover_lancamentos/` `{volume_item_ids, destino: {volume_id} | {novo: {tipo, identificador}}}` (Sup. Pátio/admin; Conferido **ou** Aguardando fechamento; lançamento inteiro; volume de OP nem origem nem destino; origem vazia é apagada; log `volumes_reorganizados`; resposta traz `volumes`, `etiqueta_bloqueio` e `etiqueta_impressa`). Web: `components/pedidos/MoverLancamentos.tsx`, botão "⇄ Mover itens entre volumes" na linha aberta de Conferidos e no card de Fechamentos. A etiqueta já impressa fica velha — a tela manda reimprimir; volumes ≠ NF aparece sozinho pela regra existente. Só web de propósito.

> **CC-e: fila do SDE, sequência da SEFAZ e carta duplicada (2026-11-19, migration `carta_correcao.0003`)** — caso real da NF 152139: `EmitirCartaCorrecao` devolveu **10011** ("verifique o log do SDE" — SDE = serviço de documentos eletrônicos do Senior, não a SEFAZ) às 19:40 de 18/11, a carta foi autorizada pelo SDE às 08:49 do dia seguinte sem o Separa saber, foi apagada da E140CCE numa arrumação pelo banco, o Pátio corrigiu os volumes e o Separa regravou como sequência 1 → **10021** duplicata. Agora: (1) `classificar_rejeicao` — 10011 vira status **`aguardando_sde`** (não é final), 10021 vira "duplicata" explicada, prefixo Senior/SDE × SEFAZ; (2) **reconciliação com a E140CCE** (`reconciliar`, casamento por texto e, com reservas, por data/hora do evento): `seqeve`/`sitcce_senior`/`verificada_em` na carta, sitcce 3 → transmitida com protocolo, 4 → erro; roda em `preparar`, no beat `verificar_cartas_pendentes` (10 min, `apps/carta_correcao/tasks.py`) e em `POST /api/carta-correcao/pedidos/<id>/verificar/`; (3) **bloqueios de sequência** em preparar/executar/reenviar: `carta_pendente_senior` (E140CCE com sitcce 1/2), `carta_rejeitada_senior` (4/5), `carta_sumiu_senior` (carta do Separa com transmissão tentada que sumiu da E140CCE — apagar no Senior não desfaz o evento na SEFAZ); só carta **nunca** transmitida continua sendo "refeita" (`_cartas_apagadas`); (4) **Reenviar carta completa** (`POST …/reenviar/`, `montar_texto_completo`): carta nova repetindo transportadora/frete/volumes atuais + anteriores, mesmo sem mudança — é o acerto da 152139; (5) **Reimportar** (`POST /api/carta-correcao/cartas/<id>/reimportar/`): carta autorizada que sumiu volta via `Gravar` com `sitCce` 3 + `numPrt`/`datAut`/`horAut`; Django Admin permite editar só `status` (marcar incerta como erro_gravar); (6) Gestão → Cartas: filtro de texto na lista, sincronizado com a busca de cima, e status novo no seletor. Ajuda e `docs_pessoais/carta-correcao.html` §15 atualizados.

> **Relatório: Conferidos sem transportadora (2026-11-23)** — pedido do usuário: em Conferidos, a lista das notas que ainda precisam da transportadora (sem ela a etiqueta de volume não sai; em produção eram 58, 56 de entrega). Link **"Relatório sem transportadora"** no alto de Gestão → Conferidos → página `/supervisor/conferidos/sem-transportadora` (mesmo padrão do relatório da sequência: tabela + **Imprimir**). Duas seções: **Entrega — precisam de transportadora** (frete C) e **Retira ou sem frete** (à parte, não precisam); colunas documento (com "ped. N"/"NF N"), cliente, conferido em, conferente, volumes (com "(NF n)" em âmbar quando a nota tem outra quantidade — a mesma carta acerta os dois) e, **só no papel e só na entrega**, coluna "Transportadora" em branco para anotar; ordenação "Mais antigas" | "Cliente" no cliente. `GET /api/conferidos/sem_transportadora/` (supervisores/admin; `conferencia.views.relatorio_sem_transportadora`): antes de listar chama `senior.tasks.atualizar_transportadoras` — relê a transportadora no Senior (nota: E140NFV; pedido sem nota: E120PED) e preenche quem já tem, porque o `monitorar_cancelamentos` só olha Conferido dentro da janela do sync e nota antiga acertada direto no Senior ficaria na lista para sempre; não dispara etiqueta nem mexe em situação; Oracle fora → `senior_consultado: false` e aviso na tela. Resposta: `{gerado_em, senior_consultado, preenchidas_agora, documentos[]}`. A correção em si continua em Conferidos (filtro "Sem transportadora" → Corrigir NF). O cabeçalho do layout dos supervisores ganhou `print:hidden` (o menu não sai mais na impressão dos relatórios). Ajuda `supervisor-conferidos-sem-transportadora` (sem captura ainda). Só web.

> **CC-e: a autorização é conferida no eDocs, não na E140CCE (2026-11-23, decisão da chefia)** — o usuário de leitura do Oracle enxerga o banco do SDE (esquema `EDOCS_PROD_ERP`, `SENIOR_EDOCS_SCHEMA`): `N130ENF` (evento; `idevnt` = `ID110110` + chave + nº seq.; `codsta` = cStat, 135/136 = registrado; `prtsef`/`datsef` = protocolo/data) + `N130CCE` (`dsccor` = texto). Lá as 24 cartas "paradas" estavam **autorizadas na SEFAZ com protocolo** (~30 s depois do envio); quem não grava o retorno é o ERP (E140CCE fica "Não enviada" + linha 10) — **só nas cartas vindas do Separa (usuário 296), desde a primeira (17/11 — ver a nota de 2026-11-24)**; as digitadas no Senior seguem normais. Nenhum dos dois WS tem campo de sequência (`EmitirCartaCorrecao`: chvDoe, cnpjFil, codEmp, codFIl, codSnf, numNfv, datEve, horEve, desCor, tipGer; `Gravar` não devolve a sequência) — conferido no WSDL. Causa no ERP em aberto (o formato do texto está descartado — ver 2026-11-24). Código: `senior.cartas_anteriores` lê a E140CCE **e funde com o eDocs** (`eventos_edocs` + `_fundir_com_edocs`: evento autorizado → a linha do ERP com o mesmo protocolo ou texto vira Autorizada com protocolo do eDocs, `fonte: edocs`; evento sem linha no ERP entra como `so_no_edocs`); depois saem os ecos. `reconciliar`, bloqueios de sequência e texto das anteriores usam essa lista sem mudança; beat `verificar_cartas_pendentes` a cada **2 min** (era 10). eDocs fora → `edocs_disponivel: False` e segue só com a E140CCE. **Não retransmitir essas cartas pelo Senior** (a SEFAZ já tem a sequência → 10021). **Mesmo dia, 2ª rodada (restos de 18–19/11, NF 150297 e 152139)**: quando o evento do eDocs casa com a linha do ERP pelo protocolo e o texto difere (linha regravada no ERP), `texto` passa a ser o da SEFAZ e o do ERP fica em `texto_erp`; `reconciliar` marca como `erro_transmitir` ("Não consta na SEFAZ", limpa protocolo) a carta transmitida há mais de `MARGEM_AUSENTE_MIN` (30) que não casa com nenhuma linha quando o eDocs foi lido; `_cartas_sumidas` com eDocs = só carta que casa com evento autorizado **sem** linha na E140CCE (`so_no_edocs`) — sem eDocs vale a regra antiga. Simulação sobre as 71 cartas de produção: só mudam as 5 dessas duas notas (21 e 11 viram Transmitida com o protocolo real; 23, 26 e 28 viram erro) e a nota de teste 147911 (22/10) ganha o protocolo; nenhuma nota fica bloqueada. A 2ª carta de uma nota nesse estado volta 10021 (o Senior reenvia o evento nº 1) — NF 150786 em 23/11 17:58; bloqueada desde 2026-11-24.

> **CC-e: 2ª carta bloqueada enquanto o Senior não registra a 1ª (2026-11-24)** — a leitura pelo eDocs (23/11) passou a tratar como Autorizada a linha que o ERP mostra "Não enviada", e com isso o bloqueio `carta_pendente_senior` deixou de segurar a 2ª correção da mesma nota: na NF 150786 o `Gravar` trocou os volumes da nota (2 → 1) e o `EmitirCartaCorrecao` voltou **10021** (evento nº 1 de novo; a SEFAZ ficou com 2 volumes). Novo bloqueio em `bloqueio_por_cartas` (preparar/executar/reenviar): linha com `fonte` edocs e `sitcce_erp` ≠ 3 → **`carta_sem_retorno_senior`** ("já foi autorizada na SEFAZ, mas o Senior ainda a mostra como 'Não enviada'… avise a TI ou o fiscal"), com o link "Conferir de novo" na tela; 45 notas de produção ficam assim, nota cuja carta o ERP tem como Autorizada e nota só com carta digitada no Senior seguem livres. **Diagnóstico corrigido no mesmo dia**: nada mudou no Senior em 19/11 — o par `Gravar` + `EmitirCartaCorrecao` **sempre** deixou a linha do `Gravar` "Não enviada" + uma linha própria do Emitir (`usueve` 296) com situação 10; prova nas fotos `CartaCorrecao.cartas_anteriores` das cartas 18 (NF 150297, 18/11 16:21, que já voltou 10021) e 23 (NF 152139, 19/11 08:49). As cartas de 17/11 a 19/11 17:40 aparecem Autorizadas na E140CCE porque foram acertadas depois (antes de 19/11 17:51). Chamadas do Separa e respostas do WS idênticas em todo o período. Hipótese ainda não testada: transmitir sem o `Gravar` antes (o Senior numera o evento pelo que ele tem como autorizado). Sem migration; ajuda `supervisor-cartas` atualizada. Só backend + um link no web.

> **Etiqueta: "Todos / Só alguns" volumes sempre visível (2026-11-23, APK 0.15.12)** — a escolha de volumes só aparecia em reimpressão (`impressaEm` / `reimpressao`); impressão que dá erro no meio não fica `ok`, o botão continua "Etiqueta" e não havia como mandar só os volumes que faltaram. Agora o seletor aparece sempre no web (`ImprimirEtiqueta.tsx`) e no coletor (`EscolherImpressora.tsx`); o backend já aceitava `volumes` em qualquer impressão. Só front.

> **Leitura em dobro — documento fechava acima de 100% (2026-11-23, APK 0.15.11)** — a NF 150739 foi Conferida com 1329 de 1316. Causa: no modal de quantidade o Enter do leitor dispara `onSubmitEditing` duas vezes no mesmo instante, a guarda era o estado `enviando` (ainda não atualizado) e saíam **dois `bipar` idênticos com 8–300 ms**; no servidor a checagem de excesso lia sem trava e as duas passavam. 38 pares em produção desde 17/11 (a maioria dentro do limite do item — peça contada duas vezes sem ninguém ver); 3 itens acima do pedido (NF 150700 e 150739). Nada a ver com o cálculo de caixas. Correção: (1) `bipar` e `liberar_divergencia` travam a linha do item (`select_for_update`) e conferem o excesso de novo dentro da transação; (2) `bipar` ignora lançamento idêntico (mesmo item, volume, qtd) dentro de `JANELA_REPETICAO_MS` = 700 ms — responde `ok` com `repetida: true` sem lançar (protege APK antigo); leitura legítima do mesmo código leva > 1 s; (3) `ModalBipar` (web e coletor) com guarda síncrona `enviandoRef`. Os lançamentos em dobro antigos **não** foram corrigidos nos dados.

> **CC-e: "Transmitida" só com protocolo; situação 10 = erro; eco da transmissão (2026-11-23)** — caso NF 151214: desde 19/11 ~16:40 o `EmitirCartaCorrecao` deixa na E140CCE, além da carta do `Gravar`, uma **segunda linha idêntica com `sitcce` 10** (erro, confirmado pela Altomax), e desde 19/11 18:46 a sequência 1 ficou "Não enviada" em 24 notas — mas o WS respondia "autorizado com sucesso" (protocolo em branco) e o Separa marcava Transmitida. O Separa fez uma carta só por nota e as chamadas não mudaram; a causa está no Senior/SDE (em aberto com o fiscal). Agora: (1) `Transmitida` só com `numPrt` preenchido; resposta ok sem protocolo → `aguardando_sde` (`MSG_SEM_PROTOCOLO`); (2) o beat `verificar_cartas_pendentes` também revê `transmitida` sem protocolo, e `reconciliar` rebaixa para `aguardando_sde` (E140CCE 1/2) ou `erro_transmitir` (4/10) — as 24 se acertam sozinhas na primeira passada; (3) `senior.SITCCE_ERRO = 10` ("Erro"); `cartas_anteriores` separa os **ecos** (linha 10 com o mesmo texto de outra linha que não está em erro → `ecos_com_erro`, fora de sequência/bloqueio/texto das anteriores); linha 10 com texto próprio bloqueia como rejeitada; `_casar_com_senior` prefere a linha autorizada quando o texto se repete. Sem migration.

> **Caixa cheia na conferência (2026-11-23)** — medidas da derivação (E075DER COMDER/LARDER/ALTDER em cm, fallback para o tamanho base como o EAN) entram no sync dos itens em `PedidoItem.comprimento/largura/altura` (migration `pedidos.0022`); itens antigos: `manage.py preencher_medidas_itens [--todos]`. Volume da caixa padrão em `Configuracao.volume_caixa` (default `102396` cm³, Django Admin; migration `core.0015`). Regra em `apps/conferencia/caixas.py`. **Dois avisos**: (1) antes — o detalhe devolve `estimativa_caixas` (`soma(qtd_pedida × medidas) / volume_caixa`, `{caixas, itens_sem_medida}`); > 1 → faixa âmbar "📦 Mais de uma caixa" no "Pronto para iniciar" e sob a barra de progresso; (2) na hora — `bipar` devolve `ocupacao_volume` e, **só na leitura que faz o volume do tipo caixa passar de 1** (antes ≤ 1 < depois), `caixa_cheia: {ocupacao}` → diálogo "📦 Caixa cheia" com OK (web com bipes; coletor vibra e desliga o leitor contínuo). Fardo/outro e OP não entram; item sem medida conta 0. Log `item_bipado` leva `caixa_cheia`.

Atores principais: **Supervisor de Vendas**, **Supervisor de Pátio**, **Conferente** e **Admin**.

### Fluxo geral

```
1. [Senior]            Pedidos pendentes existem no Senior (Oracle, leitura).
2. [Sup. Vendas]       Sincroniza pedidos; seleciona quais entram para separação.
3. [Sup. Pátio]        Atribui cada pedido selecionado a um conferente específico.
4. [Conferente]        Lista pedidos atribuídos a ele → inicia conferência:
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
| Pedido | Unidade de venda originada no Senior; contém 1..N itens. Desde 2026-09 a tabela também guarda **notas fiscais** (`tipo='nota_fiscal'`) |
| Nota fiscal | NF de venda fechada (E140NFV); passa pelo mesmo fluxo de conferência que o pedido. Até 2026-11-05 só as sem pedido de origem; agora também as que saíram de pedido (`pedidos_origem`), menos o faturamento de pedido já em conferência |
| Volume | Embalagem física (caixa, fardo etc.) que agrupa parte dos itens separados de um pedido |
| OP (caixa/fardo) | Ordem de produção do Sisplan (fábrica), só dígitos sem tamanho fixo (sempre menos de 13, o tamanho do EAN), na etiqueta do volume fechado; uma OP = um volume, caixa ou fardo pelo produto (CODPRO[4:5] em RP/AL = fardo). Itens na view `REPORTS.USU_OP_PRODUTOS` |
| Código de barras do item | `PedidoItem.ean` = CODBAR da derivação → CODGTN → CODBAR do tamanho base (G1/G2/G60 → G). Até 2026-11-05 era só o CODBAR, e derivações como G1 (CODBAR 0) entravam sem código |
| Conferente | Usuário do sistema que confere por bipagem e monta volumes (era chamado de "separador" até o rename de 2026-08) |
| Separador | Trabalhador físico que separa a mercadoria no estoque — em geral extras; terá cadastro próprio sem login (Fase 2, ver `DESIGN.md`) |
| Conferência por bipagem | Conferente escolhe item, informa qtd e bipa o código de barras; sistema verifica se bate com o item esperado |
| Não conforme | Pedido com problema na conferência (qtd divergente, produto errado, item ausente) |
| Senior | ERP da empresa — fonte dos pedidos (Oracle, leitura) e destino do status pós-conferência (SOAP, escrita via WS a definir) |

---

## Atores e perfis

| Perfil | Permissões |
|---|---|
| **Supervisor de Vendas** | Lista pedidos pendentes do Senior; seleciona pedidos que vão para separação |
| **Supervisor de Pátio** | Lista pedidos selecionados; atribui cada pedido a um conferente |
| **Conferente** | Lista pedidos atribuídos a ele; executa conferência por bipagem em volumes |
| **Admin** | Tudo acima + cadastros, usuários, relatórios |

A autenticação associa usuário → perfil. Telas são filtradas pelo perfil.

---

## Estados do pedido

```
Pendente
  → [Sup. Vendas seleciona]   → Selecionado
  → [Sup. Pátio atribui]      → Atribuído
  → [Conferente inicia]       → Em conferência
  → [Conferente conclui]      → Conferido         (chama WS Senior)
                                ou
                                Aguardando fechamento  (sobra registrada; Sup. Pátio
                                                        fecha → Conferido + WS Senior)
                                ou
                                Não conforme       (entra na lista de exceções;
                                                    faltas viram ErroSeparacao)
  → [Senior cancela]          → Cancelado          (a qualquer momento após Selecionado;
                                                    volumes ficam; Sup. Pátio pode
                                                    transferir a conferência ao doc. novo)
```

Cores sugeridas no front:
- Pendente — **cinza**
- Selecionado — **laranja**
- Atribuído — **amarelo**
- Em conferência — **azul**
- Aguardando fechamento — **roxo/violeta**
- Conferido — **verde**
- Não conforme — **vermelho**
- Cancelado — **vermelho** (tela bloqueante no conferente)

Toda transição grava em `PedidoLog` (quem, quando, ação, payload).

---

## Fluxo 1 — Supervisor de Vendas

1. **Lista de pedidos pendentes**
   - Sincroniza com o Senior (snapshot no Postgres local).
   - Filtros: data, cliente, número.
2. **Selecionar pedidos**
   - Multi-seleção via checkbox.
   - Botão "Enviar para separação" → status `Selecionado`, registra `selecionado_em`/`selecionado_por`.
   - **Colar lista** (2026-11-13): cola a relação de NFs recebida de outro setor (ou abre .txt); o que não está no Separa vem do Senior na hora; pendentes já marcadas. Busca vazia com número tem "Buscar N no Senior".

---

## Fluxo 2 — Supervisor de Pátio

1. **Montar sequências** (Fase 3)
   - Pedidos `Selecionado` sem sequência entram em **sequências de separação** (criar nova ou adicionar a uma aberta).
   - Tudo passa por sequência — a atribuição direta antiga foi desativada.
2. **Atribuir dentro da sequência** (opcional desde 2026-10-05)
   - Na tela da sequência, escolher pedidos (multi-seleção) e um conferente ativo — quando a supervisora quer decidir quem pega o quê. O que ficar sem conferente pode ser **pego pelo próprio conferente bipando a nota** (ponto 4).
   - Status passa para `Atribuído`, registra `atribuido_em`/`atribuido_por`/`conferente`; reatribuir e remover são permitidos até o pedido entrar em conferência.
3. **Trava do conferente**
   - O conferente só confere pedidos da sua sequência ativa (a mais antiga com pendências dele); a liberação da próxima é configurável (`ao_terminar_meus_pedidos` default | `ao_concluir_sequencia_inteira`).
4. **Separadores do dia** — mantém a liberação diária (Fase 2).

---

## Fluxo 3 — Conferente

1. **Lista "Atribuídos a mim"**
   - Pedidos com status `Atribuído` ou `Em conferência` cujo `conferente` é o usuário logado.
   - FIFO por `atribuido_em`.
   - **Barra de bipagem da nota** (sempre focada, recebe o leitor do coletor): chave do DANFE ou número → abre o pedido se já é dele, ou **pega** um pedido sequenciado sem conferente. Abaixo da lista, "Disponíveis na sequência N" (toque = pegar).
2. **Selecionar pedido**
   - Status passa para `Em conferência` na primeira ação relevante (abrir volume).
3. **Tela de conferência**
   - Header: número do pedido, cliente, contagem de itens (qtd_separada / qtd_pedida agregada), botão fixo "**Novo volume**".
   - Lista de itens do pedido: SKU, descrição, qtd_pedida, qtd_separada.
   - Painel "Volume atual": tipo, identificador, lista de itens já alocados nele.
4. **Abrir primeiro volume**
   - Tipo: caixa / fardo / outro (string livre por enquanto, mapeamento Senior TBD).
   - Identificador opcional (texto livre).
5. **Bipar item**
   - **Desde 2026-11-05 (pedido do Sup. Pátio): bipar na barra registra 1 unidade direto** (sem modal; leituras em fila, toast verde "+1 SKU"). O botão **Qtd** da barra arma só a próxima leitura para abrir o modal de quantidade (barra âmbar; desarma sozinho). Tocar no item da lista continua abrindo o modal.
   - **Caixa ou fardo fechado da fábrica (2026-11-05)**: bipar a **OP do Sisplan (só dígitos, menos de 13 — sem tamanho fixo desde 2026-11-06)** consulta a view `REPORTS.USU_OP_PRODUTOS` (OP, CODPRO, CODBAR, TAM, QTD; uma OP = um volume) e compara o volume inteiro com o que falta (CODBAR da OP × `PedidoItem.ean`; sem código, produto + tamanho base). Bateu → volume "OP N" **já fechado** com os lançamentos (`Volume.op`, migration `pedidos.0018`), **caixa ou fardo conforme o produto** (desde 2026-11-09: posições 4-5 do CODPRO em RP/AL = fardo, senão caixa; só o primeiro item da OP); não bateu → bloqueia sem lançar nada e lista o que diverge; OP já lida (fora de documento Cancelado) → bloqueia. Mesmo código em G1 e G2 → enche o primeiro e passa ao próximo. "Desfazer OP" apaga o volume e devolve as quantidades. `POST /api/conferencia/pedidos/<id>/fardo/`, regra em `apps/conferencia/fardo.py`. A barra de bipagem aparece mesmo sem volume aberto.
   - No modal: informa **quantidade** que está colocando no volume atual.
   - Bipa o código de barras → sistema valida:
     - Match (EAN/SKU bate com o item escolhido) → soma a qtd ao item, feedback verde + som curto.
     - Mismatch → feedback vermelho, não soma, log.
     - Excesso (`qtd_separada` ficaria > `qtd_pedida`) → bloqueia ou pede confirmação.
6. **Novo volume** (botão sempre disponível)
   - Pode abrir outro volume sem precisar fechar o atual (a confirmar se múltiplos volumes podem ficar simultaneamente abertos).
7. **Concluir conferência**
   - Habilita quando `qtd_separada == qtd_pedida` para todos os itens.
   - Chama WS Senior (a definir) com a lista de volumes.
   - Sucesso → `Conferido`.
   - Falha no WS → registra erro, mantém `Em conferência`, alerta admin.
   - **Etiqueta de volume**: ao virar Conferido, imprime 1 etiqueta 10x15 por volume na impressora padrão (só com transportadora, NF emitida e, desde 2026-11-09, volumes iguais aos da NF — senão espera a carta de correção); a resposta traz `etiqueta` com o veredito e a tela avisa o conferente.
8. **Marcar como Não conforme**
   - Botão alternativo a "Concluir".
   - Conferente escolhe motivo: divergência de quantidade, produto errado, item ausente.
   - Status passa para `Não conforme` com payload do motivo.

---

## Fluxo 4 — Lista de Não Conformes

- Página separada (admin/supervisor de pátio). Mostra pedidos `Não conforme` com motivo, conferente, data.
- Ações **a definir** (placeholder no MVP): cancelar pedido, retornar para fila de atribuição, escalar.

---

## Telas (mínimo viável)

1. **Login**
2. **Sup. Vendas — Lista (a selecionar)**
3. **Sup. Pátio — Lista (a atribuir)** + dropdown de conferente
4. **Conferente — Lista (atribuídos a mim)**
5. **Conferente — Conferência por bipagem (volumes)**
6. **Lista de Não Conformes** (com placeholder de ações)
7. **Admin** (cadastros, usuários — futuro)

Todas mobile-first (coletor Android com leitor embutido). Campo de bipagem sempre em foco; alvos de toque ≥ 44px; alto contraste.

---

## Modelo de dados (proposta)

```
User(id, username, perfil, ...)
  perfil: conferente | supervisor_vendas | supervisor_patio | admin
          (+ etiquetador, congelado)

Pedido(id, tipo, numero_externo, codfil, codsnf, frete, codtra, transportadora,
       nf_codfil, nf_codsnf, nf_numero, nf_vinculada_em,      # NF emitida a partir do pedido (E140IPV)
       nf_chave, nf_volumes,                                  # chave do DANFE + qtdemb da NF (etiqueta, 2026-11-09)
       status, criado_em, cliente,
       selecionado_em, selecionado_por_id,
       atribuido_em, atribuido_por_id, conferente_id,
       conferencia_iniciada_em,
       conferido_em,
       senior_atualizado_em, senior_tentativas, senior_ultimo_erro,
       nao_conforme_em, nao_conforme_motivo, nao_conforme_detalhe,
       cancelado_em, cancelado_origem, status_anterior, transferido_para_id)

PedidoItem(id, pedido_id, sku, descricao, ean, qtd_pedida, qtd_separada, status)

Volume(id, pedido_id, tipo, identificador,
       criado_em, criado_por_id, fechado_em)

VolumeItem(id, volume_id, pedido_item_id, qtd, criado_em)

PedidoLog(id, pedido_id, user_id, acao, payload, criado_em)

ImpressaoEtiqueta(id, pedido_id, impressora_id, canal, status, qtd_etiquetas,
                  automatica, usuario_id, print_job_id, erro, criado_em)   # apps/impressao

CartaCorrecao(id, pedido_id, usuario_id, modo, status, nf_codfil/nf_codsnf/nf_numero,
              codtra/transportadora/frete antes e depois, volumes antes e depois,
              texto, complemento, cartas_anteriores, payload/retorno de Gravar e Transmitir,
              erro, sitdoe, protocolo, autorizada_em, criado_em)              # apps/carta_correcao
```

> O `Pedido` ganha campos novos (`selecionado_em`, `atribuido_para_id`, etc.) e perde a relevância dos campos de etiquetagem (`embalagem_*`, `etiqueta_vtex_*`, `etiqueta_impressa_em`) para o fluxo principal — esses ficam no schema (módulos congelados) mas não são tocados.

---

## Integrações

- **Senior (Oracle, leitura)** — origem dos pedidos e das NFs sem pedido de origem. Read-only. Celery Beat a cada 2 min (`sincronizar_pedidos_oracle`), janela configurável; a cada 60 s `monitorar_cancelamentos` reconsulta `sitped`/`sitnfv` dos documentos em andamento (Pendentes só dentro da janela; `manage.py monitorar_cancelamentos --completa` para a passada total); a cada 5 min `vincular_nfs_pedidos` descobre pela E140IPV a NF emitida de cada pedido em andamento ou Conferido dentro da janela (`Pedido.nf_*`; o botão Corrigir NF faz a mesma consulta na hora, sem janela).
  - Critério de "pedido pendente" no Oracle: a definir (filtros, status, empresa).
- **Senior (SOAP, escrita)** — atualizar volumes após separação.
  - **WS exato a definir.** Tipicamente espera identificador do pedido + lista de volumes (tipo + qtd_itens? a confirmar).
  - Idempotência por `numero_externo`; backoff em falha; alertar admin após N tentativas.

VTEX, CLICK, marketplaces e o `embalagempfa` **saíram do escopo** — ver "Módulos congelados".

---

## Stack (mantida)

| Camada | Tecnologia |
|---|---|
| Frontend | **Next.js** (App Router) + **Zustand** (só sessão/tema; dado de tela é `useState` + re-fetch) |
| UI | Mobile-first; Tailwind/shadcn |
| Backend | **Django REST Framework** |
| Auth | **JWT** (`djangorestframework-simplejwt`) |
| Banco local | **PostgreSQL** |
| Banco origem (read-only) | **Oracle** (Senior) |
| Tempo real | WebSocket via Django Channels (ou polling curto) |
| Observabilidade | logs JSON (stdout) · `/api/health/` + healthchecks · `ExecucaoTarefa`/`ErroCliente` · django-prometheus `/metrics/` · Prometheus/Grafana/Loki na stack `mp-*` da VM |
| Containers | Docker + docker-compose |
| Hospedagem | VM Linux em Proxmox |

### Estrutura de repositório

```
separa/
├── backend/
│   ├── apps/
│   │   ├── core/           # User, perfis, auth, Configuracao; observabilidade: logging, health/saúde, ExecucaoTarefa, ErroCliente
│   │   ├── pedidos/        # Pedido, PedidoItem, Volume, VolumeItem, PedidoLog + ações dos supervisores; historico.py e agora.py (observabilidade)
│   │   ├── conferencia/    # fluxo do conferente (bipagem em volumes + não conformes)
│   │   ├── separadores/    # cadastro de separadores físicos + liberação diária
│   │   ├── sequencias/     # sequências de separação (fluxo do Sup. Pátio)
│   │   ├── senior/         # leitura Oracle + saída SOAP (operação a definir)
│   │   ├── impressao/      # etiqueta de volume 10x15: dados, ZPL, impressão automática, pendentes
│   │   ├── carta_correcao/ # CC-e: troca de transportadora da NF via WS Senior (Gravar / EmitirCartaCorrecao), dry-run
│   │   ├── app_mobile/     # distribuição do APK: publicar, /apk/ (download), /api/app/versao/ (aviso no app), inventário
│   │   ├── etiquetas/      # CONGELADO — mas Impressora/PrintAgent/PrintJob e printer.py são reaproveitados pela impressao
│   │   └── vtex/           # CONGELADO — VTEX API
├── agente/                 # SeparaAgente.exe — agente de impressão USB para o PC da Zebra (Windows, serviço) (2026-11-11)
├── frontend/
│   ├── content/ajuda/      # manual embutido: um AjudaTela por tela + README (guia de estilo) (2026-10-29)
│   ├── public/manual/      # capturas das telas usadas no manual
│   ├── app/
│   │   ├── (conferente)/   # conferencia/ (atual) + pedidos/ (LEGADO congelado)
│   │   ├── (impressao)/    # etiquetas/[id] — etiqueta 10x15 pelo navegador (sem header)
│   │   ├── (publico)/      # ajuda/ — manual do usuário (sem login) (2026-10-29)
│   │   ├── (supervisor)/   # telas de Sup. Vendas, Sup. Pátio, conferidos, não conformes, etiquetas, agora, cartas (CC-e)
│   │   ├── (admin)/
│   │   │   └── admin/
│   │   │       ├── saude/         # Admin → Saúde: componentes, heartbeat das tarefas, erros do web/coletor (2026-10-08)
│   │   │       ├── app/           # Admin → App do coletor: publicar APK, link de download, inventário de versões (2026-10-28)
│   │   │       ├── impressoras/   # cadastro das impressoras + impressora padrão da etiqueta (voltou ao menu em 2026-10-07)
│   │   │       └── agents/        # agentes USB (voltou ao menu em 2026-10-07)
│   │   └── (etiquetador)/  # CONGELADO — fora do menu
├── mobile/                 # app React Native (Expo) — paridade de telas com o web
├── deploy/monitoramento/   # Loki/Promtail, scrape job do backend, alertas sugeridos — para a stack mp-* da VM (fora do compose do Separa)
└── docker-compose.yml
```

---

## Princípios de UI

- **Mobile-first**: validar a 360px antes de pensar em desktop.
- **Alvos de toque** ≥ 44px.
- **Foco no input de bipagem** sempre que a tela de conferência estiver visível.
- **Cores fortes** para status (paleta acima).
- **Operação com uma mão** — conferente segura o coletor; UI cabe na metade superior da tela.

---

## Requisitos não-funcionais

- Tempo real nas listas (Sup. Pátio precisa ver imediatamente o que Sup. Vendas selecionou; Conferente idem).
- Auditoria: toda transição grava em `PedidoLog`.
- Idempotência no WS Senior (não mandar duas vezes).
- Resiliência: conferente não perde progresso de conferência se cair a rede.

---

## Módulos congelados (não apagar)

Estes módulos foram desenvolvidos para o escopo anterior (expedição multi-marketplace com etiquetagem VTEX) e permanecem no código **preservados, fora do menu/navegação atual**:

- `apps/etiquetas/` — Lote, LotePedido, EtiquetaVtex (congelados). **Exceção desde 2026-10-07**: `Impressora`, `PrintAgent`, `PrintJob`, `printer.py` e as rotas do agente/CRUD de impressoras voltaram ao uso pela etiqueta de volume (`apps/impressao`) — continuam sem alteração, só são importados.
- `apps/vtex/` — integração com VTEX API (resgate de etiquetas).
- `apps/senior/soap.py` — operação `Gerar` do `embalagempfa` (cliente SOAP base pode ser reaproveitado, a operação específica não).
- Frontend: `app/(etiquetador)/` (congelado). `app/(admin)/admin/impressoras/` e `app/(admin)/admin/agents/` voltaram ao menu do admin em 2026-10-07 (cadastro das impressoras da etiqueta de volume).

Não tocar nesses arquivos durante o trabalho do escopo atual. Podem voltar ao fluxo principal mais tarde.

---

## Pontos abertos

> **2026-08**: o redesenho está com a espec **fechada** — todas as pendências resolvidas; ver `DESIGN.md`.

- [ ] Nome e contrato do **WS Senior** para atualizar volumes pós-separação
- [ ] Como o Senior identifica os tipos de volume (caixa/fardo/outro) — código próprio? string livre?
- [ ] Critério no Oracle para "pedido pendente" (filtros, status, empresa) — possivelmente diferente do critério usado antes (CODEMP=8 era para o fluxo marketplace)
- [x] ~~Comportamento quando a separação termina parcial~~ — resolvido no redesenho (`DESIGN.md` §4.2): falta → Não conforme + erro registrado; sobra → conclui com erro registrado e fechamento pelo Sup. Pátio
- [ ] Lista completa de ações disponíveis na lista de Não Conformes
- [x] ~~Nota cancelada no Senior durante a conferência~~ — detectada pelo beat, bloqueio no conferente e transferência de conferência pelo Sup. Pátio (2026-09-30)
- [x] ~~Ponto 6 — troca de transportadora com carta de correção~~ — implementado em 2026-10-22 em `apps/carta_correcao` (dry-run ligado). Na tarde de 22/10 passou a valer também para pedido já faturado (vínculo pedido → NF pela E140IPV) e a corrigir a quantidade de volumes (`qtdEmb`). Dry-run desligado em produção e primeiro `Gravar` real (volumes) feito em 22/10 à noite. Ficam abertos: primeira troca real de transportadora/frete; transmissão pelo Separa (`gravar_e_transmitir`) depende da parametrização da F070FVE (`tipGer`)
- [ ] Ponto 8 — liberação de exceção com mensageria — espera as respostas do supervisor (ver abaixo)
- [x] ~~Ponto 7 — etiqueta de caixa~~ — implementado em 2026-10-07 como **etiqueta de volume 10x15** (não existia etiqueta; era pincel + carta de transporte). Ficam abertos: modelo/quantidade/local das impressoras (todos os caminhos prontos: Zebra rede, agente USB, navegador); dados do cliente além do nome (sync não traz endereço/CNPJ)
- [ ] Ponto 8 — leitura do supervisor em 2026-10-07: o conferente faz a operação "não permitida" no coletor, o sistema **só persiste se o supervisor liberar**, em lote (fila de aprovação assíncrona; a mensageria é o aviso). Falta definir quais operações entram (barra divergente, excesso/item completo, concluir com falta), se o conferente fica travado, e o canal
- [x] ~~Ponto 5 — avisar quantidade incorreta~~ — fechado em 2026-10-06 sem implementar: bloqueio de excesso na bipagem + sobra/falta no concluir já atendem
- [x] ~~Ponto 1 — notificação para parar separação de nota~~ — fechado em 2026-10-06 sem implementar: o cancelamento no Senior (ponto 9) já bloqueia o conferente automaticamente; um "parar" manual só repetiria isso
- [x] ~~Ponto 4 — campo para o conferente selecionar a nota~~ — diretoria escolheu a leitura B em 2026-10-05; implementado como pull dentro da sequência (bipar a nota pega o pedido sem conferente; atribuição do Pátio continua existindo, opcional)
- [x] ~~Ponto 3 — prioridade por transportadora~~ — respondido e implementado em 2026-10-05: fila do Sup. Pátio (`?ordem=transportadora`) ordenada pela transportadora com mais notas/pedidos, com cabeçalho de grupo no web e no mobile; valor não conta. Falta só deploy + APK
- [ ] Múltiplos volumes podem ficar abertos simultaneamente, ou só um por vez?
- [ ] Bipar item para um item já completo (`qtd_separada == qtd_pedida`) — bloqueia ou avisa?
- [ ] Senior tem cadastro de "embalagem"? Os tipos de volume vêm de lá ou são livres no nosso lado?
- [ ] Cadência de sincronização Senior → Postgres da lista de pendentes
- [x] ~~Valor de produção da janela do sync~~ — 5 dias (2026-09-09)
- [x] ~~Significado de `CIFFOB='X'` e regra entrega × retira~~ — X = sem frete; entrega × retira é só filtro na tela do Sup. Vendas (2026-09-09)

---

## Roadmap (novo escopo)

> **2026-08**: as Fases A–F abaixo estão **concluídas** (detalhes em `STATUS.md`). O roadmap vigente é o do **redesenho 2026-08**, em `DESIGN.md`: 1) rename separador→conferente ✅ · 2) cadastro de Separador + liberação diária ✅ · 3) sequências ✅ · 4) divergência de barra + erro de separação + relatório agrupado ✅ (todas 2026-08-27) · 5) APK novo + deploy coordenado · 6) futuros (finalizar sem conferência, DOM, Sisplan, imagens).

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
- **Observabilidade (2026-10-08)**: task Celery nova leva `@shared_task` + `@registrar_execucao()`; logs com `logger.info(msg, extra={...})` (vira JSON em prod); não precisa de try/catch só para relatar erro no web/mobile — `error.tsx`/`ErroReporter`/`ErrorBoundary` já mandam para `/api/erros-cliente/`.
- **Mensagens: toast, não texto solto (2026-11-05)** — aviso sem resposta é `useToast().ok/erro/aviso/info(titulo, {detalhe, codigo, chave})` (`components/Toast.tsx` no web e no mobile); confirmação continua `useDialog().confirm`. Nunca mensagem no placeholder da barra de bipagem (ilegível no coletor): leitor usa `toast.erro(msg, {codigo, chave: 'leitor'})` e a barra só pisca. Lista com busca vazia mostra `<OndeEsta>` (`GET /api/pedidos/localizar/`).
- **Zustand só para sessão e tema** (`authStore`, `themeStore`). Dado de tela é `useState` local + re-fetch (`carregar()`) após cada mutação — sem store de dados, sem cache. O `pedidosStore` é exclusivo do fluxo legado congelado `/pedidos`; não imitar. (Decisão registrada em 2026-08-31; o padrão existe desde o primeiro commit do fluxo novo.)
- **Mobile-first sempre**: validar a 360px antes de pensar em desktop.
- **Tudo em Docker**: novas dependências entram via `docker-compose.yml`.
- **Oracle é read-only**: nenhum INSERT/UPDATE/DELETE no Senior.
- **Não apagar nada** dos módulos congelados (etiquetagem/VTEX/embalagempfa) — apenas não usar no fluxo atual.
- Antes de criar nova stack/dependência, perguntar.
