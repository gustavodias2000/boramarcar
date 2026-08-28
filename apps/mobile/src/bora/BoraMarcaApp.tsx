import React, { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { isSupabaseConfigured, supabase } from "../../supabaseConfig";
import { colors } from "./theme";
import { BoraStateProvider } from "./state";
import { AuthScreen, BusinessSetupScreen, ContextsScreen, JoinBusinessScreen, RoleScreen, WelcomeScreen } from "./AuthFlow";
import { BusinessTabs, CustomerBookingScreen, CustomerTabs, StaffBookingScreen } from "./Navigation";

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

  return <SafeAreaProvider><StatusBar barStyle="light-content" backgroundColor={colors.background} /><BoraStateProvider session={session}><NavigationContainer theme={navigationTheme}><RootNavigator signedIn={Boolean(session)} /></NavigationContainer></BoraStateProvider></SafeAreaProvider>;
}

function RootNavigator({ signedIn }: { readonly signedIn: boolean }) {
  return <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
    {signedIn ? <>
      <Stack.Screen name="Contexts" component={ContextsScreen} />
      <Stack.Screen name="BusinessSetup" component={BusinessSetupScreen} options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="JoinBusiness" component={JoinBusinessScreen} options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="BusinessTabs" component={BusinessTabs} />
      <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
      <Stack.Screen name="CustomerBooking" component={CustomerBookingScreen} options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="StaffBooking" component={StaffBookingScreen} options={{ animation: "slide_from_right" }} />
    </> : <>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Role" component={RoleScreen} options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ animation: "slide_from_bottom" }} />
    </>}
  </Stack.Navigator>;
}

function BootScreen() {
  return <View style={styles.boot}><ActivityIndicator color={colors.amber} size="large" /><Text style={styles.bootText}>Preparando sua agenda</Text></View>;
}

function ConfigurationRequired() {
  return <View style={styles.boot}><Text style={styles.configTitle}>Bora Marcá precisa ser conectado</Text><Text style={styles.bootText}>Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo de ambiente do aplicativo.</Text></View>;
}

const styles = StyleSheet.create({ boot: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }, bootText: { color: colors.textSecondary, fontSize: 16, textAlign: "center", lineHeight: 24 }, configTitle: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" } });
