# BarberShop

Aplicativo React Native/TypeScript de agendamento para clientes e gestão de barbearias. A estrutura, telas, riscos e índice dos documentos estão em [docs/RELATORIOS.md](docs/RELATORIOS.md).

## Execução rápida

Pré-requisitos: Node 18+, JDK 17 e Android Studio/SDK. Para iOS, macOS, Xcode e CocoaPods.

```powershell
npm ci
npm run emulators
# Em outro terminal:
npm start
# Em outro terminal, com emulador Android aberto ou aparelho conectado:
npm run android
```

Para conferir antes de enviar alterações: `npx tsc --noEmit`, `npm run lint` e `npm test -- --ci`.

> A seção **Procedimento vigente** abaixo substitui qualquer instrução operacional do texto padrão preservado como histórico.

---

## Procedimento vigente

O procedimento abaixo substitui o texto padrão preservado ao final deste arquivo. O produto deve preservar o isolamento entre empresas (tenants): um usuário ou profissional de uma empresa não pode acessar os dados de outra.

Consulte [docs/RELATORIOS.md](docs/RELATORIOS.md) para o estado técnico, [docs/GUIA_DESENVOLVIMENTO.md](docs/GUIA_DESENVOLVIMENTO.md) para desenvolvimento, [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) para testes e [functions/README.md](functions/README.md) para operação das Functions.

Em builds de desenvolvimento, Auth, Firestore e Functions se conectam à Firebase Emulator Suite. Não use contas ou dados de produção como atalho para testes. Em aparelho Android físico, faça o redirecionamento de portas descrito no guia de desenvolvimento.

Verificações locais:

```powershell
npx tsc --noEmit
npm run lint
npm test -- --ci --runInBand
npm run test:rules
```

Publicar regras, índices ou Functions e configurar Firebase Secrets são operações externas, que exigem autorização e não são realizadas pelos comandos acima. Builds Android de release exigem uma chave de assinatura real.

<!-- Conteúdo padrão do React Native preservado apenas como histórico. Não é instrução operacional do BarberShop.

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
-->
