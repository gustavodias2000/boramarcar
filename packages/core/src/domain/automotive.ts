/**
 * Domínio da operação automotiva.
 *
 * Tipos e regras puras, sem apresentação. Servem ao site e ao aplicativo — o técnico
 * que fotografa a OS pelo celular usa exatamente estes tipos.
 *
 * O que NÃO vem para cá: rótulo, tom de cor e ícone. `patioStatusCopy` mistura o
 * próximo estado (domínio) com label e tom (apresentação), então fica na web até ser
 * dividido. `AutomotiveDataMode` também fica: prévia, vivo, vazio e sem configuração
 * são estados de interface, não do negócio.
 */

export const PATIO_STATUSES = [
  "awaiting_service",
  "in_service",
  "service_completed",
  "awaiting_pickup",
] as const;

export type PatioStatus = (typeof PATIO_STATUSES)[number];

/**
 * Espelha a view `automotive_patio`.
 *
 * `unbilled` foi acrescentado na Etapa 2: uma OS sem nenhum item lançado não é uma OS
 * quitada. É diferente de ter itens somando zero, que continua sendo `paid`.
 */
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
  payment_status: "unbilled" | "unpaid" | "partial" | "paid";
}

export type WorkOrderItemKind = "service" | "product";
export type AutomotivePaymentKind = "payment" | "refund";
export type AutomotivePaymentMethod =
  | "cash"
  | "pix"
  | "credit_card"
  | "debit_card"
  | "bank_transfer"
  | "other";
export type AutomotiveMediaStage = "intake" | "execution" | "delivery";

export interface WorkOrderItem {
  id: string;
  tenant_id: string;
  work_order_id: string;
  kind: WorkOrderItemKind;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
  created_at: string;
}

export interface WorkOrderPayment {
  id: string;
  tenant_id: string;
  work_order_id: string;
  kind: AutomotivePaymentKind;
  method: AutomotivePaymentMethod;
  amount: number | string;
  paid_at: string;
  notes: string | null;
  created_at: string;
}

export interface WorkOrderMedia {
  id: string;
  tenant_id: string;
  work_order_id: string;
  stage: AutomotiveMediaStage;
  storage_path: string;
  caption: string | null;
  created_at: string;
  signed_url?: string;
}

/**
 * Normalização de placa — a mesma regra da coluna gerada
 * `automotive_vehicles.normalized_license_plate`. Manter as duas em acordo é o que
 * permite consultar por placa digitada de qualquer jeito.
 */
export function normalizeLicensePlate(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function displayLicensePlate(value: string) {
  const normalized = normalizeLicensePlate(value);

  return normalized.length === 7
    ? `${normalized.slice(0, 3)}-${normalized.slice(3)}`
    : normalized;
}

/**
 * A view devolve `numeric` como string. Converter na borda evita que cada tela
 * lembre de fazer `Number(...)` antes de somar.
 */
export function normalizePatioOrder(order: PatioOrder): PatioOrder {
  return {
    ...order,
    total_amount: Number(order.total_amount),
    paid_amount: Number(order.paid_amount),
    outstanding_amount: Number(order.outstanding_amount),
  };
}
