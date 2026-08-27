"""Cadastro de separadores físicos + liberação diária (DESIGN.md §2).

Gestão (CRUD + liberar/desliberar) é do Sup. Pátio/Admin. A lista de liberados
do dia é lida também pelo conferente (picker do apontamento "separado por").
"""
from datetime import date

from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.pedidos.models import Separador, SeparadorLiberacao

PERFIS_GESTAO = ('supervisor_patio', 'admin')
PERFIS_LEITURA = ('conferente', 'supervisor_patio', 'supervisor_vendas', 'admin')


def _exige_gestao(request):
    if request.user.perfil not in PERFIS_GESTAO:
        return Response(
            {'erro': 'restrito ao Supervisor de Pátio'},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    return None


def _exige_leitura(request):
    if request.user.perfil not in PERFIS_LEITURA:
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)
    return None


def _parse_data(valor):
    """(data, erro) — default hoje no fuso local quando vazio."""
    if not valor:
        return timezone.localdate(), None
    try:
        return date.fromisoformat(valor), None
    except ValueError:
        return None, Response(
            {'erro': 'data inválida — use YYYY-MM-DD'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )


def _serializar(s: Separador, liberado_hoje=None) -> dict:
    dados = {
        'id': s.id,
        'nome': s.nome,
        'apelido': s.apelido,
        'documento': s.documento,
        'tipo': s.tipo,
        'ativo': s.ativo,
        'criado_em': s.criado_em,
    }
    if liberado_hoje is not None:
        dados['liberado_hoje'] = liberado_hoje
    return dados


# ---------------------------------------------------------------------------
# Cadastro — listar / criar / atualizar
# ---------------------------------------------------------------------------

@api_view(['GET', 'POST'])
def listar_ou_criar(request):
    err = _exige_gestao(request)
    if err:
        return err

    if request.method == 'POST':
        nome = (request.data.get('nome') or '').strip()
        if not nome:
            return Response({'erro': 'nome obrigatório'}, status=http_status.HTTP_400_BAD_REQUEST)

        tipo = (request.data.get('tipo') or Separador.Tipo.EXTRA).strip()
        if tipo not in (Separador.Tipo.EXTRA, Separador.Tipo.FUNCIONARIO):
            return Response(
                {'erro': 'tipo inválido (extra ou funcionario)'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        separador = Separador.objects.create(
            nome=nome,
            apelido=(request.data.get('apelido') or '').strip(),
            documento=(request.data.get('documento') or '').strip(),
            tipo=tipo,
        )
        return Response(
            _serializar(separador, liberado_hoje=False),
            status=http_status.HTTP_201_CREATED,
        )

    # GET — lista com flag de liberação do dia
    hoje = timezone.localdate()
    qs = Separador.objects.annotate(
        liberado_hoje=Exists(
            SeparadorLiberacao.objects.filter(separador=OuterRef('pk'), data=hoje)
        )
    )

    search = (request.query_params.get('search') or '').strip()
    if search:
        qs = qs.filter(
            Q(nome__icontains=search) | Q(apelido__icontains=search) | Q(documento__icontains=search)
        )
    if request.query_params.get('ativos') == '1':
        qs = qs.filter(ativo=True)

    return Response([_serializar(s, liberado_hoje=s.liberado_hoje) for s in qs])


@api_view(['PATCH'])
def atualizar(request, pk):
    err = _exige_gestao(request)
    if err:
        return err

    separador = get_object_or_404(Separador, pk=pk)

    if 'nome' in request.data:
        nome = (request.data.get('nome') or '').strip()
        if not nome:
            return Response({'erro': 'nome não pode ficar vazio'}, status=http_status.HTTP_400_BAD_REQUEST)
        separador.nome = nome
    if 'apelido' in request.data:
        separador.apelido = (request.data.get('apelido') or '').strip()
    if 'documento' in request.data:
        separador.documento = (request.data.get('documento') or '').strip()
    if 'tipo' in request.data:
        tipo = (request.data.get('tipo') or '').strip()
        if tipo not in (Separador.Tipo.EXTRA, Separador.Tipo.FUNCIONARIO):
            return Response(
                {'erro': 'tipo inválido (extra ou funcionario)'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        separador.tipo = tipo
    if 'ativo' in request.data:
        separador.ativo = bool(request.data.get('ativo'))

    separador.save()

    hoje = timezone.localdate()
    liberado = separador.liberacoes.filter(data=hoje).exists()
    return Response(_serializar(separador, liberado_hoje=liberado))


# ---------------------------------------------------------------------------
# Liberação diária
# ---------------------------------------------------------------------------

@api_view(['POST'])
def liberar(request):
    err = _exige_gestao(request)
    if err:
        return err

    ids = request.data.get('separador_ids') or []
    if not isinstance(ids, list) or not ids:
        return Response({'erro': 'separador_ids obrigatório'}, status=http_status.HTTP_400_BAD_REQUEST)

    data, err = _parse_data(request.data.get('data'))
    if err:
        return err

    liberados = []
    for separador in Separador.objects.filter(pk__in=ids, ativo=True):
        SeparadorLiberacao.objects.get_or_create(
            separador=separador, data=data,
            defaults={'liberado_por': request.user},
        )
        liberados.append(separador.id)

    ignorados = [i for i in ids if i not in liberados]
    return Response({'liberados': liberados, 'ignorados': ignorados, 'data': data})


@api_view(['POST'])
def desliberar(request):
    err = _exige_gestao(request)
    if err:
        return err

    ids = request.data.get('separador_ids') or []
    if not isinstance(ids, list) or not ids:
        return Response({'erro': 'separador_ids obrigatório'}, status=http_status.HTTP_400_BAD_REQUEST)

    data, err = _parse_data(request.data.get('data'))
    if err:
        return err

    removidos, _ = SeparadorLiberacao.objects.filter(separador_id__in=ids, data=data).delete()
    return Response({'removidos': removidos, 'data': data})


@api_view(['GET'])
def listar_liberados(request):
    """Separadores ativos liberados na data (default hoje) — picker do conferente."""
    err = _exige_leitura(request)
    if err:
        return err

    data, err = _parse_data(request.query_params.get('data'))
    if err:
        return err

    qs = (
        Separador.objects
        .filter(ativo=True, liberacoes__data=data)
        .order_by('nome')
        .distinct()
    )
    return Response([
        {'id': s.id, 'nome': s.nome, 'apelido': s.apelido}
        for s in qs
    ])
