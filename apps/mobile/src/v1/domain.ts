import { getSegmentConfig, type BusinessType } from "@boramarca/core";

export interface BusinessContext {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly businessType: BusinessType;
  readonly timezone: string;
  readonly role: string;
  readonly access: "business" | "customer";
}

export interface BookingCatalog {
  readonly business: { id: string; name: string; businessType: BusinessType; timezone: string };
  readonly services: readonly Service[];
  readonly professionals: readonly Professional[];
}

export interface Service {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: number;
  readonly price: number;
}

export interface Professional {
  readonly id: string;
  readonly name: string;
}

export interface AppointmentSummary {
  readonly id: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly status: string;
  readonly customerName?: string;
  readonly serviceName: string;
  readonly professionalName: string;
}

export interface BookingSlot {
  readonly startAt: string;
  readonly endAt: string;
}

export function labelForBusiness(type: BusinessType): string {
  return getSegmentConfig(type).label;
}

export function inviteCodeFromUrl(url: string | null): string | null {
  if (!url) return null;

  const match = url.match(/^boramarca:\/\/convite\/([A-Z0-9]{6,16})\/?$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function startOfBrazilDay(date = new Date()): string {
  const local = new Date(date);
  local.setHours(0, 0, 0, 0);
  return local.toISOString();
}

export function endOfBrazilDay(date = new Date()): string {
  const local = new Date(date);
  local.setHours(23, 59, 59, 999);
  return local.toISOString();
}
