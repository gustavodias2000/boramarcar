/**
 * Privacidade e dado pessoal (LGPD, §48 do Contexto Mestre).
 *
 * Duas ideias sustentam este módulo, e as duas vêm do Barbershop:
 *
 * 1. **Dado pessoal vive separado do dado operacional.** O nome do cliente é operação —
 *    a OS precisa mostrar de quem é o carro. Documento, telefone, e-mail e aniversário
 *    não são: ficam em `customer_contacts`, com política própria, e o técnico não os
 *    alcança. Quem não tem permissão não recebe erro, recebe ausência.
 *
 * 2. **Ausência de consentimento é opt-in pendente, nunca autorização implícita.** Por
 *    isso não há valor padrão em lugar nenhum: `consentFor` devolve `false` quando não
 *    encontra registro, e é assim que deve ser lido.
 *
 * O que a LGPD chama de exclusão, aqui é anonimização. Apagar o cliente levaria junto o
 * registro fiscal do que foi vendido a ele; anonimizar remove a pessoa e preserva o
 * fato comercial. Ver `anonymize_customer` na migration de LGPD.
 */

import type { Db } from "../data/index";

export const CONSENT_PURPOSES = [
  "service_terms",
  "marketing_push",
  "marketing_whatsapp",
  "marketing_email",
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_PURPOSE_LABELS: Readonly<Record<ConsentPurpose, string>> = {
  service_terms: "Termos de atendimento",
  marketing_push: "Novidades pelo aplicativo",
  marketing_whatsapp: "Promoções por WhatsApp",
  marketing_email: "Promoções por e-mail",
};

/**
 * Por que separar por finalidade em vez de um único "aceita contato": consentir em
 * receber a confirmação do horário não é consentir em receber promoção. Juntar os dois
 * num campo só transforma um sim específico num cheque em branco.
 */
export const CONSENT_PURPOSE_DESCRIPTIONS: Readonly<Record<ConsentPurpose, string>> = {
  service_terms: "Confirmação, lembrete e aviso sobre o próprio atendimento.",
  marketing_push: "Campanhas e novidades enviadas pelo aplicativo.",
  marketing_whatsapp: "Campanhas e promoções enviadas por WhatsApp.",
  marketing_email: "Campanhas e promoções enviadas por e-mail.",
};

/** Os campos que `clear_customer_contact_fields` aceita apagar. A RPC recusa o resto. */
export const CONTACT_FIELDS = [
  "cpf_cnpj",
  "phone",
  "whatsapp",
  "email",
  "birthday_md",
  "notes",
] as const;

export type ContactField = (typeof CONTACT_FIELDS)[number];

export interface CustomerContact {
  customer_id: string;
  tenant_id: string;
  cpf_cnpj: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  /** `"MM-DD"`. Sem ano de propósito: permite a campanha sem guardar a idade. */
  birthday_md: string | null;
  notes: string | null;
}

export interface CustomerConsent {
  id: string;
  tenant_id: string;
  customer_id: string;
  purpose: ConsentPurpose;
  granted: boolean;
  granted_at: string;
  source: string | null;
}

export interface AuditEntry {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

// ---------------------------------------------------------------------------
// Dado de contato
// ---------------------------------------------------------------------------

/**
 * Devolve `null` tanto quando não há contato cadastrado quanto quando quem pergunta
 * não tem permissão de ver — a RLS filtra a linha em vez de recusar a consulta. A
 * indistinção é intencional: a interface trata os dois casos do mesmo jeito, campo
 * vazio, e a operação segue.
 */
export async function getCustomerContact(db: Db, customerId: string) {
  return db
    .from("customer_contacts")
    .select("customer_id, tenant_id, cpf_cnpj, phone, whatsapp, email, birthday_md, notes")
    .eq("customer_id", customerId)
    .maybeSingle();
}

export async function saveCustomerContact(
  db: Db,
  input: {
    customerId: string;
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
    cpfCnpj?: string | null;
    birthdayMd?: string | null;
    notes?: string | null;
  },
) {
  return db.rpc("upsert_customer_contact", {
    p_customer_id: input.customerId,
    p_phone: input.phone ?? null,
    p_whatsapp: input.whatsapp ?? null,
    p_email: input.email ?? null,
    p_cpf_cnpj: input.cpfCnpj ?? null,
    p_birthday_md: input.birthdayMd ?? null,
    p_notes: input.notes ?? null,
  });
}

/** `"1990-03-14"` ou `"14/03/1990"` → `"03-14"`. Descarta o ano, que é o ponto. */
export function toBirthdayMd(value: string | null | undefined): string | null {
  if (!value) return null;

  const iso = /^\d{4}-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) return `${iso[1]}-${iso[2]}`;

  const br = /^(\d{2})\/(\d{2})(?:\/\d{4})?$/.exec(value.trim());
  if (br) return `${br[2]}-${br[1]}`;

  const md = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(value.trim());
  return md ? value.trim() : null;
}

/** `"03-14"` → `"14/03"`. */
export function formatBirthdayMd(value: string | null | undefined): string {
  if (!value) return "";
  const parts = /^(\d{2})-(\d{2})$/.exec(value);
  return parts ? `${parts[2]}/${parts[1]}` : "";
}

// ---------------------------------------------------------------------------
// Consentimento
// ---------------------------------------------------------------------------

export async function listCustomerConsents(db: Db, customerId: string) {
  return db
    .from("customer_consents")
    .select("id, tenant_id, customer_id, purpose, granted, granted_at, source")
    .eq("customer_id", customerId);
}

/**
 * A leitura correta de "não encontrei registro" é **não consentido**. Nunca inverter
 * este default: seria transformar silêncio em autorização.
 */
export function consentFor(
  consents: readonly CustomerConsent[] | null | undefined,
  purpose: ConsentPurpose,
): boolean {
  return consents?.find((consent) => consent.purpose === purpose)?.granted === true;
}

/**
 * Passa pela RPC, não por `upsert` direto — e isso não é preferência de estilo.
 *
 * `customer_consents.recorded_by` nulo significa, na semântica da própria tabela, "o
 * cliente consentiu sozinho pela área do cliente". Gravando direto, o campo ficava
 * nulo e qualquer membro podia alegar consentimento que ninguém deu. A RPC carimba
 * `auth.uid()` e grava a trilha; a escrita direta foi revogada na `20260826000200`.
 *
 * `tenantId` não é mais necessário — a função deriva do próprio cliente. O parâmetro
 * continua aceito para não quebrar quem já chama, e é ignorado.
 */
export async function setCustomerConsent(
  db: Db,
  input: {
    tenantId?: string;
    customerId: string;
    purpose: ConsentPurpose;
    granted: boolean;
    source?: string;
  },
) {
  return db.rpc("record_customer_consent", {
    p_customer_id: input.customerId,
    p_purpose: input.purpose,
    p_granted: input.granted,
    p_source: input.source ?? null,
  });
}

/**
 * Apagar um campo de contato. O upsert não serve: ele usa `coalesce`, então passar
 * nulo deixa como estava. Apagar é um direito do titular e precisa de caminho próprio.
 */
export async function clearCustomerContactFields(
  db: Db,
  customerId: string,
  fields: readonly ContactField[],
) {
  return db.rpc("clear_customer_contact_fields", {
    p_customer_id: customerId,
    p_fields: fields,
  });
}

// ---------------------------------------------------------------------------
// Direitos do titular
// ---------------------------------------------------------------------------

export async function anonymizeCustomer(db: Db, customerId: string, reason?: string) {
  return db.rpc("anonymize_customer", {
    p_customer_id: customerId,
    p_reason: reason ?? null,
  });
}

export async function deactivateProfessional(db: Db, professionalId: string) {
  return db.rpc("deactivate_professional", { p_professional_id: professionalId });
}

/**
 * Exige o nome digitado por inteiro. É a única barreira entre um clique e a perda de
 * todo o histórico da empresa — e por isso a confirmação é do chamador, não um
 * `confirm()` que o servidor não vê.
 */
export async function deleteBusiness(db: Db, tenantId: string, confirmationName: string) {
  return db.rpc("delete_business", {
    p_tenant_id: tenantId,
    p_confirmation_name: confirmationName,
  });
}

// ---------------------------------------------------------------------------
// Trilha e retenção
// ---------------------------------------------------------------------------

export async function listAuditLog(db: Db, tenantId: string, limit = 50) {
  return db
    .from("audit_log")
    .select("id, tenant_id, actor_user_id, action, entity, entity_id, metadata, occurred_at")
    .eq("tenant_id", tenantId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
}

/** Faixa aceita pelo schema. Menos de seis meses não sobrevive a uma auditoria fiscal. */
export const RETENTION_MONTHS_RANGE = { min: 6, max: 240 } as const;

export async function setDataRetention(db: Db, tenantId: string, months: number | null) {
  return db
    .from("businesses")
    .update({ data_retention_months: months })
    .eq("id", tenantId)
    .select("id, data_retention_months")
    .maybeSingle();
}
