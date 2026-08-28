/**
 * BarbeiroRepository — único ponto de acesso à coleção `barbeiros`
 * (a "vitrine" que os clientes veem).
 */
import { db } from '../../../firebaseConfig';
import {
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import CacheService from '../../services/CacheService';
import { semCamposIndefinidos } from '../../utils/firestoreUtils';
import type { Barbeiro } from '../../types';

const TTL_BARBEIRO_MS = 2 * 60 * 1000; // 2min — config individual
const PREFIXO_LISTA = 'barbeiros:list:';

/**
 * Identidade da versão de um documento `barbeiros/{id}` no instante em que ele
 * foi lido. `null` = o documento não existia, ou é anterior ao carimbo de
 * `updatedAt`. Opaca de propósito: só serve para comparar igualdade, nunca
 * para ordenar ou exibir.
 */
export type MarcaDeVersao = string | null;

/**
 * DOM-01 — o documento mudou entre a carga da tela e o salvamento.
 *
 * Mesmo espírito de `HorarioIndisponivelError` (OcupacaoService): um erro
 * tipado que a tela reconhece e traduz numa mensagem específica, em vez de
 * cair no "não foi possível salvar" genérico — que aqui seria pior que inútil,
 * porque o usuário tentaria de novo e, sem esta checagem, apagaria mesmo o
 * trabalho do outro aparelho.
 */
export class ConflitoDeVersaoError extends Error {
  /** Caminho do documento em conflito, ex.: `barbeiros/abc`. */
  recurso: string;
  constructor(recurso: string) {
    super(`O documento ${recurso} foi alterado depois que esta tela o carregou.`);
    this.name = 'ConflitoDeVersaoError';
    this.recurso = recurso;
  }
}

/**
 * Reconhece o erro de conflito.
 *
 * Por que não `instanceof` direto na tela: `extends Error` sobrevive ao Babel
 * hoje, mas o `name` é o que o objeto carrega em qualquer transpilação e
 * através de qualquer re-embrulho — e o custo de errar aqui é a tela mostrar
 * "tente novamente" para um conflito, exatamente o caminho que DOM-01 fecha.
 * O `instanceof` continua sendo tentado primeiro.
 */
export function ehConflitoDeVersao(erro: unknown): boolean {
  if (erro instanceof ConflitoDeVersaoError) return true;
  return (erro as { name?: string } | null)?.name === 'ConflitoDeVersaoError';
}

/**
 * Extrai a marca de versão de um documento de barbeiro já carregado.
 *
 * Usa o `updatedAt` que `upsertBarbeiro`/`atualizarProfissional` já gravam em
 * toda escrita — nenhum campo novo no documento. Guarda segundos E nanossegundos
 * (não milissegundos) porque é assim que o `Timestamp` do Firestore guarda:
 * truncar faria duas escritas do mesmo milissegundo parecerem a mesma versão.
 */
export function marcaDeVersaoBarbeiro(
  barbeiro?: { updatedAt?: unknown } | null,
): MarcaDeVersao {
  const valor = barbeiro?.updatedAt;
  if (valor == null) return null;
  const carimbo = valor as { seconds?: number; nanoseconds?: number; toMillis?: () => number };
  if (typeof carimbo.seconds === 'number') {
    return `${carimbo.seconds}.${carimbo.nanoseconds ?? 0}`;
  }
  if (typeof carimbo.toMillis === 'function') return String(carimbo.toMillis());
  if (valor instanceof Date) return String(valor.getTime());
  if (typeof valor === 'number') return String(valor);
  // Qualquer outra coisa (inclusive um `serverTimestamp()` ainda pendente, que
  // nunca aparece numa LEITURA) conta como "sem marca".
  return null;
}

/**
 * Escrita com concorrência otimista em `barbeiros/{id}`: relê o documento
 * dentro de uma transação e só grava se a marca de versão continuar igual à
 * do momento da carga.
 *
 * NÃO faz merge de conteúdo, de propósito. Quando dois aparelhos editam a
 * mesma lista de serviços não existe resposta que o código possa inventar —
 * escolher errado num PREÇO é pior que recusar —, então a decisão volta para
 * quem sabe: o usuário recarrega e reaplica.
 *
 * A transação cobre a janela curta (entre o `get` e o commit); a marca cobre a
 * janela longa (entre abrir a tela e apertar Salvar), que é a de DOM-01.
 *
 * Não invalida cache: quem chama é que sabe quais chaves a escrita suja — ver
 * `upsertBarbeiroSeNaoMudou` aqui e `atualizarProfissionalSeNaoMudou` no
 * NegocioRepository.
 *
 * @throws ConflitoDeVersaoError se o documento mudou desde a carga
 */
export async function gravarBarbeiroSeNaoMudou(
  barbeiroId: string,
  campos: Record<string, unknown>,
  marcaCarregada: MarcaDeVersao,
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'barbeiros', barbeiroId);
    const snap = await transaction.get(ref);
    const marcaAtual = snap.exists()
      ? marcaDeVersaoBarbeiro(snap.data() as { updatedAt?: unknown })
      : null;
    if (marcaAtual !== marcaCarregada) {
      throw new ConflitoDeVersaoError(`barbeiros/${barbeiroId}`);
    }
    transaction.set(ref, { ...campos, updatedAt: serverTimestamp() }, { merge: true });
  });
}

/**
 * Busca um barbeiro pelo uid. Cacheado em memória (ver CacheService) — toda
 * escrita em `barbeiros/{uid}` (aqui ou em NegocioRepository) invalida a
 * chave correspondente, então nunca serve dado desatualizado após um save.
 */
export async function getBarbeiro(uid: string): Promise<Barbeiro | null> {
  return CacheService.getOrFetch(`barbeiro:${uid}`, TTL_BARBEIRO_MS, async () => {
    const snap = await getDoc(doc(db, 'barbeiros', uid));
    if (!snap.exists()) return null;
    return { ...(snap.data() as Omit<Barbeiro, 'id'>), id: snap.id };
  });
}

/**
 * Cria/atualiza a entrada do barbeiro na vitrine (id do doc == uid).
 */
export async function upsertBarbeiro(
  uid: string,
  data: Partial<Omit<Barbeiro, 'id' | 'uid'>>,
): Promise<void> {
  await setDoc(
    doc(db, 'barbeiros', uid),
    { id: uid, uid, ...semCamposIndefinidos(data), updatedAt: serverTimestamp() },
    { merge: true },
  );
  CacheService.invalidate(`barbeiro:${uid}`);
  CacheService.invalidatePrefix(PREFIXO_LISTA);
}

function invalidarCacheDoBarbeiro(uid: string): void {
  CacheService.invalidate(`barbeiro:${uid}`);
  CacheService.invalidatePrefix(PREFIXO_LISTA);
}

/**
 * `upsertBarbeiro` com detecção de conflito (DOM-01).
 *
 * Mesmo payload e MESMAS invalidações de cache do `upsertBarbeiro` — a única
 * diferença é a transação que recusa a escrita quando o documento mudou desde
 * a carga. Escrever por fora das invalidações deixaria a vitrine servindo
 * serviço/preço velho até o TTL de 2min vencer.
 *
 * O conflito invalida o cache TAMBÉM, e é proposital: quando a transação
 * recusa, está provado que o documento guardado em cache — o mesmo que gerou a
 * marca recusada — está velho. Sem invalidar, o "Recarregar" que a tela
 * oferece devolveria exatamente a mesma versão desatualizada por até 2min, e o
 * usuário ficaria preso no aviso de conflito sem saída. Erro de rede NÃO
 * invalida: ali não se provou nada sobre o servidor.
 *
 * @throws ConflitoDeVersaoError se o documento mudou desde a carga
 */
export async function upsertBarbeiroSeNaoMudou(
  uid: string,
  data: Partial<Omit<Barbeiro, 'id' | 'uid'>>,
  marcaCarregada: MarcaDeVersao,
): Promise<void> {
  try {
    await gravarBarbeiroSeNaoMudou(
      uid,
      { id: uid, uid, ...semCamposIndefinidos(data) },
      marcaCarregada,
    );
  } catch (erro) {
    if (ehConflitoDeVersao(erro)) invalidarCacheDoBarbeiro(uid);
    throw erro;
  }
  invalidarCacheDoBarbeiro(uid);
}

/**
 * Remove o barbeiro da vitrine (usado na exclusão de conta — LGPD).
 */
export async function removerBarbeiro(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'barbeiros', uid));
  } catch (error: any) {
    console.warn('Não foi possível remover da vitrine:', error?.message);
  } finally {
    CacheService.invalidate(`barbeiro:${uid}`);
    CacheService.invalidatePrefix(PREFIXO_LISTA);
  }
}
