import type { BusinessType } from "@boramarca/core";

import { clearActiveBusiness, readActiveBusiness, saveActiveBusiness, supabase } from "../../supabaseConfig";
import type {
  AppointmentSummary,
  BookingCatalog,
  BookingSlot,
  BusinessContext,
  Professional,
  Service,
} from "./domain";

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" ? (value as RecordValue) : {};
}

function relatedRecord(value: unknown): RecordValue {
  return asRecord(Array.isArray(value) ? value[0] : value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function mapService(value: unknown): Service {
  const row = asRecord(value);
  return {
    id: text(row.id),
    name: text(row.name),
    durationMinutes: number(row.duration_minutes),
    price: number(row.base_price),
  };
}

function mapProfessional(value: unknown): Professional {
  const row = asRecord(value);
  return { id: text(row.id), name: text(row.name) };
}

function mapAppointment(value: unknown): AppointmentSummary {
  const row = asRecord(value);
  return {
    id: text(row.id),
    startAt: text(row.start_at),
    endAt: text(row.end_at),
    status: text(row.status),
    customerName: text(relatedRecord(row.customers).name) || undefined,
    serviceName: text(relatedRecord(row.services).name),
    professionalName: text(relatedRecord(row.professionals).name),
  };
}

function mapCustomerAppointment(value: unknown): AppointmentSummary {
  const row = asRecord(value);
  return {
    id: text(row.id),
    startAt: text(row.start_at),
    endAt: text(row.end_at),
    status: text(row.status),
    serviceName: text(row.service_name),
    professionalName: text(row.professional_name),
  };
}

export async function listBusinessContexts(userId: string): Promise<BusinessContext[]> {
  const { data, error } = await supabase
    .from("business_members")
    .select("tenant_id, role, businesses!inner(id, name, slug, business_type, timezone, active)")
    .eq("user_id", userId)
    .eq("active", true);
  fail(error);

  const contexts: BusinessContext[] = [];
  for (const raw of (data ?? []) as unknown[]) {
    const row = asRecord(raw);
    const business = asRecord(row.businesses);
    if (business.active !== false) {
      contexts.push({
        id: text(business.id),
        name: text(business.name),
        slug: text(business.slug),
        businessType: text(business.business_type) as BusinessType,
        timezone: text(business.timezone),
        role: text(row.role),
        access: "business",
      });
    }
  }
  return contexts;
}

export async function listCustomerContexts(): Promise<BusinessContext[]> {
  const { data, error } = await supabase.rpc("list_customer_businesses");
  fail(error);

  return ((data ?? []) as unknown[]).map((raw) => {
    const row = asRecord(raw);
    return {
      id: text(row.tenant_id),
      name: text(row.business_name),
      slug: text(row.business_slug),
      businessType: text(row.business_type) as BusinessType,
      timezone: text(row.timezone),
      role: "customer",
      access: "customer" as const,
    };
  });
}

export async function selectBusiness(context: BusinessContext): Promise<void> {
  await saveActiveBusiness(context.id);
}

export function selectedBusinessId(): Promise<string | null> {
  return readActiveBusiness();
}

export function clearSelectedBusiness(): Promise<void> {
  return clearActiveBusiness();
}

export async function createBusiness(name: string, businessType: BusinessType): Promise<void> {
  const { error } = await supabase.rpc("create_business_with_owner", {
    p_name: name.trim(),
    p_business_type: businessType,
  });
  fail(error);
}

export async function redeemInvitation(code: string, displayName: string): Promise<string> {
  const { data, error } = await supabase.rpc("redeem_business_invitation", {
    p_code: code.trim().toUpperCase(),
    p_display_name: displayName.trim() || null,
  });
  fail(error);
  return text(asRecord(data).tenant_id);
}

export async function listServices(tenantId: string): Promise<Service[]> {
  const { data, error } = await supabase
    .from("services")
    .select("id, name, duration_minutes, base_price")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name", { ascending: true });
  fail(error);
  return (data ?? []).map(mapService);
}

export async function listProfessionals(tenantId: string): Promise<Professional[]> {
  const { data, error } = await supabase
    .from("professionals")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name", { ascending: true });
  fail(error);
  return (data ?? []).map(mapProfessional);
}

export async function listCustomers(tenantId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name", { ascending: true });
  fail(error);
  return (data ?? []).map((row) => ({ id: text(asRecord(row).id), name: text(asRecord(row).name) }));
}

export async function addCustomer(tenantId: string, name: string): Promise<void> {
  const { error } = await supabase.from("customers").insert({ tenant_id: tenantId, name: name.trim() });
  fail(error);
}

export async function addService(tenantId: string, name: string, durationMinutes: number): Promise<void> {
  const { error } = await supabase.from("services").insert({
    tenant_id: tenantId,
    name: name.trim(),
    duration_minutes: durationMinutes,
    base_price: 0,
  });
  fail(error);
}

export async function addProfessional(tenantId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("professionals")
    .insert({ tenant_id: tenantId, name: name.trim() });
  fail(error);
}

export async function setDefaultAvailability(professionalId: string): Promise<void> {
  const weekdays = [1, 2, 3, 4, 5, 6];
  for (const weekday of weekdays) {
    const { error } = await supabase.rpc("set_professional_schedule_rule", {
      p_professional_id: professionalId,
      p_weekday: weekday,
      p_starts_at: "09:00",
      p_ends_at: "18:00",
    });
    fail(error);
  }
}

export async function listBusinessAppointments(
  tenantId: string,
  startAt: string,
  endAt: string,
): Promise<AppointmentSummary[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, start_at, end_at, status, customers(name), services(name), professionals(name)")
    .eq("tenant_id", tenantId)
    .gte("start_at", startAt)
    .lte("start_at", endAt)
    .order("start_at", { ascending: true });
  fail(error);
  return ((data ?? []) as unknown[]).map(mapAppointment);
}

export async function createStaffAppointment(input: {
  tenantId: string;
  customerId: string;
  serviceId: string;
  professionalId: string;
  startAt: string;
}): Promise<void> {
  const { error } = await supabase.rpc("create_staff_appointment", {
    p_tenant_id: input.tenantId,
    p_customer_id: input.customerId,
    p_service_id: input.serviceId,
    p_professional_id: input.professionalId,
    p_start_at: input.startAt,
    p_notes: null,
  });
  fail(error);
}

export async function getBookingCatalog(tenantId: string): Promise<BookingCatalog> {
  const { data, error } = await supabase.rpc("get_customer_booking_catalog", { p_tenant_id: tenantId });
  fail(error);
  const root = asRecord(data);
  const business = asRecord(root.business);
  return {
    business: {
      id: text(business.id),
      name: text(business.name),
      businessType: text(business.business_type) as BusinessType,
      timezone: text(business.timezone),
    },
    services: Array.isArray(root.services) ? root.services.map(mapService) : [],
    professionals: Array.isArray(root.professionals) ? root.professionals.map(mapProfessional) : [],
  };
}

export async function listBookingSlots(input: {
  tenantId: string;
  serviceId: string;
  professionalId: string;
  date: string;
}): Promise<BookingSlot[]> {
  const { data, error } = await supabase.rpc("list_customer_available_slots", {
    p_tenant_id: input.tenantId,
    p_service_id: input.serviceId,
    p_professional_id: input.professionalId,
    p_date: input.date,
  });
  fail(error);
  return ((data ?? []) as unknown[]).map((row) => {
    const value = asRecord(row);
    return { startAt: text(value.start_at), endAt: text(value.end_at) };
  });
}

export async function createCustomerBooking(input: {
  tenantId: string;
  serviceId: string;
  professionalId: string;
  startAt: string;
}): Promise<void> {
  const { error } = await supabase.rpc("create_customer_appointment", {
    p_tenant_id: input.tenantId,
    p_service_id: input.serviceId,
    p_professional_id: input.professionalId,
    p_start_at: input.startAt,
  });
  fail(error);
}

export async function listMyCustomerAppointments(tenantId: string): Promise<AppointmentSummary[]> {
  const { data, error } = await supabase.rpc("list_my_customer_appointments", {
    p_tenant_id: tenantId,
  });
  fail(error);
  return ((data ?? []) as unknown[]).map(mapCustomerAppointment);
}
