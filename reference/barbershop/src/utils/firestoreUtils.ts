/**
 * firestoreUtils — utilitários pequenos para lidar com peculiaridades do SDK
 * do Firestore que não são óbvias a partir de uma tela comum.
 */

/**
 * Remove do objeto qualquer chave cujo valor seja `undefined`.
 *
 * O SDK do Firestore (`setDoc`/`updateDoc`) LANÇA um erro se qualquer campo
 * do payload for `undefined` explícito ("Unsupported field value: undefined
 * (found in field X)") — diferente de `null`, que é um valor válido. Várias
 * telas usam o idioma `campo: valor.trim() || undefined` para "não grave
 * nada se o campo ficar vazio" (ex.: `ConfigAgendaScreen.tsx`,
 * `BloqueiosScreen.tsx`, `EditarProfissionalScreen.tsx`) — sem essa limpeza,
 * salvar com QUALQUER um desses campos vazio falha com "Não foi possível
 * salvar" assim que a tela chama `setDoc`, mesmo a regra do Firestore nunca
 * chegando a ser avaliada.
 *
 * Use nos repositórios, não nas telas: a tela não deveria precisar saber
 * dessa peculiaridade do SDK para usar o idioma `|| undefined` com segurança.
 */
export function semCamposIndefinidos<T extends Record<string, unknown>>(dados: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(dados).filter(([, valor]) => valor !== undefined),
  ) as Partial<T>;
}
