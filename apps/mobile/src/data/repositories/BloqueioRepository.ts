/**
 * BloqueioRepository — motivo dos bloqueios de horário do barbeiro.
 *
 * Vive separado de `barbeiros/{id}.bloqueiosHorario` (array público, usado
 * pela tela de agendamento do cliente para montar o calendário) porque o
 * motivo (ex.: "consulta médica") é dado pessoal e não deve estar no doc
 * lido por qualquer cliente logado — ver comentário em `firestore.rules`
 * (`match /bloqueiosPrivados/{bloqueioId}`) e o tipo `BloqueioMotivo`.
 */
import { db } from '../../../firebaseConfig';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import type { BloqueioMotivo } from '../../types';

/**
 * Busca os motivos de todos os bloqueios de horário de um barbeiro.
 * @returns mapa `{ [bloqueioId]: motivo }`.
 */
export async function getMotivosBloqueio(barbeiroId: string): Promise<Record<string, string>> {
  const snap = await getDocs(collection(db, 'barbeiros', barbeiroId, 'bloqueiosPrivados'));
  const motivos: Record<string, string> = {};
  snap.docs.forEach((d) => {
    const data = d.data() as BloqueioMotivo;
    if (data.motivo) motivos[d.id] = data.motivo;
  });
  return motivos;
}

/**
 * Grava/atualiza o motivo de um bloqueio de horário específico.
 */
export async function upsertMotivoBloqueio(
  barbeiroId: string,
  bloqueioId: string,
  motivo: string,
): Promise<void> {
  await setDoc(doc(db, 'barbeiros', barbeiroId, 'bloqueiosPrivados', bloqueioId), { motivo });
}

/**
 * Remove o motivo de um bloqueio de horário (usado quando o bloqueio em si é removido).
 */
export async function removerMotivoBloqueio(barbeiroId: string, bloqueioId: string): Promise<void> {
  await deleteDoc(doc(db, 'barbeiros', barbeiroId, 'bloqueiosPrivados', bloqueioId));
}
