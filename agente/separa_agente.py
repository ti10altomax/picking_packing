# -*- coding: utf-8 -*-
"""Agente de impressão USB do Separa (Windows).

Roda no PC onde a Zebra está plugada por cabo USB. Em loop:

  1. avisa que está vivo  — POST /api/etiquetas/agents/heartbeat/  (a cada minuto)
  2. puxa a fila          — GET  /api/etiquetas/agents/jobs/        (a cada poucos segundos)
  3. imprime cada job RAW na fila de impressão do Windows (driver ZDesigner ou
     "Generic / Text Only") e espera o job sair do spooler
  4. confirma             — POST /api/etiquetas/agents/jobs/<id>/ack/  ({erro: ""} ou o motivo)

O servidor só marca a etiqueta como impressa quando o `ack` chega sem erro
(`apps/impressao/signals.py`). Impressora desligada/offline/sem papel → o agente
não pega os jobs (ficam pendentes no servidor e saem quando ela voltar); fila do
Windows inexistente ou job que não saiu no prazo → `ack` com erro e o pedido volta
para Gestão → Etiquetas com o motivo.

Uso (console; instalar/remover o serviço pede "Executar como administrador"):

  SeparaAgente.exe registrar            registra este PC no servidor e grava o token no agente.ini
  SeparaAgente.exe impressoras          lista as filas de impressão do Windows
  SeparaAgente.exe teste [nome]         imprime uma etiqueta de teste
  SeparaAgente.exe status               configuração, servidor, impressora e serviço
  SeparaAgente.exe rodar                roda em primeiro plano (Ctrl+C para sair)
  SeparaAgente.exe instalar | remover   serviço do Windows "SeparaAgente" (início automático)
  SeparaAgente.exe iniciar | parar | reiniciar

Configuração em `agente.ini` ao lado do executável (ver agente.ini.exemplo).
Um agente pode atender mais de uma impressora do Separa: a seção [impressoras]
mapeia o id da impressora no Separa → nome da fila no Windows.
"""
from __future__ import annotations

import configparser
import datetime as dt
import http.client
import json
import logging
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from logging.handlers import TimedRotatingFileHandler
from typing import Any

VERSAO = '1.0.0'
NOME_SERVICO = 'SeparaAgente'
NOME_EXIBICAO = 'Separa - Agente de impressão USB'
DESCRICAO_SERVICO = 'Imprime as etiquetas de volume do Separa na Zebra USB deste computador.'
ARQUIVO_INI = 'agente.ini'
ARQUIVO_LOG = 'agente.log'
URL_PADRAO = 'http://192.168.1.199:8003'

# Constantes do spooler (winspool.h). O win32print expõe quase todas, mas o valor
# numérico aqui evita depender da versão do pywin32.
PRINTER_ATTRIBUTE_WORK_OFFLINE = 0x400
PRINTER_STATUS = {
    0x1: 'fila pausada',
    0x2: 'erro na impressora',
    0x8: 'etiqueta presa (atolamento)',
    0x10: 'sem etiquetas (papel)',
    0x40: 'problema no papel',
    0x80: 'offline',
    0x1000: 'não disponível',
    0x40000: 'sem ribbon',
    0x100000: 'precisa de intervenção',
    0x400000: 'tampa aberta',
}
PRINTER_STATUS_BLOQUEIA = 0x1 | 0x2 | 0x8 | 0x10 | 0x40 | 0x80 | 0x1000 | 0x100000 | 0x400000
JOB_STATUS = {
    0x1: 'job pausado',
    0x2: 'erro no job',
    0x20: 'impressora offline',
    0x40: 'sem etiquetas (papel)',
    0x200: 'job bloqueado na fila',
    0x400: 'precisa de intervenção',
}
JOB_STATUS_FALHA = 0x2 | 0x20 | 0x40 | 0x200 | 0x400
JOB_CONTROL_DELETE = 5


# ---------------------------------------------------------------------------
# Caminhos e configuração
# ---------------------------------------------------------------------------

def _tupla(versao: str) -> tuple[int, ...]:
    try:
        return tuple(int(p) for p in str(versao).strip().split('.'))
    except ValueError:
        return (0,)


def pasta_base() -> str:
    """Pasta do executável (congelado) ou do script — é onde ficam o .ini e o .log."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


class Config:
    def __init__(self, caminho: str):
        self.caminho = caminho
        self.cp = configparser.ConfigParser(interpolation=None)
        self.cp.read(caminho, encoding='utf-8')

    @classmethod
    def carregar(cls) -> 'Config':
        return cls(os.path.join(pasta_base(), ARQUIVO_INI))

    def _get(self, secao, chave, padrao=''):
        return self.cp.get(secao, chave, fallback=padrao).strip()

    def _int(self, secao, chave, padrao):
        try:
            return int(self._get(secao, chave, str(padrao)))
        except ValueError:
            return padrao

    @property
    def url(self) -> str:
        return (self._get('servidor', 'url', URL_PADRAO) or URL_PADRAO).rstrip('/')

    @property
    def token(self) -> str:
        return self._get('servidor', 'token')

    @property
    def nome_windows(self) -> str:
        return self._get('impressora', 'nome_windows')

    @property
    def intervalo_jobs(self) -> int:
        return max(self._int('agente', 'intervalo_jobs', 3), 1)

    @property
    def intervalo_heartbeat(self) -> int:
        return max(self._int('agente', 'intervalo_heartbeat', 60), 10)

    @property
    def confirmar_saida_s(self) -> int:
        return max(self._int('agente', 'confirmar_saida_s', 60), 5)

    @property
    def log_dias(self) -> int:
        return max(self._int('agente', 'log_dias', 14), 1)

    def nome_para(self, impressora_id) -> str:
        """Fila do Windows para a impressora `impressora_id` do Separa: [impressoras]
        tem prioridade; senão a padrão em [impressora] nome_windows."""
        if self.cp.has_section('impressoras'):
            nome = self.cp.get('impressoras', str(impressora_id), fallback='').strip()
            if nome:
                return nome
        return self.nome_windows

    def filas(self) -> set[str]:
        nomes = {self.nome_windows} if self.nome_windows else set()
        if self.cp.has_section('impressoras'):
            nomes |= {v.strip() for _k, v in self.cp.items('impressoras') if v.strip()}
        return nomes

    def salvar_token(self, token: str, url: str | None = None):
        if not self.cp.has_section('servidor'):
            self.cp.add_section('servidor')
        self.cp.set('servidor', 'token', token)
        if url:
            self.cp.set('servidor', 'url', url)
        with open(self.caminho, 'w', encoding='utf-8') as f:
            self.cp.write(f)

    def resumo(self) -> str:
        tok = self.token
        tok_txt = f'{tok[:8]}… ({len(tok)} caracteres)' if tok else '(vazio — rode "registrar")'
        linhas = [
            f'arquivo        : {self.caminho}{"" if os.path.exists(self.caminho) else "  (NÃO EXISTE)"}',
            f'servidor       : {self.url}',
            f'token          : {tok_txt}',
            f'fila padrão    : {self.nome_windows or "(vazia)"}',
        ]
        if self.cp.has_section('impressoras'):
            for k, v in self.cp.items('impressoras'):
                linhas.append(f'impressora {k:>4} : {v}')
        linhas.append(
            f'intervalos     : jobs {self.intervalo_jobs}s · heartbeat {self.intervalo_heartbeat}s · '
            f'confirmar saída {self.confirmar_saida_s}s · log {self.log_dias} dias'
        )
        return '\n'.join(linhas)


# ---------------------------------------------------------------------------
# Log
# ---------------------------------------------------------------------------

def montar_log(cfg: Config | None, console: bool) -> logging.Logger:
    log = logging.getLogger('separa.agente')
    log.setLevel(logging.INFO)
    if log.handlers:
        return log
    fmt = logging.Formatter('%(asctime)s %(levelname)-7s %(message)s', '%Y-%m-%d %H:%M:%S')
    try:
        h = TimedRotatingFileHandler(
            os.path.join(pasta_base(), ARQUIVO_LOG), when='midnight',
            backupCount=cfg.log_dias if cfg else 14, encoding='utf-8',
        )
        h.setFormatter(fmt)
        log.addHandler(h)
    except OSError as e:  # pasta sem permissão de escrita — segue só no console/evento
        print(f'aviso: não deu para abrir o {ARQUIVO_LOG}: {e}', file=sys.stderr)
    if console:
        c = logging.StreamHandler(sys.stdout)
        c.setFormatter(fmt)
        log.addHandler(c)
    return log


class LogSemRepetir:
    """Mesma mensagem (por chave) só volta ao log quando muda ou depois de `a_cada` s —
    para a impressora offline ou o servidor fora não encherem o arquivo a cada 3 s."""

    def __init__(self, log: logging.Logger, a_cada: int = 300):
        self.log = log
        self.a_cada = a_cada
        self._ultimo: dict[str, tuple[str, float]] = {}

    def __call__(self, chave: str, nivel: int, msg: str):
        agora = time.monotonic()
        ant = self._ultimo.get(chave)
        if ant and ant[0] == msg and agora - ant[1] < self.a_cada:
            return
        self._ultimo[chave] = (msg, agora)
        self.log.log(nivel, msg)

    def limpar(self, chave: str) -> bool:
        """Esquece a chave; True se havia algo (= a condição ruim acabou de passar)."""
        return self._ultimo.pop(chave, None) is not None


# ---------------------------------------------------------------------------
# Servidor (API do agente — token próprio, sem login)
# ---------------------------------------------------------------------------

class ErroServidor(Exception):
    pass


class Servidor:
    def __init__(self, url: str, token: str = ''):
        self.url = url.rstrip('/')
        self.token = token

    def _req(self, metodo: str, caminho: str, dados=None, auth=True, timeout=15):
        corpo = json.dumps(dados).encode('utf-8') if dados is not None else None
        req = urllib.request.Request(self.url + caminho, data=corpo, method=metodo)
        req.add_header('Content-Type', 'application/json')
        req.add_header('Accept', 'application/json')
        req.add_header('User-Agent', f'SeparaAgente/{VERSAO}')
        if auth:
            if not self.token:
                raise ErroServidor('sem token — rode "SeparaAgente.exe registrar"')
            req.add_header('Authorization', f'Token {self.token}')
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                texto = r.read().decode('utf-8', errors='replace')
        except urllib.error.HTTPError as e:
            detalhe = e.read().decode('utf-8', errors='replace')[:300]
            if e.code == 401:
                raise ErroServidor(f'token recusado pelo servidor (401): {detalhe}') from e
            raise ErroServidor(f'HTTP {e.code} em {caminho}: {detalhe}') from e
        except urllib.error.URLError as e:
            raise ErroServidor(f'servidor {self.url} inacessível: {e.reason}') from e
        except (socket.timeout, TimeoutError) as e:
            raise ErroServidor(f'servidor {self.url} não respondeu em {timeout}s') from e
        except (http.client.HTTPException, OSError) as e:  # conexão fechada no meio, reset etc.
            raise ErroServidor(f'falha de conexão com {self.url}: {e.__class__.__name__}: {e}') from e
        if not texto:
            return None
        try:
            return json.loads(texto)
        except json.JSONDecodeError as e:
            raise ErroServidor(f'resposta inesperada em {caminho}: {texto[:200]}') from e

    def saude(self) -> Any:
        return self._req('GET', '/api/health/', auth=False, timeout=8) or {}

    def versao_publicada(self) -> Any:
        """Versão do agente publicada em Admin → Agente de impressão (`/agente/`), ou None."""
        return self._req('GET', '/api/impressao/agente/versao/', auth=False, timeout=8) or {}

    def registrar(self, hostname: str) -> dict:
        return self._req('POST', '/api/etiquetas/agents/registrar/',
                         {'hostname': hostname, 'versao': VERSAO}, auth=False)

    def heartbeat(self):
        return self._req('POST', '/api/etiquetas/agents/heartbeat/', {'versao': VERSAO})

    def jobs(self) -> list[dict]:
        return self._req('GET', '/api/etiquetas/agents/jobs/') or []

    def ack(self, job_id: int, erro: str = ''):
        return self._req('POST', f'/api/etiquetas/agents/jobs/{job_id}/ack/', {'erro': erro[:1000]})


# ---------------------------------------------------------------------------
# Impressora do Windows (spooler, RAW)
# ---------------------------------------------------------------------------

def _win32print():
    try:
        import win32print  # só existe no Windows
        return win32print
    except ImportError as e:
        raise RuntimeError('pywin32 não instalado — este agente só roda no Windows') from e


class FilaInexistente(Exception):
    pass


class ImpressoraWindows:
    def __init__(self, nome: str):
        self.nome = nome

    def _abrir(self):
        wp = _win32print()
        try:
            return wp.OpenPrinter(self.nome)
        except Exception as e:  # pywintypes.error 1801 = nome de impressora inválido
            raise FilaInexistente(f'fila de impressão "{self.nome}" não existe neste Windows ({e})') from e

    def info(self) -> Any:
        wp = _win32print()
        h = self._abrir()
        try:
            return wp.GetPrinter(h, 2)
        finally:
            wp.ClosePrinter(h)

    def estado(self, info: Any = None) -> tuple[bool, str]:
        """(pronta?, motivo). Offline/desligada/sem papel/tampa aberta → não pronta."""
        info = info or self.info()
        if info.get('Attributes', 0) & PRINTER_ATTRIBUTE_WORK_OFFLINE:
            return False, 'offline (desligada ou cabo USB solto)'
        status = info.get('Status', 0)
        if status & PRINTER_STATUS_BLOQUEIA:
            motivos = [txt for bit, txt in PRINTER_STATUS.items() if status & bit]
            return False, ', '.join(motivos) or f'status 0x{status:x}'
        return True, 'pronta'

    def imprimir_raw(self, dados: bytes, titulo: str) -> int:
        """Manda os bytes como estão (datatype RAW) e devolve o id do job no spooler."""
        wp = _win32print()
        h = self._abrir()
        try:
            job_id = wp.StartDocPrinter(h, 1, (titulo, None, 'RAW'))
            try:
                wp.StartPagePrinter(h)
                escritos = wp.WritePrinter(h, dados)
                wp.EndPagePrinter(h)
            finally:
                wp.EndDocPrinter(h)
            if escritos != len(dados):
                raise RuntimeError(f'spooler aceitou {escritos} de {len(dados)} bytes')
            return job_id
        finally:
            wp.ClosePrinter(h)

    def _job(self, h, job_id: int) -> Any:
        wp = _win32print()
        for j in wp.EnumJobs(h, 0, 999, 1):
            if j.get('JobId') == job_id:
                return j
        return None

    def aguardar_saida(self, job_id: int, timeout_s: int) -> tuple[bool, str]:
        """Espera o job sumir da fila do Windows (= bytes entregues à porta USB).
        Job com erro/offline/sem papel, ou que não sai no prazo, é apagado da fila e
        volta como falha — assim quem reimprime pelo Separa não gera duplicata."""
        wp = _win32print()
        h = self._abrir()
        try:
            limite = time.monotonic() + timeout_s
            while True:
                j = self._job(h, job_id)
                if j is None:
                    return True, ''
                status = j.get('Status', 0)
                if status & JOB_STATUS_FALHA:
                    motivos = [txt for bit, txt in JOB_STATUS.items() if status & bit]
                    self._apagar(h, job_id)
                    return False, 'spooler: ' + (', '.join(motivos) or f'status 0x{status:x}')
                if time.monotonic() >= limite:
                    self._apagar(h, job_id)
                    pronta, motivo = self.estado()
                    extra = '' if pronta else f' — impressora {motivo}'
                    return False, f'etiqueta não saiu em {timeout_s}s{extra}; job cancelado na fila do Windows'
                time.sleep(0.5)
        finally:
            wp.ClosePrinter(h)

    def _apagar(self, h, job_id: int):
        wp = _win32print()
        try:
            wp.SetJob(h, job_id, 0, None, JOB_CONTROL_DELETE)
        except Exception:
            pass


def listar_filas() -> list[dict]:
    """Filas de impressão locais e conectadas: nome, porta, driver, estado."""
    wp = _win32print()
    saida = []
    flags = wp.PRINTER_ENUM_LOCAL | wp.PRINTER_ENUM_CONNECTIONS
    for _flags, _desc, nome, _comment in wp.EnumPrinters(flags, None, 1):
        try:
            imp = ImpressoraWindows(nome)
            info = imp.info()
            pronta, motivo = imp.estado(info)
            saida.append({
                'nome': nome, 'porta': info.get('pPortName', '') or '', 'driver': info.get('pDriverName', '') or '',
                'estado': 'pronta' if pronta else motivo,
            })
        except Exception as e:  # fila remota fora etc.
            saida.append({'nome': nome, 'porta': '?', 'driver': '?', 'estado': f'erro: {e}'})
    return saida


def zpl_teste(nome_fila: str) -> bytes:
    """Etiqueta 100x150 mm a 203 dpi com os dados do PC — para validar cabo, driver e fila."""
    agora = dt.datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    host = socket.gethostname()
    linhas = [
        '^XA', '^CI27', '^PW800', '^LL1200', '^LH0,0',
        '^FO40,60^GB720,4,4^FS',
        '^FO40,90^A0N,70,70^FDSEPARA^FS',
        '^FO40,170^A0N,36,36^FDTeste do agente de impressao USB^FS',
        '^FO40,240^GB720,4,4^FS',
        f'^FO40,290^A0N,30,30^FDPC: {host[:28]}^FS',
        f'^FO40,340^A0N,30,30^FDFila: {nome_fila[:30]}^FS',
        f'^FO40,390^A0N,30,30^FDAgente: {VERSAO}^FS',
        f'^FO40,440^A0N,30,30^FD{agora}^FS',
        '^FO40,520^BY3^BCN,120,Y,N,N^FDSEPARA-TESTE^FS',
        '^FO40,720^A0N,28,28^FDSe esta etiqueta saiu inteira, cabo, driver^FS',
        '^FO40,760^A0N,28,28^FDe fila estao certos. Cadastre a impressora no^FS',
        '^FO40,800^A0N,28,28^FDSepara (tipo USB) com o token deste agente.^FS',
        '^FO40,1120^GB720,4,4^FS',
        '^XZ',
    ]
    return '\n'.join(linhas).encode('latin-1', errors='replace')


# ---------------------------------------------------------------------------
# O agente
# ---------------------------------------------------------------------------

class Agente:
    def __init__(self, cfg: Config, log: logging.Logger):
        self.cfg = cfg
        self.log = log
        self.sem_repetir = LogSemRepetir(log)
        self.parar = threading.Event()
        self.servidor = Servidor(cfg.url, cfg.token)
        # jobs já impressos cujo ack não chegou ao servidor (caiu entre imprimir e confirmar):
        # na volta só reenvia o ack, não reimprime.
        self._ack_pendente: dict[int, str] = {}

    # -- laço principal ------------------------------------------------------

    def executar(self):
        self.log.info(f'agente {VERSAO} iniciando · PC {socket.gethostname()} · servidor {self.cfg.url}')
        self.log.info(f'fila padrão do Windows: {self.cfg.nome_windows or "(vazia)"}')
        proximo_hb = 0.0
        while not self.parar.is_set():
            if not self.cfg.token:
                # Serviço instalado antes do "registrar": relê o .ini até o token aparecer.
                self.sem_repetir('token', logging.ERROR,
                                 'sem token no agente.ini — rode "SeparaAgente.exe registrar" (relendo a cada minuto)')
                self.parar.wait(60)
                self.cfg = Config(self.cfg.caminho)
                self.servidor = Servidor(self.cfg.url, self.cfg.token)
                continue
            agora = time.monotonic()
            if agora >= proximo_hb:
                self._heartbeat()
                proximo_hb = agora + self.cfg.intervalo_heartbeat
            self._ciclo()
            self.parar.wait(self.cfg.intervalo_jobs)
        self.log.info('agente parado')

    def _heartbeat(self):
        try:
            self.servidor.heartbeat()
            if self.sem_repetir.limpar('servidor'):
                self.log.info('servidor voltou')
        except ErroServidor as e:
            self.sem_repetir('servidor', logging.WARNING, f'heartbeat falhou: {e}')

    def _ciclo(self):
        # 1) acks que ficaram devendo
        for job_id, erro in list(self._ack_pendente.items()):
            try:
                self.servidor.ack(job_id, erro)
                del self._ack_pendente[job_id]
                self.log.info(f'job {job_id}: ack atrasado entregue')
            except ErroServidor as e:
                self.sem_repetir('servidor', logging.WARNING, f'ack do job {job_id} falhou: {e}')
                return
        # 2) fila
        try:
            jobs = self.servidor.jobs()
        except ErroServidor as e:
            self.sem_repetir('servidor', logging.WARNING, f'não deu para ler a fila: {e}')
            return
        if self.sem_repetir.limpar('servidor'):
            self.log.info('servidor voltou')
        for job in jobs:
            if self.parar.is_set():
                return
            if job['id'] in self._ack_pendente:
                continue  # já impresso, só falta o ack (tratado acima)
            self._processar(job)

    # -- um job ----------------------------------------------------------------

    def _processar(self, job: dict):
        job_id = job['id']
        nome = self.cfg.nome_para(job.get('impressora_id'))
        if not nome:
            self._ack(job_id, 'agente sem fila do Windows configurada (agente.ini → [impressora] nome_windows)')
            return
        imp = ImpressoraWindows(nome)
        try:
            pronta, motivo = imp.estado()
        except FilaInexistente as e:
            self._ack(job_id, f'{e} — confira o nome em "SeparaAgente.exe impressoras"')
            return
        except Exception as e:
            self.sem_repetir(f'estado:{nome}', logging.ERROR, f'não deu para ler o estado da fila "{nome}": {e}')
            return
        if not pronta:
            # Deixa o job pendente no servidor: sai sozinho quando a impressora voltar.
            self.sem_repetir(f'imp:{nome}', logging.WARNING, f'impressora "{nome}" {motivo} — jobs esperando')
            return
        if self.sem_repetir.limpar(f'imp:{nome}'):
            self.log.info(f'impressora "{nome}" voltou')

        try:
            dados = bytes.fromhex(job['conteudo'])
        except (KeyError, ValueError, TypeError) as e:
            self._ack(job_id, f'conteúdo do job inválido: {e}')
            return
        etiquetas = dados.count(b'^XZ')
        try:
            spool_id = imp.imprimir_raw(dados, f'Separa job {job_id}')
        except FilaInexistente as e:
            self._ack(job_id, str(e))
            return
        except Exception as e:
            self._ack(job_id, f'falha ao enviar à fila "{nome}": {e}')
            return
        ok, erro = imp.aguardar_saida(spool_id, self.cfg.confirmar_saida_s)
        if ok:
            self.log.info(f'job {job_id}: {etiquetas} etiqueta(s), {len(dados)} bytes → "{nome}" (spool {spool_id}) ok')
            self._ack(job_id, '')
        else:
            self.log.error(f'job {job_id}: falhou em "{nome}" — {erro}')
            self._ack(job_id, erro)

    def _ack(self, job_id: int, erro: str):
        if erro:
            self.log.error(f'job {job_id}: devolvido ao servidor com erro — {erro}')
        try:
            self.servidor.ack(job_id, erro)
        except ErroServidor as e:
            self._ack_pendente[job_id] = erro
            self.log.warning(f'job {job_id}: tratado mas o ack falhou ({e}) — vou reenviar')


# ---------------------------------------------------------------------------
# Serviço do Windows
# ---------------------------------------------------------------------------

def _servico_classe():
    import servicemanager
    import win32event
    import win32service
    import win32serviceutil

    class Servico(win32serviceutil.ServiceFramework):
        _svc_name_ = NOME_SERVICO
        _svc_display_name_ = NOME_EXIBICAO
        _svc_description_ = DESCRICAO_SERVICO

        def __init__(self, args):
            super().__init__(args)
            self.evento = win32event.CreateEvent(None, 0, 0, None)
            self.agente: Agente | None = None

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            if self.agente:
                self.agente.parar.set()
            win32event.SetEvent(self.evento)

        def SvcDoRun(self):
            servicemanager.LogInfoMsg(f'{NOME_SERVICO} {VERSAO} iniciando')
            cfg = Config.carregar()
            log = montar_log(cfg, console=False)
            try:
                self.agente = Agente(cfg, log)
                self.agente.executar()
            except Exception:
                log.exception('agente caiu')
                servicemanager.LogErrorMsg(f'{NOME_SERVICO}: agente caiu — veja {ARQUIVO_LOG}')
                raise
            servicemanager.LogInfoMsg(f'{NOME_SERVICO} parado')

    return Servico


def _como_servico() -> bool:
    """Sem argumentos: tenta se ligar ao gerenciador de serviços. Fora dele (duplo clique
    no .exe), a chamada falha com 1063 e mostramos a ajuda."""
    import servicemanager
    Servico = _servico_classe()
    try:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(Servico)
        servicemanager.StartServiceCtrlDispatcher()
        return True
    except Exception as e:  # pywintypes.error 1063 = não foi iniciado pelo SCM
        if getattr(e, 'winerror', None) == 1063 or '1063' in str(e):
            return False
        raise


def _comando_servico(acao: str):
    import win32serviceutil
    Servico = _servico_classe()
    mapa = {
        'instalar': ['--startup', 'auto', 'install'],
        'remover': ['remove'],
        'iniciar': ['start'],
        'parar': ['stop'],
        'reiniciar': ['restart'],
    }
    argv = [sys.argv[0]] + mapa[acao]
    win32serviceutil.HandleCommandLine(Servico, argv=argv)
    if acao == 'instalar':
        print(f'\nServiço "{NOME_SERVICO}" instalado com início automático.')
        print('Agora: SeparaAgente.exe iniciar   (ou reinicie o PC)')
        if not Config.carregar().token:
            print('ATENÇÃO: ainda sem token — rode "SeparaAgente.exe registrar" antes de iniciar.')


def _estado_servico() -> str:
    import win32service
    import win32serviceutil
    nomes = {
        win32service.SERVICE_STOPPED: 'parado', win32service.SERVICE_START_PENDING: 'iniciando',
        win32service.SERVICE_STOP_PENDING: 'parando', win32service.SERVICE_RUNNING: 'rodando',
        win32service.SERVICE_PAUSED: 'pausado',
    }
    try:
        st = win32serviceutil.QueryServiceStatus(NOME_SERVICO)
        return nomes.get(st[1], f'estado {st[1]}')
    except Exception as e:
        if getattr(e, 'winerror', None) == 1060:
            return 'não instalado (SeparaAgente.exe instalar)'
        return f'? ({e})'


# ---------------------------------------------------------------------------
# Comandos de console
# ---------------------------------------------------------------------------

def cmd_registrar(args: list[str]) -> int:
    cfg = Config.carregar()
    url = cfg.url
    novo = False
    i = 0
    while i < len(args):
        if args[i] == '--url' and i + 1 < len(args):
            url = args[i + 1].rstrip('/')
            i += 2
            continue
        if args[i] == '--novo':
            novo = True
        i += 1
    if cfg.token and not novo:
        print('Este agente já tem token. Para registrar de novo (gera outro token e exige colar o novo')
        print('no cadastro da impressora), rode: SeparaAgente.exe registrar --novo')
        return 1
    host = socket.gethostname()
    print(f'Registrando "{host}" em {url} …')
    try:
        r = Servidor(url).registrar(host)
    except ErroServidor as e:
        print(f'FALHOU: {e}')
        return 1
    cfg.salvar_token(r['token'], url)
    print(f'OK — agente #{r["id"]} registrado. Token gravado em {cfg.caminho}\n')
    print(f'TOKEN: {r["token"]}\n')
    print('Próximos passos:')
    print('  1. No Separa, Admin → Impressoras → Nova (ou editar): tipo USB, cole o token em "Agent ID".')
    print('     (o token também aparece em Admin → Print Agents)')
    print('  2. Confira o nome da fila do Windows em "SeparaAgente.exe impressoras" e')
    print('     coloque em agente.ini → [impressora] nome_windows.')
    print('  3. SeparaAgente.exe teste   → sai uma etiqueta de teste')
    print('  4. SeparaAgente.exe instalar e depois iniciar (como administrador)')
    return 0


def cmd_impressoras(_args) -> int:
    filas = listar_filas()
    if not filas:
        print('Nenhuma fila de impressão encontrada.')
        return 1
    larg = max(len(f['nome']) for f in filas)
    print(f'{"FILA (nome_windows)":<{larg}}  {"PORTA":<18} {"ESTADO":<32} DRIVER')
    for f in filas:
        print(f'{f["nome"]:<{larg}}  {f["porta"][:18]:<18} {f["estado"][:32]:<32} {f["driver"]}')
    cfg = Config.carregar()
    if cfg.nome_windows:
        achou = any(f['nome'] == cfg.nome_windows for f in filas)
        print(f'\nagente.ini → nome_windows = "{cfg.nome_windows}" '
              f'{"(encontrada)" if achou else "(NÃO ENCONTRADA — confira o nome exato)"}')
    return 0


def cmd_teste(args: list[str]) -> int:
    cfg = Config.carregar()
    nome = ' '.join(args).strip() or cfg.nome_windows
    if not nome:
        print('Informe a fila: SeparaAgente.exe teste "ZDesigner ZD220-203dpi ZPL"  (ou preencha nome_windows no agente.ini)')
        return 1
    imp = ImpressoraWindows(nome)
    try:
        pronta, motivo = imp.estado()
    except FilaInexistente as e:
        print(f'FALHOU: {e}')
        return 1
    print(f'fila "{nome}": {motivo}')
    if not pronta:
        print('Impressora não está pronta — ligue/conecte e tente de novo.')
        return 1
    dados = zpl_teste(nome)
    spool_id = imp.imprimir_raw(dados, 'Separa teste')
    print(f'enviado ({len(dados)} bytes, job {spool_id} no spooler) — aguardando sair…')
    ok, erro = imp.aguardar_saida(spool_id, cfg.confirmar_saida_s)
    print('OK — etiqueta de teste impressa.' if ok else f'FALHOU: {erro}')
    return 0 if ok else 1


def cmd_status(_args) -> int:
    cfg = Config.carregar()
    print(f'SeparaAgente {VERSAO} · PC {socket.gethostname()}\n')
    print(cfg.resumo())
    print()
    try:
        s = Servidor(cfg.url).saude()
        print(f'servidor       : responde ({s.get("status", s)})')
    except ErroServidor as e:
        print(f'servidor       : FORA — {e}')
    try:
        pub = Servidor(cfg.url).versao_publicada()
        if pub.get('versao') and _tupla(pub['versao']) > _tupla(VERSAO):
            print(f'ATUALIZAÇÃO    : versão {pub["versao"]} publicada no servidor (esta é {VERSAO}) — baixe em {pub.get("pagina")}')
        elif pub.get('versao'):
            print(f'versão         : {VERSAO} (é a publicada no servidor)')
    except ErroServidor:
        pass
    if cfg.token:
        try:
            Servidor(cfg.url, cfg.token).heartbeat()
            print('token          : aceito (heartbeat ok)')
        except ErroServidor as e:
            print(f'token          : {e}')
    for nome in sorted(cfg.filas()):
        try:
            _p, motivo = ImpressoraWindows(nome).estado()
            print(f'impressora     : "{nome}" — {motivo}')
        except FilaInexistente as e:
            print(f'impressora     : {e}')
    print(f'serviço        : {_estado_servico()}')
    print(f'log            : {os.path.join(pasta_base(), ARQUIVO_LOG)}')
    return 0


def cmd_rodar(_args) -> int:
    cfg = Config.carregar()
    log = montar_log(cfg, console=True)
    agente = Agente(cfg, log)
    try:
        agente.executar()
    except KeyboardInterrupt:
        agente.parar.set()
        log.info('interrompido (Ctrl+C)')
    return 0


def ajuda() -> int:
    print((__doc__ or '').strip())
    return 0


def main(argv: list[str]) -> int:
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore[attr-defined]
    except Exception:
        pass
    if len(argv) == 1:
        if _como_servico():
            return 0
        return ajuda()
    cmd, args = argv[1].lower(), argv[2:]
    comandos = {
        'registrar': cmd_registrar, 'impressoras': cmd_impressoras, 'teste': cmd_teste,
        'status': cmd_status, 'rodar': cmd_rodar,
    }
    if cmd in comandos:
        return comandos[cmd](args)
    if cmd in ('instalar', 'remover', 'iniciar', 'parar', 'reiniciar'):
        _comando_servico(cmd)
        return 0
    if cmd in ('ajuda', '-h', '--help', '/?', 'help'):
        return ajuda()
    print(f'comando desconhecido: {argv[1]}\n')
    ajuda()
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
