import type { User } from "@supabase/supabase-js";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { isSupabaseConfigured, supabase } from "../../supabaseConfig";
import {
  endOfBrazilDay,
  formatDateTime,
  inviteCodeFromUrl,
  labelForBusiness,
  startOfBrazilDay,
  type AppointmentSummary,
  type BookingCatalog,
  type BookingSlot,
  type BusinessContext,
  type Professional,
  type Service,
} from "./domain";
import {
  addCustomer,
  addProfessional,
  addService,
  clearSelectedBusiness,
  createBusiness,
  createCustomerBooking,
  createStaffAppointment,
  getBookingCatalog,
  listBookingSlots,
  listBusinessAppointments,
  listBusinessContexts,
  listCustomerContexts,
  listCustomers,
  listMyCustomerAppointments,
  listProfessionals,
  listServices,
  redeemInvitation,
  selectBusiness,
  selectedBusinessId,
  setDefaultAvailability,
} from "./repositories";

type AccountMode = "business" | "customer";
type AuthMode = "signin" | "signup";
type Screen = "welcome" | "auth" | "access" | "business-setup" | "business-home" | "business-clients" | "business-catalog" | "business-agenda" | "business-booking" | "customer-join" | "customer-home" | "customer-book" | "customer-appointments" | "profile";

const colors = {
  ink: "#15132B", muted: "#6E6A85", primary: "#4338CA", primaryDark: "#312E81",
  primarySoft: "#EEEDFF", surface: "#FFFFFF", canvas: "#F7F7FB", line: "#E5E4F0",
  success: "#067A5F", warning: "#B45309", danger: "#B42318",
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir agora. Tente novamente.";
}

function todayInputValue(): string {
  const value = new Date();
  return String(value.getFullYear()) + "-" + String(value.getMonth() + 1).padStart(2, "0") + "-" + String(value.getDate()).padStart(2, "0");
}

function oneLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function Button({ label, onPress, variant = "primary", disabled = false }: {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: "primary" | "secondary" | "quiet" | "danger";
  readonly disabled?: boolean;
}) {
  const buttonStyle = variant === "primary" ? styles.buttonPrimary : variant === "secondary" ? styles.buttonSecondary : variant === "danger" ? styles.buttonDanger : styles.buttonQuiet;
  const labelStyle = variant === "primary" ? styles.buttonLabelPrimary : variant === "secondary" ? styles.buttonLabelSecondary : variant === "danger" ? styles.buttonLabelDanger : styles.buttonLabelQuiet;
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, buttonStyle, (pressed || disabled) && styles.buttonPressed]}>
      <Text style={[styles.buttonLabel, labelStyle]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry = false, keyboardType }: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly secureTextEntry?: boolean;
  readonly keyboardType?: "default" | "email-address" | "numeric";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"} autoCorrect={false} keyboardType={keyboardType} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#9894AA" secureTextEntry={secureTextEntry} style={styles.input} value={value} />
    </View>
  );
}

function Card({ children }: { readonly children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Header({ eyebrow, title, subtitle, onBack }: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      {onBack ? <Button label="Voltar" onPress={onBack} variant="quiet" /> : null}
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function Notice({ children, tone = "info" }: { readonly children: React.ReactNode; readonly tone?: "info" | "error" | "success" }) {
  return <Text style={[styles.notice, tone === "error" && styles.noticeError, tone === "success" && styles.noticeSuccess]}>{children}</Text>;
}

function Section({ title }: { readonly title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function Selection({ label, selected, onPress }: { readonly label: string; readonly selected: boolean; readonly onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.selection, selected && styles.selectionSelected]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioInner} /> : null}</View>
      <Text style={styles.selectionText}>{label}</Text>
    </Pressable>
  );
}

function ContextCard({ context, selected, onPress }: { readonly context: BusinessContext; readonly selected?: boolean; readonly onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={"Usar " + context.name} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.contextCard, selected && styles.contextCardSelected, pressed && styles.buttonPressed]}>
      <Text style={styles.contextType}>{labelForBusiness(context.businessType)}</Text>
      <Text style={styles.contextName}>{context.name}</Text>
      <Text style={styles.contextMeta}>{context.access === "business" ? "Área da empresa" : "Área do cliente"}</Text>
    </Pressable>
  );
}

export function MobileApp() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [accountMode, setAccountMode] = useState<AccountMode>("business");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [businessContexts, setBusinessContexts] = useState<BusinessContext[]>([]);
  const [customerContexts, setCustomerContexts] = useState<BusinessContext[]>([]);
  const [activeContext, setActiveContext] = useState<BusinessContext | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [catalog, setCatalog] = useState<BookingCatalog | null>(null);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedProfessionalId, setSelectedProfessionalId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [bookingDate, setBookingDate] = useState(todayInputValue());
  const [manualStartAt, setManualStartAt] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState("30");
  const [newProfessionalName, setNewProfessionalName] = useState("");

  const clearFeedback = () => { setError(null); setNotice(null); };

  const refreshContexts = useCallback(async (currentUser: User) => {
    const result = await Promise.all([listBusinessContexts(currentUser.id), listCustomerContexts(), selectedBusinessId()]);
    const business = result[0];
    const customer = result[1];
    const savedId = result[2];
    setBusinessContexts(business);
    setCustomerContexts(customer);
    setActiveContext(business.concat(customer).find((context) => context.id === savedId) ?? null);
    return { business, customer };
  }, []);

  const handleInviteUrl = useCallback((url: string | null) => {
    const code = inviteCodeFromUrl(url);
    if (!code) return;
    setInviteCode(code);
    setAccountMode("customer");
    setScreen(user ? "customer-join" : "auth");
  }, [user]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        try {
          await refreshContexts(data.session.user);
          if (active) setScreen("access");
        } catch (cause) {
          if (active) setError(messageFrom(cause));
        }
      }
      if (active) setLoading(false);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setActiveContext(null);
        setBusinessContexts([]);
        setCustomerContexts([]);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [refreshContexts]);

  useEffect(() => {
    void Linking.getInitialURL().then(handleInviteUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => handleInviteUrl(url));
    return () => subscription.remove();
  }, [handleInviteUrl]);

  const run = async (work: () => Promise<void>) => {
    clearFeedback();
    setSubmitting(true);
    try { await work(); } catch (cause) { setError(messageFrom(cause)); } finally { setSubmitting(false); }
  };

  const loadBusinessHome = async (context: BusinessContext) => {
    const result = await Promise.all([
      listServices(context.id),
      listProfessionals(context.id),
      listCustomers(context.id),
      listBusinessAppointments(context.id, startOfBrazilDay(), endOfBrazilDay()),
    ]);
    setServices(result[0]);
    setProfessionals(result[1]);
    setCustomers(result[2]);
    setAppointments(result[3]);
  };

  const loadCustomerHome = async (context: BusinessContext) => {
    const result = await Promise.all([getBookingCatalog(context.id), listMyCustomerAppointments(context.id)]);
    setCatalog(result[0]);
    setAppointments(result[1]);
    setSlots([]);
    setSelectedSlot(null);
  };

  const chooseContext = async (context: BusinessContext) => {
    await run(async () => {
      await selectBusiness(context);
      setActiveContext(context);
      if (context.access === "business") {
        await loadBusinessHome(context);
        setScreen("business-home");
      } else {
        await loadCustomerHome(context);
        setScreen("customer-home");
      }
    });
  };

  const goToAccess = async () => {
    if (!user) { setScreen("auth"); return; }
    await run(async () => { await refreshContexts(user); setScreen("access"); });
  };

  const submitAuth = async () => {
    await run(async () => {
      if (!email.trim() || password.length < 6) throw new Error("Informe seu e-mail e uma senha de pelo menos 6 caracteres.");
      if (authMode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice("Conta criada. Confirme o e-mail para entrar, se essa confirmação estiver ativa no Supabase.");
          return;
        }
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Não foi possível restaurar sua sessão.");
      setUser(data.user);
      await refreshContexts(data.user);
      setScreen(accountMode === "customer" ? "customer-join" : "access");
    });
  };

  const createBarbershop = async () => {
    await run(async () => {
      const name = oneLine(businessName);
      if (name.length < 2) throw new Error("Informe o nome da barbearia.");
      await createBusiness(name);
      if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
      const result = await refreshContexts(user);
      const created = result.business.find((context) => context.name === name) ?? result.business[0];
      if (!created) throw new Error("A barbearia foi criada, mas não foi possível carregá-la ainda.");
      await selectBusiness(created);
      setActiveContext(created);
      await loadBusinessHome(created);
      setScreen("business-home");
    });
  };

  const joinBusiness = async () => {
    await run(async () => {
      const code = inviteCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{6,16}$/.test(code)) throw new Error("Use o código de convite recebido da empresa.");
      const tenantId = await redeemInvitation(code, oneLine(displayName));
      if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
      const result = await refreshContexts(user);
      const joined = result.customer.find((context) => context.id === tenantId);
      if (!joined) throw new Error("O convite foi aceito, mas a empresa ainda não ficou disponível.");
      await selectBusiness(joined);
      setActiveContext(joined);
      await loadCustomerHome(joined);
      setScreen("customer-home");
    });
  };

  const addBusinessCustomer = async () => {
    if (!activeContext) return;
    await run(async () => {
      const name = oneLine(newCustomerName);
      if (!name) throw new Error("Informe o nome do cliente.");
      await addCustomer(activeContext.id, name);
      setNewCustomerName("");
      setCustomers(await listCustomers(activeContext.id));
      setNotice("Cliente adicionado.");
    });
  };

  const addBusinessService = async () => {
    if (!activeContext) return;
    await run(async () => {
      const name = oneLine(newServiceName);
      const duration = Number(newServiceDuration);
      if (!name || !Number.isInteger(duration) || duration < 5 || duration > 480) throw new Error("Informe serviço e uma duração entre 5 e 480 minutos.");
      await addService(activeContext.id, name, duration);
      setNewServiceName("");
      setServices(await listServices(activeContext.id));
      setNotice("Serviço adicionado.");
    });
  };

  const addBusinessProfessional = async () => {
    if (!activeContext) return;
    await run(async () => {
      const name = oneLine(newProfessionalName);
      if (!name) throw new Error("Informe o nome do profissional.");
      await addProfessional(activeContext.id, name);
      setNewProfessionalName("");
      setProfessionals(await listProfessionals(activeContext.id));
      setNotice("Profissional adicionado.");
    });
  };

  const applyAvailability = async (professionalId: string) => {
    await run(async () => {
      await setDefaultAvailability(professionalId);
      setNotice("Disponibilidade padrão aplicada: segunda a sábado, 09:00–18:00.");
    });
  };

  const bookForCustomer = async () => {
    if (!activeContext) return;
    await run(async () => {
      if (!selectedCustomerId || !selectedServiceId || !selectedProfessionalId || !manualStartAt.trim()) throw new Error("Selecione cliente, serviço, profissional e informe início em ISO (ex.: 2026-08-28T14:00:00-03:00).");
      const parsedStartAt = new Date(manualStartAt);
      if (Number.isNaN(parsedStartAt.getTime())) throw new Error("Use uma data/hora válida em ISO.");
      await createStaffAppointment({ tenantId: activeContext.id, customerId: selectedCustomerId, serviceId: selectedServiceId, professionalId: selectedProfessionalId, startAt: parsedStartAt.toISOString() });
      setManualStartAt("");
      await loadBusinessHome(activeContext);
      setScreen("business-agenda");
      setNotice("Agendamento criado. A agenda protege contra o mesmo horário duplicado.");
    });
  };

  const findCustomerSlots = async () => {
    if (!activeContext) return;
    await run(async () => {
      if (!selectedServiceId || !selectedProfessionalId || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) throw new Error("Escolha serviço, profissional e uma data no formato AAAA-MM-DD.");
      const nextSlots = await listBookingSlots({ tenantId: activeContext.id, serviceId: selectedServiceId, professionalId: selectedProfessionalId, date: bookingDate });
      setSlots(nextSlots);
      setSelectedSlot(null);
    });
  };

  const bookOwnAppointment = async () => {
    if (!activeContext || !selectedSlot) return;
    await run(async () => {
      await createCustomerBooking({ tenantId: activeContext.id, serviceId: selectedServiceId, professionalId: selectedProfessionalId, startAt: selectedSlot.startAt });
      await loadCustomerHome(activeContext);
      setScreen("customer-appointments");
      setNotice("Horário reservado. Se outra pessoa reservou antes, você verá uma mensagem e poderá escolher outro horário.");
    });
  };

  const signOut = async () => {
    await run(async () => {
      await supabase.auth.signOut();
      await clearSelectedBusiness();
      setUser(null);
      setActiveContext(null);
      setScreen("welcome");
    });
  };

  if (loading) return <LoadingPage label="Preparando o Bora Marcá" />;

  if (!isSupabaseConfigured) {
    return <Page><Header eyebrow="CONFIGURAÇÃO" title="Conecte seu ambiente" subtitle="O aplicativo precisa das variáveis públicas do Supabase para funcionar." /><Notice tone="error">Crie apps/mobile/.env a partir de .env.example e preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY. Nunca use uma chave administrativa no aplicativo.</Notice></Page>;
  }

  const topNotice = error ? <Notice tone="error">{error}</Notice> : notice ? <Notice tone="success">{notice}</Notice> : null;

  if (screen === "welcome") {
    return (
      <Page>
        <View style={styles.brandMark}><Text style={styles.brandText}>bora marcá</Text></View>
        <View style={styles.hero}><Text style={styles.eyebrow}>AGENDA QUE RESPEITA O SEU TEMPO</Text><Text style={styles.heroTitle}>A sua rotina, no ritmo certo.</Text><Text style={styles.subtitle}>Entre como empresário para gerir sua barbearia, ou como cliente para reservar com uma empresa que já te convidou.</Text></View>
        {topNotice}
        <Card>
          <Text style={styles.cardTitle}>Como você quer entrar?</Text>
          <Text style={styles.cardDescription}>O acesso do cliente é por código, convite, QR Code ou link da empresa — ainda não há busca pública.</Text>
          <Button label="Sou empresário" onPress={() => { clearFeedback(); setAccountMode("business"); setScreen(user ? "access" : "auth"); }} />
          <Button label="Sou cliente" onPress={() => { clearFeedback(); setAccountMode("customer"); setScreen(user ? "customer-join" : "auth"); }} variant="secondary" />
        </Card>
      </Page>
    );
  }

  if (screen === "auth") {
    return (
      <Page>
        <Header onBack={() => setScreen("welcome")} eyebrow={accountMode === "business" ? "ÁREA DA EMPRESA" : "ÁREA DO CLIENTE"} title={authMode === "signin" ? "Que bom ver você" : "Crie sua conta"} subtitle="Use seu e-mail para continuar. Você poderá escolher a empresa depois." />
        {topNotice}
        <Card>
          <Field label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@exemplo.com" keyboardType="email-address" />
          <Field label="Senha" value={password} onChangeText={setPassword} placeholder="Mínimo de 6 caracteres" secureTextEntry />
          <Button label={submitting ? "Entrando…" : authMode === "signin" ? "Entrar" : "Criar conta"} disabled={submitting} onPress={() => void submitAuth()} />
          <Button label={authMode === "signin" ? "Ainda não tenho conta" : "Já tenho uma conta"} onPress={() => { clearFeedback(); setAuthMode(authMode === "signin" ? "signup" : "signin"); }} variant="quiet" />
        </Card>
      </Page>
    );
  }

  if (screen === "access") {
    return (
      <Page>
        <Header eyebrow="SUA CONTA" title="Escolha onde continuar" subtitle="Cada empresa fica isolada. Você pode alternar de contexto quando precisar." onBack={() => setScreen("welcome")} />
        {topNotice}
        {businessContexts.length > 0 ? <Section title="Empresas" /> : null}
        {businessContexts.map((context) => <ContextCard context={context} key={"business-" + context.id} onPress={() => void chooseContext(context)} selected={activeContext?.id === context.id} />)}
        <Button label="Abrir uma barbearia" onPress={() => { clearFeedback(); setScreen("business-setup"); }} />
        {customerContexts.length > 0 ? <Section title="Empresas onde sou cliente" /> : null}
        {customerContexts.map((context) => <ContextCard context={context} key={"customer-" + context.id} onPress={() => void chooseContext(context)} selected={activeContext?.id === context.id} />)}
        <Button label="Tenho um código ou convite" onPress={() => { clearFeedback(); setScreen("customer-join"); }} variant="secondary" />
        <Button label="Minha conta" onPress={() => setScreen("profile")} variant="quiet" />
      </Page>
    );
  }

  if (screen === "business-setup") {
    return <Page><Header onBack={() => setScreen("access")} eyebrow="NOVA EMPRESA" title="Abra sua barbearia" subtitle="Vamos criar sua equipe inicial, catálogo e disponibilidade de segunda a sábado, das 09:00 às 18:00." />{topNotice}<Card><Field label="Nome da barbearia" value={businessName} onChangeText={setBusinessName} placeholder="Ex.: Barbearia do Gustavo" /><Button label={submitting ? "Criando…" : "Abrir barbearia"} disabled={submitting} onPress={() => void createBarbershop()} /></Card></Page>;
  }

  if (screen === "customer-join") {
    return <Page><Header onBack={() => setScreen(user ? "access" : "welcome")} eyebrow="ACESSO POR CONVITE" title="Entre na empresa" subtitle="Cole o código recebido, abra o link ou leia o QR Code. A empresa controla quem pode reservar." />{topNotice}<Card><Field label="Código da empresa" value={inviteCode} onChangeText={(value) => setInviteCode(value.toUpperCase())} placeholder="Ex.: ABC123" /><Field label="Como quer ser chamado" value={displayName} onChangeText={setDisplayName} placeholder="Seu nome" /><Button label={submitting ? "Conectando…" : "Entrar na empresa"} disabled={submitting} onPress={() => void joinBusiness()} /></Card></Page>;
  }

  if (screen === "business-home" && activeContext) {
    return (
      <Page>
        <AppBar context={activeContext} onSwitch={() => void goToAccess()} onProfile={() => setScreen("profile")} />
        {topNotice}
        <Header eyebrow="HOJE" title="Sua agenda em movimento" subtitle={appointments.length === 0 ? "Nenhum atendimento para hoje." : String(appointments.length) + " atendimento(s) programado(s) para hoje."} />
        <Stats appointments={appointments.length} customers={customers.length} professionals={professionals.length} />
        <Section title="Próximos horários" />
        <AppointmentList appointments={appointments} empty="Nenhum atendimento para hoje." />
        <Button label="Novo agendamento" onPress={() => { clearFeedback(); setScreen("business-booking"); }} />
        <Button label="Agenda completa" onPress={() => { clearFeedback(); setScreen("business-agenda"); }} variant="secondary" />
        <Button label="Clientes" onPress={() => { clearFeedback(); setScreen("business-clients"); }} variant="quiet" />
        <Button label="Serviços e equipe" onPress={() => { clearFeedback(); setScreen("business-catalog"); }} variant="quiet" />
      </Page>
    );
  }

  if (screen === "business-clients" && activeContext) {
    return <Page><Header onBack={() => setScreen("business-home")} eyebrow={activeContext.name.toUpperCase()} title="Clientes" subtitle="Cadastre clientes para agendar pelo atendimento da empresa." />{topNotice}<Card><Field label="Nome do cliente" value={newCustomerName} onChangeText={setNewCustomerName} placeholder="Nome completo" /><Button label={submitting ? "Salvando…" : "Adicionar cliente"} disabled={submitting} onPress={() => void addBusinessCustomer()} /></Card><Section title={String(customers.length) + " cliente(s)"} />{customers.map((customer) => <Card key={customer.id}><Text style={styles.listTitle}>{customer.name}</Text></Card>)}</Page>;
  }

  if (screen === "business-catalog" && activeContext) {
    return (
      <Page>
        <Header onBack={() => setScreen("business-home")} eyebrow={activeContext.name.toUpperCase()} title="Serviços e equipe" subtitle="Monte o que aparece na sua agenda. A disponibilidade pode ser ajustada depois no site." />
        {topNotice}
        <Card><Text style={styles.cardTitle}>Novo serviço</Text><Field label="Nome" value={newServiceName} onChangeText={setNewServiceName} placeholder="Ex.: Corte clássico" /><Field label="Duração em minutos" value={newServiceDuration} onChangeText={setNewServiceDuration} placeholder="30" keyboardType="numeric" /><Button label="Adicionar serviço" onPress={() => void addBusinessService()} disabled={submitting} /></Card>
        {services.map((service) => <Card key={service.id}><Text style={styles.listTitle}>{service.name}</Text><Text style={styles.listMeta}>{String(service.durationMinutes) + " min"}</Text></Card>)}
        <Card><Text style={styles.cardTitle}>Novo profissional</Text><Field label="Nome" value={newProfessionalName} onChangeText={setNewProfessionalName} placeholder="Nome do profissional" /><Button label="Adicionar profissional" onPress={() => void addBusinessProfessional()} disabled={submitting} /></Card>
        {professionals.map((professional) => <Card key={professional.id}><Text style={styles.listTitle}>{professional.name}</Text><Button label="Aplicar agenda 09h–18h" onPress={() => void applyAvailability(professional.id)} variant="secondary" disabled={submitting} /></Card>)}
      </Page>
    );
  }

  if (screen === "business-agenda" && activeContext) {
    return <Page><Header onBack={() => setScreen("business-home")} eyebrow={activeContext.name.toUpperCase()} title="Agenda de hoje" subtitle="Os horários são verificados no banco no momento da reserva." />{topNotice}<AppointmentList appointments={appointments} empty="Nenhum agendamento para hoje." /><Button label="Atualizar agenda" onPress={() => void run(async () => { await loadBusinessHome(activeContext); setNotice("Agenda atualizada."); })} variant="secondary" /><Button label="Novo agendamento" onPress={() => setScreen("business-booking")} /></Page>;
  }

  if (screen === "business-booking" && activeContext) {
    return (
      <Page>
        <Header onBack={() => setScreen("business-home")} eyebrow="ATENDIMENTO OPERACIONAL" title="Criar agendamento" subtitle="A confirmação é transacional: o mesmo profissional não pode ter duas reservas no mesmo horário." />
        {topNotice}
        <Section title="Cliente" />{customers.map((customer) => <Selection key={customer.id} label={customer.name} selected={selectedCustomerId === customer.id} onPress={() => setSelectedCustomerId(customer.id)} />)}
        <Section title="Serviço" />{services.map((service) => <Selection key={service.id} label={service.name + " · " + String(service.durationMinutes) + " min"} selected={selectedServiceId === service.id} onPress={() => setSelectedServiceId(service.id)} />)}
        <Section title="Profissional" />{professionals.map((professional) => <Selection key={professional.id} label={professional.name} selected={selectedProfessionalId === professional.id} onPress={() => setSelectedProfessionalId(professional.id)} />)}
        <Field label="Início (ISO com fuso)" value={manualStartAt} onChangeText={setManualStartAt} placeholder="2026-08-28T14:00:00-03:00" />
        <Button label={submitting ? "Reservando…" : "Confirmar agendamento"} disabled={submitting} onPress={() => void bookForCustomer()} />
      </Page>
    );
  }

  if (screen === "customer-home" && activeContext) {
    return (
      <Page>
        <AppBar context={activeContext} onSwitch={() => void goToAccess()} onProfile={() => setScreen("profile")} />
        {topNotice}
        <Header eyebrow={labelForBusiness(activeContext.businessType).toUpperCase()} title={"Olá, " + (displayName || "vamos marcar?")} subtitle="Escolha um serviço e reserve com segurança." />
        <Card><Text style={styles.cardTitle}>Próximo horário</Text>{appointments[0] ? <AppointmentLine appointment={appointments[0]} /> : <Text style={styles.cardDescription}>Você ainda não tem horários marcados nessa empresa.</Text>}<Button label="Agendar agora" onPress={() => { clearFeedback(); setScreen("customer-book"); }} /></Card>
        <Button label="Meus agendamentos" onPress={() => { clearFeedback(); setScreen("customer-appointments"); }} variant="secondary" />
      </Page>
    );
  }

  if (screen === "customer-book" && activeContext && catalog) {
    return (
      <Page>
        <Header onBack={() => setScreen("customer-home")} eyebrow={catalog.business.name.toUpperCase()} title="Reserve seu horário" subtitle="Os horários exibidos já consideram a agenda do profissional." />
        {topNotice}
        <Section title="1. Serviço" />{catalog.services.map((service) => <Selection key={service.id} label={service.name + " · " + String(service.durationMinutes) + " min"} selected={selectedServiceId === service.id} onPress={() => { setSelectedServiceId(service.id); setSlots([]); }} />)}
        <Section title="2. Profissional" />{catalog.professionals.map((professional) => <Selection key={professional.id} label={professional.name} selected={selectedProfessionalId === professional.id} onPress={() => { setSelectedProfessionalId(professional.id); setSlots([]); }} />)}
        <Field label="3. Data" value={bookingDate} onChangeText={setBookingDate} placeholder="AAAA-MM-DD" />
        <Button label={submitting ? "Buscando…" : "Ver horários"} disabled={submitting} onPress={() => void findCustomerSlots()} variant="secondary" />
        {slots.length > 0 ? <Section title="4. Horários disponíveis" /> : null}
        {slots.map((slot) => <Selection key={slot.startAt} label={formatDateTime(slot.startAt)} selected={selectedSlot?.startAt === slot.startAt} onPress={() => setSelectedSlot(slot)} />)}
        {slots.length === 0 ? <Text style={styles.emptyText}>Escolha os dados acima para carregar os horários disponíveis.</Text> : null}
        <Button label={submitting ? "Reservando…" : "Confirmar reserva"} disabled={submitting || !selectedSlot} onPress={() => void bookOwnAppointment()} />
      </Page>
    );
  }

  if (screen === "customer-appointments" && activeContext) {
    return <Page><Header onBack={() => setScreen("customer-home")} eyebrow={activeContext.name.toUpperCase()} title="Meus agendamentos" subtitle="Aqui aparecem somente os seus horários nessa empresa." />{topNotice}<AppointmentList appointments={appointments} empty="Você ainda não tem agendamentos nessa empresa." /><Button label="Atualizar" onPress={() => void run(async () => { await loadCustomerHome(activeContext); setNotice("Lista atualizada."); })} variant="secondary" /></Page>;
  }

  return <Page><Header onBack={() => setScreen("access")} eyebrow="CONTA" title="Seu acesso" subtitle={user?.email ?? ""} />{topNotice}<Card><Text style={styles.cardTitle}>Sessão ativa</Text><Text style={styles.cardDescription}>Você pode alternar entre suas empresas sem compartilhar dados entre elas.</Text><Button label="Trocar empresa" onPress={() => void goToAccess()} variant="secondary" /><Button label="Sair" onPress={() => Alert.alert("Sair da conta", "Você precisará entrar novamente neste aparelho.", [{ text: "Cancelar", style: "cancel" }, { text: "Sair", style: "destructive", onPress: () => void signOut() }])} variant="danger" /></Card></Page>;
}

function Page({ children }: { readonly children: React.ReactNode }) {
  return <SafeAreaView style={styles.safeArea}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">{children}</ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function LoadingPage({ label }: { readonly label: string }) {
  return <SafeAreaView style={[styles.safeArea, styles.centered]}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.loadingText}>{label}</Text></SafeAreaView>;
}

function AppBar({ context, onSwitch, onProfile }: { readonly context: BusinessContext; readonly onSwitch: () => void; readonly onProfile: () => void }) {
  return <View style={styles.appBar}><View style={styles.appBarText}><Text style={styles.appBarName} numberOfLines={1}>{context.name}</Text><Text style={styles.appBarRole}>{context.access === "business" ? "Empresa" : "Cliente"}</Text></View><Pressable accessibilityLabel="Trocar empresa" onPress={onSwitch} style={styles.appBarButton}><Text style={styles.appBarButtonText}>Trocar</Text></Pressable><Pressable accessibilityLabel="Minha conta" onPress={onProfile} style={styles.appBarButton}><Text style={styles.appBarButtonText}>Conta</Text></Pressable></View>;
}

function Stats({ appointments, customers, professionals }: { readonly appointments: number; readonly customers: number; readonly professionals: number }) {
  return <View style={styles.stats}><Stat label="Hoje" value={String(appointments)} /><Stat label="Clientes" value={String(customers)} /><Stat label="Equipe" value={String(professionals)} /></View>;
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function AppointmentList({ appointments, empty }: { readonly appointments: readonly AppointmentSummary[]; readonly empty: string }) {
  if (appointments.length === 0) return <Text style={styles.emptyText}>{empty}</Text>;
  return <View style={styles.appointmentList}>{appointments.map((appointment) => <Card key={appointment.id}><AppointmentLine appointment={appointment} /></Card>)}</View>;
}

function AppointmentLine({ appointment }: { readonly appointment: AppointmentSummary }) {
  return <View><Text style={styles.listTitle}>{formatDateTime(appointment.startAt)}</Text><Text style={styles.listMeta}>{(appointment.serviceName || "Serviço") + " · " + (appointment.professionalName || "Profissional")}</Text>{appointment.customerName ? <Text style={styles.listMeta}>{appointment.customerName}</Text> : null}<Text style={styles.status}>{appointment.status}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  fill: { flex: 1 },
  page: { flexGrow: 1, padding: 20, paddingBottom: 44, gap: 12 },
  centered: { alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { color: colors.muted, fontSize: 15 },
  brandMark: { alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 18 },
  brandText: { color: colors.surface, fontSize: 16, fontWeight: "800", letterSpacing: -0.5 },
  hero: { paddingTop: 34, paddingBottom: 18, gap: 10 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" },
  heroTitle: { color: colors.ink, fontSize: 40, fontWeight: "800", letterSpacing: -1.4, lineHeight: 45 },
  header: { gap: 7, paddingTop: 8, paddingBottom: 8 },
  title: { color: colors.ink, fontSize: 29, fontWeight: "800", letterSpacing: -0.7, lineHeight: 34 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 12, padding: 16 },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  cardDescription: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  button: { alignItems: "center", borderRadius: 12, justifyContent: "center", minHeight: 50, paddingHorizontal: 16 },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.primarySoft, borderColor: "#CBC8FF", borderWidth: 1 },
  buttonQuiet: { alignSelf: "flex-start", minHeight: 40, paddingHorizontal: 0 },
  buttonDanger: { backgroundColor: "#FEE4E2" },
  buttonPressed: { opacity: 0.58 },
  buttonLabel: { fontSize: 15, fontWeight: "800" },
  buttonLabelPrimary: { color: colors.surface },
  buttonLabelSecondary: { color: colors.primaryDark },
  buttonLabelQuiet: { color: colors.primary },
  buttonLabelDanger: { color: colors.danger },
  field: { gap: 7 },
  fieldLabel: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  input: { backgroundColor: "#FCFCFE", borderColor: colors.line, borderRadius: 12, borderWidth: 1, color: colors.ink, fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  notice: { backgroundColor: colors.primarySoft, borderRadius: 12, color: colors.primaryDark, fontSize: 14, lineHeight: 20, padding: 13 },
  noticeError: { backgroundColor: "#FEE4E2", color: colors.danger },
  noticeSuccess: { backgroundColor: "#DDF8EE", color: colors.success },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 12 },
  contextCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 16, borderWidth: 1, gap: 4, padding: 16 },
  contextCardSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: "#FAFAFF" },
  contextType: { color: colors.primary, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  contextName: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  contextMeta: { color: colors.muted, fontSize: 14 },
  selection: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 54, paddingHorizontal: 14 },
  selectionSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  radio: { alignItems: "center", borderColor: "#9792B3", borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: "center", width: 20 },
  radioSelected: { borderColor: colors.primary },
  radioInner: { backgroundColor: colors.primary, borderRadius: 6, height: 10, width: 10 },
  selectionText: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: "700" },
  appBar: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 4, paddingBottom: 8 },
  appBarText: { flex: 1, gap: 1 },
  appBarName: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  appBarRole: { color: colors.muted, fontSize: 12 },
  appBarButton: { borderColor: colors.line, borderRadius: 9, borderWidth: 1, minHeight: 38, justifyContent: "center", paddingHorizontal: 9 },
  appBarButtonText: { color: colors.primaryDark, fontSize: 12, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 8 },
  stat: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 14, borderWidth: 1, flex: 1, gap: 2, padding: 12 },
  statValue: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  appointmentList: { gap: 8 },
  listTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  listMeta: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 3 },
  status: { color: colors.warning, fontSize: 12, fontWeight: "800", marginTop: 8, textTransform: "uppercase" },
  emptyText: { color: colors.muted, fontSize: 15, lineHeight: 22, paddingVertical: 10 },
});
