/**
 * DespesaRepository — único ponto de acesso à coleção `despesas`.
 *
 * Lançamentos manuais de gasto do barbeiro (aluguel, produtos de trabalho,
 * contas etc.), usados para compor a coluna "Despesas" dos relatórios
 * financeiros. Sem integração com nenhum meio de pagamento — é só um
 * registro do que foi gasto.
 */
import { db } from '../../../firebaseConfig';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { ehIndiceIndisponivel } from '../../utils/consultaResiliente';
import type { Despesa } from '../../types';

const fromSnap = (d: { id: string; data: () => unknown }): Despesa => ({
  ...(d.data() as Omit<Despesa, 'id'>),
  id: d.id,
});

/**
 * Busca todas as despesas do barbeiro usando SÓ o filtro de igualdade —
 * consulta que o Firestore atende com o índice de campo único (criado
 * automaticamente), sem depender de nenhum índice composto.
 *
 * É o plano B das funções abaixo enquanto o índice composto
 * `barbeiroId + data` ainda está sendo construído (o que acontece por
 * alguns minutos após cada `firebase deploy --only firestore:indexes`).
 * O volume de despesas de uma barbearia é pequeno, então ordenar e
 * filtrar em memória aqui é barato.
 */
async function buscarTodasDoBarbeiro(barbeiroId: string): Promise<Despesa[]> {
  const snap = await getDocs(
    query(collection(db, 'despesas'), where('barbeiroId', '==', barbeiroId)),
  );
  return snap.docs.map(fromSnap);
}

/**
 * Cria um novo lançamento de despesa.
 */
export async function criarDespesa(
  dados: Omit<Despesa, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'despesas'), {
    ...dados,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Lista as despesas do barbeiro num intervalo de datas (inclusive) —
 * usado pelos cards financeiros do Início e da aba Relatórios. Precisa do
 * índice composto `barbeiroId` + `data` (ver firestore.indexes.json).
 */
export async function listarPorBarbeiroEPeriodo(
  barbeiroId: string,
  dataInicio: string,
  dataFim: string,
): Promise<Despesa[]> {
  if (!barbeiroId) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, 'despesas'),
        where('barbeiroId', '==', barbeiroId),
        where('data', '>=', dataInicio),
        where('data', '<=', dataFim),
      ),
    );
    return snap.docs.map(fromSnap);
  } catch (error) {
    if (!ehIndiceIndisponivel(error)) throw error;
    // Índice composto ainda em construção: cai para a consulta sem
    // range (só igualdade) e recorta o período em memória.
    console.warn('[despesas] índice composto indisponível — filtrando o período em memória.');
    const todas = await buscarTodasDoBarbeiro(barbeiroId);
    return todas.filter((d) => d.data >= dataInicio && d.data <= dataFim);
  }
}

/**
 * Lista as despesas mais recentes do barbeiro (para a tela de gestão de
 * despesas). Reaproveita o mesmo índice `barbeiroId + data` da função
 * acima ordenando ascendente e revertendo em memória — evita precisar de
 * um segundo índice composto só para inverter a ordem.
 */
export async function listarDoBarbeiro(
  barbeiroId: string,
  max: number = 200,
): Promise<Despesa[]> {
  if (!barbeiroId) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, 'despesas'),
        where('barbeiroId', '==', barbeiroId),
        orderBy('data', 'asc'),
        limit(max),
      ),
    );
    return snap.docs.map(fromSnap).reverse();
  } catch (error) {
    if (!ehIndiceIndisponivel(error)) throw error;
    // Mesmo plano B de `listarPorBarbeiroEPeriodo`: sem o índice composto,
    // ordena e recorta em memória — a tela de Despesas abre normalmente.
    console.warn('[despesas] índice composto indisponível — ordenando em memória.');
    const todas = await buscarTodasDoBarbeiro(barbeiroId);
    return todas.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)).slice(0, max);
  }
}

/**
 * Remove um lançamento de despesa.
 */
export async function removerDespesa(id: string): Promise<void> {
  await deleteDoc(doc(db, 'despesas', id));
}
