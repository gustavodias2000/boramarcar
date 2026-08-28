# Add project specific ProGuard rules here.

# ── React Native ──────────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**

# ── Firebase ──────────────────────────────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── React Native Safe Area Context ───────────────────────────────────────────
-keep class com.th3rdwave.safeareacontext.** { *; }

# ── React Native Screens ──────────────────────────────────────────────────────
-keep class com.swmansion.rnscreens.** { *; }

# ── AsyncStorage ──────────────────────────────────────────────────────────────
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ── Keep JavaScript interface annotations ────────────────────────────────────
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Serialization / Reflection ───────────────────────────────────────────────
-keepattributes Signature
-keepattributes Exceptions
-keepattributes SourceFile,LineNumberTable
