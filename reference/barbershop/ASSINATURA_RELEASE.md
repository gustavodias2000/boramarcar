# Como assinar o app para produção (release)

O build de release **não usa mais a chave de debug** — agora ele exige um
keystore próprio e seguro. Sem isso, o app não pode ser publicado com segurança
na Play Store (qualquer um poderia assinar uma atualização falsa).

O Gradle lê as credenciais de `android/keystore.properties`, um arquivo que
**não vai para o Git** (está no `.gitignore`). Se ele não existir, o build de
release cai na chave de debug — ou seja, seu `assembleDebug` continua funcionando
normalmente sem nenhuma configuração.

## Passo 1 — Gerar o keystore (uma vez só)

Na pasta `android/app/`, rode (precisa do Java instalado — o `keytool` vem com ele):

```powershell
cd D:\Claude\Barbershop-master\android\app
keytool -genkeypair -v -storetype PKCS12 `
  -keystore barbershop-release.jks `
  -alias barbershop `
  -keyalg RSA -keysize 2048 -validity 10000
```

Ele vai pedir uma **senha** e alguns dados (nome, organização, cidade...).
**Guarde essa senha em local seguro** — se você perdê-la, nunca mais conseguirá
publicar atualizações do app com a mesma identidade.

## Passo 2 — Criar o keystore.properties

Na pasta `android/`, copie o modelo e preencha:

```powershell
cd D:\Claude\Barbershop-master\android
copy keystore.properties.example keystore.properties
```

Abra `keystore.properties` no bloco de notas e preencha com a senha que você criou:

```
storeFile=app/barbershop-release.jks
storePassword=SUA_SENHA_AQUI
keyAlias=barbershop
keyPassword=SUA_SENHA_AQUI
```

(Se você usou a mesma senha para o keystore e para a chave, repita nos dois campos.)

## Passo 3 — Gerar o APK/AAB assinado

APK (para instalar direto no celular):

```powershell
cd D:\Claude\Barbershop-master\android
.\gradlew assembleRelease
```
→ Saída: `android/app/build/outputs/apk/release/app-release.apk`

AAB (formato exigido pela Play Store):

```powershell
.\gradlew bundleRelease
```
→ Saída: `android/app/build/outputs/bundle/release/app-release.aab`

## Importante

- **Nunca** suba o `.jks` nem o `keystore.properties` para o GitHub (o `.gitignore`
  já bloqueia, mas confira).
- Faça **backup** do arquivo `.jks` e da senha num lugar seguro (gerenciador de
  senhas, cofre). Perder isso = perder a capacidade de atualizar o app na loja.
- Para a Play Store, o recomendado é ativar o **Play App Signing**, onde o Google
  guarda a chave final e você mantém só a chave de upload.
