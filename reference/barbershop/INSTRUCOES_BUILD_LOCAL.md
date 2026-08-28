# Instruções para Build Local - Barbershop App

## 🚀 Guia Completo para Compilar o APK

Este guia fornece instruções passo a passo para compilar o aplicativo Barbershop em seu ambiente local.

---

## 📋 Pré-requisitos

### 1. Node.js e npm
```bash
# Verificar se está instalado
node --version  # Deve ser 18.x ou superior
npm --version

# Se não estiver instalado, baixe de: https://nodejs.org/
```

### 2. Java Development Kit (JDK)
```bash
# Instalar JDK 17 (recomendado)
# Windows: Baixar de https://adoptium.net/
# macOS: brew install openjdk@17
# Linux: sudo apt install openjdk-17-jdk

# Verificar instalação
java -version
javac -version
```

### 3. Android Studio ou Android SDK
**Opção A: Android Studio (Recomendado)**
1. Baixe de: https://developer.android.com/studio
2. Instale seguindo o wizard
3. Abra Android Studio → SDK Manager
4. Instale:
   - Android SDK Platform 35
   - Android SDK Build-Tools 35.0.0
   - Android NDK (Side by side) 27.1.12297006

**Opção B: Command Line Tools apenas**
1. Baixe de: https://developer.android.com/studio#command-tools
2. Extraia para uma pasta (ex: `/opt/android-sdk`)
3. Configure as variáveis de ambiente

---

## ⚙️ Configuração do Ambiente

### 1. Variáveis de Ambiente

**Windows (PowerShell):**
```powershell
# Adicionar ao perfil do PowerShell ou configurar nas variáveis do sistema
$env:ANDROID_HOME = "C:\Users\SeuUsuario\AppData\Local\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.x-hotspot"
$env:PATH += ";$env:ANDROID_HOME\cmdline-tools\latest\bin"
$env:PATH += ";$env:ANDROID_HOME\platform-tools"
$env:PATH += ";$env:JAVA_HOME\bin"
```

**macOS/Linux (Bash/Zsh):**
```bash
# Adicionar ao ~/.bashrc, ~/.zshrc ou ~/.profile
export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS
# export ANDROID_HOME=/opt/android-sdk  # Linux
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home  # macOS
# export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64  # Linux
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$JAVA_HOME/bin

# Recarregar o perfil
source ~/.bashrc  # ou ~/.zshrc
```

### 2. Verificar Configuração
```bash
# Verificar se as ferramentas estão acessíveis
adb --version
sdkmanager --version
java -version
```

### 3. Aceitar Licenças do Android SDK
```bash
# Aceitar todas as licenças
sdkmanager --licenses
# Digite 'y' para cada licença apresentada
```

---

## 📱 Preparação do Projeto

### 1. Extrair o Projeto
```bash
# Extrair o arquivo BarbershopApp.zip
unzip BarbershopApp.zip
cd BarbershopApp
```

### 2. Instalar Dependências
```bash
# Instalar dependências do Node.js
npm install

# Se houver problemas, tente:
npm install --legacy-peer-deps
```

### 3. Configurar Firebase (OBRIGATÓRIO)

**A. Criar Projeto Firebase:**
1. Acesse https://console.firebase.google.com/
2. Clique em "Criar projeto"
3. Siga o wizard de criação
4. Ative Authentication e Firestore

**B. Configurar Authentication:**
1. No console Firebase → Authentication → Sign-in method
2. Ative "Email/password"

**C. Configurar Firestore:**
1. No console Firebase → Firestore Database
2. Criar banco de dados (modo teste)
3. Criar coleções:
   - `barbeiros` (para dados dos barbeiros)
   - `agendamentos` (criada automaticamente)

**D. Baixar google-services.json:**
1. No console Firebase → Configurações do projeto
2. Adicionar app Android
3. Package name: `com.barbershopapp`
4. Baixar `google-services.json`
5. Substituir o arquivo em `android/app/google-services.json`

**E. Atualizar firebase.js:**
```javascript
// Substituir as configurações genéricas pelas suas
const firebaseConfig = {
  apiKey: "sua-api-key-aqui",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto-id",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:android:abc123def456"
};
```

### 4. Configurar WhatsApp Business API (OPCIONAL)

**Se quiser usar a API oficial:**
1. Acesse https://developers.facebook.com/
2. Crie um app Business
3. Adicione produto WhatsApp
4. Configure Business Portfolio
5. Gere Access Token
6. Atualize `src/services/WhatsAppConfig.js`:

```javascript
export const WHATSAPP_CONFIG = {
  ACCESS_TOKEN: 'seu-access-token-aqui',
  PHONE_NUMBER_ID: 'seu-phone-number-id-aqui',
  // ... outras configurações
};
```

**Se não configurar:**
- O app funcionará normalmente
- WhatsApp será aberto via link direto (fallback)

---

## 🔨 Build do APK

### 1. Preparar Build
```bash
# Navegar para pasta do projeto
cd BarbershopApp

# Limpar cache (se necessário)
npx react-native start --reset-cache
```

### 2. Build Debug (Desenvolvimento)
```bash
# Navegar para pasta Android
cd android

# Build debug
./gradlew assembleDebug

# No Windows:
# gradlew.bat assembleDebug
```

### 3. Build Release (Produção)
```bash
# Build release
./gradlew assembleRelease

# No Windows:
# gradlew.bat assembleRelease
```

### 4. Localizar APK
```bash
# APK Debug estará em:
android/app/build/outputs/apk/debug/app-debug.apk

# APK Release estará em:
android/app/build/outputs/apk/release/app-release.apk
```

---

## 🐛 Solução de Problemas

### Problema 1: "SDK location not found"
**Solução:**
```bash
# Criar arquivo local.properties na pasta android/
echo "sdk.dir=/caminho/para/android-sdk" > android/local.properties

# Exemplo Windows:
echo "sdk.dir=C:\\Users\\SeuUsuario\\AppData\\Local\\Android\\Sdk" > android/local.properties

# Exemplo macOS:
echo "sdk.dir=/Users/SeuUsuario/Library/Android/sdk" > android/local.properties
```

### Problema 2: "License not accepted"
**Solução:**
```bash
# Aceitar licenças novamente
sdkmanager --licenses

# Se não funcionar, instalar componentes manualmente:
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

### Problema 3: "Java version incompatible"
**Solução:**
```bash
# Verificar versão do Java
java -version

# Deve ser Java 17. Se não for, instalar Java 17 e configurar JAVA_HOME
```

### Problema 4: "Metro bundler issues"
**Solução:**
```bash
# Limpar cache do Metro
npx react-native start --reset-cache

# Limpar cache do npm
npm start -- --reset-cache

# Reinstalar node_modules
rm -rf node_modules
npm install
```

### Problema 5: "Gradle build failed"
**Solução:**
```bash
# Limpar build do Gradle
cd android
./gradlew clean

# Build novamente
./gradlew assembleDebug
```

### Problema 6: "Firebase not configured"
**Erro:** App trava ao fazer login

**Solução:**
1. Verificar se `google-services.json` está correto
2. Verificar se `firebase.js` tem as configurações corretas
3. Verificar se Authentication está ativado no console Firebase

---

## 📊 Teste do Aplicativo

### 1. Criar Dados de Teste

**A. Criar usuários no Firebase Authentication:**
1. Console Firebase → Authentication → Users
2. Adicionar usuários:
   - `cliente@teste.com` (senha: 123456)
   - `barbeiro@teste.com` (senha: 123456)

**B. Adicionar barbeiros no Firestore:**
1. Console Firebase → Firestore → Coleção `barbeiros`
2. Adicionar documento:
```json
{
  "nome": "João Silva",
  "especialidade": "Corte e barba",
  "preco": "30,00",
  "telefone": "5511999999999"
}
```

### 2. Fluxo de Teste
1. **Login:** Teste com os usuários criados
2. **Cliente:** Visualizar barbeiros, fazer agendamento
3. **Barbeiro:** Ver agendamentos, confirmar/cancelar
4. **WhatsApp:** Testar envio de mensagens (se configurado)
5. **Histórico:** Verificar histórico de agendamentos

---

## 📦 Distribuição do APK

### 1. APK Debug
- ✅ Para testes internos
- ✅ Permite debugging
- ❌ Não otimizado
- ❌ Não assinado para produção

### 2. APK Release
- ✅ Otimizado para produção
- ✅ Menor tamanho
- ⚠️ Requer assinatura para Play Store

### 3. Assinatura para Play Store (Se necessário)
```bash
# Gerar keystore
keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000

# Configurar gradle.properties
echo "MYAPP_RELEASE_STORE_FILE=my-release-key.keystore" >> android/gradle.properties
echo "MYAPP_RELEASE_KEY_ALIAS=my-key-alias" >> android/gradle.properties
echo "MYAPP_RELEASE_STORE_PASSWORD=senha-do-keystore" >> android/gradle.properties
echo "MYAPP_RELEASE_KEY_PASSWORD=senha-da-chave" >> android/gradle.properties
```

---

## ✅ Checklist Final

Antes de distribuir o APK, verifique:

- [ ] Firebase configurado com credenciais reais
- [ ] WhatsApp API configurado (ou fallback funcionando)
- [ ] Dados de barbeiros adicionados no Firestore
- [ ] Usuários de teste criados
- [ ] APK testado em dispositivo real
- [ ] Funcionalidades principais testadas:
  - [ ] Login/logout
  - [ ] Listagem de barbeiros
  - [ ] Agendamento
  - [ ] Confirmação/cancelamento
  - [ ] Histórico
  - [ ] WhatsApp (se configurado)

---

## 📞 Suporte

Se encontrar problemas durante o build:

1. **Verifique os logs:** Sempre leia as mensagens de erro completas
2. **Limpe caches:** Metro, Gradle, npm
3. **Verifique configurações:** Variáveis de ambiente, Firebase
4. **Teste em etapas:** Primeiro debug, depois release

**Logs úteis:**
```bash
# Logs do Metro bundler
npx react-native start

# Logs do Gradle (verbose)
./gradlew assembleDebug --info --stacktrace

# Logs do dispositivo (se conectado)
adb logcat
```

---

*Guia atualizado para React Native 0.80.0*
*Testado em: Windows 11, macOS Sonoma, Ubuntu 22.04*

