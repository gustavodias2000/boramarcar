# Regras de ofuscação do build de release.

# ── React Native ──────────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**

# ── Configuração do ambiente ──────────────────────────────────────────────────
# SEM ISTO O APLICATIVO ABRE DIZENDO QUE NÃO ESTÁ CONFIGURADO, e o build passa.
#
# O `react-native-config` grava SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY como campos do
# `BuildConfig` e os lê em tempo de execução por REFLEXÃO — `Class.forName(pacote +
# ".BuildConfig")`. Nenhum código referencia esses campos diretamente, então o R8
# conclui, corretamente pelo que ele enxerga, que ninguém os usa, e os remove.
#
# O resultado é o pior tipo de falha: `assembleRelease` termina com sucesso, o APK
# instala, e só na tela aparece "Conecte seu ambiente". O build de debug não mostra o
# problema porque não passa pelo R8.
#
# O curinga evita fixar `com.boramarca.mobile`: renomear o pacote não pode ressuscitar
# este defeito em silêncio.
-keep class **.BuildConfig { *; }
-keep class com.lugg.RNCConfig.** { *; }

# ── AsyncStorage ──────────────────────────────────────────────────────────────
# Onde a sessão do Supabase é guardada entre aberturas do aplicativo.
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ── Navegação e gestos ────────────────────────────────────────────────────────
# Voltaram com a reconstrução visual: abas, pilha nativa e área segura. Módulos
# nativos do React Native são instanciados por nome pela camada de autolinking, o
# mesmo caminho reflexivo que fez o R8 apagar o BuildConfig acima.
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class com.horcrux.svg.** { *; }

# ── Anotações de interface JavaScript ─────────────────────────────────────────
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Serialização / reflexão ───────────────────────────────────────────────────
-keepattributes Signature
-keepattributes Exceptions
-keepattributes SourceFile,LineNumberTable
