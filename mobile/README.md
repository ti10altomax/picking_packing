# Separa — Mobile (React Native + Expo)

App nativo Android/iOS do Separa. Compartilha o backend Django com o frontend web.

## Stack

- **Expo SDK 51** — toolchain managed (sem Android Studio/Xcode pra começar)
- **Expo Router 3** — file-based routing (igual Next App Router)
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
- ✅ `https://192.168.1.199` — backend de produção (via Caddy)
- ✅ `https://separa.srv` — quando o DNS interno subir

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

Quando estiver pronto, usar **EAS Build** (cloud-based, sem Android Studio):

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

Resultado: APK pra sideload nos coletores do galpão.

## Próximos passos

- [ ] Lista "atribuídos a mim" do separador (`app/separacao/index.tsx`)
- [ ] Tela de separação por volumes (`app/separacao/[id].tsx`)
- [ ] Câmera scanner com `expo-camera` ou `react-native-vision-camera`
- [ ] Telas dos supervisores (vendas, pátio, separados, não conformes)
- [ ] Dialog reutilizável estilo SweetAlert (Modal nativo)
- [ ] Build APK via EAS
