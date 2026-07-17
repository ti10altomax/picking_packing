# Separa — Mobile (React Native + Expo)

App nativo Android/iOS do Separa. Compartilha o backend Django com o frontend web.

## Stack

- **Expo SDK 54** — com pasta `android/` nativa (prebuild) pro build local
- **Expo Router 6** — file-based routing (igual Next App Router)
- **NativeWind 4** — Tailwind CSS pra RN (sintaxe `className="..."`)
- **Zustand** — state global (mesmo lib do web)
- **axios** — HTTP client (mesmo lib do web)
- **expo-secure-store** — armazenamento seguro de tokens JWT (substitui localStorage)

## Setup

```bash
cd mobile
npm install
cp .env.example .env
# Edite EXPO_PUBLIC_API_URL com o IP do seu backend
```

### Como o celular alcança o backend (dev)

O `EXPO_PUBLIC_API_URL` precisa ser um endereço **acessível pelo celular pela LAN**:

- ❌ `http://localhost:8000` — só funciona em emulador no PC
- ❌ `http://172.18.18.123:8000` — IP do WSL, celular não alcança
- ✅ `http://192.168.1.50:8000` — IP do Windows na LAN da empresa
- ✅ `http://192.168.1.199:8003` — backend na VM de produção

#### Por que 8000 no dev e 8003 na VM

O Django **sempre** escuta na 8000 *dentro do container* — o que muda é a porta
publicada no host:

| Onde | Compose | Porta do host |
|---|---|---|
| Dev (sua máquina) | `docker-compose.yml` → `8000:8000` | `:8000` |
| VM de produção | `docker-compose.prod.yml` → `8003:8000` | `:8003` |

Na VM a 8000 já está ocupada por outra aplicação, daí a 8003. Os dois estão certos
no seu contexto — `:8000` aqui no dev **não** é engano.

#### E o Caddy (`https://192.168.1.199`)?

Serve o **web**, não o app. O APK chama a 8003 em HTTP direto e **não passa pelo
Caddy**: o cert é mkcert, cuja root CA não é confiada pelo Android, e o HTTPS morre
com `ERR_NETWORK`. Por isso `usesCleartextTraffic` está ligado (`app.json` e
`AndroidManifest.xml`) — sem ele o Android 9+ bloqueia HTTP em build release.

Quando houver cert válido (DNS interno tipo `separa.altomax.local`), dá pra tirar o
cleartext e voltar pra HTTPS.

Pra descobrir o IP do Windows na LAN: `ipconfig` (Windows) ou no painel de rede.

## Rodando

```bash
npm start
```

Isso abre o **Metro bundler**. Aí escolhe:

- Pressionar `a` → abre no emulador Android (precisa Android Studio)
- Escanear o **QR code** com o app **Expo Go** no celular Android
- (iOS) escanear com a câmera, abre no Expo Go

O app recarrega automaticamente quando você salva qualquer arquivo.

## Estrutura

```
mobile/
├── app/                    # rotas (file-based)
│   ├── _layout.tsx         # raiz: SafeArea, GestureHandler, Stack
│   ├── index.tsx           # entry: hidrata sessão e redireciona
│   ├── login.tsx           # login JWT
│   ├── separacao/          # tela do separador (placeholder)
│   ├── supervisor/         # telas dos sup. vendas/pátio (placeholder)
│   ├── admin/              # admin (placeholder)
│   └── etiquetador/        # CONGELADO
├── components/             # componentes reutilizáveis
├── lib/
│   ├── api.ts              # axios + interceptors + endpoints
│   ├── destino.ts          # rota por perfil
│   └── jwt.ts              # decode JWT
├── stores/
│   └── authStore.ts        # Zustand auth (token + user via SecureStore)
├── tailwind.config.js      # mesma paleta zinc do web
└── global.css              # @tailwind base/components/utilities
```

## Build de produção (APK)

Build **local** com Gradle — é o caminho padrão.

**1. Confira o `.env` antes de buildar.** O `EXPO_PUBLIC_API_URL` é embutido no
bundle em tempo de build; trocar o `.env` depois não muda o APK já gerado.

```
EXPO_PUBLIC_API_URL=http://192.168.1.199:8003
```

**2. Rode o Gradle:**

```powershell
cd mobile\android
.\gradlew.bat assembleRelease
```

**3. O APK sai em:**

```
mobile/android/app/build/outputs/apk/release/app-release.apk
```

Daí é sideload nos coletores do galpão.

### Assinatura

O `release` é assinado com a **`app/debug.keystore`** (padrão do template Expo,
ver `app/build.gradle`). Serve pro sideload interno, mas tem uma consequência
prática: se essa keystore for regenerada ou perdida, o Android recusa atualizar
o app instalado (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) e é preciso **desinstalar
antes de instalar o novo APK** — o que apaga a sessão salva no SecureStore.

Enquanto a `debug.keystore` do repo continuar a mesma, a atualização por cima funciona.

### EAS Build (emergência)

Fica configurado (`eas.json`, scripts `build:preview` / `build:production`) como
alternativa cloud caso o build local quebre. Não é o caminho padrão.

```bash
npx eas build --platform android --profile preview
```

Atenção: os perfis do `eas.json` têm o `EXPO_PUBLIC_API_URL` **próprio**, separado
do `.env` local.

## Próximos passos

- [ ] Lista "atribuídos a mim" do separador (`app/separacao/index.tsx`)
- [ ] Tela de separação por volumes (`app/separacao/[id].tsx`)
- [ ] Câmera scanner com `expo-camera` ou `react-native-vision-camera`
- [ ] Telas dos supervisores (vendas, pátio, separados, não conformes)
- [ ] Dialog reutilizável estilo SweetAlert (Modal nativo)
- [ ] Keystore de release própria (hoje o release usa a `debug.keystore`)
