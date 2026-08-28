/**
 * UsuarioRepository — único ponto de acesso à coleção `usuarios`.
 *
 * Item 12 da auditoria: camada de Repository isola o Firestore das telas,
 * elimina a duplicação de fetchUserProfile (antes copiada em 4 telas) e
 * facilita testes (basta mockar este módulo).
 */
import { Platform } from 'react-native';
import { db } from '../../../firebaseConfig';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import type { Usuario } from '../../types';

const ref = (uid: string) => doc(db, 'usuarios', uid);
const tokenRef = (uid: string, token: string) => doc(db, 'usuarios', uid, 'tokens', token);

/**
 * Busca o perfil do usuário. Retorna null se não existir.
 */
export async function getProfile(uid?: string | null): Promise<Usuario | null> {
  if (!uid) return null;
  const snap = await getDoc(ref(uid));
  return snap.exists() ? (snap.data() as Usuario) : null;
}

/**
 * Cria o perfil no cadastro.
 *
 * ARCH-003 (auditoria, Onda 3): `consentimentoEm` (carimbo do momento em
 * que o consentimento LGPD foi aceito) é campo técnico de timestamp —
 * mesma categoria de `createdAt` — então quem grava é o repositório, nunca
 * a tela. `RegisterScreen.tsx` só manda `consentimentoLGPD: true`; o tipo
 * do parâmetro exclui `consentimentoEm` de propósito, então a tela não
 * consegue nem tentar passar um valor próprio para esse campo. Quando
 * `consentimentoLGPD` não vier `true` (ausente ou `false`), nenhum
 * `consentimentoEm` é gravado.
 */
export async function createProfile(
  uid: string,
  data: Omit<Usuario, 'uid' | 'createdAt' | 'consentimentoEm'>,
): Promise<void> {
  await setDoc(ref(uid), {
    uid,
    ...data,
    ...(data.consentimentoLGPD ? { consentimentoEm: serverTimestamp() } : {}),
    createdAt: serverTimestamp(),
  });
}

/**
 * Atualiza campos do perfil.
 */
export async function updateProfile(
  uid: string,
  data: Partial<Omit<Usuario, 'uid' | 'tipo' | 'consentimentoNotificacoesPushEm'>>,
): Promise<void> {
  await updateDoc(ref(uid), {
    ...data,
    // A tela informa só a escolha. O instante é responsabilidade desta
    // camada, para preservar uma trilha de auditoria confiável.
    ...(Object.prototype.hasOwnProperty.call(data, 'consentimentoNotificacoesPush')
      ? { consentimentoNotificacoesPushEm: serverTimestamp() }
      : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Salva o token de push (FCM) do dispositivo atual em DOIS lugares numa
 * única chamada — transição da Onda C (multi-dispositivo):
 *  - `usuarios/{uid}.fcmToken`/`.fcmTokenAt` (campo legado, `updateDoc`):
 *    `functions/index.js` (lembretesAgendamento/lembretes2Horas) ainda lê só
 *    este campo único — não pode parar de ser gravado sob risco de quebrar
 *    os dois lembretes agendados que dependem dele.
 *  - `usuarios/{uid}/tokens/{token}` (subcoleção nova, `setDoc` com
 *    `merge: true`): registro por dispositivo, base do FCM multi-dispositivo.
 *    `tokenId` é o próprio token bruto — reregistrar o mesmo token faz
 *    merge no mesmo doc, nunca duplica. `createdAt` só é gravado na criação
 *    (checagem de existência abaixo); `lastSeenAt` é atualizado em toda
 *    gravação.
 */
export async function saveFcmToken(
  uid?: string | null,
  token?: string | null,
): Promise<void> {
  if (!uid || !token) return;
  try {
    const tRef = tokenRef(uid, token);
    const jaExiste = (await getDoc(tRef)).exists();
    await Promise.all([
      updateDoc(ref(uid), { fcmToken: token, fcmTokenAt: serverTimestamp() }),
      setDoc(
        tRef,
        {
          token,
          platform: Platform.OS,
          ...(jaExiste ? {} : { createdAt: serverTimestamp() }),
          lastSeenAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ]);
  } catch (error: any) {
    // Não é crítico: o app funciona sem push
    console.warn('Não foi possível salvar o token de push:', error?.message);
  }
}

/**
 * Exclui o documento de perfil (LGPD — direito de exclusão).
 */
export async function deleteProfile(uid: string): Promise<void> {
  await deleteDoc(ref(uid));
}
