/**
 * Acesso a dados do núcleo.
 *
 * A COSTURA: toda função **recebe** o cliente Supabase em vez de criá-lo.
 *
 * Site e aplicativo constroem o cliente de formas incompatíveis — `createBrowserClient`
 * e `createServerClient` de um lado, `createClient` com AsyncStorage do outro. Se este
 * módulo criasse o cliente, ficaria preso a um dos dois. Recebendo, as consultas e as
 * chamadas de RPC são escritas uma vez e servem aos dois (ADR 0005).
 *
 * O formato de retorno é o do próprio Supabase — `{ data, error }` — para que quem
 * adotar não precise reescrever o tratamento de erro.
 *
 * A autorização NÃO está aqui. Está no banco: RLS e as funções transacionais recusam
 * de novo, sempre. O que a camada de permissões da interface faz é não oferecer o que
 * vai ser negado.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AutomotiveMediaStage,
  AutomotivePaymentKind,
  AutomotivePaymentMethod,
  PatioOrder,
  PatioStatus,
  WorkOrderItemKind,
} from "../domain/automotive";
import { normalizePatioOrder } from "../domain/automotive";

export type Db = SupabaseClient;

// ---------------------------------------------------------------------------
// Pátio
// ---------------------------------------------------------------------------

export async function listPatioOrders(db: Db, tenantId: string) {
  const { data, error } = await db
    .from("automotive_patio")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: true });

  if (error) {
    return { data: null, error };
  }

  return {
    data: (data ?? []).map((order) => normalizePatioOrder(order as PatioOrder)),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Ordem de serviço
// ---------------------------------------------------------------------------

export async function listWorkOrderItems(db: Db, workOrderId: string) {
  return db
    .from("automotive_work_order_items")
    .select("*")
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: true });
}

export async function listWorkOrderPayments(db: Db, workOrderId: string) {
  return db
    .from("automotive_work_order_payments")
    .select("*")
    .eq("work_order_id", workOrderId)
    .order("paid_at", { ascending: true });
}

export async function listWorkOrderMedia(db: Db, workOrderId: string) {
  return db
    .from("automotive_work_order_media")
    .select("*")
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: true });
}

export async function addWorkOrderItem(
  db: Db,
  params: {
    workOrderId: string;
    kind: WorkOrderItemKind;
    description: string;
    quantity: number;
    unitPrice: number;
  },
) {
  return db.rpc("add_automotive_work_order_item", {
    p_work_order_id: params.workOrderId,
    p_kind: params.kind,
    p_description: params.description,
    p_quantity: params.quantity,
    p_unit_price: params.unitPrice,
  });
}

export async function removeWorkOrderItem(db: Db, itemId: string) {
  return db.rpc("remove_automotive_work_order_item", { p_item_id: itemId });
}

/**
 * A Etapa 2 passou a validar o recebimento contra o total da OS: pagamento acima do
 * total e estorno acima do que entrou são recusados com `22023` e uma mensagem que
 * traz os valores. Quem chamar deve mostrar essa mensagem, não um erro genérico.
 */
export async function recordWorkOrderPayment(
  db: Db,
  params: {
    workOrderId: string;
    kind: AutomotivePaymentKind;
    method: AutomotivePaymentMethod;
    amount: number;
  },
) {
  return db.rpc("record_automotive_work_order_payment", {
    p_work_order_id: params.workOrderId,
    p_kind: params.kind,
    p_method: params.method,
    p_amount: params.amount,
  });
}

export async function transitionWorkOrder(
  db: Db,
  params: { workOrderId: string; nextStatus: PatioStatus | "delivered" | "cancelled" },
) {
  return db.rpc("transition_automotive_work_order", {
    p_work_order_id: params.workOrderId,
    p_next_status: params.nextStatus,
  });
}

export async function deliverWorkOrder(db: Db, workOrderId: string) {
  return db.rpc("deliver_automotive_work_order", { p_work_order_id: workOrderId });
}

// ---------------------------------------------------------------------------
// Mídia da OS
// ---------------------------------------------------------------------------

/**
 * O objeto precisa existir no Storage ANTES do registro: o cliente sobe o arquivo e
 * só então chama esta função. A Etapa 2 tornou o metadado a autoridade de leitura —
 * sem linha aqui, o objeto fica ilegível mesmo estando no bucket.
 */
export async function registerWorkOrderMedia(
  db: Db,
  params: {
    workOrderId: string;
    stage: AutomotiveMediaStage;
    storagePath: string;
    caption?: string | null;
  },
) {
  return db.rpc("register_automotive_work_order_media", {
    p_work_order_id: params.workOrderId,
    p_stage: params.stage,
    p_storage_path: params.storagePath,
    p_caption: params.caption ?? null,
  });
}

export async function removeWorkOrderMedia(db: Db, mediaId: string) {
  return db.rpc("remove_automotive_work_order_media", { p_media_id: mediaId });
}

// ---------------------------------------------------------------------------
// Entrada sem agendamento
// ---------------------------------------------------------------------------

export async function openWalkInWorkOrder(
  db: Db,
  params: {
    tenantId: string;
    licensePlate: string;
    customerName?: string | null;
    customerPhone?: string | null;
    make?: string | null;
    model?: string | null;
    color?: string | null;
    yearModel?: number | null;
    odometer?: number | null;
    fuelLevel?: number | null;
    conditionNotes?: string | null;
    notes?: string | null;
  },
) {
  return db.rpc("open_automotive_walk_in_work_order", {
    p_tenant_id: params.tenantId,
    p_license_plate: params.licensePlate,
    p_customer_name: params.customerName ?? null,
    p_customer_phone: params.customerPhone ?? null,
    p_make: params.make ?? null,
    p_model: params.model ?? null,
    p_color: params.color ?? null,
    p_year_model: params.yearModel ?? null,
    p_odometer: params.odometer ?? null,
    p_fuel_level: params.fuelLevel ?? null,
    p_condition_notes: params.conditionNotes ?? null,
    p_notes: params.notes ?? null,
  });
}
