/**
 * consultaResiliente — utilitários para que uma consulta ao Firestore que
 * falha isoladamente não derrube a tela inteira.
 *
 * Motivação real (24/07/2026): logo depois de `firebase deploy --only
 * firestore:indexes`, o índice novo fica alguns minutos em estado
 * "Building" e QUALQUER query que dependa dele falha com
 * `failed-precondition: The query requires an index. That index is
 * currently building and cannot be used yet.`
 *
 * Como as telas de relatório buscavam agendamentos e despesas dentro de um
 * mesmo `Promise.all`, essa falha transitória de UMA consulta rejeitava o
 * lote todo (semântica fail-fast do `Promise.all`) e deixava a tela em
 * spinner infinito — mesmo com os agendamentos tendo carregado bem.
 *
 * A regra aqui é: dados secundários (despesas) degradam para um valor
 * padrão e a tela renderiza mesmo assim, avisando o usuário do que ficou
 * incompleto em vez de mostrar um erro genérico ou travar.
 */
import { registrarAviso } from '../services/ObservabilityService';

/**
 * Executa a consulta e, em caso de falha, devolve `fallback` em vez de
 * propagar o erro. Loga como aviso (não `console.error`) porque isso não é
 * um defeito da tela — é uma indisponibilidade momentânea do backend.
 *
 * `onErro` permite que a tela guarde o erro para exibir um aviso ao
 * usuário, sem abrir mão do fallback.
 */
export async function comFallback<T>(
  promessa: Promise<T>,
  fallback: T,
  contexto: string,
  onErro?: (error: unknown) => void,
): Promise<T> {
  try {
    return await promessa;
  } catch (error) {
    registrarAviso(error, { area: 'consulta', operacao: contexto }).catch(() => {});
    onErro?.(error);
    return fallback;
  }
}

/** Extrai a mensagem de um erro desconhecido sem quebrar. */
const textoDoErro = (error: unknown): string => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const e = error as { code?: unknown; message?: unknown };
  return `${typeof e.code === 'string' ? e.code : ''} ${typeof e.message === 'string' ? e.message : ''}`;
};

/**
 * true quando o erro é o clássico "índice composto ainda não está pronto"
 * do Firestore — situação transitória que se resolve sozinha em minutos,
 * sem precisar de novo deploy nem de rebuild do app.
 */
export function ehIndiceIndisponivel(error: unknown): boolean {
  const texto = textoDoErro(error).toLowerCase();
  return (
    texto.includes('failed-precondition') ||
    texto.includes('requires an index') ||
    texto.includes('currently building')
  );
}

/** true quando o Firestore recusou por regra de segurança. */
export function ehPermissaoNegada(error: unknown): boolean {
  const texto = textoDoErro(error).toLowerCase();
  return texto.includes('permission-denied') || texto.includes('missing or insufficient permissions');
}

/**
 * Mensagem curta e acionável para mostrar ao barbeiro, em português, a
 * partir de um erro de consulta. Nunca vaza o texto técnico do Firebase.
 */
export function mensagemErroConsulta(error: unknown): string {
  if (ehIndiceIndisponivel(error)) {
    return 'O banco de dados ainda está preparando este relatório (leva alguns minutos após a atualização). Tente de novo em instantes.';
  }
  if (ehPermissaoNegada(error)) {
    return 'Sem permissão para ler estes dados. Se você acabou de atualizar o app, saia e entre na conta novamente.';
  }
  return 'Não foi possível carregar agora. Verifique sua conexão e tente de novo.';
}
