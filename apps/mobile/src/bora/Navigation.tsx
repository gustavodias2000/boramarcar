import { getSegmentConfig } from "@boramarca/core";
import type { NavigationProp } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { TabActions, useNavigation } from "@react-navigation/native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogOut,
  Plus,
  Scissors,
  Settings2,
  Store,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react-native";

import { supabase } from "../../supabaseConfig";
import type { AppointmentSummary, BookingCatalog, BookingSlot, Professional, Service } from "../v1/domain";
import { endOfBrazilDay, formatDateTime, startOfBrazilDay } from "../v1/domain";
import {
  addProfessional,
  addService,
  createCustomerBooking,
  createStaffAppointment,
  getBookingCatalog,
  listBookingSlots,
  listBusinessAppointments,
  listCustomers,
  listMyCustomerAppointments,
  listProfessionals,
  listServices,
  setDefaultAvailability,
} from "../v1/repositories";
import type { RootStackParamList } from "./BoraMarcaApp";
import { useBoraState } from "./state";
import { asStartAt, colors, dayKey, elevation, radius, shortDate, space, timeOf, type } from "./theme";
import { AppointmentCard, AppIcon, EmptyState, Field, Notice, PrimaryButton, ScreenHeader, SecondaryButton, SectionTitle, SelectRow, Surface, TextAction } from "./ui";

type BusinessTabsParamList = { Inicio: undefined; Agenda: undefined; Gestao: undefined; Relatorios: undefined; Perfil: undefined };
type CustomerTabsParamList = { Agendar: undefined; Horarios: undefined; PerfilCliente: undefined };
const BusinessTab = createBottomTabNavigator<BusinessTabsParamList>();
const CustomerTab = createBottomTabNavigator<CustomerTabsParamList>();

const tabStyle = {
  headerShown: false,
  tabBarActiveTintColor: colors.amber,
  tabBarInactiveTintColor: colors.muted,
  tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 66, paddingTop: 7 },
  tabBarLabelStyle: { fontSize: 11, fontWeight: "700" as const },
};

export function BusinessTabs() {
  return <BusinessTab.Navigator screenOptions={tabStyle}>
    <BusinessTab.Screen name="Inicio" component={BusinessHomeScreen} options={{ title: "Início", tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }} />
    <BusinessTab.Screen name="Agenda" component={BusinessAgendaScreen} options={{ title: "Agenda", tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
    <BusinessTab.Screen name="Gestao" component={BusinessManagementScreen} options={{ title: "Gestão", tabBarIcon: ({ color, size }) => <Settings2 color={color} size={size} /> }} />
    <BusinessTab.Screen name="Relatorios" component={BusinessReportsScreen} options={{ title: "Relatórios", tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} /> }} />
    <BusinessTab.Screen name="Perfil" component={BusinessProfileScreen} options={{ title: "Perfil", tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
  </BusinessTab.Navigator>;
}

export function CustomerTabs() {
  const { activeContext } = useBoraState();
  const labels = getSegmentConfig(activeContext?.businessType ?? "barbershop").labels;
  return <CustomerTab.Navigator screenOptions={tabStyle}>
    <CustomerTab.Screen name="Agendar" component={CustomerHomeScreen} options={{ title: labels.professionalPlural, tabBarIcon: ({ color, size }) => <Scissors color={color} size={size} /> }} />
    <CustomerTab.Screen name="Horarios" component={CustomerAppointmentsScreen} options={{ title: "Meus horários", tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
    <CustomerTab.Screen name="PerfilCliente" component={CustomerProfileScreen} options={{ title: "Perfil", tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
  </CustomerTab.Navigator>;
}

function useBusinessData() {
  const { activeContext } = useBoraState();
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!activeContext) return;
    setLoading(true); setError(null);
    try {
      const [today, serviceRows, professionalRows, customerRows] = await Promise.all([
        listBusinessAppointments(activeContext.id, startOfBrazilDay(), endOfBrazilDay()),
        listServices(activeContext.id), listProfessionals(activeContext.id), listCustomers(activeContext.id),
      ]);
      setAppointments(today); setServices(serviceRows); setProfessionals(professionalRows); setCustomers(customerRows);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar a operação."); }
    finally { setLoading(false); }
  }, [activeContext]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { activeContext, appointments, services, professionals, customers, loading, error, refresh };
}

function BusinessHomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { activeContext, appointments, professionals, customers, loading, error, refresh } = useBusinessData();
  if (!activeContext) return <ContextMissing />;
  const labels = getSegmentConfig(activeContext.businessType).labels;
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scroll}><View style={styles.topline}><View><Text style={styles.businessName}>{activeContext.name}</Text><Text style={styles.businessSegment}>{getSegmentConfig(activeContext.businessType).label}</Text></View><Pressable onPress={() => navigation.navigate("Contexts")} style={styles.switchButton}><Text style={styles.switchButtonText}>Trocar</Text></Pressable></View>
    <Text style={styles.greeting}>Sua agenda{`\n`}em movimento.</Text><Text style={styles.greetingBody}>Tudo que acontece hoje, em uma leitura rápida.</Text>{error ? <Notice tone="danger">{error}</Notice> : null}
    <View style={styles.metricRow}><Metric value={String(appointments.length)} label="Hoje" /><Metric value={String(customers.length)} label={labels.customerPlural} /><Metric value={String(professionals.length)} label={labels.professionalPlural} /></View>
    <PrimaryButton label={`Novo ${labels.appointment.toLowerCase()}`} onPress={() => navigation.navigate("StaffBooking")} icon={Plus} />
    <SectionTitle action={<TextAction label="Atualizar" onPress={() => void refresh()} />}>Próximos horários</SectionTitle>
    {loading ? <LoadingBlock /> : appointments.length ? <View style={styles.list}>{appointments.slice(0, 4).map((appointment) => <AppointmentCard key={appointment.id} time={timeOf(appointment.startAt)} title={appointment.customerName ?? labels.customer} subtitle={`${appointment.serviceName} · ${appointment.professionalName}`} status={appointment.status} />)}</View> : <EmptyState title="Seu dia está livre" body={`Quando um ${labels.appointment.toLowerCase()} entrar, ele aparece aqui.`} />}
    <SectionTitle>Atalhos da operação</SectionTitle><View style={styles.quickRow}><QuickAction label="Agenda" icon={CalendarDays} onPress={() => navigation.dispatch(TabActions.jumpTo("Agenda") as never)} /><QuickAction label="Serviços" icon={Wrench} onPress={() => navigation.dispatch(TabActions.jumpTo("Gestao") as never)} /><QuickAction label={labels.customerPlural} icon={UsersRound} onPress={() => navigation.dispatch(TabActions.jumpTo("Gestao") as never)} /></View>
  </ScrollView></SafeAreaView>;
}

function BusinessAgendaScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { activeContext, appointments, loading, error, refresh } = useBusinessData();
  if (!activeContext) return <ContextMissing />;
  const labels = getSegmentConfig(activeContext.businessType).labels;
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scroll}><ScreenHeader title="Agenda" subtitle="Visão de hoje, com a confirmação protegida pelo banco." right={<Pressable onPress={() => void refresh()} style={styles.iconButton}><AppIcon icon={Clock3} color={colors.amber} /></Pressable>} />{error ? <Notice tone="danger">{error}</Notice> : null}<View style={styles.todayPill}><CalendarDays color={colors.amber} size={18} /><Text style={styles.todayPillText}>Hoje · {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date())}</Text></View>
    <PrimaryButton label={`Novo ${labels.appointment.toLowerCase()}`} onPress={() => navigation.navigate("StaffBooking")} icon={Plus} />
    <SectionTitle>Atendimentos</SectionTitle>{loading ? <LoadingBlock /> : appointments.length ? <View style={styles.list}>{appointments.map((appointment) => <AppointmentCard key={appointment.id} time={timeOf(appointment.startAt)} title={appointment.customerName ?? labels.customer} subtitle={`${appointment.serviceName} · ${appointment.professionalName}`} status={appointment.status} />)}</View> : <EmptyState title="Nenhum atendimento hoje" body="Use o botão acima para criar o primeiro horário." />}
  </ScrollView></SafeAreaView>;
}

function BusinessManagementScreen() {
  const { activeContext, services, professionals, loading, error, refresh } = useBusinessData();
  const [serviceName, setServiceName] = useState(""); const [duration, setDuration] = useState("30"); const [professionalName, setProfessionalName] = useState(""); const [saving, setSaving] = useState(false); const [feedback, setFeedback] = useState<string | null>(null);
  if (!activeContext) return <ContextMissing />;
  const tenantId = activeContext.id;
  const labels = getSegmentConfig(activeContext.businessType).labels;
  async function addNewService() { if (!serviceName.trim()) return; setSaving(true); try { await addService(tenantId, serviceName, Number(duration) || 30); setServiceName(""); setFeedback("Serviço adicionado."); await refresh(); } catch (reason) { setFeedback(reason instanceof Error ? reason.message : "Não foi possível salvar o serviço."); } finally { setSaving(false); } }
  async function addNewProfessional() { if (!professionalName.trim()) return; setSaving(true); try { await addProfessional(tenantId, professionalName); setProfessionalName(""); setFeedback(`${labels.professional} adicionado. Defina a disponibilidade abaixo.`); await refresh(); } catch (reason) { setFeedback(reason instanceof Error ? reason.message : "Não foi possível salvar o profissional."); } finally { setSaving(false); } }
  async function applyAvailability(id: string) { setSaving(true); try { await setDefaultAvailability(id); setFeedback("Disponibilidade de segunda a sábado, das 09h às 18h, aplicada."); } catch (reason) { setFeedback(reason instanceof Error ? reason.message : "Não foi possível salvar a disponibilidade."); } finally { setSaving(false); } }
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scroll}><ScreenHeader title="Gestão" subtitle="Monte o catálogo e a equipe que aparecem na agenda." />{error ? <Notice tone="danger">{error}</Notice> : null}{feedback ? <Notice tone="success">{feedback}</Notice> : null}
    <SectionTitle>Serviços</SectionTitle><Surface style={styles.formSurface}><Field label="Nome do serviço" value={serviceName} onChangeText={setServiceName} placeholder="Ex.: Corte clássico" /><Field label="Duração em minutos" value={duration} onChangeText={setDuration} keyboardType="numeric" placeholder="30" /><PrimaryButton label="Adicionar serviço" onPress={() => void addNewService()} loading={saving} icon={Plus} /></Surface>{loading ? <LoadingBlock /> : services.map((service) => <SelectRow key={service.id} title={service.name} subtitle={`${service.durationMinutes} min`} onPress={() => undefined} icon={Wrench} />)}
    <SectionTitle>{labels.professionalPlural}</SectionTitle><Surface style={styles.formSurface}><Field label={`Nome do ${labels.professional.toLowerCase()}`} value={professionalName} onChangeText={setProfessionalName} placeholder={`Nome do ${labels.professional.toLowerCase()}`} autoCapitalize="words" /><PrimaryButton label={`Adicionar ${labels.professional.toLowerCase()}`} onPress={() => void addNewProfessional()} loading={saving} icon={Plus} /></Surface>{professionals.map((professional) => <Surface key={professional.id} style={styles.personSurface}><View style={styles.personCopy}><Text style={styles.personName}>{professional.name}</Text><Text style={styles.personMeta}>{labels.professional}</Text></View><SecondaryButton label="Aplicar 09h–18h" onPress={() => void applyAvailability(professional.id)} disabled={saving} /></Surface>)}
  </ScrollView></SafeAreaView>;
}

function BusinessReportsScreen() {
  const { activeContext, appointments, services, customers, loading } = useBusinessData();
  if (!activeContext) return <ContextMissing />;
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scroll}><ScreenHeader title="Relatórios" subtitle="Leitura operacional do período atual." />{loading ? <LoadingBlock /> : <><View style={styles.reportHero}><Text style={styles.reportLabel}>ATENDIMENTOS DE HOJE</Text><Text style={styles.reportNumber}>{appointments.length}</Text><Text style={styles.reportBody}>Seu resumo financeiro detalhado continua disponível no painel web enquanto este módulo móvel evolui.</Text></View><View style={styles.reportGrid}><Metric value={String(services.length)} label="Serviços ativos" /><Metric value={String(customers.length)} label="Clientes" /></View><SectionTitle>Próximo passo</SectionTitle><Surface><View style={styles.reportCallout}><BarChart3 color={colors.amber} size={28} /><View style={styles.personCopy}><Text style={styles.personName}>Relatórios por serviço</Text><Text style={styles.personMeta}>Acompanhe a base diária no app e aprofunde indicadores no web.</Text></View></View></Surface></>}</ScrollView></SafeAreaView>;
}

function BusinessProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>(); const { activeContext, user } = useBoraState();
  if (!activeContext) return <ContextMissing />;
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scroll}><ScreenHeader title="Perfil" subtitle="Conta e contexto da empresa." /><Surface style={styles.profileHero}><View style={styles.avatar}><Text style={styles.avatarText}>{(user?.email?.[0] ?? "B").toUpperCase()}</Text></View><View style={styles.personCopy}><Text style={styles.personName}>{activeContext.name}</Text><Text style={styles.personMeta}>{user?.email}</Text></View></Surface><SectionTitle>Conta</SectionTitle><SelectRow title="Trocar empresa" subtitle="Abra outro contexto sem misturar dados" onPress={() => navigation.navigate("Contexts")} icon={Store} /><SelectRow title="Sair desta conta" subtitle="Você precisará entrar novamente" onPress={() => Alert.alert("Sair da conta", "Deseja encerrar a sessão neste aparelho?", [{ text: "Cancelar", style: "cancel" }, { text: "Sair", style: "destructive", onPress: () => void supabase.auth.signOut() }])} icon={LogOut} /></ScrollView></SafeAreaView>;
}

export function StaffBookingScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>(); const { activeContext } = useBoraState(); const { customers, services, professionals, loading, error } = useBusinessData(); const [customerId, setCustomerId] = useState<string | null>(null); const [serviceId, setServiceId] = useState<string | null>(null); const [professionalId, setProfessionalId] = useState<string | null>(null); const [date, setDate] = useState(dayKey(new Date())); const [time, setTime] = useState<string | null>(null); const [saving, setSaving] = useState(false); const [feedback, setFeedback] = useState<string | null>(null);
  if (!activeContext) return <ContextMissing />;
  const tenantId = activeContext.id;
  const labels = getSegmentConfig(activeContext.businessType).labels;
  const dates = nextDays(7); const times = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
  async function reserve() { if (!customerId || !serviceId || !professionalId || !time) { setFeedback("Selecione cliente, serviço, profissional, data e horário."); return; } setSaving(true); setFeedback(null); try { await createStaffAppointment({ tenantId, customerId, serviceId, professionalId, startAt: asStartAt(date, time) }); setFeedback("Agendamento confirmado com segurança."); } catch (reason) { setFeedback(reason instanceof Error ? reason.message : "Esse horário não está mais disponível."); } finally { setSaving(false); } }
  return <SafeAreaView style={styles.screen} edges={["top", "bottom"]}><ScrollView contentContainerStyle={styles.bookingScroll}><ScreenHeader onBack={() => navigation.goBack()} title={`Novo ${labels.appointment.toLowerCase()}`} subtitle="A confirmação é transacional: conflitos são recusados pelo banco." />{error ? <Notice tone="danger">{error}</Notice> : null}{feedback ? <Notice tone={feedback.includes("confirmado") ? "success" : "danger"}>{feedback}</Notice> : null}{loading ? <LoadingBlock /> : <><Step current={0} labels={[labels.customer, "Serviço", labels.professional, "Horário"]} /><SectionTitle>{labels.customer}</SectionTitle><ChoiceList items={customers.map((item) => ({ id: item.id, title: item.name }))} selected={customerId} onSelect={setCustomerId} icon={UsersRound} /><SectionTitle>Serviço</SectionTitle><ChoiceList items={services.map((item) => ({ id: item.id, title: item.name, subtitle: `${item.durationMinutes} min` }))} selected={serviceId} onSelect={setServiceId} icon={Wrench} /><SectionTitle>{labels.professional}</SectionTitle><ChoiceList items={professionals.map((item) => ({ id: item.id, title: item.name }))} selected={professionalId} onSelect={setProfessionalId} icon={Scissors} /><SectionTitle>Data e horário</SectionTitle><DateStrip dates={dates} selected={date} onSelect={setDate} /><TimeGrid times={times} selected={time} onSelect={setTime} /></>}<PrimaryButton label="Confirmar agendamento" onPress={() => void reserve()} loading={saving} icon={CheckCircle2} /></ScrollView></SafeAreaView>;
}

function CustomerHomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>(); const { activeContext } = useBoraState(); const [catalog, setCatalog] = useState<BookingCatalog | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!activeContext) return; setLoading(true); try { setCatalog(await getBookingCatalog(activeContext.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível abrir o catálogo."); } finally { setLoading(false); } }, [activeContext]); useEffect(() => { void load(); }, [load]);
  if (!activeContext) return <ContextMissing />;
  const labels = getSegmentConfig(activeContext.businessType).labels;
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scroll}><View style={styles.topline}><View><Text style={styles.businessName}>{activeContext.name}</Text><Text style={styles.businessSegment}>{getSegmentConfig(activeContext.businessType).label}</Text></View><Pressable onPress={() => navigation.navigate("Contexts")} style={styles.switchButton}><Text style={styles.switchButtonText}>Trocar</Text></Pressable></View><Text style={styles.customerHeadline}>Seu próximo{`\n`}horário começa aqui.</Text><Text style={styles.greetingBody}>Escolha quem vai te atender e reserve em poucos toques.</Text>{error ? <Notice tone="danger">{error}</Notice> : null}{loading ? <LoadingBlock /> : catalog?.professionals.length ? <><SectionTitle>{labels.professionalPlural}</SectionTitle><View style={styles.professionalGrid}>{catalog.professionals.map((professional, index) => <ProfessionalCard key={professional.id} professional={professional} serviceCount={catalog.services.length} position={index} onPress={() => navigation.navigate("CustomerBooking")} />)}</View><PrimaryButton label="Ver horários disponíveis" onPress={() => navigation.navigate("CustomerBooking")} icon={CalendarDays} /></> : <EmptyState title="Catálogo em preparação" body="Esta empresa ainda não cadastrou profissionais disponíveis." />}</ScrollView></SafeAreaView>;
}

function CustomerAppointmentsScreen() {
  const { activeContext } = useBoraState(); const [appointments, setAppointments] = useState<AppointmentSummary[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!activeContext) return; setLoading(true); try { setAppointments(await listMyCustomerAppointments(activeContext.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar seus horários."); } finally { setLoading(false); } }, [activeContext]); useEffect(() => { void load(); }, [load]); if (!activeContext) return <ContextMissing />;
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scroll}><ScreenHeader title="Meus horários" subtitle="Somente as suas reservas nesta empresa." />{error ? <Notice tone="danger">{error}</Notice> : null}{loading ? <LoadingBlock /> : appointments.length ? <View style={styles.list}>{appointments.map((appointment) => <AppointmentCard key={appointment.id} time={formatDateTime(appointment.startAt)} title={appointment.serviceName} subtitle={appointment.professionalName} status={appointment.status} />)}</View> : <EmptyState title="Nada marcado ainda" body="Quando você reservar, seu próximo horário aparece aqui." />}</ScrollView></SafeAreaView>;
}

function CustomerProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>(); const { activeContext, user } = useBoraState(); if (!activeContext) return <ContextMissing />;
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scroll}><ScreenHeader title="Perfil" subtitle="Seus dados e empresas vinculadas." /><Surface style={styles.profileHero}><View style={styles.avatar}><Text style={styles.avatarText}>{(user?.email?.[0] ?? "C").toUpperCase()}</Text></View><View style={styles.personCopy}><Text style={styles.personName}>{user?.user_metadata.full_name || "Minha conta"}</Text><Text style={styles.personMeta}>{user?.email}</Text></View></Surface><SectionTitle>Conta</SectionTitle><SelectRow title="Trocar empresa" subtitle="Acesse outro convite ou sua empresa" onPress={() => navigation.navigate("Contexts")} icon={Store} /><SelectRow title="Sair da conta" subtitle="Encerrar esta sessão" onPress={() => void supabase.auth.signOut()} icon={LogOut} /></ScrollView></SafeAreaView>;
}

export function CustomerBookingScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>(); const { activeContext } = useBoraState(); const [catalog, setCatalog] = useState<BookingCatalog | null>(null); const [serviceId, setServiceId] = useState<string | null>(null); const [professionalId, setProfessionalId] = useState<string | null>(null); const [date, setDate] = useState(dayKey(new Date())); const [slots, setSlots] = useState<BookingSlot[]>([]); const [slot, setSlot] = useState<BookingSlot | null>(null); const [loading, setLoading] = useState(true); const [slotLoading, setSlotLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState(false);
  const dates = nextDays(7);
  useEffect(() => { if (!activeContext) return; void getBookingCatalog(activeContext.id).then(setCatalog).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível abrir o catálogo.")).finally(() => setLoading(false)); }, [activeContext]);
  const loadSlots = async () => { if (!activeContext || !serviceId || !professionalId) { setError("Escolha serviço e profissional antes de procurar horários."); return; } setError(null); setSlot(null); setSlotLoading(true); try { setSlots(await listBookingSlots({ tenantId: activeContext.id, serviceId, professionalId, date })); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível consultar a disponibilidade."); } finally { setSlotLoading(false); } };
  const reserve = async () => { if (!activeContext || !serviceId || !professionalId || !slot) return; setSaving(true); setError(null); try { await createCustomerBooking({ tenantId: activeContext.id, serviceId, professionalId, startAt: slot.startAt }); setDone(true); } catch (reason) { setError(reason instanceof Error ? reason.message : "Esse horário acabou de ser ocupado. Consulte novamente."); } finally { setSaving(false); } };
  if (!activeContext) return <ContextMissing />;
  if (done) return <SafeAreaView style={styles.screen} edges={["top", "bottom"]}><View style={styles.confirmed}><View style={styles.confirmedIcon}><CheckCircle2 color={colors.onAmber} size={38} /></View><Text style={styles.confirmedTitle}>Horário confirmado</Text><Text style={styles.confirmedBody}>Sua reserva foi protegida e já aparece em Meus horários.</Text><PrimaryButton label="Ver meus horários" onPress={() => navigation.reset({ index: 0, routes: [{ name: "CustomerTabs" }] })} icon={CalendarDays} /></View></SafeAreaView>;
  const labels = getSegmentConfig(activeContext.businessType).labels;
  return <SafeAreaView style={styles.screen} edges={["top", "bottom"]}><ScrollView contentContainerStyle={styles.bookingScroll}><ScreenHeader onBack={() => navigation.goBack()} title="Reserve seu horário" subtitle={activeContext.name} />{error ? <Notice tone="danger">{error}</Notice> : null}{loading || !catalog ? <LoadingBlock /> : <><Step current={slot ? 3 : serviceId && professionalId ? 2 : serviceId ? 1 : 0} labels={["Serviço", labels.professional, "Data", "Confirmar"]} /><SectionTitle>Escolha o serviço</SectionTitle><ChoiceList items={catalog.services.map((item) => ({ id: item.id, title: item.name, subtitle: `${item.durationMinutes} min` }))} selected={serviceId} onSelect={(value) => { setServiceId(value); setSlots([]); setSlot(null); }} icon={Wrench} /><SectionTitle>Com quem?</SectionTitle><ChoiceList items={catalog.professionals.map((item) => ({ id: item.id, title: item.name }))} selected={professionalId} onSelect={(value) => { setProfessionalId(value); setSlots([]); setSlot(null); }} icon={Scissors} /><SectionTitle>Que dia?</SectionTitle><DateStrip dates={dates} selected={date} onSelect={(value) => { setDate(value); setSlots([]); setSlot(null); }} /><SecondaryButton label="Ver horários" onPress={() => void loadSlots()} icon={Clock3} />{slotLoading ? <LoadingBlock /> : slots.length ? <><SectionTitle>Horários disponíveis</SectionTitle><TimeGrid times={slots.map((item) => timeOf(item.startAt))} selected={slot ? timeOf(slot.startAt) : null} onSelect={(value) => setSlot(slots.find((item) => timeOf(item.startAt) === value) ?? null)} /></> : <Text style={styles.helperText}>Escolha o serviço e o profissional para consultar a agenda.</Text>}</>}<PrimaryButton label="Confirmar reserva" onPress={() => void reserve()} loading={saving} disabled={!slot} icon={CheckCircle2} /></ScrollView></SafeAreaView>;
}

function ChoiceList({ items, selected, onSelect, icon }: { readonly items: readonly { id: string; title: string; subtitle?: string }[]; readonly selected: string | null; readonly onSelect: (value: string) => void; readonly icon: typeof Scissors }) { return <View style={styles.choiceList}>{items.map((item) => <SelectRow key={item.id} title={item.title} subtitle={item.subtitle} selected={selected === item.id} onPress={() => onSelect(item.id)} icon={icon} />)}</View>; }
function DateStrip({ dates, selected, onSelect }: { readonly dates: readonly string[]; readonly selected: string; readonly onSelect: (date: string) => void }) { return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>{dates.map((date) => <Pressable key={date} onPress={() => onSelect(date)} style={[styles.dateChip, selected === date && styles.dateChipSelected]}><Text style={[styles.dateChipWeekday, selected === date && styles.dateChipTextSelected]}>{shortDate(date).split(" ")[0].toUpperCase()}</Text><Text style={[styles.dateChipDay, selected === date && styles.dateChipTextSelected]}>{date.slice(-2)}</Text></Pressable>)}</ScrollView>; }
function TimeGrid({ times, selected, onSelect }: { readonly times: readonly string[]; readonly selected: string | null; readonly onSelect: (time: string) => void }) { return <View style={styles.timeGrid}>{times.map((time) => <Pressable key={time} onPress={() => onSelect(time)} style={[styles.timeChip, selected === time && styles.timeChipSelected]}><Text style={[styles.timeText, selected === time && styles.timeTextSelected]}>{time}</Text></Pressable>)}</View>; }
function Step({ labels, current }: { readonly labels: readonly string[]; readonly current: number }) { return <View style={styles.stepRow}>{labels.map((label, index) => <React.Fragment key={label}><View style={styles.step}><View style={[styles.stepDot, index <= current && styles.stepDotActive]}>{index < current ? <CheckCircle2 color={colors.onAmber} size={14} /> : <Text style={[styles.stepNumber, index <= current && styles.stepNumberActive]}>{index + 1}</Text>}</View><Text numberOfLines={1} style={[styles.stepText, index <= current && styles.stepTextActive]}>{label}</Text></View>{index < labels.length - 1 ? <View style={[styles.stepLine, index < current && styles.stepLineActive]} /> : null}</React.Fragment>)}</View>; }
function Metric({ value, label }: { readonly value: string; readonly label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel} numberOfLines={1}>{label}</Text></View>; }
function QuickAction({ label, icon, onPress }: { readonly label: string; readonly icon: typeof CalendarDays; readonly onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><AppIcon icon={icon} color={colors.amber} /><Text style={styles.quickText}>{label}</Text></Pressable>; }
function ProfessionalCard({ professional, serviceCount, position, onPress }: { readonly professional: Professional; readonly serviceCount: number; readonly position: number; readonly onPress: () => void }) { const images = [require("./assets/barbearia-corte.png"), require("./assets/barbearia-barba.png"), require("./assets/barbearia-degrade.png")]; return <Pressable onPress={onPress} style={({ pressed }) => [styles.professionalCard, pressed && styles.pressed]}><ImageBackground source={images[position % images.length]} imageStyle={styles.professionalImage} style={styles.professionalImageWrap}><View style={styles.professionalScrim} /><View style={styles.professionalBottom}><Text style={styles.professionalName}>{professional.name}</Text><Text style={styles.professionalServices}>{serviceCount} serviço(s) disponível(is)</Text></View></ImageBackground></Pressable>; }
function LoadingBlock() { return <View style={styles.loading}><ActivityIndicator color={colors.amber} /><Text style={styles.loadingText}>Carregando…</Text></View>; }
function ContextMissing() { return <SafeAreaView style={styles.screen}><EmptyState title="Escolha uma empresa" body="Abra um contexto para continuar." /></SafeAreaView>; }
function nextDays(count: number): string[] { return Array.from({ length: count }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); return dayKey(date); }); }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, scroll: { flexGrow: 1, padding: space.xl, gap: 12, paddingBottom: 32 }, bookingScroll: { flexGrow: 1, gap: 12, paddingBottom: 32 },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }, businessName: { ...type.label, color: colors.text, fontSize: 17 }, businessSegment: { ...type.micro, color: colors.textSecondary, fontWeight: "500", marginTop: 2 }, switchButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.chip, paddingVertical: 9, paddingHorizontal: 11 }, switchButtonText: { ...type.micro, color: colors.amberLight }, greeting: { ...type.display, color: colors.text, fontSize: 34, lineHeight: 39 }, customerHeadline: { ...type.display, color: colors.text, fontSize: 34, lineHeight: 39, marginTop: 12 }, greetingBody: { ...type.body, color: colors.textSecondary, marginBottom: 10 },
  metricRow: { flexDirection: "row", gap: 8, marginVertical: 10 }, metric: { flex: 1, minHeight: 88, borderRadius: radius.card, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, padding: 12, justifyContent: "space-between" }, metricValue: { color: colors.amberLight, fontSize: 28, lineHeight: 32, fontWeight: "800" }, metricLabel: { ...type.micro, color: colors.textSecondary, fontWeight: "600" },
  list: { gap: 8 }, quickRow: { flexDirection: "row", gap: 8 }, quickAction: { flex: 1, minHeight: 100, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 12, justifyContent: "space-between" }, quickText: { ...type.micro, color: colors.text, fontSize: 12 },
  iconButton: { width: 42, height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.round, justifyContent: "center", alignItems: "center" }, todayPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.amberSoft, borderRadius: radius.round, paddingHorizontal: 12, paddingVertical: 9 }, todayPillText: { ...type.micro, color: colors.amberLight },
  formSurface: { gap: 14 }, personSurface: { flexDirection: "row", alignItems: "center", gap: 12 }, personCopy: { flex: 1, gap: 3 }, personName: { ...type.label, color: colors.text, fontSize: 16 }, personMeta: { ...type.micro, color: colors.textSecondary, fontWeight: "500", lineHeight: 18 },
  reportHero: { padding: 24, backgroundColor: colors.amber, borderRadius: radius.modal, gap: 6, ...elevation.primary }, reportLabel: { ...type.micro, color: colors.onAmber, letterSpacing: 1 }, reportNumber: { color: colors.onAmber, fontSize: 52, lineHeight: 56, fontWeight: "800", letterSpacing: -2 }, reportBody: { ...type.body, color: "#26323C" }, reportGrid: { flexDirection: "row", gap: 8 }, reportCallout: { flexDirection: "row", gap: 13, alignItems: "center" },
  profileHero: { flexDirection: "row", alignItems: "center", gap: 14 }, avatar: { width: 54, height: 54, borderRadius: radius.round, backgroundColor: colors.amber, justifyContent: "center", alignItems: "center" }, avatarText: { color: colors.onAmber, fontSize: 21, fontWeight: "800" },
  choiceList: { gap: 8 }, dateStrip: { gap: 8 }, dateChip: { width: 61, minHeight: 71, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, justifyContent: "center", alignItems: "center", gap: 3 }, dateChipSelected: { borderColor: colors.amber, backgroundColor: colors.amber }, dateChipWeekday: { ...type.micro, color: colors.textSecondary, fontSize: 10 }, dateChipDay: { color: colors.text, fontSize: 21, fontWeight: "800" }, dateChipTextSelected: { color: colors.onAmber }, timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, timeChip: { minWidth: 78, minHeight: 48, borderRadius: radius.input, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 }, timeChipSelected: { backgroundColor: colors.amber, borderColor: colors.amber }, timeText: { ...type.label, color: colors.text }, timeTextSelected: { color: colors.onAmber },
  stepRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: space.xl, paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1 }, step: { width: 57, alignItems: "center", gap: 5 }, stepDot: { width: 27, height: 27, borderRadius: radius.round, backgroundColor: colors.field, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }, stepDotActive: { backgroundColor: colors.amber, borderColor: colors.amber }, stepNumber: { ...type.micro, color: colors.textSecondary }, stepNumberActive: { color: colors.onAmber }, stepText: { ...type.micro, color: colors.muted, fontSize: 10, textAlign: "center" }, stepTextActive: { color: colors.text }, stepLine: { flex: 1, height: 1, backgroundColor: colors.border, marginTop: 13, marginHorizontal: -2 }, stepLineActive: { backgroundColor: colors.amber },
  helperText: { ...type.body, color: colors.textSecondary, textAlign: "center", paddingVertical: 10 }, confirmed: { flex: 1, justifyContent: "center", padding: 28, gap: 16, backgroundColor: colors.background }, confirmedIcon: { width: 76, height: 76, borderRadius: radius.round, justifyContent: "center", alignItems: "center", backgroundColor: colors.amber }, confirmedTitle: { ...type.display, color: colors.text }, confirmedBody: { ...type.body, color: colors.textSecondary, marginBottom: 8 },
  professionalGrid: { gap: 12 }, professionalCard: { overflow: "hidden", borderRadius: radius.modal, height: 190, backgroundColor: colors.surfaceRaised }, professionalImageWrap: { flex: 1, justifyContent: "flex-end" }, professionalImage: { borderRadius: radius.modal }, professionalScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4, 12, 18, 0.50)" }, professionalBottom: { padding: 18, gap: 3 }, professionalName: { ...type.subtitle, color: colors.white }, professionalServices: { ...type.micro, color: "#E2E8F0", fontWeight: "500" },
  loading: { minHeight: 150, justifyContent: "center", alignItems: "center", gap: 10 }, loadingText: { ...type.body, color: colors.textSecondary }, pressed: { opacity: 0.78 },
});
