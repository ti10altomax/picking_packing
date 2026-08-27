import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { destinoPorPerfil } from '@/lib/destino'
import { parseJwt } from '@/lib/jwt'

type JwtPayload = {
  user_id: number
  username?: string
  perfil?: string
}

export default function Login() {
  const router = useRouter()
  const { setAuth, hydrate, hydrated, token, user } = useAuthStore()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!hydrated) hydrate()
  }, [])

  useEffect(() => {
    if (hydrated && token && user) {
      router.replace(destinoPorPerfil(user.perfil) as never)
    }
  }, [hydrated, token, user])

  async function handleSubmit() {
    if (!username || !password || loading) return
    setErro('')
    setLoading(true)
    try {
      const data = await authApi.login(username, password)
      const payload = parseJwt<JwtPayload>(data.access)
      await setAuth(data.access, data.refresh, {
        id: payload.user_id,
        username: payload.username ?? username,
        perfil: (payload.perfil as never) ?? 'conferente',
      })
      router.replace(destinoPorPerfil(payload.perfil) as never)
    } catch (e: unknown) {
      const err = e as {
        response?: { status?: number; data?: { detail?: string } }
        request?: unknown
        message?: string
        code?: string
      }
      if (err.response) {
        if (err.response.status === 401) {
          setErro('Usuário ou senha incorretos.')
        } else {
          setErro(`HTTP ${err.response.status}: ${err.response.data?.detail ?? 'erro do servidor'}`)
        }
      } else if (err.request) {
        setErro(`Sem resposta do servidor (${err.code ?? err.message ?? 'rede'}).`)
      } else {
        setErro(err.message ?? 'Erro desconhecido.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#a1a1aa" />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-black">
      {/* Glows decorativos no fundo — não há gradient nativo, usamos círculos blur-ed */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -120, left: -80,
          width: 320, height: 320, borderRadius: 160,
          backgroundColor: '#1e3a8a', opacity: 0.35,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -140, right: -100,
          width: 380, height: 380, borderRadius: 190,
          backgroundColor: '#7c3aed', opacity: 0.25,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '40%', right: -60,
          width: 220, height: 220, borderRadius: 110,
          backgroundColor: '#0ea5e9', opacity: 0.18,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            className="w-full max-w-sm self-center rounded-3xl border border-white/10 overflow-hidden"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              shadowColor: '#000',
              shadowOpacity: 0.4,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 8,
            }}
          >
            {/* Cabeçalho com a marca Altomax — desenhado em runtime, sem asset */}
            <View
              style={{
                height: 140,
                backgroundColor: '#000000',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 32,
              }}
            >
              <View style={{ height: 2, width: 220, backgroundColor: '#ffffff', marginBottom: 14 }} />
              <Text
                style={{
                  fontFamily: Platform.select({ ios: 'Times New Roman', android: 'serif' }),
                  fontSize: 44,
                  color: '#ffffff',
                  letterSpacing: 4,
                  fontWeight: '400',
                }}
              >
                ALTOMAX
              </Text>
              <View style={{ height: 2, width: 220, backgroundColor: '#ffffff', marginTop: 14 }} />
            </View>

            <View className="p-7">
              <Text className="text-white/60 text-xs tracking-[3px] text-center mb-1">
                SISTEMA DE SEPARAÇÃO
              </Text>
              <Text className="text-white text-xl font-semibold text-center mb-6">
                Bem-vindo
              </Text>

              <View className="mb-3">
                <Text className="text-white/70 text-xs font-medium mb-1.5 ml-0.5">USUÁRIO</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect={false}
                  placeholder="seu.usuario"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  selectionColor="#ffffff"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderColor: 'rgba(255,255,255,0.15)',
                    borderWidth: 1,
                    borderRadius: 14,
                    height: 48,
                    paddingHorizontal: 14,
                    color: '#ffffff',
                    fontSize: 16,
                  }}
                />
              </View>

              <View className="mb-4">
                <Text className="text-white/70 text-xs font-medium mb-1.5 ml-0.5">SENHA</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="password"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  selectionColor="#ffffff"
                  onSubmitEditing={handleSubmit}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderColor: 'rgba(255,255,255,0.15)',
                    borderWidth: 1,
                    borderRadius: 14,
                    height: 48,
                    paddingHorizontal: 14,
                    color: '#ffffff',
                    fontSize: 16,
                  }}
                />
              </View>

              {erro ? (
                <View
                  className="mb-4 rounded-xl px-3 py-2.5 border"
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.18)',
                    borderColor: 'rgba(248,113,113,0.4)',
                  }}
                >
                  <Text className="text-red-200 text-sm">{erro}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleSubmit}
                disabled={loading || !username || !password}
                className={`h-12 rounded-xl items-center justify-center active:opacity-80 ${
                  loading || !username || !password ? 'opacity-50' : ''
                }`}
                style={{
                  backgroundColor: '#ffffff',
                  shadowColor: '#000',
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#18181b" />
                ) : (
                  <Text className="font-bold text-base text-zinc-900">Entrar</Text>
                )}
              </Pressable>

              <Text className="text-white/40 text-[11px] text-center mt-6">
                Altomax · uso interno
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
