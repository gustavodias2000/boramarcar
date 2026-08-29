/**
 * CloudFunctionsClient — substituto do `httpsCallable` do SDK do Firebase.
 *
 * Diagnosticado ao vivo em dispositivo real (release build, Android): toda
 * chamada via `httpsCallable(functions, nome)(dados)` falhava em ~3ms com
 * `FirebaseError: internal`, sem nunca chegar ao servidor (confirmado nos
 * logs do Cloud Functions — nenhuma tentativa registrada). Um `fetch()`
 * manual para a MESMA URL, com o MESMO token (`auth.currentUser.getIdToken()`),
 * funcionou perfeitamente (200, resposta correta). Ou seja, o problema não é
 * rede, autenticação nem a Function em si — é o mecanismo interno do SDK que
 * junta token de auth/messaging/app-check antes do fetch (`ContextProvider`
 * em `@firebase/functions`), que falha nesse ambiente React Native
 * específico (app com `firebase` JS SDK + `@react-native-firebase/*`
 * coexistindo). Este módulo reimplementa só o necessário — POST com
 * Authorization Bearer — com a MESMA assinatura de `httpsCallable`, então
 * trocar o import em cada arquivo chamador é a única mudança necessária.
 *
 * Mesmo formato de erro do SDK original (`FirebaseError`, `.code` no formato
 * `functions/<codigo>`, `.message` em português vindo do servidor) para não
 * quebrar nenhum tratamento de erro já escrito nas telas/serviços.
 */
import { auth } from '../../firebaseConfig';

/** Mesma tabela usada pelo SDK oficial (`@firebase/functions`) para traduzir
 * o `status` da resposta HTTP em um código de erro do cliente. */
const MAPA_STATUS_PARA_CODIGO: Record<string, string> = {
  OK: 'ok',
  CANCELLED: 'cancelled',
  UNKNOWN: 'unknown',
  INVALID_ARGUMENT: 'invalid-argument',
  DEADLINE_EXCEEDED: 'deadline-exceeded',
  NOT_FOUND: 'not-found',
  ALREADY_EXISTS: 'already-exists',
  PERMISSION_DENIED: 'permission-denied',
  UNAUTHENTICATED: 'unauthenticated',
  RESOURCE_EXHAUSTED: 'resource-exhausted',
  FAILED_PRECONDITION: 'failed-precondition',
  ABORTED: 'aborted',
  OUT_OF_RANGE: 'out-of-range',
  UNIMPLEMENTED: 'unimplemented',
  INTERNAL: 'internal',
  UNAVAILABLE: 'unavailable',
  DATA_LOSS: 'data-loss',
};

export class FunctionsCallError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FirebaseError';
    this.code = code;
  }
}

interface FunctionsInstanceLike {
  region?: string;
  app?: { options?: { projectId?: string } };
}

interface HttpsCallableResult<T> {
  data: T;
}

/**
 * Mesma assinatura de `httpsCallable` do `firebase/functions`:
 * `httpsCallable(functionsInstance, nome)(dados)` → `Promise<{ data }>`.
 * `functionsInstance` só é usado para extrair `region`/`projectId` (do mesmo
 * objeto retornado por `getFunctions(app, region)`), sem depender do
 * mecanismo interno do SDK que está falhando.
 */
export function httpsCallable<TRequest = Record<string, unknown>, TResponse = unknown>(
  functionsInstance: FunctionsInstanceLike,
  nome: string,
): (dados?: TRequest) => Promise<HttpsCallableResult<TResponse>> {
  const regiao = functionsInstance?.region || 'us-central1';
  const projectId = functionsInstance?.app?.options?.projectId;

  return async (dados?: TRequest) => {
    let token: string | undefined;
    try {
      token = await auth.currentUser?.getIdToken();
    } catch {
      // Sem token: a Function decide se aceita a chamada (a maioria exige
      // autenticação e vai recusar com 'unauthenticated' — tratado abaixo).
    }

    let resposta: Response;
    try {
      resposta = await fetch(`https://${regiao}-${projectId}.cloudfunctions.net/${nome}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ data: dados ?? {} }),
      });
    } catch {
      throw new FunctionsCallError('functions/unavailable', 'Verifique sua conexão e tente novamente.');
    }

    let corpo: any = null;
    try {
      corpo = await resposta.json();
    } catch {
      // Resposta sem corpo JSON válido — tratado como erro genérico abaixo.
    }

    if (corpo?.error) {
      const codigo = MAPA_STATUS_PARA_CODIGO[corpo.error.status] ?? 'internal';
      throw new FunctionsCallError(`functions/${codigo}`, corpo.error.message || 'Erro desconhecido.');
    }
    if (!resposta.ok) {
      throw new FunctionsCallError('functions/internal', 'Erro inesperado do servidor.');
    }

    const dadosResposta = (corpo?.result ?? corpo?.data) as TResponse;
    return { data: dadosResposta };
  };
}
