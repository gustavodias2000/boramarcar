export const PATIO_STATUSES = [
  "awaiting_service",
  "in_service",
  "service_completed",
  "awaiting_pickup",
] as const;

export type PatioStatus = (typeof PATIO_STATUSES)[number];

export type AutomotiveDataMode = "demonstration" | "live" | "empty" | "unconfigured";

export interface PatioOrder {
  id: string;
  tenant_id: string;
  number: number;
  status: PatioStatus;
  created_at: string;
  received_at: string;
  customer_id: string;
  customer_name: string;
  vehicle_id: string;
  license_plate: string;
  normalized_license_plate: string;
  make: string | null;
  model: string | null;
  color: string | null;
  professional_id: string | null;
  professional_name: string | null;
  box_id: string | null;
  box_code: string | null;
  box_name: string | null;
  total_amount: number | string;
  paid_amount: number | string;
  outstanding_amount: number | string;
  payment_status: "paid" | "partial" | "unpaid";
}

export interface QuickEntryDraft {
  licensePlate: string;
  customerName: string;
  customerPhone: string;
  make: string;
  model: string;
  color: string;
  yearModel: string;
  odometer: string;
  fuelLevel: string;
  conditionNotes: string;
  notes: string;
}

export const initialQuickEntryDraft: QuickEntryDraft = {
  licensePlate: "",
  customerName: "",
  customerPhone: "",
  make: "",
  model: "",
  color: "",
  yearModel: "",
  odometer: "",
  fuelLevel: "",
  conditionNotes: "",
  notes: "",
};

export function normalizeLicensePlate(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function displayLicensePlate(value: string) {
  const normalized = normalizeLicensePlate(value);

  return normalized.length === 7
    ? `${normalized.slice(0, 3)}-${normalized.slice(3)}`
    : normalized;
}

export function normalizePatioOrder(order: PatioOrder): PatioOrder {
  return {
    ...order,
    total_amount: Number(order.total_amount),
    paid_amount: Number(order.paid_amount),
    outstanding_amount: Number(order.outstanding_amount),
  };
}

export const patioStatusCopy: Record<
  PatioStatus,
  { label: string; action: string; next?: PatioStatus; tone: string }
> = {
  awaiting_service: {
    label: "Aguardando serviço",
    action: "Iniciar serviço",
    next: "in_service",
    tone: "sand",
  },
  in_service: {
    label: "Em serviço",
    action: "Concluir serviço",
    next: "service_completed",
    tone: "blue",
  },
  service_completed: {
    label: "Serviço concluído",
    action: "Aguardar retirada",
    next: "awaiting_pickup",
    tone: "violet",
  },
  awaiting_pickup: {
    label: "Aguardando retirada",
    action: "Confirmar entrega",
    tone: "green",
  },
};

const day = "2026-08-24T12:00:00.000Z";

export const demonstrationOrders: PatioOrder[] = [
  {
    id: "demo-001",
    tenant_id: "demo-tenant",
    number: 318,
    status: "awaiting_service",
    created_at: day,
    received_at: "2026-08-24T11:20:00.000Z",
    customer_id: "demo-customer-1",
    customer_name: "Mariana Nunes",
    vehicle_id: "demo-vehicle-1",
    license_plate: "RUE-4K29",
    normalized_license_plate: "RUE4K29",
    make: "Jeep",
    model: "Compass",
    color: "Cinza",
    professional_id: "demo-professional-1",
    professional_name: "Caio",
    box_id: "demo-box-1",
    box_code: "B02",
    box_name: "Box 02",
    total_amount: 320,
    paid_amount: 0,
    outstanding_amount: 320,
    payment_status: "unpaid",
  },
  {
    id: "demo-002",
    tenant_id: "demo-tenant",
    number: 317,
    status: "in_service",
    created_at: day,
    received_at: "2026-08-24T10:40:00.000Z",
    customer_id: "demo-customer-2",
    customer_name: "Gustavo Lima",
    vehicle_id: "demo-vehicle-2",
    license_plate: "FAN-7A41",
    normalized_license_plate: "FAN7A41",
    make: "Toyota",
    model: "Corolla Cross",
    color: "Preto",
    professional_id: "demo-professional-2",
    professional_name: "Nina",
    box_id: "demo-box-2",
    box_code: "B01",
    box_name: "Box 01",
    total_amount: 480,
    paid_amount: 240,
    outstanding_amount: 240,
    payment_status: "partial",
  },
  {
    id: "demo-003",
    tenant_id: "demo-tenant",
    number: 315,
    status: "service_completed",
    created_at: day,
    received_at: "2026-08-24T09:10:00.000Z",
    customer_id: "demo-customer-3",
    customer_name: "Juliana Prado",
    vehicle_id: "demo-vehicle-3",
    license_plate: "SMK-2D84",
    normalized_license_plate: "SMK2D84",
    make: "BMW",
    model: "320i",
    color: "Branco",
    professional_id: "demo-professional-3",
    professional_name: "Icaro",
    box_id: "demo-box-3",
    box_code: "B03",
    box_name: "Box 03",
    total_amount: 690,
    paid_amount: 690,
    outstanding_amount: 0,
    payment_status: "paid",
  },
  {
    id: "demo-004",
    tenant_id: "demo-tenant",
    number: 312,
    status: "awaiting_pickup",
    created_at: day,
    received_at: "2026-08-24T08:25:00.000Z",
    customer_id: "demo-customer-4",
    customer_name: "Roberto Alves",
    vehicle_id: "demo-vehicle-4",
    license_plate: "SJU-9L13",
    normalized_license_plate: "SJU9L13",
    make: "Volkswagen",
    model: "T-Cross",
    color: "Azul",
    professional_id: "demo-professional-1",
    professional_name: "Caio",
    box_id: null,
    box_code: null,
    box_name: null,
    total_amount: 210,
    paid_amount: 210,
    outstanding_amount: 0,
    payment_status: "paid",
  },
];

export function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
