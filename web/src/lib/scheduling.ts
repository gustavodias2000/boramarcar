export type AppointmentStatus = "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled";

export interface ScheduleProfessional {
  id: string;
  name: string;
  active: boolean;
  business_member_id?: string | null;
}

export interface ScheduleCustomer {
  id: string;
  name: string;
  active: boolean;
}

export interface ScheduleService {
  id: string;
  name: string;
  duration_minutes: number;
  active: boolean;
}

export interface ScheduleRule {
  id: string;
  tenant_id: string;
  professional_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
}

export interface ScheduleResource {
  id: string;
  tenant_id: string;
  professional_id: string | null;
  name: string;
  kind: "professional" | "service_box";
  active: boolean;
}

export interface ScheduleAppointment {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  service_id: string;
  service_name: string;
  professional_id: string;
  professional_name: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  notes: string | null;
}

export interface SchedulingBlock {
  id: string;
  tenant_id: string;
  scheduling_resource_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
}

export const appointmentStatusCopy: Record<AppointmentStatus, { label: string; tone: string }> = {
  scheduled: { label: "Agendado", tone: "sand" },
  confirmed: { label: "Confirmado", tone: "blue" },
  in_progress: { label: "Em atendimento", tone: "violet" },
  completed: { label: "Concluído", tone: "green" },
  cancelled: { label: "Cancelado", tone: "muted" },
};

export function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`).toISOString();
}

export function displayScheduleDate(date: string) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${date}T12:00:00`));

  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shortTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function timePart(value: string) {
  return value.slice(0, 5);
}

export function sameLocalDay(value: string, date: string) {
  return localDateKey(new Date(value)) === date;
}
