/**
 * Ponte entre a interface web e o núcleo compartilhado.
 *
 * Tipos de domínio, normalização de placa e formatação viviam aqui e agora moram em
 * `@boramarca/core`, de onde servem também ao aplicativo (ADR 0005). Este arquivo os
 * reexporta para que os componentes existentes continuem importando de
 * `@/lib/automotive` sem reescrita — migrar os imports é mecânico e pode ser gradual.
 *
 * O que permanece aqui é o que NÃO é do núcleo: cópia de interface (rótulo, tom),
 * estados de tela e as fixtures da prévia demonstrativa.
 */

import type { AutomotiveMediaStage, AutomotivePaymentMethod, PatioStatus } from "@boramarca/core";

export {
  PATIO_STATUSES,
  displayLicensePlate,
  formatCurrency,
  formatDateTime,
  formatTime,
  normalizeLicensePlate,
  normalizePatioOrder,
} from "@boramarca/core";

export type {
  AutomotiveMediaStage,
  AutomotivePaymentKind,
  AutomotivePaymentMethod,
  PatioOrder,
  PatioStatus,
  WorkOrderItem,
  WorkOrderItemKind,
  WorkOrderMedia,
  WorkOrderPayment,
} from "@boramarca/core";

export type AutomotiveDataMode = "demonstration" | "live" | "empty" | "unconfigured";

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

export const paymentMethodCopy: Record<AutomotivePaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Crédito",
  debit_card: "Débito",
  bank_transfer: "Transferência",
  other: "Outro",
};

export const mediaStageCopy: Record<AutomotiveMediaStage, string> = {
  intake: "Entrada",
  execution: "Execução",
  delivery: "Entrega",
};

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
