"use client";

import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";

import { AutomotiveDataMode } from "@/lib/automotive";
import {
  AppointmentStatus,
  appointmentStatusCopy,
  displayScheduleDate,
  localDateKey,
  localDateTime,
  ScheduleAppointment,
  ScheduleCustomer,
  ScheduleProfessional,
  ScheduleResource,
  ScheduleRule,
  ScheduleService,
  SchedulingBlock,
  shortTime,
  timePart,
} from "@/lib/scheduling";
import { createClient } from "@/lib/supabase/client";
import { can, type BusinessRole } from "@boramarca/core";
import { useSegment } from "@/core/segment";

interface AutomotiveAgendaProps {
  mode: AutomotiveDataMode;
  tenantId: string | null;
  onOpenPatio: () => void;
}

const DEFAULT_DAY_START = 8 * 60;
const DEFAULT_DAY_END = 18 * 60;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 42;
const noAppointments: ScheduleAppointment[] = [];
const noBlocks: SchedulingBlock[] = [];
const noProfessionals: ScheduleProfessional[] = [];

const demoProfessionals: ScheduleProfessional[] = [
  { id: "demo-professional-1", name: "Caio", active: true },
  { id: "demo-professional-2", name: "Nina", active: true },
  { id: "demo-professional-3", name: "Ícaro", active: true },
];

const demoCustomers: ScheduleCustomer[] = [
  { id: "demo-customer-1", name: "Mariana Nunes", active: true },
  { id: "demo-customer-2", name: "Gustavo Lima", active: true },
  { id: "demo-customer-3", name: "Juliana Prado", active: true },
];

const demoServices: ScheduleService[] = [
  { id: "demo-service-1", name: "Higienização interna", duration_minutes: 120, active: true },
  { id: "demo-service-2", name: "Polimento técnico", duration_minutes: 180, active: true },
  { id: "demo-service-3", name: "Lavagem detalhada", duration_minutes: 90, active: true },
];

const demoResources: ScheduleResource[] = demoProfessionals.map((professional) => ({
  id: `resource-${professional.id}`,
  tenant_id: "demo-tenant",
  professional_id: professional.id,
  name: professional.name,
  kind: "professional",
  active: true,
}));

function demoRules(): ScheduleRule[] {
  return demoProfessionals.flatMap((professional) =>
    [1, 2, 3, 4, 5, 6].map((weekday) => ({
      id: `demo-rule-${professional.id}-${weekday}`,
      tenant_id: "demo-tenant",
      professional_id: professional.id,
      weekday,
      starts_at: "08:00:00",
      ends_at: "18:00:00",
      active: true,
    })),
  );
}

function demoAppointments(date: string): ScheduleAppointment[] {
  return [
    {
      id: `demo-appointment-1-${date}`,
      tenant_id: "demo-tenant",
      customer_id: "demo-customer-1",
      customer_name: "Mariana Nunes",
      service_id: "demo-service-1",
      service_name: "Higienização interna",
      professional_id: "demo-professional-1",
      professional_name: "Caio",
      start_at: localDateTime(date, "09:00"),
      end_at: localDateTime(date, "11:00"),
      status: "confirmed",
      notes: "Confirmado por WhatsApp",
    },
    {
      id: `demo-appointment-2-${date}`,
      tenant_id: "demo-tenant",
      customer_id: "demo-customer-2",
      customer_name: "Gustavo Lima",
      service_id: "demo-service-2",
      service_name: "Polimento técnico",
      professional_id: "demo-professional-2",
      professional_name: "Nina",
      start_at: localDateTime(date, "10:30"),
      end_at: localDateTime(date, "13:30"),
      status: "scheduled",
      notes: null,
    },
    {
      id: `demo-appointment-3-${date}`,
      tenant_id: "demo-tenant",
      customer_id: "demo-customer-3",
      customer_name: "Juliana Prado",
      service_id: "demo-service-3",
      service_name: "Lavagem detalhada",
      professional_id: "demo-professional-3",
      professional_name: "Ícaro",
      start_at: localDateTime(date, "14:00"),
      end_at: localDateTime(date, "15:30"),
      status: "scheduled",
      notes: "Avaliar manchas no banco traseiro",
    },
  ];
}

function demoBlocks(date: string): SchedulingBlock[] {
  return [
    {
      id: `demo-block-${date}`,
      tenant_id: "demo-tenant",
      scheduling_resource_id: "resource-demo-professional-1",
      start_at: localDateTime(date, "13:00"),
      end_at: localDateTime(date, "14:00"),
      reason: "Almoço / preparação de box",
    },
  ];
}

function minutesInDay(value: string) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function toClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function unavailableWindows(dayRules: ScheduleRule[], rangeStart: number, rangeEnd: number) {
  const windows = dayRules
    .map((rule) => ({
      start: Math.max(rangeStart, timeToMinutes(rule.starts_at)),
      end: Math.min(rangeEnd, timeToMinutes(rule.ends_at)),
    }))
    .filter((window) => window.end > window.start)
    .sort((left, right) => left.start - right.start);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = rangeStart;
  for (const window of windows) {
    if (window.start > cursor) gaps.push({ start: cursor, end: window.start });
    cursor = Math.max(cursor, window.end);
  }
  if (cursor < rangeEnd) gaps.push({ start: cursor, end: rangeEnd });
  return gaps;
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return localDateKey(value);
}

function weekdayFor(date: string) {
  return new Date(`${date}T12:00:00`).getDay();
}

function relationName(value: unknown) {
  if (Array.isArray(value)) return relationName(value[0]);
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string")
    return value.name;
  return "Cadastro indisponível";
}

export function AutomotiveAgenda({ mode, tenantId, onOpenPatio }: AutomotiveAgendaProps) {
  const segment = useSegment();
  const connected = Boolean(tenantId) && (mode === "live" || mode === "empty");
  const [selectedDate, setSelectedDate] = useState(localDateKey);
  const [appointments, setAppointments] = useState<ScheduleAppointment[]>(() =>
    demoAppointments(localDateKey()),
  );
  const [blocks, setBlocks] = useState<SchedulingBlock[]>(() => demoBlocks(localDateKey()));
  // O motivo do bloqueio mora numa tabela separada com política própria: quem não
  // pode ver simplesmente não recebe a linha, e a grade mostra "Indisponível".
  const [blockNotes, setBlockNotes] = useState<Record<string, string>>({});
  /**
   * Veículos do cliente do agendamento selecionado, guardados JUNTO do agendamento a
   * que pertencem. Sem esse par, a lista do cliente anterior ficaria visível enquanto
   * a busca do novo não voltasse — e daria para abrir uma OS com o carro errado.
   */
  const [vehicleState, setVehicleState] = useState<{
    appointmentId: string;
    vehicles: { id: string; license_plate: string }[];
  }>({ appointmentId: "", vehicles: [] });
  const [vehicleId, setVehicleId] = useState("");
  const [professionals, setProfessionals] = useState<ScheduleProfessional[]>(demoProfessionals);
  const [customers, setCustomers] = useState<ScheduleCustomer[]>(demoCustomers);
  const [services, setServices] = useState<ScheduleService[]>(demoServices);
  const [rules, setRules] = useState<ScheduleRule[]>(demoRules);
  const [resources, setResources] = useState<ScheduleResource[]>(demoResources);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isBlockOpen, setIsBlockOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedLive, setHasLoadedLive] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availabilityAccess, setAvailabilityAccess] = useState<"all" | "self" | "none">("all");
  const [ownAvailabilityProfessionalId, setOwnAvailabilityProfessionalId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState({
    customerId: "",
    serviceId: "",
    professionalId: "",
    time: "09:00",
    notes: "",
  });
  const [blockForm, setBlockForm] = useState({
    professionalId: "",
    startsAt: "12:00",
    endsAt: "13:00",
    reason: "",
  });
  const [availabilityProfessionalId, setAvailabilityProfessionalId] = useState("");
  const [availabilityForm, setAvailabilityForm] = useState({ startsAt: "08:00", endsAt: "18:00" });
  const [rescheduleTime, setRescheduleTime] = useState("09:00");

  useEffect(() => {
    let cancelled = false;

    async function loadAgenda() {
      if (!connected || !tenantId) {
        setAppointments(demoAppointments(selectedDate));
        setBlocks(demoBlocks(selectedDate));
        setProfessionals(demoProfessionals);
        setCustomers(demoCustomers);
        setServices(demoServices);
        setRules(demoRules());
        setResources(demoResources);
        setHasLoadedLive(false);
        setLoadError(null);
        setAvailabilityAccess("all");
        setOwnAvailabilityProfessionalId("");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setHasLoadedLive(false);
      setLoadError(null);
      const startAt = localDateTime(selectedDate, "00:00");
      const endAt = localDateTime(addDays(selectedDate, 1), "00:00");
      const supabase = createClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionError || !sessionData.session) {
        setLoadError("Não foi possível validar a sessão para carregar a agenda. Tente novamente.");
        setIsLoading(false);
        return;
      }
      const [
        membershipResult,
        appointmentsResult,
        professionalsResult,
        customersResult,
        servicesResult,
        rulesResult,
        resourcesResult,
        reservationsResult,
        blockNotesResult,
      ] = await Promise.all([
        supabase
          .from("business_members")
          .select("id, role")
          .eq("tenant_id", tenantId)
          .eq("user_id", sessionData.session.user.id)
          .eq("active", true)
          .maybeSingle(),
        supabase
          .from("appointments")
          .select(
            "id, tenant_id, customer_id, service_id, professional_id, start_at, end_at, status, notes, customers(name), services(name), professionals(name)",
          )
          .eq("tenant_id", tenantId)
          .gte("start_at", startAt)
          .lt("start_at", endAt)
          .order("start_at"),
        supabase
          .from("professionals")
          .select("id, name, active, business_member_id")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("name"),
        supabase
          .from("customers")
          .select("id, name, active")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("name"),
        supabase
          .from("services")
          .select("id, name, duration_minutes, active")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("name"),
        supabase
          .from("professional_schedule_rules")
          .select("id, tenant_id, professional_id, weekday, starts_at, ends_at, active")
          .eq("tenant_id", tenantId)
          .order("starts_at"),
        supabase
          .from("scheduling_resources")
          .select("id, tenant_id, professional_id, name, kind, active")
          .eq("tenant_id", tenantId)
          .eq("active", true),
        supabase
          .from("scheduling_resource_reservations")
          .select("id, tenant_id, scheduling_resource_id, kind, start_at, end_at")
          .eq("tenant_id", tenantId)
          .eq("kind", "block")
          .lt("start_at", endAt)
          .gt("end_at", startAt),
        supabase
          .from("scheduling_block_notes")
          .select("reservation_id, note")
          .eq("tenant_id", tenantId),
      ]);

      if (cancelled) return;
      const requestError =
        membershipResult.error ??
        appointmentsResult.error ??
        professionalsResult.error ??
        customersResult.error ??
        servicesResult.error ??
        rulesResult.error ??
        resourcesResult.error ??
        reservationsResult.error ??
        blockNotesResult.error;
      if (requestError || !membershipResult.data) {
        setLoadError(
          `Não foi possível carregar a agenda: ${requestError?.message ?? "vínculo ativo não encontrado"}.`,
        );
        setIsLoading(false);
        return;
      }

      const nextAppointments = (appointmentsResult.data ?? []).map((row) => {
        const appointment = row as unknown as {
          id: string;
          tenant_id: string;
          customer_id: string;
          service_id: string;
          professional_id: string;
          start_at: string;
          end_at: string;
          status: AppointmentStatus;
          notes: string | null;
          customers: unknown;
          services: unknown;
          professionals: unknown;
        };
        return {
          ...appointment,
          customer_name: relationName(appointment.customers),
          service_name: relationName(appointment.services),
          professional_name: relationName(appointment.professionals),
        } as ScheduleAppointment;
      });

      const nextProfessionals = (professionalsResult.data ?? []) as ScheduleProfessional[];
      const isScheduler = can(membershipResult.data.role as BusinessRole, "manageSchedule");
      const ownProfessional = nextProfessionals.find(
        (professional) => professional.business_member_id === membershipResult.data?.id,
      );
      setAppointments(nextAppointments);
      setBlocks((reservationsResult.data ?? []) as SchedulingBlock[]);
      setBlockNotes(
        Object.fromEntries(
          ((blockNotesResult.data ?? []) as { reservation_id: string; note: string }[]).map(
            (linha) => [linha.reservation_id, linha.note],
          ),
        ),
      );
      setProfessionals(nextProfessionals);
      setCustomers((customersResult.data ?? []) as ScheduleCustomer[]);
      setServices((servicesResult.data ?? []) as ScheduleService[]);
      setRules((rulesResult.data ?? []) as ScheduleRule[]);
      setResources((resourcesResult.data ?? []) as ScheduleResource[]);
      setAvailabilityAccess(isScheduler ? "all" : ownProfessional ? "self" : "none");
      setOwnAvailabilityProfessionalId(ownProfessional?.id ?? "");
      if (ownProfessional && !isScheduler) setAvailabilityProfessionalId(ownProfessional.id);
      setHasLoadedLive(true);
      setIsLoading(false);
    }

    void loadAgenda();
    return () => {
      cancelled = true;
    };
  }, [connected, reloadKey, selectedDate, tenantId]);

  const isAgendaReady = !connected || hasLoadedLive;
  const renderedAppointments = isAgendaReady ? appointments : noAppointments;
  const renderedBlocks = isAgendaReady ? blocks : noBlocks;
  const renderedProfessionals = isAgendaReady ? professionals : noProfessionals;
  const resourceByProfessional = useMemo(
    () =>
      new Map(
        resources
          .filter((resource) => resource.kind === "professional" && resource.professional_id)
          .map((resource) => [resource.professional_id as string, resource]),
      ),
    [resources],
  );
  const selectedAppointment = isAgendaReady
    ? (appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null)
    : null;
  const selectedBlock = isAgendaReady
    ? (blocks.find((block) => block.id === selectedBlockId) ?? null)
    : null;
  const selectedWeekday = weekdayFor(selectedDate);
  const bookingCustomerId = customers.some((customer) => customer.id === booking.customerId)
    ? booking.customerId
    : (customers[0]?.id ?? "");
  const bookingServiceId = services.some((service) => service.id === booking.serviceId)
    ? booking.serviceId
    : (services[0]?.id ?? "");
  const bookingProfessionalId = professionals.some(
    (professional) => professional.id === booking.professionalId,
  )
    ? booking.professionalId
    : (professionals[0]?.id ?? "");
  const blockProfessionalId = professionals.some(
    (professional) => professional.id === blockForm.professionalId,
  )
    ? blockForm.professionalId
    : (professionals[0]?.id ?? "");
  const ownProfessionalId = availabilityAccess === "self" ? ownAvailabilityProfessionalId : "";
  const selectedAvailabilityProfessionalId =
    availabilityAccess === "self"
      ? ownProfessionalId
      : professionals.some((professional) => professional.id === availabilityProfessionalId)
        ? availabilityProfessionalId
        : (professionals[0]?.id ?? "");
  const availabilityRules = rules.filter(
    (rule) =>
      rule.professional_id === selectedAvailabilityProfessionalId &&
      rule.weekday === selectedWeekday &&
      rule.active,
  );
  const isBusy = isLoading || isSaving;
  const actionsDisabled = isBusy || !isAgendaReady;
  const canManageAvailability = !connected || availabilityAccess !== "none";
  const canChooseAvailabilityProfessional = !connected || availabilityAccess === "all";
  const timeRange = useMemo(() => {
    const points = [
      ...rules
        .filter((rule) => rule.weekday === selectedWeekday && rule.active)
        .flatMap((rule) => [timeToMinutes(rule.starts_at), timeToMinutes(rule.ends_at)]),
      ...renderedAppointments.flatMap((appointment) => [
        minutesInDay(appointment.start_at),
        minutesInDay(appointment.end_at),
      ]),
      ...renderedBlocks.flatMap((block) => [
        minutesInDay(block.start_at),
        minutesInDay(block.end_at),
      ]),
    ];
    const earliest = points.length ? Math.min(...points) : DEFAULT_DAY_START;
    const latest = points.length ? Math.max(...points) : DEFAULT_DAY_END;
    const start = Math.max(0, Math.floor((earliest - SLOT_MINUTES) / SLOT_MINUTES) * SLOT_MINUTES);
    const end = Math.min(24 * 60, Math.ceil((latest + SLOT_MINUTES) / SLOT_MINUTES) * SLOT_MINUTES);
    return { start, end: Math.max(start + SLOT_MINUTES, end) };
  }, [renderedAppointments, renderedBlocks, rules, selectedWeekday]);
  const timeSlots = Array.from(
    { length: (timeRange.end - timeRange.start) / SLOT_MINUTES + 1 },
    (_, index) => timeRange.start + index * SLOT_MINUTES,
  );

  function clearMessages() {
    setError(null);
    setNotice(null);
  }

  function reloadAgenda() {
    clearMessages();
    setLoadError(null);
    setReloadKey((current) => current + 1);
  }

  function hasReservationConflict(
    professionalId: string,
    startAt: string,
    endAt: string,
    ignoredAppointmentId?: string,
  ) {
    const starts = new Date(startAt).getTime();
    const ends = new Date(endAt).getTime();
    const appointmentConflict = appointments.some(
      (appointment) =>
        appointment.id !== ignoredAppointmentId &&
        appointment.professional_id === professionalId &&
        appointment.status !== "cancelled" &&
        starts < new Date(appointment.end_at).getTime() &&
        ends > new Date(appointment.start_at).getTime(),
    );
    const resource = resourceByProfessional.get(professionalId);
    const blockConflict =
      resource &&
      blocks.some(
        (block) =>
          block.scheduling_resource_id === resource.id &&
          starts < new Date(block.end_at).getTime() &&
          ends > new Date(block.start_at).getTime(),
      );
    return appointmentConflict || blockConflict;
  }

  function isWithinRecurringAvailability(professionalId: string, startAt: string, endAt: string) {
    const weekday = new Date(startAt).getDay();
    const start = minutesInDay(startAt);
    const end = minutesInDay(endAt);
    return rules.some(
      (rule) =>
        rule.professional_id === professionalId &&
        rule.weekday === weekday &&
        rule.active &&
        start >= Number(rule.starts_at.slice(0, 2)) * 60 + Number(rule.starts_at.slice(3, 5)) &&
        end <= Number(rule.ends_at.slice(0, 2)) * 60 + Number(rule.ends_at.slice(3, 5)),
    );
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    if (!bookingCustomerId || !bookingServiceId || !bookingProfessionalId) {
      setError("Cadastre e selecione cliente, serviço e profissional antes de agendar.");
      return;
    }

    setIsSaving(true);
    const startAt = localDateTime(selectedDate, booking.time);
    if (connected && tenantId) {
      const { error: rpcError } = await createClient().rpc("create_staff_appointment", {
        p_tenant_id: tenantId,
        p_customer_id: bookingCustomerId,
        p_service_id: bookingServiceId,
        p_professional_id: bookingProfessionalId,
        p_start_at: startAt,
        p_notes: booking.notes.trim() || null,
      });
      if (rpcError) {
        setError(`Agendamento não criado: ${rpcError.message}`);
        setIsSaving(false);
        return;
      }
      setNotice("Agendamento criado e reserva de capacidade confirmada.");
      setIsBookingOpen(false);
      setIsSaving(false);
      reloadAgenda();
      return;
    }

    const service = services.find((item) => item.id === bookingServiceId);
    const customer = customers.find((item) => item.id === bookingCustomerId);
    const professional = professionals.find((item) => item.id === bookingProfessionalId);
    if (!service || !customer || !professional) {
      setError("Não foi possível montar esta prévia de agendamento.");
      setIsSaving(false);
      return;
    }
    const endAt = new Date(
      new Date(startAt).getTime() + service.duration_minutes * 60_000,
    ).toISOString();
    if (!isWithinRecurringAvailability(professional.id, startAt, endAt)) {
      setError("O profissional está fora do horário de disponibilidade neste intervalo.");
      setIsSaving(false);
      return;
    }
    if (hasReservationConflict(professional.id, startAt, endAt)) {
      setError("Esse horário já está reservado ou bloqueado para o profissional selecionado.");
      setIsSaving(false);
      return;
    }
    setAppointments((current) => [
      {
        id: `demo-booking-${Date.now()}`,
        tenant_id: "demo-tenant",
        customer_id: customer.id,
        customer_name: customer.name,
        service_id: service.id,
        service_name: service.name,
        professional_id: professional.id,
        professional_name: professional.name,
        start_at: startAt,
        end_at: endAt,
        status: "scheduled",
        notes: booking.notes.trim() || null,
      },
      ...current,
    ]);
    setNotice("Agendamento incluído apenas nesta prévia.");
    setIsBookingOpen(false);
    setIsSaving(false);
  }

  /**
   * A ponte que os ADRs 0001 e 0002 descrevem e a interface nunca construiu.
   * `open_automotive_work_order` existe desde a primeira migration automotiva e não
   * tinha nenhum consumidor: só a variante de entrada rápida era usada, então Agenda e
   * Pátio eram dois sistemas que não se conversavam.
   *
   * O agendamento traz cliente e serviço; o veículo é do módulo e precisa ser
   * escolhido aqui — é a única informação que o núcleo não tem.
   */
  // Os veículos do cliente do agendamento selecionado. Sem isto, abrir a OS exigiria
  // adivinhar qual carro chegou.
  useEffect(() => {
    if (!connected || !tenantId || !selectedAppointment) return;

    let cancelado = false;

    async function buscarVeiculos(cliente: string, unidade: string, agendamento: string) {
      const { data } = await createClient()
        .from("automotive_vehicles")
        .select("id, license_plate")
        .eq("tenant_id", unidade)
        .eq("customer_id", cliente)
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (cancelado) return;
      const lista = (data ?? []) as { id: string; license_plate: string }[];
      setVehicleState({ appointmentId: agendamento, vehicles: lista });
      setVehicleId(lista[0]?.id ?? "");
    }

    void buscarVeiculos(selectedAppointment.customer_id, tenantId, selectedAppointment.id);

    return () => {
      cancelado = true;
    };
  }, [connected, tenantId, selectedAppointment]);

  const customerVehicles =
    vehicleState.appointmentId === selectedAppointment?.id ? vehicleState.vehicles : [];

  async function openWorkOrder(appointment: ScheduleAppointment) {
    if (!connected) {
      setError("A ordem de serviço é aberta somente nesta prévia.");
      return;
    }

    if (!vehicleId || !customerVehicles.some((vehicle) => vehicle.id === vehicleId)) {
      setError("Escolha o veículo que chegou para abrir a ordem de serviço.");
      return;
    }

    setIsSaving(true);
    const { error: rpcError } = await createClient().rpc("open_automotive_work_order", {
      p_tenant_id: tenantId,
      p_customer_id: appointment.customer_id,
      p_vehicle_id: vehicleId,
      p_appointment_id: appointment.id,
    });
    setIsSaving(false);

    if (rpcError) {
      setError(`Não foi possível abrir a OS: ${rpcError.message}`);
      return;
    }

    // Abrir a OS consome o agendamento (Etapa 2): ele avança para em andamento e a
    // reserva de box do agendamento é liberada. Voltar ao Pátio é o passo natural.
    onOpenPatio();
  }

  async function confirmAppointment(appointment: ScheduleAppointment) {
    clearMessages();
    setIsSaving(true);
    if (connected) {
      const { error: rpcError } = await createClient().rpc("transition_staff_appointment", {
        p_appointment_id: appointment.id,
        p_next_status: "confirmed",
      });
      if (rpcError) {
        setError(`Não foi possível confirmar: ${rpcError.message}`);
        setIsSaving(false);
        return;
      }
    }
    setAppointments((current) =>
      current.map((item) => (item.id === appointment.id ? { ...item, status: "confirmed" } : item)),
    );
    setNotice(
      connected ? "Agendamento confirmado." : "Agendamento confirmado somente nesta prévia.",
    );
    setIsSaving(false);
  }

  async function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAppointment || !["scheduled", "confirmed"].includes(selectedAppointment.status))
      return;
    clearMessages();
    setIsSaving(true);
    const startAt = localDateTime(selectedDate, rescheduleTime);
    if (connected) {
      const { error: rpcError } = await createClient().rpc("reschedule_staff_appointment", {
        p_appointment_id: selectedAppointment.id,
        p_start_at: startAt,
      });
      if (rpcError) {
        setError(`Não foi possível remarcar: ${rpcError.message}`);
        setIsSaving(false);
        return;
      }
      setNotice("Horário remarcado e capacidade conferida.");
      setIsSaving(false);
      reloadAgenda();
      return;
    }
    const duration =
      new Date(selectedAppointment.end_at).getTime() -
      new Date(selectedAppointment.start_at).getTime();
    const endAt = new Date(new Date(startAt).getTime() + duration).toISOString();
    if (!isWithinRecurringAvailability(selectedAppointment.professional_id, startAt, endAt)) {
      setError("O novo horário está fora da disponibilidade do profissional.");
      setIsSaving(false);
      return;
    }
    if (
      hasReservationConflict(
        selectedAppointment.professional_id,
        startAt,
        endAt,
        selectedAppointment.id,
      )
    ) {
      setError("O novo horário conflita com uma reserva ou bloqueio existente.");
      setIsSaving(false);
      return;
    }
    setAppointments((current) =>
      current.map((appointment) =>
        appointment.id === selectedAppointment.id
          ? { ...appointment, start_at: startAt, end_at: endAt }
          : appointment,
      ),
    );
    setNotice("Horário remarcado somente nesta prévia.");
    setIsSaving(false);
  }

  async function submitBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    const resource = resourceByProfessional.get(blockProfessionalId);
    if (!resource || blockForm.endsAt <= blockForm.startsAt) {
      setError("Selecione um profissional e um período de bloqueio válido.");
      return;
    }
    setIsSaving(true);
    const startAt = localDateTime(selectedDate, blockForm.startsAt);
    const endAt = localDateTime(selectedDate, blockForm.endsAt);
    if (connected) {
      const { error: rpcError } = await createClient().rpc("create_scheduling_block", {
        p_scheduling_resource_id: resource.id,
        p_start_at: startAt,
        p_end_at: endAt,
        p_reason: blockForm.reason.trim() || null,
      });
      if (rpcError) {
        setError(`Bloqueio não criado: ${rpcError.message}`);
        setIsSaving(false);
        return;
      }
      setNotice("Horário bloqueado. A agenda não aceitará reservas neste intervalo.");
      setIsBlockOpen(false);
      setIsSaving(false);
      reloadAgenda();
      return;
    }
    if (hasReservationConflict(blockProfessionalId, startAt, endAt)) {
      setError("Esse período já contém uma reserva ou bloqueio para o profissional selecionado.");
      setIsSaving(false);
      return;
    }
    setBlocks((current) => [
      {
        id: `demo-block-${Date.now()}`,
        tenant_id: "demo-tenant",
        scheduling_resource_id: resource.id,
        start_at: startAt,
        end_at: endAt,
        reason: blockForm.reason.trim() || "Indisponível",
      },
      ...current,
    ]);
    setNotice("Bloqueio incluído somente nesta prévia.");
    setIsBlockOpen(false);
    setIsSaving(false);
  }

  async function removeBlock(block: SchedulingBlock) {
    if (!window.confirm("Remover este bloqueio de disponibilidade?")) return;
    clearMessages();
    setIsSaving(true);
    if (connected) {
      const { error: rpcError } = await createClient().rpc("remove_scheduling_block", {
        p_reservation_id: block.id,
      });
      if (rpcError) {
        setError(`Não foi possível remover o bloqueio: ${rpcError.message}`);
        setIsSaving(false);
        return;
      }
    }
    setBlocks((current) => current.filter((item) => item.id !== block.id));
    setSelectedBlockId(null);
    setNotice(connected ? "Bloqueio removido." : "Bloqueio removido somente nesta prévia.");
    setIsSaving(false);
  }

  async function submitAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    if (!canManageAvailability) {
      setError("Seu perfil não tem permissão para alterar a disponibilidade deste profissional.");
      return;
    }
    if (
      !selectedAvailabilityProfessionalId ||
      availabilityForm.endsAt <= availabilityForm.startsAt
    ) {
      setError("Informe um profissional e um intervalo de disponibilidade válido.");
      return;
    }
    setIsSaving(true);
    const nextRule = {
      tenant_id: tenantId ?? "demo-tenant",
      professional_id: selectedAvailabilityProfessionalId,
      weekday: selectedWeekday,
      starts_at: availabilityForm.startsAt,
      ends_at: availabilityForm.endsAt,
      active: true,
    };
    if (connected) {
      const { error: insertError } = await createClient().rpc("set_professional_schedule_rule", {
        p_professional_id: selectedAvailabilityProfessionalId,
        p_weekday: selectedWeekday,
        p_starts_at: availabilityForm.startsAt,
        p_ends_at: availabilityForm.endsAt,
      });
      if (insertError) {
        setError(`Disponibilidade não salva: ${insertError.message}`);
        setIsSaving(false);
        return;
      }
      setNotice("Disponibilidade recorrente salva.");
      setIsSaving(false);
      reloadAgenda();
      return;
    }
    setRules((current) => [...current, { id: `demo-rule-${Date.now()}`, ...nextRule }]);
    setNotice("Disponibilidade incluída somente nesta prévia.");
    setIsSaving(false);
  }

  async function removeAvailability(rule: ScheduleRule) {
    if (!window.confirm("Remover este horário recorrente?")) return;
    clearMessages();
    if (!canManageAvailability) {
      setError("Seu perfil não tem permissão para alterar esta disponibilidade.");
      return;
    }
    setIsSaving(true);
    if (connected) {
      const { error: deleteError } = await createClient().rpc("remove_professional_schedule_rule", {
        p_rule_id: rule.id,
      });
      if (deleteError) {
        setError(`Não foi possível remover o horário: ${deleteError.message}`);
        setIsSaving(false);
        return;
      }
    }
    setRules((current) => current.filter((item) => item.id !== rule.id));
    setNotice(
      connected ? "Disponibilidade removida." : "Disponibilidade removida somente nesta prévia.",
    );
    setIsSaving(false);
  }

  const scheduledCount = renderedAppointments.filter(
    (appointment) => appointment.status === "scheduled" || appointment.status === "confirmed",
  ).length;
  const hasScheduleDependencies =
    isAgendaReady && Boolean(customers.length && services.length && professionals.length);

  return (
    <section className="agenda-workspace" aria-label="Agenda e disponibilidade">
      {(notice || error) && (
        <div
          className={`agenda-notice ${error ? "agenda-notice-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <CircleAlert size={17} />
          <span>{error ?? notice}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      )}

      <header className="agenda-heading">
        <div>
          <h1>Agenda de operação</h1>
          <p>Disponibilidade real do time antes de prometer um novo atendimento.</p>
        </div>
        <div className="agenda-heading-actions">
          <span
            className={`mode-badge mode-${connected && isAgendaReady ? "live" : "demonstration"}`}
          >
            <span />
            {connected
              ? isAgendaReady
                ? "Dados ao vivo"
                : loadError
                  ? "Dados indisponíveis"
                  : "Carregando dados"
              : "Prévia demonstrativa"}
          </span>
          <button className="agenda-back" type="button" onClick={onOpenPatio}>
            <ChevronRight size={16} />
            Ver Pátio
          </button>
        </div>
      </header>

      <section className="agenda-toolbar" aria-label="Controles da agenda">
        <div className="date-navigator">
          <button
            type="button"
            onClick={() => setSelectedDate((current) => addDays(current, -1))}
            aria-label="Dia anterior"
          >
            <ArrowLeft size={17} />
          </button>
          <button
            className="date-navigator-current"
            type="button"
            onClick={() => setSelectedDate(localDateKey())}
          >
            <CalendarClock size={17} />
            {displayScheduleDate(selectedDate)}
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate((current) => addDays(current, 1))}
            aria-label="Próximo dia"
          >
            <ArrowRight size={17} />
          </button>
        </div>
        <div className="agenda-toolbar-status">
          <span>
            <i className="agenda-dot agenda-dot-booked" />
            {scheduledCount} reservado{scheduledCount === 1 ? "" : "s"}
          </span>
          <span>
            <i className="agenda-dot agenda-dot-blocked" />
            Bloqueio manual
          </span>
          <span>
            <i className="agenda-dot agenda-dot-available" />
            Disponível
          </span>
          <span>
            <i className="agenda-dot agenda-dot-unavailable" />
            Fora do horário
          </span>
        </div>
        <div className="agenda-toolbar-actions">
          <button
            type="button"
            onClick={reloadAgenda}
            disabled={isBusy}
            aria-label="Atualizar agenda"
          >
            <RefreshCw size={16} className={isLoading ? "spin" : ""} />
          </button>
          <button
            className="agenda-block-action"
            type="button"
            onClick={() => {
              setIsBlockOpen(true);
              setIsBookingOpen(false);
              setSelectedAppointmentId(null);
              setSelectedBlockId(null);
            }}
            disabled={!renderedProfessionals.length || actionsDisabled}
          >
            <Ban size={16} />
            Bloquear
          </button>
          <button
            className="agenda-primary"
            type="button"
            onClick={() => {
              setIsBookingOpen(true);
              setIsBlockOpen(false);
              setSelectedAppointmentId(null);
              setSelectedBlockId(null);
            }}
            disabled={!hasScheduleDependencies || actionsDisabled}
          >
            <Plus size={17} />
            Novo agendamento
          </button>
        </div>
      </section>

      <div className="agenda-layout">
        <section
          className="agenda-board"
          aria-label={`Agenda de ${displayScheduleDate(selectedDate)}`}
        >
          {!isAgendaReady ? (
            <div className="agenda-data-state">
              <CircleAlert size={24} />
              <h2>
                {loadError
                  ? "Não foi possível carregar a capacidade"
                  : "Carregando capacidade da unidade"}
              </h2>
              <p>
                {loadError ??
                  "A agenda ficará disponível assim que as reservas, bloqueios e horários recorrentes forem confirmados."}
              </p>
              {loadError && (
                <button type="button" onClick={reloadAgenda}>
                  <RefreshCw size={16} />
                  Tentar novamente
                </button>
              )}
            </div>
          ) : (
            <div className="agenda-board-scroll">
              <div
                className="agenda-time-grid"
                style={
                  {
                    "--agenda-height": `${(timeSlots.length - 1) * SLOT_HEIGHT}px`,
                  } as CSSProperties
                }
              >
                <div className="agenda-time-labels" aria-hidden="true">
                  {timeSlots.map((slot) => (
                    <span
                      key={slot}
                      style={{
                        top: `${((slot - timeRange.start) / SLOT_MINUTES) * SLOT_HEIGHT - 7}px`,
                      }}
                    >
                      {toClock(slot)}
                    </span>
                  ))}
                </div>
                <div className="agenda-professional-lanes">
                  {renderedProfessionals.map((professional) => {
                    const resource = resourceByProfessional.get(professional.id);
                    const dayRules = rules.filter(
                      (rule) =>
                        rule.professional_id === professional.id &&
                        rule.weekday === selectedWeekday &&
                        rule.active,
                    );
                    const professionalAppointments = renderedAppointments.filter(
                      (appointment) =>
                        appointment.professional_id === professional.id &&
                        appointment.status !== "cancelled",
                    );
                    const professionalBlocks = resource
                      ? renderedBlocks.filter(
                          (block) => block.scheduling_resource_id === resource.id,
                        )
                      : [];
                    return (
                      <section className="agenda-lane" key={professional.id}>
                        <header>
                          <span className="agenda-person-avatar">
                            {professional.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <strong>{professional.name}</strong>
                            <small>
                              {dayRules.length
                                ? dayRules
                                    .map(
                                      (rule) =>
                                        `${timePart(rule.starts_at)}–${timePart(rule.ends_at)}`,
                                    )
                                    .join(" · ")
                                : "Sem expediente"}
                            </small>
                          </div>
                        </header>
                        <div
                          className={`agenda-lane-body ${dayRules.length ? "" : "agenda-lane-off"}`}
                        >
                          {unavailableWindows(dayRules, timeRange.start, timeRange.end).map(
                            (window) => (
                              <div
                                className="agenda-unavailable"
                                key={`${window.start}-${window.end}`}
                                style={{
                                  top: `${((window.start - timeRange.start) / SLOT_MINUTES) * SLOT_HEIGHT}px`,
                                  height: `${((window.end - window.start) / SLOT_MINUTES) * SLOT_HEIGHT}px`,
                                }}
                              >
                                <span>Fora do horário</span>
                              </div>
                            ),
                          )}
                          {professionalBlocks.map((block) => {
                            const top = Math.max(
                              0,
                              ((minutesInDay(block.start_at) - timeRange.start) / SLOT_MINUTES) *
                                SLOT_HEIGHT,
                            );
                            const height = Math.max(
                              30,
                              ((minutesInDay(block.end_at) - minutesInDay(block.start_at)) /
                                SLOT_MINUTES) *
                                SLOT_HEIGHT,
                            );
                            return (
                              <button
                                className={`agenda-block ${selectedBlockId === block.id ? "agenda-block-selected" : ""}`}
                                key={block.id}
                                type="button"
                                onClick={() => {
                                  setSelectedBlockId(block.id);
                                  setSelectedAppointmentId(null);
                                  setIsBookingOpen(false);
                                  setIsBlockOpen(false);
                                }}
                                style={{ top: `${top}px`, height: `${height}px` }}
                              >
                                <Ban size={14} />
                                <span>
                                  {blockNotes[block.id] ?? block.reason ?? "Indisponível"}
                                </span>
                                <small>
                                  {shortTime(block.start_at)}–{shortTime(block.end_at)}
                                </small>
                              </button>
                            );
                          })}
                          {professionalAppointments.map((appointment) => {
                            const top = Math.max(
                              0,
                              ((minutesInDay(appointment.start_at) - timeRange.start) /
                                SLOT_MINUTES) *
                                SLOT_HEIGHT,
                            );
                            const height = Math.max(
                              54,
                              ((minutesInDay(appointment.end_at) -
                                minutesInDay(appointment.start_at)) /
                                SLOT_MINUTES) *
                                SLOT_HEIGHT,
                            );
                            return (
                              <button
                                className={`agenda-appointment appointment-${appointmentStatusCopy[appointment.status].tone} ${selectedAppointmentId === appointment.id ? "agenda-appointment-selected" : ""}`}
                                key={appointment.id}
                                type="button"
                                onClick={() => {
                                  setSelectedAppointmentId(appointment.id);
                                  setRescheduleTime(shortTime(appointment.start_at));
                                  setSelectedBlockId(null);
                                  setIsBookingOpen(false);
                                  setIsBlockOpen(false);
                                }}
                                style={{ top: `${top}px`, height: `${height}px` }}
                              >
                                <span>{shortTime(appointment.start_at)}</span>
                                <strong>{appointment.customer_name}</strong>
                                <small>{appointment.service_name}</small>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                  {!renderedProfessionals.length && (
                    <div className="agenda-grid-empty">
                      <UserRound size={24} />
                      <p>Nenhum profissional ativo para esta unidade.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="agenda-sidepanel" aria-label="Ações da agenda">
          {!isAgendaReady && (
            <section className="agenda-side-start">
              <CircleAlert size={25} />
              <h2>{loadError ? "Ações pausadas" : "Verificando agenda"}</h2>
              <p>
                {loadError
                  ? "Não crie ou altere reservas até a leitura da capacidade ser concluída."
                  : "As ações serão liberadas após a leitura das reservas e da disponibilidade."}
              </p>
              {loadError && (
                <button className="agenda-plain-action" type="button" onClick={reloadAgenda}>
                  <RefreshCw size={16} />
                  Tentar novamente
                </button>
              )}
            </section>
          )}
          {isAgendaReady && (
            <>
              {isBookingOpen ? (
                <form className="agenda-form" onSubmit={submitBooking}>
                  <div className="agenda-form-heading">
                    <Plus size={18} />
                    <div>
                      <h2>Novo agendamento</h2>
                      <p>A reserva só é criada se o horário estiver livre.</p>
                    </div>
                  </div>
                  <fieldset disabled={isBusy}>
                    <label>
                      Cliente
                      <select
                        value={bookingCustomerId}
                        onChange={(event) =>
                          setBooking((current) => ({ ...current, customerId: event.target.value }))
                        }
                      >
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Serviço
                      <select
                        value={bookingServiceId}
                        onChange={(event) =>
                          setBooking((current) => ({ ...current, serviceId: event.target.value }))
                        }
                      >
                        {services.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name} · {service.duration_minutes} min
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Profissional
                      <select
                        value={bookingProfessionalId}
                        onChange={(event) =>
                          setBooking((current) => ({
                            ...current,
                            professionalId: event.target.value,
                          }))
                        }
                      >
                        {professionals.map((professional) => (
                          <option key={professional.id} value={professional.id}>
                            {professional.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Horário
                      <input
                        type="time"
                        value={booking.time}
                        onChange={(event) =>
                          setBooking((current) => ({ ...current, time: event.target.value }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Observação
                      <input
                        value={booking.notes}
                        onChange={(event) =>
                          setBooking((current) => ({ ...current, notes: event.target.value }))
                        }
                        placeholder="Opcional"
                      />
                    </label>
                    <button className="agenda-submit" type="submit">
                      {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}Criar
                      agendamento
                    </button>
                  </fieldset>
                </form>
              ) : isBlockOpen ? (
                <form className="agenda-form" onSubmit={submitBlock}>
                  <div className="agenda-form-heading">
                    <Ban size={18} />
                    <div>
                      <h2>Bloquear horário</h2>
                      <p>Protege a capacidade contra novos agendamentos.</p>
                    </div>
                  </div>
                  <fieldset disabled={isBusy}>
                    <label>
                      Profissional
                      <select
                        value={blockProfessionalId}
                        onChange={(event) =>
                          setBlockForm((current) => ({
                            ...current,
                            professionalId: event.target.value,
                          }))
                        }
                      >
                        {professionals.map((professional) => (
                          <option key={professional.id} value={professional.id}>
                            {professional.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="agenda-form-row">
                      <label>
                        Início
                        <input
                          type="time"
                          value={blockForm.startsAt}
                          onChange={(event) =>
                            setBlockForm((current) => ({
                              ...current,
                              startsAt: event.target.value,
                            }))
                          }
                          required
                        />
                      </label>
                      <label>
                        Fim
                        <input
                          type="time"
                          value={blockForm.endsAt}
                          onChange={(event) =>
                            setBlockForm((current) => ({ ...current, endsAt: event.target.value }))
                          }
                          required
                        />
                      </label>
                    </div>
                    <label>
                      Motivo
                      <input
                        value={blockForm.reason}
                        onChange={(event) =>
                          setBlockForm((current) => ({ ...current, reason: event.target.value }))
                        }
                        placeholder="Ex.: almoço, manutenção"
                      />
                    </label>
                    <button className="agenda-submit agenda-submit-block" type="submit">
                      {isSaving ? <Loader2 size={16} className="spin" /> : <Ban size={16} />}
                      Bloquear período
                    </button>
                  </fieldset>
                </form>
              ) : selectedAppointment ? (
                <section className="agenda-selected">
                  <div className="agenda-form-heading">
                    <Clock3 size={18} />
                    <div>
                      <h2>{selectedAppointment.customer_name}</h2>
                      <p>{selectedAppointment.service_name}</p>
                    </div>
                  </div>
                  <div className="agenda-selection-meta">
                    <span
                      className={`agenda-status appointment-${appointmentStatusCopy[selectedAppointment.status].tone}`}
                    >
                      {appointmentStatusCopy[selectedAppointment.status].label}
                    </span>
                    <strong>
                      {shortTime(selectedAppointment.start_at)}–
                      {shortTime(selectedAppointment.end_at)}
                    </strong>
                    <span>{selectedAppointment.professional_name}</span>
                    {selectedAppointment.notes && <p>{selectedAppointment.notes}</p>}
                  </div>
                  {selectedAppointment.status === "scheduled" && (
                    <button
                      className="agenda-plain-action"
                      type="button"
                      onClick={() => void confirmAppointment(selectedAppointment)}
                      disabled={isBusy}
                    >
                      <Check size={16} />
                      Confirmar presença
                    </button>
                  )}
                  {segment.hasFeature("workOrders") &&
                    ["scheduled", "confirmed", "in_progress"].includes(
                      selectedAppointment.status,
                    ) && (
                      <div className="agenda-open-os">
                        {customerVehicles.length > 0 ? (
                          <>
                            <label>
                              Veículo que chegou
                              <select
                                value={vehicleId}
                                onChange={(event) => setVehicleId(event.target.value)}
                                disabled={isBusy}
                              >
                                {customerVehicles.map((vehicle) => (
                                  <option key={vehicle.id} value={vehicle.id}>
                                    {vehicle.license_plate}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => void openWorkOrder(selectedAppointment)}
                              disabled={isBusy}
                            >
                              {isSaving ? (
                                <Loader2 size={15} className="spin" />
                              ) : (
                                <ClipboardList size={15} />
                              )}
                              Abrir ordem de serviço
                            </button>
                          </>
                        ) : (
                          <p className="agenda-hint">
                            Este cliente ainda não tem veículo cadastrado. Use a entrada rápida no
                            Pátio para receber o carro e cadastrar a placa.
                          </p>
                        )}
                      </div>
                    )}
                  {["scheduled", "confirmed"].includes(selectedAppointment.status) && (
                    <form className="agenda-reschedule" onSubmit={submitReschedule}>
                      <label>
                        Novo horário
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={(event) => setRescheduleTime(event.target.value)}
                          disabled={isBusy}
                          required
                        />
                      </label>
                      <button type="submit" disabled={isBusy}>
                        {isSaving ? <Loader2 size={15} className="spin" /> : <Clock3 size={15} />}
                        Remarcar
                      </button>
                    </form>
                  )}
                </section>
              ) : selectedBlock ? (
                <section className="agenda-selected">
                  <div className="agenda-form-heading">
                    <Ban size={18} />
                    <div>
                      <h2>Horário bloqueado</h2>
                      <p>
                        {blockNotes[selectedBlock.id] ??
                          selectedBlock.reason ??
                          "Sem motivo informado"}
                      </p>
                    </div>
                  </div>
                  <div className="agenda-selection-meta">
                    <strong>
                      {shortTime(selectedBlock.start_at)}–{shortTime(selectedBlock.end_at)}
                    </strong>
                    <span>Este período não aceita reservas.</span>
                  </div>
                  <button
                    className="agenda-delete"
                    type="button"
                    onClick={() => void removeBlock(selectedBlock)}
                    disabled={isBusy}
                  >
                    <Trash2 size={16} />
                    Remover bloqueio
                  </button>
                </section>
              ) : (
                <section className="agenda-side-start">
                  <CalendarClock size={25} />
                  <h2>Planeje com capacidade real</h2>
                  <p>
                    Selecione um horário, um agendamento ou crie uma indisponibilidade para manter o
                    Pátio previsível.
                  </p>
                  <button
                    className="agenda-plain-action"
                    type="button"
                    onClick={() => {
                      setIsBlockOpen(true);
                      setIsBookingOpen(false);
                    }}
                    disabled={!professionals.length || isBusy}
                  >
                    <Ban size={16} />
                    Bloquear horário
                  </button>
                </section>
              )}

              <section className="availability-section">
                <div className="availability-heading">
                  <div>
                    <h2>Disponibilidade recorrente</h2>
                    <p>
                      Vale para {displayScheduleDate(selectedDate).split(",")[0].toLowerCase()}.
                    </p>
                  </div>
                </div>
                <label className="availability-professional">
                  Profissional
                  <select
                    value={selectedAvailabilityProfessionalId}
                    onChange={(event) => setAvailabilityProfessionalId(event.target.value)}
                    disabled={isBusy || !canChooseAvailabilityProfessional}
                  >
                    {professionals.map((professional) => (
                      <option key={professional.id} value={professional.id}>
                        {professional.name}
                      </option>
                    ))}
                  </select>
                </label>
                {availabilityAccess === "self" && (
                  <p className="availability-access">
                    Você pode ajustar apenas a sua própria disponibilidade.
                  </p>
                )}
                {availabilityAccess === "none" && (
                  <p className="availability-access">
                    Seu perfil pode consultar a disponibilidade, mas não alterá-la.
                  </p>
                )}
                <div className="availability-rules">
                  {availabilityRules.map((rule) => (
                    <div key={rule.id}>
                      <span>
                        {timePart(rule.starts_at)}–{timePart(rule.ends_at)}
                      </span>
                      {canManageAvailability && (
                        <button
                          type="button"
                          onClick={() => void removeAvailability(rule)}
                          disabled={isBusy}
                          aria-label={`Remover ${timePart(rule.starts_at)} a ${timePart(rule.ends_at)}`}
                        >
                          <Minus size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  {!availabilityRules.length && <p>Sem faixa cadastrada neste dia.</p>}
                </div>
                {canManageAvailability && (
                  <form className="availability-form" onSubmit={submitAvailability}>
                    <fieldset disabled={isBusy}>
                      <div>
                        <label>
                          Início
                          <input
                            type="time"
                            value={availabilityForm.startsAt}
                            onChange={(event) =>
                              setAvailabilityForm((current) => ({
                                ...current,
                                startsAt: event.target.value,
                              }))
                            }
                            required
                          />
                        </label>
                        <label>
                          Fim
                          <input
                            type="time"
                            value={availabilityForm.endsAt}
                            onChange={(event) =>
                              setAvailabilityForm((current) => ({
                                ...current,
                                endsAt: event.target.value,
                              }))
                            }
                            required
                          />
                        </label>
                      </div>
                      <button type="submit">
                        <Plus size={15} />
                        Adicionar horário
                      </button>
                    </fieldset>
                  </form>
                )}
              </section>
            </>
          )}
        </aside>
      </div>
      {isLoading && (
        <div className="agenda-loading" role="status">
          <Loader2 size={18} className="spin" />
          Atualizando agenda e disponibilidade...
        </div>
      )}
    </section>
  );
}
