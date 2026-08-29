/**
 * Telemetria de erros sem dados pessoais. Em producao, os eventos sao enviados
 * para uma Callable Function; em desenvolvimento o console continua util para
 * depuracao local. Nunca envie email, telefone, token, mensagem do cliente ou
 * payload de provedor neste canal.
 *
 * Sanitização (redação de conteúdo, limite de profundidade/campos/tamanho,
 * proteção contra referência circular) vive em `../utils/sanitizacao.ts` —
 * este arquivo só monta o evento e decide o que logar localmente em DEV.
 */
import { httpsCallable } from './CloudFunctionsClient';
import { functions } from '../../firebaseConfig';
import { sanitizarProfundo, textoSanitizado } from '../utils/sanitizacao';

export type NivelObservabilidade = 'warning' | 'error' | 'fatal';

/**
 * Valor de um campo de contexto: primitivo, `Error`, ou estruturas
 * aninhadas (array/objeto) desses mesmos tipos — tudo passa por
 * `sanitizarProfundo` antes de sair do app, então não precisa ficar restrito
 * a primitivos de nível superior.
 */
export type ValorContexto =
  | string
  | number
  | boolean
  | null
  | undefined
  | Error
  | ValorContexto[]
  | { [chave: string]: ValorContexto };

export interface ContextoObservabilidade {
  area?: string;
  operacao?: string;
  codigo?: string;
  [chave: string]: ValorContexto;
}

export async function registrarEvento(
  nivel: NivelObservabilidade,
  erro: unknown,
  contexto: ContextoObservabilidade = {},
): Promise<void> {
  const evento = {
    nivel,
    mensagem: textoSanitizado(erro),
    contexto: (sanitizarProfundo(contexto) ?? {}) as Record<string, unknown>,
  };

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // Diagnostico local; a versao enviada ao servidor continua sanitizada.
    console[nivel === 'warning' ? 'warn' : 'error']('[observabilidade]', evento);
  }

  try {
    await httpsCallable(functions, 'registrarEventoOperacional')(evento);
  } catch {
    // Telemetria nunca pode quebrar o fluxo principal nem gerar loop de erros.
  }
}

export const registrarErro = (
  erro: unknown,
  contexto?: ContextoObservabilidade,
): Promise<void> => registrarEvento('error', erro, contexto);

export const registrarAviso = (
  erro: unknown,
  contexto?: ContextoObservabilidade,
): Promise<void> => registrarEvento('warning', erro, contexto);
