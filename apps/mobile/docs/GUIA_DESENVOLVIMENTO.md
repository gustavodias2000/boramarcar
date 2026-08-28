# Guia de desenvolvimento

Este e o procedimento operacional atual do projeto. Ele substitui instrucoes antigas espalhadas na raiz quando houver divergencia.

## Pre-requisitos

- Node.js 18 ou superior;
- JDK 17;
- Android Studio com SDK instalado e um emulador configurado, ou dispositivo Android com depuracao USB;
- macOS, Xcode e CocoaPods para iOS.

## Instalar e executar

```powershell
npm ci
npm start
```

Em outro terminal:

```powershell
npm run android
```

Para iOS, em macOS:

```sh
bundle install
bundle exec pod install --project-directory=ios
npm run ios
```

## Verificacoes antes de alterar ou publicar

```powershell
npx tsc --noEmit
npm run lint
npm test -- --ci --runInBand
```

Na verificacao de 01/08/2026, os tipos e o lint passaram sem avisos; 426 testes unitários passaram e as 6 regras críticas do Firestore foram verificadas no Emulator Suite.

## Firebase e testes E2E

Em desenvolvimento (`__DEV__`), `firebaseConfig.ts` conecta Auth, Firestore e Functions à Emulator Suite declarada em `firebase.json`. As portas são: Emulator UI 4000, Auth 9099, Firestore 8080 e Functions 5001. O Android Emulator acessa a máquina hospedeira por `10.0.2.2`; em aparelho físico, execute `adb reverse` para as portas 8081, 9099, 8080 e 5001 antes de abrir o app.

Os emuladores iniciam vazios. `npm run e2e:seed` limpa e recria usuários e dados fictícios determinísticos exclusivamente em Auth/Firestore locais; ele falha se os hosts não forem loopback. Para Android, `npm run e2e:android` inicia Auth, Firestore e Functions locais, aplica o seed e executa Detox. O CI ainda precisa disponibilizar AVD/SDK e executar o build do app, mas não depende de dados de produção. A exportação local `.firebase-emulator-data/` é ignorada pelo Git e não deve conter dados pessoais compartilhados.

## Deploy e release

Builds debug não exigem keystore de release. Tarefas Gradle de release falham se `android/keystore.properties` estiver ausente, em vez de gerar um artefato publicável assinado com chave debug. A configuração de chave real no CI, Firebase Secrets e qualquer deploy é uma operação externa que requer autorização explícita; este guia não afirma que foi executada.

<!-- Conteúdo anterior desta seção preservado como histórico; não é procedimento operacional.

`firebaseConfig.ts` e `.firebaserc` apontam para `barbershop-5dca2`. Em builds de desenvolvimento, o app usa a Emulator Suite declarada em `firebase.json`; builds de release nao se conectam aos emuladores.

Inicie os emuladores antes do Metro:

```powershell
npm run emulators
```

Os testes Detox ainda precisam de seed/reset deterministico, mas nao devem usar contas ou dados de producao.

## Deploy e release

Publicacoes de regras, indices e Functions exigem Firebase CLI autenticado e permissao no projeto. Secrets do WhatsApp devem ser configurados somente via Firebase Secrets, conforme `functions/README.md`.

O `assembleRelease` atual pode assinar com chave debug se `android/keystore.properties` nao existir. Nao publique um artefato nessa condicao. O CI/deploy precisa falhar explicitamente sem a chave de release configurada.
-->
