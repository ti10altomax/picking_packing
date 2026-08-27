from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User


class SeparaTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['perfil'] = user.perfil
        return token


class SeparaTokenView(TokenObtainPairView):
    serializer_class = SeparaTokenSerializer


@api_view(['GET'])
def listar_conferentes(request):
    qs = User.objects.filter(
        perfil=User.Perfil.CONFERENTE, is_active=True,
    ).order_by('username').values('id', 'username', 'first_name', 'last_name')
    return Response(list(qs))
