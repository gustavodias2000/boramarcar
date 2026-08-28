/**
 * ListaEsperaRepository — coleção `listaEspera`
 *
 * Armazena solicitações de clientes que querem agendar quando
 * não há horários disponíveis. Ao abrir um slot, o barbeiro
 * pode notificar o próximo da fila.
 */
import { db } from '../../../firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import type { QueryConstraint } from 'firebase/firestore';
import type { EntradaListaEspera } from '../../types';

/**
 * As constraints que DEFINEM "a fila de espera do barbeiro". Compartilhadas
 * entre a listagem e a contagem para os dois recortes serem o mesmo recorte
 * POR CONSTRUÇÃO — se um dia alguém acrescentar um filtro à lista, a
 * contagem o herda no mesmo commit, em vez de virar um segundo número.
 *
 * O `orderBy('createdAt')` importa mesmo numa contagem: no Firestore,
 * ordenar por um campo exclui os documentos que não o têm. Tirá-lo daqui
 * "porque contagem não tem ordem" faria a contagem incluir documentos que a
 * lista não mostra.
 *
 * Índice: reusa o composto `barbeiroId + status + createdAt` que a listagem
 * já exigia — a contagem é a mesma consulta, sem trazer os documentos.
 */
const constraintsDaFila = (barbeiroId: string, data?: string): QueryConstraint[] => {
  const constraints: QueryConstraint[] = [where('barbeiroId', '==', barbeiroId)];
  if (data) constraints.push(where('data', '==', data));
  constraints.push(where('status', '==', 'aguardando'));
  constraints.push(orderBy('createdAt', 'asc'));
  return constraints;
};

/**
 * Adiciona o cliente à lista de espera para uma data com o barbeiro.
 */
export async function entrarNaFila(
  entrada: Omit<EntradaListaEspera, 'id' | 'createdAt' | 'status'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'listaEspera'), {
    ...entrada,
    status: 'aguardando',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Lista todos os clientes em espera para um barbeiro (por data, mais antigos primeiro).
 */
export async function listarFilaDoBarbeiro(
  barbeiroId: string,
  data?: string,
): Promise<EntradaListaEspera[]> {
  const q = query(collection(db, 'listaEspera'), ...constraintsDaFila(barbeiroId, data));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<EntradaListaEspera, 'id'>),
    id: d.id,
  }));
}

/**
 * Conta quem está na fila sem baixar as entradas — agregação no servidor.
 *
 * O Início só exibia `fila.length`: trazia os documentos inteiros (nome do
 * cliente, telefone, data, observação) a cada foco para renderizar um
 * inteiro num aviso. `ListaEsperaScreen`, que de fato mostra a fila,
 * continua usando `listarFilaDoBarbeiro`.
 */
export async function contarFilaDoBarbeiro(
  barbeiroId?: string | null,
  data?: string,
): Promise<number> {
  if (!barbeiroId) return 0;
  const snap = await getCountFromServer(
    query(collection(db, 'listaEspera'), ...constraintsDaFila(barbeiroId, data)),
  );
  return snap.data().count;
}

/**
 * Verifica se o cliente já está na fila para aquela data/barbeiro.
 */
export async function jaEstaNaFila(
  barbeiroId: string,
  clienteUid: string,
  data: string,
): Promise<boolean> {
  const q = query(
    collection(db, 'listaEspera'),
    where('barbeiroId', '==', barbeiroId),
    where('clienteUid', '==', clienteUid),
    where('data', '==', data),
    where('status', '==', 'aguardando'),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Atualiza o status de uma entrada da fila.
 */
export async function atualizarStatusFila(
  entradaId: string,
  status: EntradaListaEspera['status'],
): Promise<void> {
  await updateDoc(doc(db, 'listaEspera', entradaId), { status });
}
