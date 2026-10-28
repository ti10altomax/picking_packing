"""Distribuição do APK pelo próprio Separa (2026-10-28).

Antes o APK ia para cada coletor por cabo (sideload). Agora o admin publica o
arquivo aqui (Admin → App do coletor), o backend serve a página `/apk/` e o
arquivo, e o app avisa quando há versão mais nova (`GET /api/app/versao/`).

`VersaoApp`: uma linha por APK publicado; a "atual" é a de maior `version_code`.
`DispositivoApp`: inventário — a cada requisição o app manda `X-App-Versao` e
`X-App-Dispositivo`, e o middleware guarda quem está em qual versão.
"""
from django.db import models


def _caminho_apk(instancia, nome):
    return f'apk/separa-{instancia.versao}.apk'


class VersaoApp(models.Model):
    versao = models.CharField('versão', max_length=20, unique=True)            # 0.9.0
    version_code = models.PositiveIntegerField('versionCode', unique=True)     # 15
    arquivo = models.FileField(upload_to=_caminho_apk)
    tamanho_bytes = models.BigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    notas = models.TextField(blank=True)                                       # o que mudou
    # obrigatória = o app bloqueia até atualizar; senão só um aviso dispensável
    obrigatoria = models.BooleanField(default=False)
    criado_em = models.DateTimeField(auto_now_add=True)
    criado_por = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        verbose_name = 'Versão do app'
        verbose_name_plural = 'Versões do app'
        ordering = ['-version_code']

    def __str__(self):
        return f'Separa {self.versao} ({self.version_code})'

    @property
    def nome_arquivo(self) -> str:
        return f'separa-{self.versao}.apk'

    @classmethod
    def atual(cls):
        return cls.objects.order_by('-version_code').first()


class DispositivoApp(models.Model):
    """Quem está rodando qual versão (um registro por usuário × aparelho)."""
    usuario = models.ForeignKey('core.User', on_delete=models.CASCADE, related_name='dispositivos_app')
    dispositivo = models.CharField(max_length=200, blank=True)   # "android 11 · TC21"
    versao = models.CharField(max_length=20)
    ultimo_acesso_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Dispositivo com o app'
        verbose_name_plural = 'Dispositivos com o app'
        unique_together = [('usuario', 'dispositivo')]
        ordering = ['-ultimo_acesso_em']

    def __str__(self):
        return f'{self.usuario.username} · {self.dispositivo} · {self.versao}'
