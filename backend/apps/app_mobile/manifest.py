"""Lê versionCode e versionName do AndroidManifest.xml binário (AXML) de um APK,
sem dependência nova (só zipfile + struct).

Motivo (2026-11-17): o APK de 10/11 (0.14.2 / 25) foi publicado em produção rotulado
como 0.15.0 / 26 — a publicação só pedia os números digitados. O coletor instalava a
versão velha e a faixa "Atualizar" nunca sumia. Agora o manifest é a fonte da verdade.

Formato (frameworks/base/libs/androidfw/ResourceTypes.h): cabeçalho RES_XML_TYPE,
depois chunks — string pool (0x0001), resource map (0x0180) e os nós XML. O elemento
<manifest> traz `android:versionCode` (int) e `android:versionName` (string) como
atributos; o nome do atributo é um índice do string pool que, pelo resource map,
aponta para o id público do framework (0x0101021b / 0x0101021c).
"""
import struct
import zipfile

RES_STRING_POOL = 0x0001
RES_XML_RESOURCE_MAP = 0x0180
RES_XML_START_ELEMENT = 0x0102
UTF8_FLAG = 1 << 8
TYPE_STRING = 0x03
TYPE_INT_DEC = 0x10
TYPE_INT_HEX = 0x11

ID_VERSION_CODE = 0x0101021B
ID_VERSION_NAME = 0x0101021C


class ManifestInvalido(Exception):
    pass


def versao_do_apk(arquivo) -> tuple[int, str]:
    """Devolve (versionCode, versionName) lidos do manifest do APK (arquivo aberto ou caminho)."""
    try:
        with zipfile.ZipFile(arquivo) as z:
            dados = z.read('AndroidManifest.xml')
    except (zipfile.BadZipFile, KeyError) as e:
        raise ManifestInvalido('APK sem AndroidManifest.xml legível') from e
    finally:
        if hasattr(arquivo, 'seek'):
            arquivo.seek(0)
    return _ler_versao(dados)


def _ler_versao(dados: bytes) -> tuple[int, str]:
    if len(dados) < 8:
        raise ManifestInvalido('manifest muito curto')
    tipo, tam_cab, tam_arq = struct.unpack_from('<HHI', dados, 0)
    if tipo != 0x0003:
        raise ManifestInvalido('manifest não é XML binário (AXML)')
    pos = tam_cab
    strings: list[str] = []
    resource_map: list[int] = []
    fim = min(tam_arq, len(dados))
    while pos + 8 <= fim:
        ctipo, ccab, ctam = struct.unpack_from('<HHI', dados, pos)
        if ctam < 8:
            raise ManifestInvalido('chunk inválido no manifest')
        if ctipo == RES_STRING_POOL:
            strings = _string_pool(dados, pos, ctam)
        elif ctipo == RES_XML_RESOURCE_MAP:
            n = (ctam - ccab) // 4
            resource_map = list(struct.unpack_from(f'<{n}I', dados, pos + ccab))
        elif ctipo == RES_XML_START_ELEMENT:
            resultado = _atributos_do_manifest(dados, pos, ccab, strings, resource_map)
            if resultado is not None:
                return resultado
        pos += ctam
    raise ManifestInvalido('o manifest não tem <manifest android:versionCode android:versionName>')


def _string_pool(dados: bytes, inicio: int, tam: int) -> list[str]:
    qtd, _estilos, flags, strings_start, _styles_start = struct.unpack_from('<IIIII', dados, inicio + 8)
    utf8 = bool(flags & UTF8_FLAG)
    offsets = struct.unpack_from(f'<{qtd}I', dados, inicio + 28)
    base = inicio + strings_start
    saida = []
    for off in offsets:
        p = base + off
        if utf8:
            # tamanho em chars (u8, bit alto = 2 bytes) e depois em bytes (idem)
            n_chars, p = _len_u8(dados, p)
            n_bytes, p = _len_u8(dados, p)
            saida.append(dados[p:p + n_bytes].decode('utf-8', errors='replace'))
        else:
            n, p = _len_u16(dados, p)
            saida.append(dados[p:p + 2 * n].decode('utf-16-le', errors='replace'))
    return saida


def _len_u8(dados: bytes, p: int) -> tuple[int, int]:
    n = dados[p]
    if n & 0x80:
        n = ((n & 0x7F) << 8) | dados[p + 1]
        return n, p + 2
    return n, p + 1


def _len_u16(dados: bytes, p: int) -> tuple[int, int]:
    n = struct.unpack_from('<H', dados, p)[0]
    if n & 0x8000:
        n = ((n & 0x7FFF) << 16) | struct.unpack_from('<H', dados, p + 2)[0]
        return n, p + 4
    return n, p + 2


def _atributos_do_manifest(dados, pos, ccab, strings, resource_map):
    # cabeçalho do nó: type/hs/size + lineNumber + comment (16 bytes), depois
    # ns, name, attributeStart, attributeSize, attributeCount, idIndex, classIndex, styleIndex
    _ns, nome, attr_start, attr_size, attr_count = struct.unpack_from('<IIHHH', dados, pos + ccab)
    if not (0 <= nome < len(strings)) or strings[nome] != 'manifest':
        return None
    version_code = None
    version_name = None
    base = pos + ccab + attr_start
    for i in range(attr_count):
        a = base + i * attr_size
        _ans, anome, raw, _tsize, _res0, dtype, data = struct.unpack_from('<IIIHBBI', dados, a)
        rid = resource_map[anome] if anome < len(resource_map) else None
        nome_attr = strings[anome] if anome < len(strings) else ''
        if rid == ID_VERSION_CODE or (rid is None and nome_attr == 'versionCode'):
            if dtype in (TYPE_INT_DEC, TYPE_INT_HEX):
                version_code = data
        elif rid == ID_VERSION_NAME or (rid is None and nome_attr == 'versionName'):
            idx = data if dtype == TYPE_STRING else raw
            if 0 <= idx < len(strings):
                version_name = strings[idx]
    if version_code is None or version_name is None:
        raise ManifestInvalido('o manifest não tem versionCode/versionName')
    return version_code, version_name
