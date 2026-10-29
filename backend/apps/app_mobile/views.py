"""Endpoints da distribuição do APK.

Públicos (sem login — o coletor ainda não tem token na tela de login, e a
página de download é aberta pelo navegador do aparelho):
  GET /api/app/versao/        versão atual + URL de download (o app compara e avisa)
  GET /apk/                   página com o botão "Baixar" para abrir no coletor
  GET /apk/separa-X.Y.Z.apk   o arquivo

Admin:
  GET  /api/app/versoes/      histórico + inventário de dispositivos
  POST /api/app/versoes/      multipart: arquivo, versao, version_code, notas, obrigatoria
  DELETE /api/app/versoes/<id>/
"""
import logging

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET
from rest_framework import status as http_status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import services
from .models import VersaoApp

logger = logging.getLogger(__name__)


def _so_admin(request):
    if request.user.perfil != 'admin':
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)
    return None


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def versao_atual(request):
    v = VersaoApp.atual()
    if not v:
        return Response({'versao': None})
    return Response(services.serializar(v, request))


@api_view(['GET', 'POST'])
def versoes(request):
    err = _so_admin(request)
    if err:
        return err
    if request.method == 'POST':
        arquivo = request.FILES.get('arquivo')
        if not arquivo:
            return Response({'erro': 'envie o arquivo .apk'}, status=http_status.HTTP_400_BAD_REQUEST)
        try:
            version_code = int(request.data.get('version_code') or 0)
        except (TypeError, ValueError):
            return Response({'erro': 'versionCode inválido'}, status=http_status.HTTP_400_BAD_REQUEST)
        obrigatoria = str(request.data.get('obrigatoria') or '').lower() in ('1', 'true', 'sim', 'on')
        try:
            v = services.publicar(arquivo, request.data.get('versao'), version_code,
                                  request.data.get('notas') or '', obrigatoria, request.user)
        except services.ErroVersao as e:
            return Response({'erro': str(e)}, status=http_status.HTTP_400_BAD_REQUEST)
        return Response(services.serializar(v, request), status=http_status.HTTP_201_CREATED)
    atual = VersaoApp.atual()
    return Response({
        'atual': services.serializar(atual, request) if atual else None,
        'versoes': [services.serializar(v, request) for v in VersaoApp.objects.select_related('criado_por')],
        'dispositivos': services.inventario(),
    })


@api_view(['DELETE'])
def apagar_versao(request, pk):
    err = _so_admin(request)
    if err:
        return err
    v = get_object_or_404(VersaoApp, pk=pk)
    v.arquivo.delete(save=False)
    v.delete()
    logger.info(f'APK {v.versao} apagado', extra={'versao': v.versao})
    return Response(status=http_status.HTTP_204_NO_CONTENT)


# --- /apk/ (navegador do coletor) --------------------------------------------

@require_GET
def baixar_apk(request, nome):
    v = VersaoApp.objects.filter(versao=nome.removeprefix('separa-').removesuffix('.apk')).first()
    if not v or not v.arquivo:
        raise Http404
    resposta = FileResponse(v.arquivo.open('rb'), as_attachment=True, filename=v.nome_arquivo,
                            content_type='application/vnd.android.package-archive')
    resposta['Content-Length'] = v.tamanho_bytes or v.arquivo.size
    return resposta


@require_GET
def ajuda_redirect(request):
    """O "?" do app abre `API_URL/ajuda?perfil=…#chave` (o APK só conhece a URL da API).
    Em produção a :8003 é o Django direto, então redireciona para o web — query vai
    junto e o navegador mantém o `#chave` sozinho (Location sem fragmento)."""
    base = settings.SEPARA_WEB_URL
    if not base:
        origens = getattr(settings, 'CORS_ALLOWED_ORIGINS', None) or ['https://localhost:3000']
        base = origens[0].rstrip('/')
    query = request.META.get('QUERY_STRING', '')
    return HttpResponseRedirect(f'{base}/ajuda{"?" + query if query else ""}')


def _mb(n: int) -> str:
    return f'{n / (1024 * 1024):.0f} MB'


@require_GET
def pagina_apk(request):
    """Página mínima, sem dependência do frontend: funciona no Chrome do TC21 e em
    celular comum. Abrir http://IP:8003/apk/ → tocar em Baixar → abrir o arquivo → Instalar."""
    v = VersaoApp.atual()
    if v:
        d = services.serializar(v, request)
        notas = ''.join(f'<li>{linha}</li>' for linha in (v.notas or '').splitlines() if linha.strip())
        corpo = f"""
      <p class="v">Versão <strong>{v.versao}</strong> · {_mb(v.tamanho_bytes)}{' · <span class="ob">obrigatória</span>' if v.obrigatoria else ''}</p>
      <a class="btn" href="{d['url']}">Baixar o Separa {v.versao}</a>
      {f'<ul class="notas">{notas}</ul>' if notas else ''}
      <ol class="passos">
        <li>Toque em <strong>Baixar</strong> e espere o download terminar.</li>
        <li>Abra o arquivo <code>{v.nome_arquivo}</code> na barra de notificações ou em Downloads.</li>
        <li>Toque em <strong>Instalar</strong>. Não precisa desinstalar a versão antiga.</li>
        <li>Se o Android perguntar, permita <em>instalar apps desconhecidos</em> para o navegador (só na primeira vez).</li>
      </ol>"""
    else:
        corpo = '<p class="v">Nenhuma versão publicada ainda.</p>'
    html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Separa · app do coletor</title>
<style>
  body{{margin:0;font-family:system-ui,Roboto,sans-serif;background:#faf9f5;color:#1c1917;padding:24px 16px}}
  h1{{font-size:28px;margin:0 0 4px}} .sub{{color:#78716c;margin:0 0 24px}}
  .v{{font-size:18px;margin:0 0 16px}} .ob{{color:#b91c1c;font-weight:600}}
  .btn{{display:block;text-align:center;background:#1c1917;color:#fff;text-decoration:none;font-size:20px;font-weight:600;padding:18px;border-radius:14px;margin:0 0 24px}}
  .notas{{background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:12px 12px 12px 28px;margin:0 0 24px}}
  .passos li{{margin:0 0 10px;line-height:1.4}} code{{background:#e7e5e4;padding:1px 5px;border-radius:5px}}
  @media (prefers-color-scheme:dark){{body{{background:#0c0a09;color:#fafaf9}} .btn{{background:#fafaf9;color:#0c0a09}} .notas{{background:#1c1917;border-color:#292524}} code{{background:#292524}}}}
</style></head><body>
<h1>Separa</h1><p class="sub">App do coletor (Android)</p>
{corpo}
</body></html>"""
    return HttpResponse(html)
