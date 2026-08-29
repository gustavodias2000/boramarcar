/**
 * BloqueioRepository — motivo dos bloqueios de horário do profissional.
 *
 * PORTADO DO FIRESTORE PARA O SUPABASE, com as assinaturas intactas.
 *
 * A razão de existir continua a mesma, e sobreviveu à troca de banco: o motivo de um
 * bloqueio ("consulta médica") é dado pessoal do profissional e não pode estar junto do
 * horário, que é público — o cliente lê os horários para montar o calendário.
 *
 * No Firestore isso era uma subcoleção separada (`barbeiros/{id}/bloqueiosPrivados`) com
 * regra própria. Aqui é `scheduling_block_notes`, tabela própria com política própria:
 * quem agenda lê, e o profissional lê o dele. O técnico não lê nenhum.
 *
 * A ESCRITA PASSA POR RPC. A tabela é somente-leitura para o aplicativo — texto livre com
 * dado pessoal não se grava direto. `set_scheduling_block_note` faz a checagem de papel e
 * amarra ao tenant certo.
 */
import { supabase } from "../../../supabaseConfig";

/**
 * Os motivos de todos os bloqueios de um profissional.
 *
 * @returns mapa `{ [bloqueioId]: motivo }` — a mesma forma de antes, porque
 * `BloqueiosScreen` indexa por id do bloqueio.
 *
 * Duas consultas em vez de uma junção aninhada: a nota guarda `reservation_id`, e chegar
 * ao profissional exigiria atravessar reserva e recurso. Buscar as reservas do
 * profissional primeiro é mais direto de ler e de depurar quando vier vazio.
 *
 * Quem não tem permissão recebe mapa vazio, não erro — a política filtra a linha, e a
 * tela funciona igual, só sem os motivos.
 */
export async function getMotivosBloqueio(
  profissionalId: string,
): Promise<Record<string, string>> {
  const { data: recursos } = await supabase
    .from("scheduling_resources")
    .select("id")
    .eq("professional_id", profissionalId);

  const idsRecurso = (recursos ?? []).map((recurso) => recurso.id as string);
  if (idsRecurso.length === 0) return {};

  const { data: reservas } = await supabase
    .from("scheduling_resource_reservations")
    .select("id")
    .in("scheduling_resource_id", idsRecurso)
    .eq("kind", "block");

  const idsReserva = (reservas ?? []).map((reserva) => reserva.id as string);
  if (idsReserva.length === 0) return {};

  const { data: notas } = await supabase
    .from("scheduling_block_notes")
    .select("reservation_id, note")
    .in("reservation_id", idsReserva);

  const motivos: Record<string, string> = {};
  for (const nota of notas ?? []) {
    const linha = nota as { reservation_id: string; note: string | null };
    if (linha.note) motivos[linha.reservation_id] = linha.note;
  }
  return motivos;
}

/**
 * Grava ou atualiza o motivo de um bloqueio.
 *
 * `profissionalId` continua no parâmetro por compatibilidade com a tela, e é ignorado: a
 * RPC deriva o tenant da própria reserva, que é mais confiável que aceitar da tela.
 */
export async function upsertMotivoBloqueio(
  _profissionalId: string,
  bloqueioId: string,
  motivo: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_scheduling_block_note", {
    p_reservation_id: bloqueioId,
    p_note: motivo,
  });
  if (error) throw error;
}

/** Remove o motivo — usado quando o próprio bloqueio é removido. */
export async function removerMotivoBloqueio(
  _profissionalId: string,
  bloqueioId: string,
): Promise<void> {
  // Texto vazio apaga, e é assim de propósito: guardar string vazia criaria uma terceira
  // leitura entre "sem motivo" e "motivo em branco".
  const { error } = await supabase.rpc("set_scheduling_block_note", {
    p_reservation_id: bloqueioId,
    p_note: null,
  });
  if (error) throw error;
}
