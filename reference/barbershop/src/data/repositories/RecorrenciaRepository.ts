/**
 * RecorrenciaRepository — os agendamentos periódicos dos clientes fiéis.
 *
 * PORTADO DO FIRESTORE PARA O SUPABASE, com as assinaturas intactas.
 *
 * O QUE O MODELO NOVO CORRIGE
 *
 * `Recorrencia` guardava cópias: `clienteNome`, `clienteEmail`, `clienteTelefone`,
 * `servicoNome` e `precoEmCentavos`. Não era descuido — o Firestore obriga a isso, porque
 * não faz junção. O preço é o exemplo do estrago: congelado na recorrência, ele passava a
 * discordar do catálogo no dia seguinte a um reajuste, e ninguém sabia qual dos dois
 * valia.
 *
 * Aqui a recorrência guarda `customer_id`, `service_id` e `professional_id`, e os nomes e
 * o preço vêm por junção — sempre atuais. Os campos continuam no tipo do domínio para as
 * telas não mudarem, preenchidos a partir da junção.
 *
 * `clienteEmail` é a única exceção: NÃO é preenchido. E-mail de cliente é dado pessoal,
 * mora em `customer_contacts` sob política restrita, e a tela de recorrência não precisa
 * dele para funcionar. Vem string vazia.
 */
import { supabase } from "../../../supabaseConfig";
import type { FrequenciaRecorrencia, Horario, Recorrencia } from "../../types";

/** O domínio fala português e semanal/quinzenal/mensal; o banco fala inglês e enum. */
const PARA_BANCO: Record<FrequenciaRecorrencia, string> = {
  semanal: "weekly",
  quinzenal: "biweekly",
  mensal: "monthly",
};

const PARA_DOMINIO: Record<string, FrequenciaRecorrencia> = {
  weekly: "semanal",
  biweekly: "quinzenal",
  monthly: "mensal",
};

const COLUNAS =
  "id, tenant_id, customer_id, service_id, professional_id, weekday, starts_at, " +
  "frequency, active, last_generated_on, created_at, " +
  "customers(name), services(name, base_price)";

interface LinhaRecorrencia {
  id: string;
  customer_id: string;
  service_id: string;
  professional_id: string;
  weekday: number;
  starts_at: string;
  frequency: string;
  active: boolean;
  last_generated_on: string | null;
  created_at: string;
  customers: { name: string } | null;
  services: { name: string; base_price: number } | null;
}

function paraDominio(linha: LinhaRecorrencia): Recorrencia {
  return {
    id: linha.id,
    barbeiroId: linha.professional_id,
    clienteUid: linha.customer_id,
    clienteNome: linha.customers?.name ?? "",
    // Dado pessoal — não viaja para a tela de recorrência, que não precisa dele.
    clienteEmail: "",
    servicoId: linha.service_id,
    servicoNome: linha.services?.name ?? "",
    // O banco guarda `numeric(12,2)` em reais; o domínio do app fala centavos.
    precoEmCentavos: Math.round(Number(linha.services?.base_price ?? 0) * 100),
    diaSemana: linha.weekday,
    // `time` volta como "09:00:00"; o domínio usa "09:00".
    horario: linha.starts_at.slice(0, 5) as Horario,
    frequencia: PARA_DOMINIO[linha.frequency] ?? "semanal",
    ativo: linha.active,
    ultimoAgendamento: linha.last_generated_on ?? undefined,
    createdAt: linha.created_at,
  } as Recorrencia;
}

/**
 * Cria uma recorrência.
 *
 * `tenant_id` não vem no parâmetro porque o domínio do Barbershop não o conhecia. É
 * derivado do profissional, que é a fonte confiável — aceitar da tela permitiria criar
 * recorrência apontando para outra empresa, e a FK composta recusaria depois, com erro
 * que não explica nada.
 */
export async function criarRecorrencia(
  data: Omit<Recorrencia, "id" | "createdAt">,
): Promise<string> {
  const { data: profissional, error: erroProfissional } = await supabase
    .from("professionals")
    .select("tenant_id")
    .eq("id", data.barbeiroId)
    .maybeSingle();

  if (erroProfissional) throw erroProfissional;
  if (!profissional) throw new Error("Profissional não encontrado.");

  const { data: criada, error } = await supabase
    .from("appointment_recurrences")
    .insert({
      tenant_id: (profissional as { tenant_id: string }).tenant_id,
      customer_id: data.clienteUid,
      service_id: data.servicoId,
      professional_id: data.barbeiroId,
      weekday: data.diaSemana,
      starts_at: data.horario,
      frequency: PARA_BANCO[data.frequencia] ?? "weekly",
      active: data.ativo !== false,
    })
    .select("id")
    .single();

  if (error) throw error;
  return (criada as { id: string }).id;
}

/** As recorrências de um profissional, mais recentes primeiro — como antes. */
export async function listarRecorrenciasDoBarbeiro(
  profissionalId: string,
): Promise<Recorrencia[]> {
  const { data, error } = await supabase
    .from("appointment_recurrences")
    .select(COLUNAS)
    .eq("professional_id", profissionalId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((linha) => paraDominio(linha as unknown as LinhaRecorrencia));
}

/** Ativa ou desativa. Desativar preserva o histórico; remover, não. */
export async function toggleRecorrencia(
  recorrenciaId: string,
  ativo: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("appointment_recurrences")
    .update({ active: ativo })
    .eq("id", recorrenciaId);

  if (error) throw error;
}

export async function removerRecorrencia(recorrenciaId: string): Promise<void> {
  const { error } = await supabase
    .from("appointment_recurrences")
    .delete()
    .eq("id", recorrenciaId);

  if (error) throw error;
}
