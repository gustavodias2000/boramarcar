"use client";

import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  CarFront,
  CircleAlert,
  Gift,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UserRound,
} from "lucide-react";
import {
  FormEvent,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AutomotiveDataMode, formatCurrency, formatDateTime } from "@/lib/automotive";
import { createClient } from "@/lib/supabase/client";
import { can, type BusinessRole } from "@boramarca/core";
type WorkOrderStatus =
  | "awaiting_service"
  | "in_service"
  | "service_completed"
  | "awaiting_pickup"
  | "delivered"
  | "cancelled";
type InsightState = "loading" | "ready" | "error";
type Checklist = Record<string, boolean | number | string | null>;
type Vehicle = {
  id: string;
  customer_id: string;
  license_plate: string;
  make: string | null;
  model: string | null;
  color: string | null;
  year_model: number | null;
  notes: string | null;
};
type Customer = { id: string; name: string };
type WorkOrder = {
  id: string;
  number: number;
  vehicle_id: string;
  customer_id: string;
  status: WorkOrderStatus;
  created_at: string;
  notes: string | null;
};
type Intake = {
  work_order_id: string;
  received_at: string;
  odometer: number | null;
  fuel_level: number | null;
  condition_notes: string | null;
  received_items: string | null;
  checklist: Checklist;
};
type Delivery = {
  work_order_id: string;
  delivered_at: string;
  received_by_name: string | null;
  notes: string | null;
  checklist: Checklist;
};
type Item = { work_order_id: string; description: string; line_total: number | string };
type Payment = {
  work_order_id: string;
  kind: "payment" | "refund";
  amount: number | string;
  paid_at: string;
};
type LoyaltyProgram = {
  active: boolean;
  points_per_delivered_order: number;
  reward_target_points: number;
  reward_description: string | null;
};
type LoyaltyEntry = {
  id: string;
  customer_id: string;
  work_order_id: string | null;
  kind: "earned" | "redeemed" | "adjustment";
  points: number;
  note: string | null;
  created_at: string;
};
type ProgramForm = { active: boolean; points: string; target: string; reward: string };
type PageResult<T> = { data: T[] | null; error: { message: string } | null };

const demoVehicles: Vehicle[] = [
  {
    id: "demo-vehicle-1",
    customer_id: "demo-customer-1",
    license_plate: "RUE-4K29",
    make: "Jeep",
    model: "Compass",
    color: "Cinza",
    year_model: 2023,
    notes: "Preferência por acabamento fosco.",
  },
  {
    id: "demo-vehicle-2",
    customer_id: "demo-customer-2",
    license_plate: "FAN-7A41",
    make: "Toyota",
    model: "Corolla Cross",
    color: "Preto",
    year_model: 2022,
    notes: null,
  },
  {
    id: "demo-vehicle-3",
    customer_id: "demo-customer-3",
    license_plate: "SMK-2D84",
    make: "BMW",
    model: "320i",
    color: "Branco",
    year_model: 2021,
    notes: "Verificar película da porta dianteira.",
  },
];
const demoCustomers: Customer[] = [
  { id: "demo-customer-1", name: "Mariana Nunes" },
  { id: "demo-customer-2", name: "Gustavo Lima" },
  { id: "demo-customer-3", name: "Juliana Prado" },
];
const demoOrders: WorkOrder[] = [
  {
    id: "demo-history-1",
    number: 301,
    vehicle_id: "demo-vehicle-1",
    customer_id: "demo-customer-1",
    status: "delivered",
    created_at: "2026-07-19T11:00:00.000Z",
    notes: "Lavagem técnica e proteção de pintura.",
  },
  {
    id: "demo-history-2",
    number: 286,
    vehicle_id: "demo-vehicle-1",
    customer_id: "demo-customer-1",
    status: "delivered",
    created_at: "2026-05-04T09:30:00.000Z",
    notes: "Higienização interna.",
  },
  {
    id: "demo-history-3",
    number: 274,
    vehicle_id: "demo-vehicle-2",
    customer_id: "demo-customer-2",
    status: "delivered",
    created_at: "2026-04-12T13:10:00.000Z",
    notes: "Vitrificação.",
  },
  {
    id: "demo-history-4",
    number: 315,
    vehicle_id: "demo-vehicle-3",
    customer_id: "demo-customer-3",
    status: "service_completed",
    created_at: "2026-08-24T09:10:00.000Z",
    notes: "Polimento comercial.",
  },
];
const demoIntakes: Intake[] = [
  {
    work_order_id: "demo-history-1",
    received_at: "2026-07-19T09:00:00.000Z",
    odometer: 34820,
    fuel_level: 48,
    condition_notes: "Pequena marca no para-choque traseiro, já apontada na entrada.",
    received_items: "Chave reserva e tapete do motorista.",
    checklist: { estepe: true, macaco: true },
  },
  {
    work_order_id: "demo-history-2",
    received_at: "2026-05-04T08:30:00.000Z",
    odometer: 32602,
    fuel_level: 35,
    condition_notes: "Poeira leve no painel e bancos.",
    received_items: "Chave principal.",
    checklist: { manual: true },
  },
  {
    work_order_id: "demo-history-3",
    received_at: "2026-04-12T10:00:00.000Z",
    odometer: 51400,
    fuel_level: 61,
    condition_notes: "Sem avarias aparentes na vistoria inicial.",
    received_items: "Chave principal e controle do alarme.",
    checklist: { estepe: true, triangulo: true },
  },
  {
    work_order_id: "demo-history-4",
    received_at: "2026-08-24T08:50:00.000Z",
    odometer: 28117,
    fuel_level: 42,
    condition_notes: "Risco superficial na porta dianteira direita.",
    received_items: "Chave principal.",
    checklist: { manual: true },
  },
];
const demoDeliveries: Delivery[] = [
  {
    work_order_id: "demo-history-1",
    delivered_at: "2026-07-19T16:40:00.000Z",
    received_by_name: "Mariana Nunes",
    notes: "Cliente conferiu o acabamento e retirou o veículo.",
    checklist: { porta_malas: true, painel: true },
  },
  {
    work_order_id: "demo-history-2",
    delivered_at: "2026-05-04T13:15:00.000Z",
    received_by_name: "Mariana Nunes",
    notes: "Entrega confirmada sem observações.",
    checklist: { bancos: true },
  },
  {
    work_order_id: "demo-history-3",
    delivered_at: "2026-04-12T18:10:00.000Z",
    received_by_name: "Gustavo Lima",
    notes: "Orientado sobre a cura da vitrificação.",
    checklist: { pintura: true },
  },
];
const demoItems: Item[] = [
  { work_order_id: "demo-history-1", description: "Lavagem técnica", line_total: 220 },
  { work_order_id: "demo-history-1", description: "Proteção de pintura", line_total: 180 },
  { work_order_id: "demo-history-2", description: "Higienização interna", line_total: 260 },
  { work_order_id: "demo-history-3", description: "Vitrificação", line_total: 1250 },
  { work_order_id: "demo-history-4", description: "Polimento comercial", line_total: 690 },
];
const demoPayments: Payment[] = [
  {
    work_order_id: "demo-history-1",
    kind: "payment",
    amount: 400,
    paid_at: "2026-07-19T16:20:00.000Z",
  },
  {
    work_order_id: "demo-history-2",
    kind: "payment",
    amount: 260,
    paid_at: "2026-05-04T13:00:00.000Z",
  },
  {
    work_order_id: "demo-history-3",
    kind: "payment",
    amount: 1250,
    paid_at: "2026-04-12T17:55:00.000Z",
  },
];
const demoEntries: LoyaltyEntry[] = [
  {
    id: "demo-loyalty-1",
    customer_id: "demo-customer-1",
    work_order_id: "demo-history-2",
    kind: "earned",
    points: 1,
    note: "Crédito por OS entregue",
    created_at: "2026-05-04T13:15:00.000Z",
  },
  {
    id: "demo-loyalty-2",
    customer_id: "demo-customer-1",
    work_order_id: "demo-history-1",
    kind: "earned",
    points: 1,
    note: "Crédito por OS entregue",
    created_at: "2026-07-19T16:40:00.000Z",
  },
  {
    id: "demo-loyalty-3",
    customer_id: "demo-customer-2",
    work_order_id: "demo-history-3",
    kind: "earned",
    points: 1,
    note: "Crédito por OS entregue",
    created_at: "2026-04-12T18:10:00.000Z",
  },
];
const demoProgram: LoyaltyProgram = {
  active: true,
  points_per_delivered_order: 1,
  reward_target_points: 5,
  reward_description: "Higienização interna gratuita",
};
const statusCopy: Record<WorkOrderStatus, { label: string; tone: string }> = {
  awaiting_service: { label: "Aguardando serviço", tone: "sand" },
  in_service: { label: "Em serviço", tone: "blue" },
  service_completed: { label: "Serviço concluído", tone: "violet" },
  awaiting_pickup: { label: "Aguardando retirada", tone: "green" },
  delivered: { label: "Entregue", tone: "green" },
  cancelled: { label: "Cancelada", tone: "muted" },
};

function numberValue(value: number | string) {
  return Number(value) || 0;
}
function minutesBetween(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}
function formatDuration(minutes: number) {
  if (!minutes) return "Sem tempo fechado";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? hours + "h" + (rest ? " " + rest + "min" : "") : rest + " min";
}
function checklistSummary(checklist: Checklist | null | undefined) {
  return Object.entries(checklist ?? {})
    .filter(([, value]) => value === true)
    .map(([key]) => key.replaceAll("_", " "))
    .join(", ");
}
async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
) {
  const pageSize = 1000;
  const records: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await loadPage(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    const page = result.data ?? [];
    records.push(...page);
    if (page.length < pageSize) return { data: records, error: null };
  }
}

interface AutomotiveInsightsProps {
  view: "vehicles" | "reports";
  mode: AutomotiveDataMode;
  tenantId: string | null;
  membershipRole: BusinessRole | null;
  onOpenPatio: () => void;
}

export function AutomotiveInsights({
  view,
  mode,
  tenantId,
  membershipRole,
  onOpenPatio,
}: AutomotiveInsightsProps) {
  const isConnected = Boolean(tenantId && mode !== "demonstration" && mode !== "unconfigured");
  const isDemo = !isConnected;
  const canConfigureProgram = isDemo || can(membershipRole, "configureLoyalty");
  const canRedeemReward = isDemo || can(membershipRole, "manageWorkOrders");
  const [state, setState] = useState<InsightState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>(demoVehicles);
  const [customers, setCustomers] = useState<Customer[]>(demoCustomers);
  const [orders, setOrders] = useState<WorkOrder[]>(demoOrders);
  const [intakes, setIntakes] = useState<Intake[]>(demoIntakes);
  const [deliveries, setDeliveries] = useState<Delivery[]>(demoDeliveries);
  const [items, setItems] = useState<Item[]>(demoItems);
  const [payments, setPayments] = useState<Payment[]>(demoPayments);
  const [program, setProgram] = useState<LoyaltyProgram | null>(demoProgram);
  const [entries, setEntries] = useState<LoyaltyEntry[]>(demoEntries);
  const [selectedVehicleId, setSelectedVehicleId] = useState(demoVehicles[0].id);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProgramEditing, setIsProgramEditing] = useState(false);
  const [programForm, setProgramForm] = useState<ProgramForm>({
    active: true,
    points: "1",
    target: "5",
    reward: "Higienização interna gratuita",
  });
  const redemptionRequestKey = useRef<string | null>(null);

  const loadInsights = useCallback(async () => {
    setState("loading");
    setError(null);
    setNotice(null);
    if (!isConnected || !tenantId) {
      setVehicles(demoVehicles);
      setCustomers(demoCustomers);
      setOrders(demoOrders);
      setIntakes(demoIntakes);
      setDeliveries(demoDeliveries);
      setItems(demoItems);
      setPayments(demoPayments);
      setProgram(demoProgram);
      setEntries(demoEntries);
      setSelectedVehicleId((current) =>
        current.startsWith("demo-") ? current : demoVehicles[0].id,
      );
      setState("ready");
      return;
    }
    const supabase = createClient();
    const [
      vehiclesResult,
      customersResult,
      ordersResult,
      intakesResult,
      deliveriesResult,
      itemsResult,
      paymentsResult,
      programResult,
      entriesResult,
    ] = await Promise.all([
      fetchAllPages((from, to) =>
        supabase
          .from("automotive_vehicles")
          .select("id, customer_id, license_plate, make, model, color, year_model, notes")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("updated_at", { ascending: false })
          .range(from, to),
      ),
      fetchAllPages((from, to) =>
        supabase
          .from("customers")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("name")
          .range(from, to),
      ),
      fetchAllPages((from, to) =>
        supabase
          .from("automotive_work_orders")
          .select("id, number, vehicle_id, customer_id, status, created_at, notes")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      fetchAllPages((from, to) =>
        supabase
          .from("automotive_work_order_intakes")
          .select(
            "work_order_id, received_at, odometer, fuel_level, condition_notes, received_items, checklist",
          )
          .eq("tenant_id", tenantId)
          .order("received_at", { ascending: false })
          .range(from, to),
      ),
      fetchAllPages((from, to) =>
        supabase
          .from("automotive_work_order_deliveries")
          .select("work_order_id, delivered_at, received_by_name, notes, checklist")
          .eq("tenant_id", tenantId)
          .order("delivered_at", { ascending: false })
          .range(from, to),
      ),
      fetchAllPages((from, to) =>
        supabase
          .from("automotive_work_order_items")
          .select("work_order_id, description, line_total")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      fetchAllPages((from, to) =>
        supabase
          .from("automotive_work_order_payments")
          .select("work_order_id, kind, amount, paid_at")
          .eq("tenant_id", tenantId)
          .order("paid_at", { ascending: false })
          .range(from, to),
      ),
      supabase
        .from("automotive_loyalty_programs")
        .select("active, points_per_delivered_order, reward_target_points, reward_description")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      fetchAllPages((from, to) =>
        supabase
          .from("automotive_loyalty_entries")
          .select("id, customer_id, work_order_id, kind, points, note, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
    ]);
    const failed = [
      vehiclesResult,
      customersResult,
      ordersResult,
      intakesResult,
      deliveriesResult,
      itemsResult,
      paymentsResult,
      programResult,
      entriesResult,
    ].find((result) => result.error);
    if (failed?.error) {
      setState("error");
      setError("Não foi possível carregar o histórico: " + failed.error.message);
      return;
    }
    const liveVehicles = (vehiclesResult.data ?? []) as Vehicle[];
    setVehicles(liveVehicles);
    setCustomers((customersResult.data ?? []) as Customer[]);
    setOrders((ordersResult.data ?? []) as WorkOrder[]);
    setIntakes((intakesResult.data ?? []) as Intake[]);
    setDeliveries((deliveriesResult.data ?? []) as Delivery[]);
    setItems((itemsResult.data ?? []) as Item[]);
    setPayments((paymentsResult.data ?? []) as Payment[]);
    setProgram((programResult.data ?? null) as LoyaltyProgram | null);
    setEntries(
      ((entriesResult.data ?? []) as LoyaltyEntry[]).map((entry) => ({
        ...entry,
        points: Number(entry.points),
      })),
    );
    setSelectedVehicleId((current) =>
      liveVehicles.some((vehicle) => vehicle.id === current)
        ? current
        : (liveVehicles[0]?.id ?? ""),
    );
    setState("ready");
  }, [isConnected, tenantId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInsights();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInsights]);

  const customersById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const intakeByOrderId = useMemo(
    () => new Map(intakes.map((intake) => [intake.work_order_id, intake])),
    [intakes],
  );
  const deliveryByOrderId = useMemo(
    () => new Map(deliveries.map((delivery) => [delivery.work_order_id, delivery])),
    [deliveries],
  );
  const visibleVehicles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return normalized
      ? vehicles.filter((vehicle) =>
          [
            vehicle.license_plate,
            vehicle.make,
            vehicle.model,
            customersById.get(vehicle.customer_id)?.name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(normalized),
        )
      : vehicles;
  }, [customersById, query, vehicles]);
  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? visibleVehicles[0] ?? null;
  const selectedCustomer = selectedVehicle
    ? (customersById.get(selectedVehicle.customer_id) ?? null)
    : null;
  const vehicleOrders = useMemo(
    () =>
      selectedVehicle ? orders.filter((order) => order.vehicle_id === selectedVehicle.id) : [],
    [orders, selectedVehicle],
  );
  const selectedBalance = useMemo(
    () =>
      selectedCustomer
        ? entries
            .filter((entry) => entry.customer_id === selectedCustomer.id)
            .reduce((total, entry) => total + numberValue(entry.points), 0)
        : 0,
    [entries, selectedCustomer],
  );
  const deliveredOrders = useMemo(
    () => orders.filter((order) => deliveryByOrderId.has(order.id)),
    [deliveryByOrderId, orders],
  );
  const deliveredOrderIds = useMemo(
    () => new Set(deliveredOrders.map((order) => order.id)),
    [deliveredOrders],
  );
  const receivedTotal = useMemo(
    () =>
      payments.reduce(
        (total, payment) =>
          total +
          (payment.kind === "refund" ? -numberValue(payment.amount) : numberValue(payment.amount)),
        0,
      ),
    [payments],
  );
  const deliveredReceivedTotal = useMemo(
    () =>
      payments
        .filter((payment) => deliveredOrderIds.has(payment.work_order_id))
        .reduce(
          (total, payment) =>
            total +
            (payment.kind === "refund"
              ? -numberValue(payment.amount)
              : numberValue(payment.amount)),
          0,
        ),
    [deliveredOrderIds, payments],
  );
  const averageTicket = deliveredOrders.length
    ? deliveredReceivedTotal / deliveredOrders.length
    : 0;
  const recurringCustomers = useMemo(
    () =>
      new Set(
        orders
          .filter(
            (order) =>
              orders.filter((candidate) => candidate.customer_id === order.customer_id).length > 1,
          )
          .map((order) => order.customer_id),
      ).size,
    [orders],
  );
  const averageTurnaround = useMemo(() => {
    const durations = deliveredOrders
      .map((order) => {
        const intake = intakeByOrderId.get(order.id);
        const delivery = deliveryByOrderId.get(order.id);
        return intake && delivery
          ? minutesBetween(intake.received_at, delivery.delivered_at)
          : null;
      })
      .filter((duration): duration is number => duration !== null);
    return durations.length
      ? Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length)
      : 0;
  }, [deliveredOrders, deliveryByOrderId, intakeByOrderId]);
  const deliveredFinancialRows = useMemo(
    () =>
      deliveredOrders.map((order) => ({
        order,
        customer: customersById.get(order.customer_id),
        delivery: deliveryByOrderId.get(order.id),
        serviceValue: items
          .filter((item) => item.work_order_id === order.id)
          .reduce((total, item) => total + numberValue(item.line_total), 0),
        received: payments
          .filter((payment) => payment.work_order_id === order.id)
          .reduce(
            (total, payment) =>
              total +
              (payment.kind === "refund"
                ? -numberValue(payment.amount)
                : numberValue(payment.amount)),
            0,
          ),
      })),
    [customersById, deliveredOrders, deliveryByOrderId, items, payments],
  );
  const selectedRewardCount = program?.active
    ? Math.floor(selectedBalance / program.reward_target_points)
    : 0;
  useEffect(() => {
    redemptionRequestKey.current = null;
  }, [selectedCustomer?.id]);

  function beginProgramEdit() {
    setProgramForm({
      active: program?.active ?? true,
      points: String(program?.points_per_delivered_order ?? 1),
      target: String(program?.reward_target_points ?? 5),
      reward: program?.reward_description ?? "",
    });
    setNotice(null);
    setIsProgramEditing(true);
  }
  async function submitProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConfigureProgram || isSaving) return;
    const points = Number(programForm.points);
    const target = Number(programForm.target);
    const reward = programForm.reward.trim();
    if (
      !Number.isInteger(points) ||
      points < 1 ||
      !Number.isInteger(target) ||
      target < 1 ||
      (programForm.active && reward.length < 3)
    ) {
      setNotice(
        "Informe pontos inteiros positivos e uma recompensa com pelo menos 3 caracteres para ativar o programa.",
      );
      return;
    }
    setIsSaving(true);
    if (isDemo) {
      setProgram({
        active: programForm.active,
        points_per_delivered_order: points,
        reward_target_points: target,
        reward_description: reward || null,
      });
      setNotice("Regra de fidelidade atualizada somente na prévia.");
      setIsProgramEditing(false);
      setIsSaving(false);
      return;
    }
    const { data, error: rpcError } = await createClient().rpc("save_automotive_loyalty_program", {
      p_tenant_id: tenantId,
      p_active: programForm.active,
      p_points_per_delivered_order: points,
      p_reward_target_points: target,
      p_reward_description: reward || null,
    });
    setIsSaving(false);
    if (rpcError) {
      setNotice("Não foi possível salvar a regra: " + rpcError.message);
      return;
    }
    setProgram(data as LoyaltyProgram);
    setNotice(
      "Programa de fidelidade salvo. Pontos passam a ser concedidos nas próximas entregas.",
    );
    setIsProgramEditing(false);
  }
  async function redeemReward() {
    if (
      !selectedCustomer ||
      !program?.active ||
      selectedBalance < program.reward_target_points ||
      !canRedeemReward ||
      isSaving
    )
      return;
    setIsSaving(true);
    if (isDemo) {
      setEntries((current) => [
        {
          id: "demo-redemption-" + Date.now(),
          customer_id: selectedCustomer.id,
          work_order_id: null,
          kind: "redeemed",
          points: -program.reward_target_points,
          note: program.reward_description,
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      redemptionRequestKey.current = null;
      setNotice("Recompensa registrada somente na prévia.");
      setIsSaving(false);
      return;
    }
    const requestKey = redemptionRequestKey.current ?? crypto.randomUUID();
    redemptionRequestKey.current = requestKey;
    const { data, error: rpcError } = await createClient().rpc("redeem_automotive_loyalty_reward", {
      p_tenant_id: tenantId,
      p_customer_id: selectedCustomer.id,
      p_redemption_key: requestKey,
      p_note: program.reward_description,
    });
    setIsSaving(false);
    if (rpcError) {
      setNotice("Não foi possível registrar a recompensa: " + rpcError.message);
      return;
    }
    redemptionRequestKey.current = null;
    setEntries((current) =>
      current.some((entry) => entry.id === (data as LoyaltyEntry).id)
        ? current
        : [data as LoyaltyEntry, ...current],
    );
    setNotice("Recompensa registrada no histórico do cliente.");
  }

  if (state === "loading")
    return (
      <section className="insights-state" aria-live="polite">
        <Loader2 className="spin" size={24} />
        <h1>Montando o histórico</h1>
        <p>Estamos reunindo veículos, OS entregues, recebimentos e fidelidade.</p>
      </section>
    );
  if (state === "error")
    return (
      <section className="insights-state">
        <CircleAlert size={25} />
        <h1>Histórico indisponível</h1>
        <p>{error}</p>
        <button type="button" className="insights-secondary" onClick={() => void loadInsights()}>
          <RefreshCw size={16} />
          Tentar novamente
        </button>
      </section>
    );

  const heading = (
    <header className="insights-heading">
      <div>
        <h1>{view === "reports" ? "Leitura da operação" : "Histórico do veículo"}</h1>
        <p>
          {view === "reports"
            ? "Relatório formado somente pelos registros já gravados nesta unidade."
            : "Uma leitura única de OS, condição recebida, retorno e fidelidade."}
        </p>
      </div>
      <div className="insights-heading-actions">
        <span className={"mode-badge mode-" + (isDemo ? "demonstration" : "live")}>
          <span />
          {isDemo ? "Prévia demonstrativa" : "Dados ao vivo"}
        </span>
        <button type="button" className="insights-secondary" onClick={onOpenPatio}>
          <ArrowLeft size={16} />
          Voltar ao Pátio
        </button>
      </div>
    </header>
  );
  const noticeBanner = notice && (
    <div className="insights-notice" role="status">
      <BadgeCheck size={16} />
      <span>{notice}</span>
    </div>
  );

  if (view === "reports") {
    const statusRows = (Object.keys(statusCopy) as WorkOrderStatus[])
      .map((status) => ({
        status,
        count: orders.filter((order) => order.status === status).length,
      }))
      .filter((row) => row.count);
    return (
      <section className="insights-workspace">
        {heading}
        {noticeBanner}
        <section className="report-reading" aria-label="Leitura da operação">
          <div>
            <span>Recebido registrado</span>
            <strong>{formatCurrency(receivedTotal)}</strong>
            <small>Pagamentos menos estornos</small>
          </div>
          <div>
            <span>OS entregues</span>
            <strong>{deliveredOrders.length}</strong>
            <small>Com devolução registrada</small>
          </div>
          <div>
            <span>Ticket por entrega</span>
            <strong>{formatCurrency(averageTicket)}</strong>
            <small>Recebido só nas OS entregues</small>
          </div>
          <div>
            <span>Tempo médio</span>
            <strong>{formatDuration(averageTurnaround)}</strong>
            <small>Entrada até entrega</small>
          </div>
        </section>
        <section className="report-transaction-ledger">
          <div className="insights-section-heading">
            <BarChart3 size={18} />
            <div>
              <h2>Livro de entregas</h2>
              <p>Cada linha aponta para uma OS com entrega registrada.</p>
            </div>
          </div>
          <div className="report-transaction-table" role="table" aria-label="Livro de entregas">
            <div className="report-transaction-row report-transaction-header" role="row">
              <span role="columnheader">OS / cliente</span>
              <span role="columnheader">Entregue em</span>
              <span role="columnheader">Valor de serviço</span>
              <span role="columnheader">Recebido</span>
            </div>
            {deliveredFinancialRows.map(({ order, customer, delivery, received, serviceValue }) => (
              <div className="report-transaction-row" role="row" key={order.id}>
                <span role="cell">
                  <strong>OS {String(order.number).padStart(3, "0")}</strong>
                  <small>{customer?.name ?? "Cliente sem nome"}</small>
                </span>
                <span role="cell">
                  {delivery ? formatDateTime(delivery.delivered_at) : "Sem entrega"}
                </span>
                <span role="cell">{formatCurrency(serviceValue)}</span>
                <strong role="cell">{formatCurrency(received)}</strong>
              </div>
            ))}
            {!deliveredFinancialRows.length && (
              <p className="history-empty">Nenhuma OS entregue para este recorte.</p>
            )}
          </div>
        </section>
        <div className="reports-ledgers">
          <section className="report-ledger">
            <div className="insights-section-heading">
              <BarChart3 size={18} />
              <div>
                <h2>Fluxo de ordens</h2>
                <p>Estado atual de todas as OS registradas.</p>
              </div>
            </div>
            <div className="report-status-lines">
              {statusRows.map((row) => (
                <div key={row.status}>
                  <span
                    className={"report-status-dot history-status-" + statusCopy[row.status].tone}
                  />
                  <strong>{statusCopy[row.status].label}</strong>
                  <span>{row.count}</span>
                </div>
              ))}
              {!statusRows.length && <p>Nenhuma OS para este recorte.</p>}
            </div>
          </section>
          <section className="report-ledger">
            <div className="insights-section-heading">
              <UserRound size={18} />
              <div>
                <h2>Retorno de clientes</h2>
                <p>Recorrência baseada em mais de uma OS registrada.</p>
              </div>
            </div>
            <div className="report-return-reading">
              <strong>{recurringCustomers}</strong>
              <p>
                {recurringCustomers === 1 ? "cliente já retornou" : "clientes já retornaram"} para
                uma nova OS.
              </p>
              <span>
                O programa de fidelidade não retroage: pontos entram apenas após entregas com a
                regra ativa.
              </span>
            </div>
          </section>
        </div>
        <LoyaltyProgramPanel
          program={program}
          canConfigureProgram={canConfigureProgram}
          isProgramEditing={isProgramEditing}
          isSaving={isSaving}
          form={programForm}
          onBeginEdit={beginProgramEdit}
          onCancel={() => setIsProgramEditing(false)}
          onChange={setProgramForm}
          onSubmit={submitProgram}
        />
      </section>
    );
  }

  if (!selectedVehicle)
    return (
      <section className="insights-state">
        <CarFront size={25} />
        <h1>Sem veículos registrados</h1>
        <p>Abra uma Entrada rápida para criar o primeiro veículo e começar seu histórico.</p>
        <button type="button" className="insights-secondary" onClick={onOpenPatio}>
          <ArrowLeft size={16} />
          Voltar ao Pátio
        </button>
      </section>
    );
  return (
    <section className="insights-workspace">
      {heading}
      {noticeBanner}
      <div className="vehicle-history-layout">
        <aside className="vehicle-index">
          <label className="vehicle-search">
            <Search size={16} />
            <span className="sr-only">Buscar por placa ou cliente</span>
            <input
              aria-label="Buscar por placa ou cliente"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Placa ou cliente"
            />
          </label>
          <div className="vehicle-index-list">
            {visibleVehicles.map((vehicle) => {
              const customer = customersById.get(vehicle.customer_id);
              const selected = vehicle.id === selectedVehicle.id;
              return (
                <button
                  type="button"
                  className={
                    selected ? "vehicle-index-item vehicle-index-selected" : "vehicle-index-item"
                  }
                  key={vehicle.id}
                  onClick={() => setSelectedVehicleId(vehicle.id)}
                >
                  <strong>{vehicle.license_plate}</strong>
                  <span>
                    {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Veículo"}
                  </span>
                  <small>{customer?.name ?? "Cliente sem nome"}</small>
                </button>
              );
            })}
            {!visibleVehicles.length && <p>Nenhum veículo encontrado.</p>}
          </div>
        </aside>
        <section className="vehicle-dossier">
          <div className="vehicle-dossier-heading">
            <div>
              <span>{selectedCustomer?.name ?? "Cliente"}</span>
              <h2>{selectedVehicle.license_plate}</h2>
              <p>
                {[
                  selectedVehicle.make,
                  selectedVehicle.model,
                  selectedVehicle.color,
                  selectedVehicle.year_model,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="vehicle-dossier-count">
              <span>OS registradas</span>
              <strong>{vehicleOrders.length}</strong>
            </div>
          </div>
          {selectedVehicle.notes && <p className="vehicle-note">{selectedVehicle.notes}</p>}
          <section
            className="vehicle-history-list"
            aria-label="Linha do tempo das ordens de serviço"
          >
            {vehicleOrders.map((order) => {
              const intake = intakeByOrderId.get(order.id);
              const delivery = deliveryByOrderId.get(order.id);
              const orderItems = items.filter((item) => item.work_order_id === order.id);
              const total = orderItems.reduce((sum, item) => sum + numberValue(item.line_total), 0);
              const intakeChecklist = checklistSummary(intake?.checklist);
              const deliveryChecklist = checklistSummary(delivery?.checklist);
              return (
                <article className="vehicle-history-row" key={order.id}>
                  <div className="vehicle-history-date">
                    <span>OS {String(order.number).padStart(3, "0")}</span>
                    <strong>
                      {intake
                        ? formatDateTime(intake.received_at)
                        : formatDateTime(order.created_at)}
                    </strong>
                  </div>
                  <div className="vehicle-history-body">
                    <div>
                      <span
                        className={"history-status history-status-" + statusCopy[order.status].tone}
                      >
                        {statusCopy[order.status].label}
                      </span>
                      <strong>
                        {orderItems.map((item) => item.description).join(" · ") ||
                          "Sem itens registrados"}
                      </strong>
                      {order.notes && <p>{order.notes}</p>}
                      {intake && (
                        <dl className="history-observations">
                          {intake.condition_notes && (
                            <div>
                              <dt>Condição na entrada</dt>
                              <dd>{intake.condition_notes}</dd>
                            </div>
                          )}
                          {intake.received_items && (
                            <div>
                              <dt>Itens recebidos</dt>
                              <dd>{intake.received_items}</dd>
                            </div>
                          )}
                          {intakeChecklist && (
                            <div>
                              <dt>Checklist de entrada</dt>
                              <dd>{intakeChecklist}</dd>
                            </div>
                          )}
                          {delivery?.notes && (
                            <div>
                              <dt>Entrega</dt>
                              <dd>{delivery.notes}</dd>
                            </div>
                          )}
                          {deliveryChecklist && (
                            <div>
                              <dt>Checklist de entrega</dt>
                              <dd>{deliveryChecklist}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </div>
                    <div className="vehicle-history-meta">
                      <span>
                        {intake?.odometer
                          ? intake.odometer.toLocaleString("pt-BR") + " km"
                          : "Quilometragem não informada"}
                      </span>
                      {intake?.fuel_level !== null && intake?.fuel_level !== undefined && (
                        <span>Combustível: {intake.fuel_level}%</span>
                      )}
                      <strong>{total ? formatCurrency(total) : "Sem valor"}</strong>
                      <small>
                        {delivery
                          ? "Entregue " +
                            formatDateTime(delivery.delivered_at) +
                            (delivery.received_by_name ? " · " + delivery.received_by_name : "")
                          : "Ainda sem entrega"}
                      </small>
                    </div>
                  </div>
                </article>
              );
            })}
            {!vehicleOrders.length && (
              <p className="history-empty">Nenhuma OS registrada para este veículo.</p>
            )}
          </section>
        </section>
        <aside className="loyalty-dossier">
          <div className="insights-section-heading">
            <Sparkles size={18} />
            <div>
              <h2>Fidelidade</h2>
              <p>Saldo do cliente nesta unidade.</p>
            </div>
          </div>
          {program?.active ? (
            <>
              <div className="loyalty-balance">
                <span>Pontos disponíveis</span>
                <strong>{selectedBalance}</strong>
                <p>
                  {program.points_per_delivered_order} ponto(s) entram por OS entregue a partir da
                  ativação.
                </p>
              </div>
              <div className="loyalty-reward">
                <Gift size={17} />
                <div>
                  <span>Próxima recompensa</span>
                  <strong>{program.reward_description}</strong>
                  <p>
                    {program.reward_target_points} pontos necessários ·{" "}
                    {selectedRewardCount
                      ? selectedRewardCount + " resgate(s) disponível(is)"
                      : Math.max(0, program.reward_target_points - selectedBalance) +
                        " ponto(s) restantes"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="insights-primary"
                onClick={() => void redeemReward()}
                disabled={
                  !canRedeemReward || selectedBalance < program.reward_target_points || isSaving
                }
              >
                {isSaving ? <Loader2 className="spin" size={16} /> : <TicketCheck size={16} />}
                Registrar recompensa
              </button>
              {!canRedeemReward && (
                <p className="loyalty-access">
                  Seu papel pode consultar o saldo, mas a recepção ou gestão registra o resgate.
                </p>
              )}
            </>
          ) : (
            <div className="loyalty-inactive">
              <Gift size={22} />
              <strong>Programa não configurado</strong>
              <p>
                As visitas estão no histórico, mas não geram pontos até o proprietário ou gestor
                ativar uma regra.
              </p>
            </div>
          )}
          <div className="loyalty-entry-list">
            {entries
              .filter((entry) => entry.customer_id === selectedVehicle.customer_id)
              .slice(0, 5)
              .map((entry) => (
                <div key={entry.id}>
                  <span
                    className={
                      entry.points > 0 ? "loyalty-entry-positive" : "loyalty-entry-negative"
                    }
                  >
                    {entry.points > 0 ? "+" : ""}
                    {entry.points} ponto(s)
                  </span>
                  <p>{entry.note ?? "Movimentação de fidelidade"}</p>
                  <small>{formatDateTime(entry.created_at)}</small>
                </div>
              ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

interface LoyaltyProgramPanelProps {
  program: LoyaltyProgram | null;
  canConfigureProgram: boolean;
  isProgramEditing: boolean;
  isSaving: boolean;
  form: ProgramForm;
  onBeginEdit: () => void;
  onCancel: () => void;
  onChange: Dispatch<SetStateAction<ProgramForm>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

function LoyaltyProgramPanel({
  program,
  canConfigureProgram,
  isProgramEditing,
  isSaving,
  form,
  onBeginEdit,
  onCancel,
  onChange,
  onSubmit,
}: LoyaltyProgramPanelProps) {
  return (
    <section className="loyalty-program">
      <div className="insights-section-heading">
        <Gift size={18} />
        <div>
          <h2>Programa de fidelidade</h2>
          <p>
            {program?.active
              ? "A regra está ativa para as próximas entregas."
              : "Sem regra ativa: nenhuma entrega gera pontos."}
          </p>
        </div>
      </div>
      {isProgramEditing ? (
        <form className="loyalty-form" onSubmit={onSubmit}>
          <label className="loyalty-check">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                onChange((current) => ({ ...current, active: event.target.checked }))
              }
            />
            Ativar programa
          </label>
          <div>
            <label>
              Pontos por OS entregue
              <input
                type="number"
                min="1"
                max="1000"
                value={form.points}
                onChange={(event) =>
                  onChange((current) => ({ ...current, points: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Pontos para recompensa
              <input
                type="number"
                min="1"
                max="100000"
                value={form.target}
                onChange={(event) =>
                  onChange((current) => ({ ...current, target: event.target.value }))
                }
                required
              />
            </label>
          </div>
          <label>
            Recompensa
            <input
              value={form.reward}
              onChange={(event) =>
                onChange((current) => ({ ...current, reward: event.target.value }))
              }
              placeholder="Ex.: higienização interna gratuita"
              maxLength={240}
            />
          </label>
          <div className="loyalty-form-actions">
            <button
              type="button"
              className="insights-secondary"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button type="submit" className="insights-primary" disabled={isSaving}>
              {isSaving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}Salvar regra
            </button>
          </div>
        </form>
      ) : (
        <div className="loyalty-program-reading">
          <div>
            <span>Regra</span>
            <strong>
              {program?.active
                ? program.points_per_delivered_order + " ponto(s) por OS entregue"
                : "Programa desativado"}
            </strong>
          </div>
          <div>
            <span>Recompensa</span>
            <strong>
              {program?.active
                ? program.reward_target_points + " pontos · " + program.reward_description
                : "Defina antes de conceder pontos"}
            </strong>
          </div>
          {canConfigureProgram && (
            <button type="button" className="insights-secondary" onClick={onBeginEdit}>
              <ShieldCheck size={16} />
              {program ? "Configurar regra" : "Criar programa"}
            </button>
          )}
          {!canConfigureProgram && (
            <p className="loyalty-access">
              Somente proprietário ou gestor configuram a regra da unidade.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
