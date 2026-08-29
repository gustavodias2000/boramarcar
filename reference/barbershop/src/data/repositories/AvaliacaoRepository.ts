/**
 * AvaliacaoRepository — avaliação de atendimento.
 *
 * PORTADO DO FIRESTORE PARA O SUPABASE, com as assinaturas intactas.
 *
 * A regra que o Barbershop estabeleceu sobreviveu inteira e virou constraint: **uma
 * avaliação por atendimento**. Lá isso era convenção — o id do documento era o id do
 * agendamento, então gravar duas vezes sobrescrevia. Aqui é `unique (appointment_id)` em
 * `appointment_ratings`: reavaliar é editar, não acumular.
 *
 * A ESCRITA PASSA POR `record_appointment_rating`. A tabela é somente-leitura para o
 * aplicativo, e a RPC impõe o que a tela não deveria precisar saber: só atendimento
 * CONCLUÍDO pode ser avaliado. No Firestore essa checagem não existia em lugar nenhum.
 *
 * TRÊS CAMPOS DEIXARAM DE EXISTIR, e a ausência é ganho. `barbeiroNome`, `cliente`
 * (e-mail) e `clienteNome` eram cópias desnormalizadas que o Firestore obrigava. Aqui a
 * avaliação guarda os IDs e os nomes vêm por junção — uma verdade só, e o e-mail do
 * cliente nem entra: é dado pessoal, mora em `customer_contacts` sob política restrita.
 */
import { supabase } from "../../../supabaseConfig";

/** Dados de uma nova avaliação — a mesma forma que `RatingComponent.tsx` já coletava. */
export interface DadosNovaAvaliacao {
  barbeiroId: string;
  barbeiroNome?: string;
  /** Aceito por compatibilidade e IGNORADO: e-mail de cliente é dado pessoal. */
  cliente?: string;
  clienteUid?: string;
  clienteNome?: string;
  rating: number;
  comment: string;
}

/**
 * Cria a avaliação de um atendimento. Avaliar de novo sobrescreve, como antes.
 *
 * `dados` continua sendo recebido inteiro para a tela não mudar, mas só `rating` e
 * `comment` viajam: os demais campos são derivados do próprio agendamento pela RPC, que
 * é onde eles são confiáveis. Uma tela que informa o próprio `barbeiroId` pode informar
 * o errado.
 */
export async function criarAvaliacao(
  agendamentoId: string,
  dados: DadosNovaAvaliacao,
): Promise<void> {
  const { error } = await supabase.rpc("record_appointment_rating", {
    p_appointment_id: agendamentoId,
    p_rating: dados.rating,
    p_comment: dados.comment?.trim() || null,
  });

  if (error) throw error;
}

/**
 * Já existe avaliação para este atendimento?
 *
 * Consulta pontual pela chave única, não listagem — mesma característica de antes.
 * Devolve `false` também quando a política filtra a linha, o que é a leitura correta
 * para a tela: sem poder ver, não há o que mostrar.
 */
export async function existeAvaliacaoParaAgendamento(
  agendamentoId?: string | null,
): Promise<boolean> {
  if (!agendamentoId) return false;

  const { data } = await supabase
    .from("appointment_ratings")
    .select("id")
    .eq("appointment_id", agendamentoId)
    .maybeSingle();

  return data !== null;
}
