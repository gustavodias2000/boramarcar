/**
 * BanimentoRepository — lista de clientes banidos por profissional.
 *
 * SEGURANÇA (auditoria, bloco 1): antes essa lista ficava dentro do documento
 * `barbeiros/{uid}`, que é a VITRINE PÚBLICA — qualquer usuário logado podia
 * ler nome e email de todos os clientes banidos de todos os profissionais.
 *
 * Agora ela vive numa subcoleção privada:
 *
 *   barbeiros/{barbeiroId}/banidos/{clienteUid}
 *
 * As regras do Firestore permitem que o cliente leia APENAS o próprio
 * documento (`get`, necessário para a checagem de bloqueio ao agendar) —
 * listar a coleção inteira só o profissional dono (ou o dono do negócio).
 */
import { db } from '../../../firebaseConfig';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
} from 'firebase/firestore';
import CacheService from '../../services/CacheService';
import { getBarbeiro } from './BarbeiroRepository';
import type { ClienteBanido } from '../../types';

const caminho = (barbeiroId: string) =>
  collection(db, 'barbeiros', barbeiroId, 'banidos');

/**
 * Lista os clientes banidos de um profissional.
 * Só o próprio profissional (ou o dono do negócio) consegue executar.
 */
export async function listarBanidos(barbeiroId: string): Promise<ClienteBanido[]> {
  await migrarBanidosLegado(barbeiroId);
  const snap = await getDocs(caminho(barbeiroId));
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<ClienteBanido, 'uid'>),
    uid: d.id,
  }));
}

/**
 * Checagem pontual usada pelo cliente antes de agendar.
 *
 * Faz um `get` num documento específico (não uma listagem), que é exatamente
 * o que as regras liberam para o próprio titular. Se as regras negarem por
 * qualquer motivo, retorna `false` em vez de quebrar a tela de agendamento —
 * o profissional ainda pode recusar o atendimento manualmente.
 */
export async function estaBanido(
  barbeiroId?: string | null,
  clienteUid?: string | null,
): Promise<boolean> {
  if (!barbeiroId || !clienteUid) return false;
  try {
    const snap = await getDoc(doc(db, 'barbeiros', barbeiroId, 'banidos', clienteUid));
    return snap.exists();
  } catch (error: any) {
    console.warn('Não foi possível checar banimento:', error?.message);
    return false;
  }
}

/**
 * Bane um cliente. O id do documento é o uid do cliente, então banir duas
 * vezes é idempotente (não duplica).
 */
export async function banirCliente(
  barbeiroId: string,
  cliente: ClienteBanido,
): Promise<void> {
  await setDoc(doc(db, 'barbeiros', barbeiroId, 'banidos', cliente.uid), {
    nome: cliente.nome ?? '',
    email: cliente.email ?? '',
    bannedAt: serverTimestamp(),
  });
}

/** Remove o banimento de um cliente. */
export async function desbanirCliente(
  barbeiroId: string,
  clienteUid: string,
): Promise<void> {
  await deleteDoc(doc(db, 'barbeiros', barbeiroId, 'banidos', clienteUid));
}

/**
 * Migração do formato antigo (array `clientesBanidos` dentro do doc público)
 * para a subcoleção privada. Roda no máximo uma vez por profissional: depois
 * de copiar, o campo é apagado do documento público com `deleteField()`.
 *
 * Só o próprio profissional consegue executar (é quem tem permissão de
 * escrita no doc); por isso a chamada é feita nas telas do barbeiro.
 */
export async function migrarBanidosLegado(barbeiroId: string): Promise<void> {
  try {
    const barbeiro = await getBarbeiro(barbeiroId);
    const legado = barbeiro?.clientesBanidos;
    if (!legado || legado.length === 0) return;

    await Promise.all(
      legado
        .filter((b) => !!b?.uid)
        .map((b) =>
          setDoc(
            doc(db, 'barbeiros', barbeiroId, 'banidos', b.uid),
            { nome: b.nome ?? '', email: b.email ?? '', bannedAt: serverTimestamp() },
            { merge: true },
          ),
        ),
    );

    await updateDoc(doc(db, 'barbeiros', barbeiroId), {
      clientesBanidos: deleteField(),
    });
    CacheService.invalidate(`barbeiro:${barbeiroId}`);
  } catch (error: any) {
    console.warn('Não foi possível migrar a lista de banidos:', error?.message);
  }
}
