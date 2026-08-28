/**
 * AvaliacaoRepository — único ponto de acesso à coleção `avaliacoes`.
 *
 * ARCH-002 (auditoria, Onda 3): antes `RatingComponent.tsx` gravava direto
 * com `setDoc(doc(db, 'avaliacoes', ...))`, furando a convenção do projeto
 * de "um repositório por coleção" (ver `BanimentoRepository.ts`,
 * `ClienteContatoRepository.ts`). O id do documento é sempre o id do
 * agendamento avaliado (`avaliacoes/{agendamentoId}`) — uma avaliação por
 * agendamento, gravar duas vezes sobrescreve a primeira (mesmo
 * comportamento de antes, preservado aqui).
 */
import { db } from '../../../firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const ref = (agendamentoId: string) => doc(db, 'avaliacoes', agendamentoId);

/** Dados de uma nova avaliação — tudo que `RatingComponent.tsx` já coletava. */
export interface DadosNovaAvaliacao {
  barbeiroId: string;
  barbeiroNome?: string;
  /** Email do cliente logado (`auth.currentUser?.email`). */
  cliente?: string;
  /** Uid do cliente logado (`auth.currentUser?.uid`). */
  clienteUid?: string;
  clienteNome?: string;
  rating: number;
  comment: string;
}

/**
 * Cria (ou sobrescreve, se já existir) a avaliação de um agendamento.
 * Mesmos campos e mesma chave de documento do `setDoc` original em
 * `RatingComponent.tsx` — extração de camada, sem mudar o que é gravado.
 */
export async function criarAvaliacao(
  agendamentoId: string,
  dados: DadosNovaAvaliacao,
): Promise<void> {
  await setDoc(ref(agendamentoId), {
    agendamentoId,
    ...dados,
    createdAt: serverTimestamp(),
  });
}

/**
 * Verifica se já existe avaliação gravada para um agendamento específico.
 * Como o id do documento é o próprio id do agendamento, isso é um `get`
 * pontual — não uma listagem.
 */
export async function existeAvaliacaoParaAgendamento(
  agendamentoId?: string | null,
): Promise<boolean> {
  if (!agendamentoId) return false;
  const snap = await getDoc(ref(agendamentoId));
  return snap.exists();
}
