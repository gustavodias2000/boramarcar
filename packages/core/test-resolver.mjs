/**
 * Faz o Node achar `./x` quando o arquivo é `./x.ts`.
 *
 * O pacote é consumido por bundler (Next, e um dia Metro), que resolve import sem
 * extensão. O carregador ESM do Node não resolve — ele exige o caminho exato. Sem este
 * gancho a escolha seria ruim dos dois lados: ou o código-fonte ganha `.ts` em todo
 * import e o build da web quebra, ou os testes não rodam.
 *
 * Doze linhas, zero dependência. Vale menos que um runner de teste inteiro.
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      // Não é um módulo TypeScript nosso — segue o fluxo normal.
    }
  }

  return next(specifier, context);
}
