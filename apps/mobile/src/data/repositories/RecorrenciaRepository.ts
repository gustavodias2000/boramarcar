/**
 * RecorrenciaRepository — coleção `recorrencias`
 *
 * Armazena os agendamentos periódicos dos clientes fiéis.
 * O barbeiro cria a recorrência; o sistema usa o `diaSemana + horario`
 * para sugerir o próximo agendamento a cada ciclo.
 */
import { db } from '../../../firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import type { Recorrencia } from '../../types';

/**
 * Cria uma nova recorrência.
 */
export async function criarRecorrencia(
  data: Omit<Recorrencia, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'recorrencias'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Lista as recorrências ativas de um barbeiro.
 */
export async function listarRecorrenciasDoBarbeiro(
  barbeiroId: string,
): Promise<Recorrencia[]> {
  const q = query(
    collection(db, 'recorrencias'),
    where('barbeiroId', '==', barbeiroId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<Recorrencia, 'id'>),
    id: d.id,
  }));
}

/**
 * Ativa / desativa uma recorrência.
 */
export async function toggleRecorrencia(
  recorrenciaId: string,
  ativo: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'recorrencias', recorrenciaId), { ativo });
}

/**
 * Remove uma recorrência.
 */
export async function removerRecorrencia(recorrenciaId: string): Promise<void> {
  await deleteDoc(doc(db, 'recorrencias', recorrenciaId));
}
