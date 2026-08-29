import React, { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { BusinessType } from "@boramarca/core";

import { isSupabaseConfigured, supabase } from "../../supabaseConfig";
import { colors } from "./theme";
import { AccentProvider } from "./accent";
import { Onboarding, marcarOnboardingVisto, type OnboardingProfile } from "./onboarding";
import { BoraStateProvider, useBoraState } from "./state";
import { AuthScreen, BusinessSetupScreen, ContextsScreen, JoinBusinessScreen, RoleScreen, WelcomeScreen } from "./AuthFlow";
import { BusinessTabs, CustomerBookingScreen, CustomerTabs, EquipeScreen, ServicosScreen, StaffBookingScreen } from "./Navigation";

export type RootStackParamList = {
  Welcome: undefined;
  Role: undefined;
  Auth: { mode: "signIn" | "signUp" };
  Contexts: undefined;
  BusinessSetup: undefined;
  JoinBusiness: undefined;
  BusinessTabs: undefined;
  CustomerTabs: undefined;
  CustomerBooking: undefined;
  StaffBooking: undefined;
  Onboarding: { profile: OnboardingProfile; segment: BusinessType; destino: "BusinessTabs" | "CustomerTabs" };
  Servicos: undefined;
  Equipe: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.amber },
};

export function BoraMarcaApp() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <ConfigurationRequired />;
  if (loading) return <BootScreen />;

  return <SafeAreaProvider><StatusBar barStyle="light-content" backgroundColor={colors.background} /><BoraStateProvider session={session}><AccentFromContext><NavigationContainer theme={navigationTheme}><RootNavigator signedIn={Boolean(session)} /></NavigationContainer></AccentFromContext></BoraStateProvider></SafeAreaProvider>;
}

/**
 * O acento segue a empresa ativa.
 *
 * Fica DENTRO do `BoraStateProvider` porque lê dele, e FORA do `NavigationContainer`
 * porque toda tela precisa — inclusive as de entrada, que ainda não têm empresa e caem
 * no padrão do produto.
 */
function AccentFromContext({ children }: { readonly children: React.ReactNode }) {
  const { activeContext } = useBoraState();
  return <AccentProvider segment={activeContext?.businessType}>{children}</AccentProvider>;
}

function RootNavigator({ signedIn }: { readonly signedIn: boolean }) {
  return <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
    {signedIn ? <>
      <Stack.Screen name="Contexts" component={ContextsScreen} />
      <Stack.Screen name="BusinessSetup" component={BusinessSetupScreen} options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="JoinBusiness" component={JoinBusinessScreen} options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="BusinessTabs" component={BusinessTabs} />
      <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
      <Stack.Screen name="CustomerBooking" component={CustomerBookingScreen} options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="StaffBooking" component={StaffBookingScreen} options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Servicos" component={ServicosScreen} options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Equipe" component={EquipeScreen} options={{ animation: "slide_from_right" }} />
    </> : <>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Role" component={RoleScreen} options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ animation: "slide_from_bottom" }} />
    </>}
  </Stack.Navigator>;
}

/**
 * As boas-vindas do primeiro acesso.
 *
 * Vive na pilha, e nao dentro das abas, porque ela substitui a tela — nao e um passo
 * dentro do produto, e sim o que vem antes dele. `reset` no fim para o botao voltar nao
 * trazer a apresentacao de volta depois de vista.
 */
function OnboardingScreen({ navigation, route }: { readonly navigation: { reset: (state: { index: number; routes: { name: keyof RootStackParamList }[] }) => void }; readonly route: { params: RootStackParamList["Onboarding"] } }) {
  const { profile, segment, destino } = route.params;
  return <Onboarding profile={profile} segment={segment} onFinish={() => { void marcarOnboardingVisto(profile, segment); navigation.reset({ index: 0, routes: [{ name: destino }] }); }} />;
}

function BootScreen() {
  return <View style={styles.boot}><ActivityIndicator color={colors.amber} size="large" /><Text style={styles.bootText}>Preparando sua agenda</Text></View>;
}

function ConfigurationRequired() {
  return <View style={styles.boot}><Text style={styles.configTitle}>Bora Marcá precisa ser conectado</Text><Text style={styles.bootText}>Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo de ambiente do aplicativo.</Text></View>;
}

const styles = StyleSheet.create({ boot: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }, bootText: { color: colors.textSecondary, fontSize: 16, textAlign: "center", lineHeight: 24 }, configTitle: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" } });
