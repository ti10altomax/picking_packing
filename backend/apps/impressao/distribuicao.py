"""Distribuição do agente de impressão USB pelo próprio Separa (2026-11-12).

Mesmo desenho da distribuição do APK (`apps/app_mobile`): o admin publica o
`SeparaAgente.exe` em **Admin → Agente de impressão**, o backend serve a página
pública **`/agente/`** (sem login, para abrir no navegador do PC da impressora) e os
arquivos:

  GET /agente/                          página com os botões Baixar + passo a passo
  GET /agente/SeparaAgente-X.Y.Z.exe    o executável publicado
  GET /agente/agente.ini                o .ini **gerado** com a URL deste servidor já
                                        preenchida (só falta o nome da fila do Windows)

API:
  GET  /api/impressao/agente/versao/    público — versão atual + URLs (o `status` do
                                        agente avisa se há versão mais nova)
  GET  /api/impressao/agente/versoes/   admin — atual, histórico e os PCs registrados
                                        (PrintAgent) com a versão que mandam no heartbeat
  POST /api/impressao/agente/versoes/   admin — multipart: arquivo, versao, notas
  DELETE /api/impressao/agente/versoes/<id>/

O .ini não é enviado pelo admin de propósito: o que muda de PC para PC é só o nome
da fila do Windows, e a URL do servidor o backend sabe (`SEPARA_URL_PUBLICA`).
O modelo abaixo tem que acompanhar `agente/agente.ini.exemplo`.
"""
import hashlib
import logging
import re

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET
from rest_framework import status as http_status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.pedidos.models import PrintAgent

from .models import VersaoAgente

logger = logging.getLogger(__name__)

RE_VERSAO = re.compile(r'^\d+\.\d+\.\d+$')
AGENTE_PARADO_APOS_S = 120   # igual ao botão Testar da impressora

INI_MODELO = """; Agente de impressão USB do Separa — gerado por {pagina} em {quando}
; Falta só o nome da fila do Windows ("SeparaAgente.exe impressoras" lista).

[servidor]
; Backend do Separa
url = {url}
; Preenchido por "SeparaAgente.exe registrar" — cole este mesmo token no campo
; "Agent ID" da impressora (Admin → Impressoras, tipo USB)
token =

[impressora]
; Nome EXATO da fila em Dispositivos e Impressoras ("SeparaAgente.exe impressoras" lista)
nome_windows = ZDesigner ZD220-203dpi ZPL

; Opcional: um agente atendendo mais de uma impressora do Separa.
; id da impressora no Separa (Admin → Impressoras) = nome da fila no Windows
;[impressoras]
;3 = ZDesigner ZD220-203dpi ZPL
;4 = ZDesigner ZT231-203dpi ZPL

[agente]
; segundos entre consultas à fila do servidor
intervalo_jobs = 3
; segundos entre sinais de vida (o Separa considera offline depois de 120 s)
intervalo_heartbeat = 60
; quanto esperar a etiqueta sair da fila do Windows antes de devolver erro
confirmar_saida_s = 60
; quantos dias de agente.log guardar
log_dias = 14
"""


class ErroVersao(Exception):
    pass


def tupla(versao: str) -> tuple[int, ...]:
    try:
        return tuple(int(p) for p in str(versao).strip().split('.'))
    except ValueError:
        return (0,)


def desatualizada(versao_pc: str, versao_atual: str | None) -> bool:
    return bool(versao_atual) and bool(versao_pc) and tupla(versao_pc) < tupla(versao_atual)


def _absoluta(request, caminho: str) -> str:
    """`caminho` começa em `/` ('' = só a raiz, sem barra no fim). Base = `SEPARA_URL_PUBLICA`
    (produção); sem ela, o host da requisição (dev)."""
    base = getattr(settings, 'SEPARA_URL_PUBLICA', '')
    if not base and request is not None:
        base = request.build_absolute_uri('/').rstrip('/')
    return f'{base}{caminho}'


def validar_exe(arquivo) -> tuple[int, str]:
    """Executável Windows (cabeçalho `MZ`) — e devolve (tamanho, sha256)."""
    inicio = arquivo.read(2)
    arquivo.seek(0)
    if inicio != b'MZ':
        raise ErroVersao('o arquivo não é um executável do Windows (.exe)')
    h = hashlib.sha256()
    tamanho = 0
    for bloco in iter(lambda: arquivo.read(1024 * 1024), b''):
        h.update(bloco)
        tamanho += len(bloco)
    arquivo.seek(0)
    return tamanho, h.hexdigest()


def publicar(arquivo, versao: str, notas: str, usuario) -> VersaoAgente:
    versao = str(versao or '').strip()
    if not RE_VERSAO.match(versao):
        raise ErroVersao('versão no formato X.Y.Z (ex.: 1.0.0) — é o VERSAO do separa_agente.py')
    if VersaoAgente.objects.filter(versao=versao).exists():
        raise ErroVersao(f'a versão {versao} já foi publicada — apague-a antes de subir de novo')
    atual = VersaoAgente.atual()
    if atual and tupla(versao) <= tupla(atual.versao):
        raise ErroVersao(f'a versão {versao} não é maior que a atual ({atual.versao})')
    tamanho, sha = validar_exe(arquivo)
    v = VersaoAgente(versao=versao, tamanho_bytes=tamanho, sha256=sha, notas=notas or '', criado_por=usuario)
    v.arquivo.save(v.nome_arquivo, arquivo, save=False)
    v.save()
    logger.info(f'agente {versao} publicado', extra={'versao': versao, 'tamanho': tamanho})
    return v


def serializar(v: VersaoAgente, request=None) -> dict:
    return {
        'id': v.id,
        'versao': v.versao,
        'tamanho_bytes': v.tamanho_bytes,
        'sha256': v.sha256,
        'notas': v.notas,
        'criado_em': v.criado_em,
        'criado_por': v.criado_por.username if v.criado_por else None,
        'nome_arquivo': v.nome_arquivo,
        'url': _absoluta(request, f'/agente/{v.nome_arquivo}'),
        'ini_url': _absoluta(request, '/agente/agente.ini'),
        'pagina': _absoluta(request, '/agente/'),
    }


def agentes_registrados(request=None) -> list[dict]:
    """PCs com o agente (PrintAgent) + versão que mandam no heartbeat + se está atrás da publicada."""
    atual = VersaoAgente.atual()
    agora = timezone.now()
    saida = []
    for a in PrintAgent.objects.all().order_by('hostname'):
        online = bool(a.ultimo_heartbeat) and (agora - a.ultimo_heartbeat).total_seconds() < AGENTE_PARADO_APOS_S
        saida.append({
            'id': a.id, 'hostname': a.hostname, 'versao': a.versao, 'ultimo_heartbeat': a.ultimo_heartbeat,
            'criado_em': a.criado_em, 'online': online,
            'desatualizado': desatualizada(a.versao, atual.versao if atual else None),
        })
    return saida


def ini_gerado(request) -> str:
    return INI_MODELO.format(
        url=_absoluta(request, ''), pagina=_absoluta(request, '/agente/'),
        quando=timezone.localtime().strftime('%d/%m/%Y %H:%M'),
    )


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def _so_admin(request):
    if request.user.perfil != 'admin':
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)
    return None


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def versao_atual(request):
    v = VersaoAgente.atual()
    if not v:
        return Response({'versao': None, 'pagina': _absoluta(request, '/agente/')})
    return Response(serializar(v, request))


@api_view(['GET', 'POST'])
def versoes(request):
    err = _so_admin(request)
    if err:
        return err
    if request.method == 'POST':
        arquivo = request.FILES.get('arquivo')
        if not arquivo:
            return Response({'erro': 'envie o SeparaAgente.exe'}, status=http_status.HTTP_400_BAD_REQUEST)
        try:
            v = publicar(arquivo, request.data.get('versao'), request.data.get('notas') or '', request.user)
        except ErroVersao as e:
            return Response({'erro': str(e)}, status=http_status.HTTP_400_BAD_REQUEST)
        return Response(serializar(v, request), status=http_status.HTTP_201_CREATED)
    atual = VersaoAgente.atual()
    return Response({
        'atual': serializar(atual, request) if atual else None,
        'versoes': [serializar(v, request) for v in VersaoAgente.objects.select_related('criado_por')],
        'agentes': agentes_registrados(request),
        'ini': ini_gerado(request),
        'pagina': _absoluta(request, '/agente/'),
    })


@api_view(['DELETE'])
def apagar_versao(request, pk):
    err = _so_admin(request)
    if err:
        return err
    v = get_object_or_404(VersaoAgente, pk=pk)
    v.arquivo.delete(save=False)
    v.delete()
    logger.info(f'agente {v.versao} apagado', extra={'versao': v.versao})
    return Response(status=http_status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# /agente/ — navegador do PC da impressora (sem login)
# ---------------------------------------------------------------------------

@require_GET
def baixar_exe(request, nome):
    v = VersaoAgente.objects.filter(versao=nome.removeprefix('SeparaAgente-').removesuffix('.exe')).first()
    if not v or not v.arquivo:
        raise Http404
    resposta = FileResponse(v.arquivo.open('rb'), as_attachment=True, filename=v.nome_arquivo,
                            content_type='application/vnd.microsoft.portable-executable')
    resposta['Content-Length'] = v.tamanho_bytes or v.arquivo.size
    return resposta


@require_GET
def baixar_ini(request):
    resposta = HttpResponse(ini_gerado(request), content_type='text/plain; charset=utf-8')
    resposta['Content-Disposition'] = 'attachment; filename="agente.ini"'
    return resposta


def _mb(n: int) -> str:
    return f'{n / (1024 * 1024):.1f} MB'


@require_GET
def pagina_agente(request):
    """Página mínima, sem dependência do frontend, para abrir no Chrome/Edge do PC da Zebra."""
    v = VersaoAgente.atual()
    url_servidor = _absoluta(request, '')
    if v:
        d = serializar(v, request)
        notas = ''.join(f'<li>{linha}</li>' for linha in (v.notas or '').splitlines() if linha.strip())
        corpo = f"""
      <p class="v">Versão <strong>{v.versao}</strong> · {_mb(v.tamanho_bytes)} · publicada {timezone.localtime(v.criado_em).strftime('%d/%m/%Y')}</p>
      <a class="btn" href="{d['url']}">Baixar SeparaAgente-{v.versao}.exe</a>
      <a class="btn sec" href="{d['ini_url']}">Baixar agente.ini</a>
      {f'<ul class="notas">{notas}</ul>' if notas else ''}
      <h2>Instalar no PC da impressora</h2>
      <ol class="passos">
        <li>Faça isto <strong>no computador onde a Zebra está plugada pelo cabo USB</strong>, com ela em
            <strong>Dispositivos e Impressoras</strong> (driver ZDesigner instalado). Impressora compartilhada de outro
            computador aparece na lista, mas o serviço não consegue imprimir por ela.</li>
        <li>Crie a pasta <code>C:\\SeparaAgente</code> e mova para lá os dois arquivos baixados.
            Renomeie <code>SeparaAgente-{v.versao}.exe</code> para <code>SeparaAgente.exe</code>.</li>
        <li>Abra o <strong>Prompt de Comando</strong> (comum) e entre na pasta: <code>cd C:\\SeparaAgente</code></li>
        <li><code>SeparaAgente.exe impressoras</code> — copie o nome exato da Zebra para <code>nome_windows</code> no <code>agente.ini</code> (Bloco de Notas).</li>
        <li><code>SeparaAgente.exe registrar</code> — mostra o <strong>token</strong>. No Separa, Admin → Impressoras → Nova: tipo USB, cole o token em Agent ID.</li>
        <li><code>SeparaAgente.exe teste</code> — sai uma etiqueta de teste.</li>
        <li><code>SeparaAgente.exe instalar</code> e <code>SeparaAgente.exe iniciar</code> — estes dois em um Prompt de Comando
            <strong>como administrador</strong>; o serviço sobe sozinho com o Windows.</li>
        <li><code>SeparaAgente.exe status</code> — tudo verde? Em Admin → Print Agents o PC aparece online.</li>
      </ol>
      <p class="obs">Atualizar: baixe o .exe novo, <code>SeparaAgente.exe parar</code>, troque o arquivo, <code>SeparaAgente.exe iniciar</code>. O <code>agente.ini</code> (com o token) fica.</p>"""
    else:
        corpo = '<p class="v">Nenhuma versão publicada ainda.</p>'
    html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Separa · agente de impressão USB</title>
<style>
  body{{margin:0;font-family:system-ui,Roboto,sans-serif;background:#faf9f5;color:#1c1917;padding:24px 16px;max-width:760px;margin:0 auto}}
  h1{{font-size:28px;margin:0 0 4px}} h2{{font-size:18px;margin:28px 0 8px}} .sub{{color:#78716c;margin:0 0 24px}}
  .v{{font-size:18px;margin:0 0 16px}}
  .btn{{display:block;text-align:center;background:#1c1917;color:#fff;text-decoration:none;font-size:20px;font-weight:600;padding:18px;border-radius:14px;margin:0 0 12px}}
  .btn.sec{{background:#fff;color:#1c1917;border:1px solid #d6d3d1;font-size:17px;padding:14px}}
  .notas{{background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:12px 12px 12px 28px;margin:16px 0 0}}
  .passos li{{margin:0 0 10px;line-height:1.5}} code{{background:#e7e5e4;padding:1px 5px;border-radius:5px}}
  .obs{{color:#78716c;font-size:14px;line-height:1.5}}
  @media (prefers-color-scheme:dark){{body{{background:#0c0a09;color:#fafaf9}} .btn{{background:#fafaf9;color:#0c0a09}} .btn.sec{{background:#1c1917;color:#fafaf9;border-color:#44403c}} .notas{{background:#1c1917;border-color:#292524}} code{{background:#292524}}}}
</style></head><body>
<h1>Separa</h1><p class="sub">Agente de impressão USB (Windows) · servidor {url_servidor}</p>
{corpo}
</body></html>"""
    return HttpResponse(html)
