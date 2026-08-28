import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BUSINESS_TYPES, getSegmentConfig, type BusinessType } from "@boramarca/core";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Building2,
  CircleUserRound,
  LogIn,
  Mail,
  QrCode,
  Store,
} from "lucide-react-native";

import { supabase } from "../../supabaseConfig";
import { createBusiness, listBusinessContexts, listCustomerContexts, redeemInvitation, selectBusiness } from "../v1/repositories";
import type { BusinessContext } from "../v1/domain";
import type { RootStackParamList } from "./BoraMarcaApp";
import { SegmentPreview } from "./accent";
import { segmentIcon } from "./segment-art";
import { useBoraState } from "./state";
import { colors, elevation, radius, space, type } from "./theme";
import { AppIcon, BrandMark, Field, Notice, PrimaryButton, ScreenHeader, SecondaryButton, SelectRow, Surface, TextAction } from "./ui";

type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export function WelcomeScreen({ navigation }: Props<"Welcome">) {
  return <ImageBackground source={require("./assets/barbearia-degrade.png")} resizeMode="cover" style={styles.welcomeImage}>
    <View style={styles.welcomeScrim} />
    <SafeAreaView style={styles.welcome} edges={["top", "bottom"]}>
      <View style={styles.welcomeTop}><BrandMark inverse /><Text style={styles.welcomeTagline}>Agenda, clientes e crescimento no mesmo lugar.</Text></View>
      <View style={styles.welcomeBottom}>
        <Text accessibilityRole="header" style={styles.welcomeTitle}>Seu negócio.{"\n"}No seu ritmo.</Text>
        <Text style={styles.welcomeBody}>Uma experiência simples para quem atende e para quem quer marcar.</Text>
        <View style={styles.welcomeActions}><PrimaryButton label="Começar" onPress={() => navigation.navigate("Role")} /><SecondaryButton label="Já tenho uma conta" onPress={() => navigation.navigate("Auth", { mode: "signIn" })} /></View>
      </View>
    </SafeAreaView>
  </ImageBackground>;
}

export function RoleScreen({ navigation }: Props<"Role">) {
  return <SafeAreaView style={styles.page} edges={["top", "bottom"]}><ScreenHeader onBack={() => navigation.goBack()} title="Como você vai usar?" subtitle="Você pode ter uma empresa e também reservar em outras empresas." /><View style={styles.pageContent}>
    <Pressable onPress={() => navigation.navigate("Auth", { mode: "signUp" })} style={({ pressed }) => [styles.roleCard, elevation.card, pressed && styles.pressed]}><View style={styles.roleIcon}><Building2 color={colors.amber} size={30} /></View><Text style={styles.roleTitle}>Tenho uma empresa</Text><Text style={styles.roleBody}>Organize agenda, equipe, serviços e clientes em um só app.</Text><Text style={styles.roleAction}>Criar conta empresarial</Text></Pressable>
    <Pressable onPress={() => navigation.navigate("Auth", { mode: "signUp" })} style={({ pressed }) => [styles.roleCard, elevation.card, pressed && styles.pressed]}><View style={styles.roleIcon}><CircleUserRound color={colors.amber} size={30} /></View><Text style={styles.roleTitle}>Quero marcar um horário</Text><Text style={styles.roleBody}>Entre com o convite, código ou QR Code enviado pela empresa.</Text><Text style={styles.roleAction}>Criar conta de cliente</Text></Pressable>
    <TextAction label="Já tenho uma conta" onPress={() => navigation.navigate("Auth", { mode: "signIn" })} />
  </View></SafeAreaView>;
}

export function AuthScreen({ navigation, route }: Props<"Auth">) {
  const [mode, setMode] = useState(route.params.mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null); setMessage(null);
    if (!email.trim() || !password) { setError("Informe seu e-mail e uma senha de pelo menos 6 caracteres."); return; }
    if (mode === "signUp" && !fullName.trim()) { setError("Informe como você quer ser chamado."); return; }
    setLoading(true);
    const result = mode === "signIn"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } });
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    if (mode === "signUp" && !result.data.session) setMessage("Conta criada. Confirme o e-mail para entrar.");
  }

  const registering = mode === "signUp";
  return <SafeAreaView style={styles.page} edges={["top", "bottom"]}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}><ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled"><ScreenHeader onBack={() => navigation.goBack()} title={registering ? "Crie sua conta" : "Que bom ver você"} subtitle={registering ? "Sua conta funciona como empresário e cliente." : "Entre para continuar de onde parou."} />
    <Surface style={styles.authCard}><View style={styles.authMark}><BrandMark /><Text style={styles.authCaption}>Bora Marcá</Text></View>{error ? <Notice tone="danger">{error}</Notice> : null}{message ? <Notice tone="success">{message}</Notice> : null}
      {registering ? <Field label="Como quer ser chamado" value={fullName} onChangeText={setFullName} placeholder="Seu nome" autoCapitalize="words" /> : null}
      <Field label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@exemplo.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
      <Field label="Senha" value={password} onChangeText={setPassword} placeholder="Mínimo 6 caracteres" secureTextEntry autoCapitalize="none" />
      <PrimaryButton label={registering ? "Criar conta" : "Entrar"} onPress={() => void submit()} loading={loading} icon={registering ? Mail : LogIn} />
      <TextAction label={registering ? "Já tenho uma conta" : "Ainda não tenho conta"} onPress={() => { setError(null); setMessage(null); setMode(registering ? "signIn" : "signUp"); }} />
    </Surface></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

export function ContextsScreen({ navigation }: Props<"Contexts">) {
  const { user, activeContext, setActiveContext } = useBoraState();
  const [businesses, setBusinesses] = useState<BusinessContext[]>([]);
  const [customerBusinesses, setCustomerBusinesses] = useState<BusinessContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try { const [owned, customer] = await Promise.all([listBusinessContexts(user.id), listCustomerContexts()]); setBusinesses(owned); setCustomerBusinesses(customer); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar suas empresas."); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function choose(context: BusinessContext) {
    await selectBusiness(context); setActiveContext(context); navigation.navigate(context.access === "business" ? "BusinessTabs" : "CustomerTabs");
  }

  return <SafeAreaView style={styles.page} edges={["top", "bottom"]}><ScrollView contentContainerStyle={styles.contextScroll}><View style={styles.contextBrand}><BrandMark /><Pressable onPress={() => void supabase.auth.signOut()} style={styles.signOut}><Text style={styles.signOutText}>Sair</Text></Pressable></View><Text style={styles.contextTitle}>Onde você quer continuar?</Text><Text style={styles.contextSubtitle}>Suas empresas e reservas ficam separadas, sempre.</Text>{error ? <Notice tone="danger">{error}</Notice> : null}
    {loading ? <Text style={styles.loadingLabel}>Carregando seus acessos…</Text> : <>
      {businesses.length ? <><Text style={styles.contextSection}>MINHAS EMPRESAS</Text>{businesses.map((context) => <SelectRow key={context.id} title={context.name} subtitle={getSegmentConfig(context.businessType).label} selected={activeContext?.id === context.id && activeContext.access === "business"} onPress={() => void choose(context)} icon={Building2} />)}</> : null}
      <PrimaryButton label="Abrir uma empresa" onPress={() => navigation.navigate("BusinessSetup")} icon={Store} />
      {customerBusinesses.length ? <><Text style={styles.contextSection}>ONDE SOU CLIENTE</Text>{customerBusinesses.map((context) => <SelectRow key={context.id} title={context.name} subtitle={getSegmentConfig(context.businessType).label} selected={activeContext?.id === context.id && activeContext.access === "customer"} onPress={() => void choose(context)} icon={CircleUserRound} />)}</> : null}
      <SecondaryButton label="Tenho código, convite ou QR" onPress={() => navigation.navigate("JoinBusiness")} icon={QrCode} />
    </>}</ScrollView></SafeAreaView>;
}

export function BusinessSetupScreen({ navigation }: Props<"BusinessSetup">) {
  const { user, setActiveContext } = useBoraState();
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<BusinessType>("barbershop");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labels = useMemo(() => getSegmentConfig(segment).labels, [segment]);
  async function create() {
    if (!name.trim()) { setError("Dê um nome à sua empresa para continuar."); return; }
    if (!user) return;
    setLoading(true); setError(null);
    try {
      await createBusiness(name, segment);
      const contexts = await listBusinessContexts(user.id);
      const context = contexts.find((item) => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase()) ?? contexts[0];
      if (!context) throw new Error("A empresa foi criada, mas não foi possível abrir seu contexto.");
      await selectBusiness(context); setActiveContext(context); navigation.reset({ index: 0, routes: [{ name: "BusinessTabs" }] });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível criar a empresa."); }
    finally { setLoading(false); }
  }
  return <SegmentPreview segment={segment}><SafeAreaView style={styles.page} edges={["top", "bottom"]}><ScrollView contentContainerStyle={styles.setupScroll}><ScreenHeader onBack={() => navigation.goBack()} title="Abra sua empresa" subtitle="Escolha o segmento agora. A agenda e os nomes se adaptam a ele." />{error ? <Notice tone="danger">{error}</Notice> : null}
    <View style={styles.setupStep}><Text style={styles.setupProgress}>PASSO 1 DE 2</Text><Text style={styles.setupStepTitle}>Qual é o seu segmento?</Text><Text style={styles.setupStepBody}>Começamos com as funções essenciais e liberamos os módulos certos para sua operação.</Text></View>
    <View style={styles.segmentList}>{BUSINESS_TYPES.map((businessType) => { const config = getSegmentConfig(businessType); return <SegmentPreview key={businessType} segment={businessType}><SelectRow title={config.label} subtitle={`${config.labels.professionalPlural} · ${config.labels.appointmentPlural}`} selected={segment === businessType} onPress={() => setSegment(businessType)} icon={segmentIcon(businessType)} /></SegmentPreview>; })}</View>
    <View style={styles.setupStep}><Text style={styles.setupProgress}>PASSO 2 DE 2</Text><Text style={styles.setupStepTitle}>Como sua empresa se chama?</Text></View><Field label="Nome da empresa" value={name} onChangeText={setName} placeholder={`Ex.: ${labels.professionalPlural} do Gustavo`} autoCapitalize="words" />
    <PrimaryButton label="Criar minha empresa" onPress={() => void create()} loading={loading} />
  </ScrollView></SafeAreaView></SegmentPreview>;
}

export function JoinBusinessScreen({ navigation }: Props<"JoinBusiness">) {
  const { setActiveContext } = useBoraState();
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  async function join() {
    if (!code.trim()) { setError("Informe o código enviado pela empresa."); return; }
    setLoading(true); setError(null);
    try {
      const tenantId = await redeemInvitation(code, name);
      const contexts = await listCustomerContexts();
      const context = contexts.find((item) => item.id === tenantId);
      if (!context) throw new Error("Convite aceito. Atualize seus acessos para abrir a empresa.");
      await selectBusiness(context); setActiveContext(context); navigation.reset({ index: 0, routes: [{ name: "CustomerTabs" }] });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível usar esse convite."); }
    finally { setLoading(false); }
  }
  return <SafeAreaView style={styles.page} edges={["top", "bottom"]}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}><ScrollView contentContainerStyle={styles.joinScroll} keyboardShouldPersistTaps="handled"><ScreenHeader onBack={() => navigation.goBack()} title="Entre em uma empresa" subtitle="Use o código recebido, o link ou o QR Code. Não existe busca pública nesta etapa." />{error ? <Notice tone="danger">{error}</Notice> : null}<Surface style={styles.joinCard}><View style={styles.joinIcon}><AppIcon icon={QrCode} color={colors.amber} size={32} /></View><Field label="Código da empresa" value={code} onChangeText={(value) => setCode(value.toUpperCase())} placeholder="Ex.: ABC123" autoCapitalize="characters" /><Field label="Como quer ser chamado" value={name} onChangeText={setName} placeholder="Seu nome" autoCapitalize="words" /><PrimaryButton label="Entrar na empresa" onPress={() => void join()} loading={loading} /></Surface></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: colors.background }, pressed: { opacity: 0.78 },
  welcomeImage: { flex: 1, backgroundColor: colors.background }, welcomeScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5, 12, 18, 0.72)" }, welcome: { flex: 1, justifyContent: "space-between" }, welcomeTop: { paddingHorizontal: space.xl, paddingTop: space.xl, gap: 7 }, welcomeTagline: { ...type.micro, color: "#D6E2EE", fontWeight: "500" }, welcomeBottom: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: 14 }, welcomeTitle: { ...type.display, color: colors.white, fontSize: 42, lineHeight: 45 }, welcomeBody: { ...type.body, color: "#D6E2EE", maxWidth: 310 }, welcomeActions: { gap: 12, marginTop: 14 },
  pageContent: { padding: space.xl, gap: 14 }, roleCard: { backgroundColor: colors.surfaceRaised, padding: space.xl, borderRadius: radius.modal, gap: 10 }, roleIcon: { width: 58, height: 58, borderRadius: radius.card, backgroundColor: colors.amberSoft, alignItems: "center", justifyContent: "center", marginBottom: 5 }, roleTitle: { ...type.subtitle, color: colors.text }, roleBody: { ...type.body, color: colors.textSecondary }, roleAction: { ...type.label, color: colors.amber, marginTop: 5 },
  authScroll: { flexGrow: 1, paddingBottom: space.xxl }, authCard: { marginHorizontal: space.xl, gap: 16 }, authMark: { alignItems: "center", gap: 5, marginBottom: 5 }, authCaption: { ...type.micro, color: colors.textSecondary, fontWeight: "500" },
  contextScroll: { flexGrow: 1, padding: space.xl, gap: 12 }, contextBrand: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: space.hero }, signOut: { minHeight: 40, paddingHorizontal: 10, justifyContent: "center" }, signOutText: { ...type.label, color: colors.textSecondary }, contextTitle: { ...type.display, color: colors.text }, contextSubtitle: { ...type.body, color: colors.textSecondary, marginBottom: 16 }, contextSection: { ...type.micro, color: colors.amberLight, letterSpacing: 0.8, marginTop: 14, marginBottom: 2 }, loadingLabel: { ...type.body, color: colors.textSecondary, textAlign: "center", marginTop: 50 },
  setupScroll: { flexGrow: 1, paddingBottom: space.xxl, gap: 12 }, setupStep: { paddingHorizontal: space.xl, gap: 6, marginTop: 4 }, setupProgress: { ...type.micro, color: colors.amberLight, letterSpacing: 1 }, setupStepTitle: { ...type.subtitle, color: colors.text }, setupStepBody: { ...type.body, color: colors.textSecondary }, segmentList: { paddingHorizontal: space.xl, gap: 8 },
  joinScroll: { flexGrow: 1, paddingBottom: space.xxl }, joinCard: { marginHorizontal: space.xl, gap: 16 }, joinIcon: { width: 64, height: 64, borderRadius: radius.card, alignItems: "center", justifyContent: "center", backgroundColor: colors.amberSoft, alignSelf: "center" },
});
