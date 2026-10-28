"""Regras da distribuição do APK: validação do arquivo, comparação de versões e
inventário de dispositivos (chamado pelo middleware a cada requisição do app)."""
import hashlib
import logging
import re
import time
import zipfile

from django.utils import timezone

from .models import DispositivoApp, VersaoApp

logger = logging.getLogger(__name__)

RE_VERSAO = re.compile(r'^\d+\.\d+\.\d+$')
CABECALHO_VERSAO = 'HTTP_X_APP_VERSAO'
CABECALHO_DISPOSITIVO = 'HTTP_X_APP_DISPOSITIVO'


class ErroVersao(Exception):
    pass


def tupla(versao: str) -> tuple[int, ...]:
    """'0.9.0' → (0, 9, 0); fora do padrão vira (0,) para comparar sem quebrar."""
    try:
        return tuple(int(p) for p in str(versao).strip().split('.'))
    except ValueError:
        return (0,)


def desatualizada(versao_aparelho: str, versao_atual: str | None) -> bool:
    return bool(versao_atual) and tupla(versao_aparelho) < tupla(versao_atual)


def validar_apk(arquivo) -> tuple[int, str]:
    """Garante que é um APK (zip com AndroidManifest.xml e classes.dex) e devolve
    (tamanho, sha256). Sem dependência nova: só zipfile + hashlib."""
    try:
        with zipfile.ZipFile(arquivo) as z:
            nomes = set(z.namelist())
    except zipfile.BadZipFile:
        raise ErroVersao('o arquivo não é um APK válido (não é um zip)')
    if 'AndroidManifest.xml' not in nomes or not any(n.startswith('classes') and n.endswith('.dex') for n in nomes):
        raise ErroVersao('o arquivo não é um APK válido (sem AndroidManifest.xml / classes.dex)')
    arquivo.seek(0)
    h = hashlib.sha256()
    tamanho = 0
    for bloco in iter(lambda: arquivo.read(1024 * 1024), b''):
        h.update(bloco)
        tamanho += len(bloco)
    arquivo.seek(0)
    return tamanho, h.hexdigest()


def publicar(arquivo, versao: str, version_code: int, notas: str, obrigatoria: bool, usuario) -> VersaoApp:
    versao = str(versao or '').strip()
    if not RE_VERSAO.match(versao):
        raise ErroVersao('versão no formato X.Y.Z (ex.: 0.9.0)')
    if version_code <= 0:
        raise ErroVersao('versionCode precisa ser um inteiro positivo (o do build.gradle)')
    if VersaoApp.objects.filter(versao=versao).exists():
        raise ErroVersao(f'a versão {versao} já foi publicada — apague-a antes de subir de novo')
    if VersaoApp.objects.filter(version_code=version_code).exists():
        raise ErroVersao(f'o versionCode {version_code} já foi publicado')
    atual = VersaoApp.atual()
    if atual and tupla(versao) <= tupla(atual.versao):
        raise ErroVersao(f'a versão {versao} não é maior que a atual ({atual.versao})')
    tamanho, sha = validar_apk(arquivo)
    v = VersaoApp(versao=versao, version_code=version_code, tamanho_bytes=tamanho, sha256=sha,
                  notas=notas or '', obrigatoria=bool(obrigatoria), criado_por=usuario)
    v.arquivo.save(v.nome_arquivo, arquivo, save=False)
    v.save()
    logger.info(f'APK {versao} publicado', extra={'versao': versao, 'version_code': version_code, 'tamanho': tamanho})
    return v


def serializar(v: VersaoApp, request=None) -> dict:
    return {
        'id': v.id,
        'versao': v.versao,
        'version_code': v.version_code,
        'tamanho_bytes': v.tamanho_bytes,
        'sha256': v.sha256,
        'notas': v.notas,
        'obrigatoria': v.obrigatoria,
        'criado_em': v.criado_em,
        'criado_por': v.criado_por.username if v.criado_por else None,
        'nome_arquivo': v.nome_arquivo,
        # Caminhos relativos (o app monta com a API_URL dele) + absolutos pela URL pública
        # (settings.SEPARA_URL_PUBLICA; sem ela, o host da requisição — vide settings).
        'caminho': f'/apk/{v.nome_arquivo}',
        'url': _absoluta(request, f'/apk/{v.nome_arquivo}'),
        'pagina': _absoluta(request, '/apk/'),
    }


def _absoluta(request, caminho: str) -> str:
    from django.conf import settings
    base = getattr(settings, 'SEPARA_URL_PUBLICA', '')
    if base:
        return f'{base}{caminho}'
    return request.build_absolute_uri(caminho) if request else caminho


# --- inventário -------------------------------------------------------------

# Evita um UPDATE por requisição: lembra (por worker) quando cada aparelho foi
# gravado pela última vez e só regrava a cada INTERVALO ou quando a versão muda.
_INTERVALO = 10 * 60
_vistos: dict[tuple[int, str], tuple[str, float]] = {}


def registrar_dispositivo(user, versao: str, dispositivo: str) -> None:
    versao = str(versao or '').strip()[:20]
    dispositivo = str(dispositivo or '').strip()[:200]
    if not versao or user is None or not getattr(user, 'is_authenticated', False):
        return
    chave = (user.id, dispositivo)
    agora = time.monotonic()
    visto = _vistos.get(chave)
    if visto and visto[0] == versao and agora - visto[1] < _INTERVALO:
        return
    _vistos[chave] = (versao, agora)
    try:
        DispositivoApp.objects.update_or_create(
            usuario=user, dispositivo=dispositivo,
            defaults={'versao': versao, 'ultimo_acesso_em': timezone.now()},
        )
    except Exception:   # inventário nunca pode derrubar a requisição
        logger.warning('falha ao registrar dispositivo do app', exc_info=True)


def inventario() -> list[dict]:
    atual = VersaoApp.atual()
    return [
        {
            'id': d.id, 'usuario': d.usuario.username, 'perfil': d.usuario.perfil,
            'dispositivo': d.dispositivo, 'versao': d.versao, 'ultimo_acesso_em': d.ultimo_acesso_em,
            'desatualizado': desatualizada(d.versao, atual.versao if atual else None),
        }
        for d in DispositivoApp.objects.select_related('usuario')
    ]
