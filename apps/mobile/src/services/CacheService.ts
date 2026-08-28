/**
 * CacheService — cache em memória com TTL, para reduzir leituras repetidas
 * do Firestore em consultas que mudam pouco durante a navegação normal
 * (ex.: vitrine de barbeiros, config de um barbeiro sendo vista por vários
 * clientes seguidos).
 *
 * Histórico: a AUDITORIA.md (item 2.4/3.3) encontrou um `CacheService`
 * anterior que existia, mas nunca era chamado por nenhuma tela — foi
 * removido como código morto. Esta versão nasce já conectada em
 * `BarbeiroRepository`/`NegocioRepository`, com invalidação automática em
 * toda escrita, para não repetir o mesmo erro (cache pronto e não usado) —
 * e principalmente para não introduzir dado desatualizado.
 *
 * Deliberadamente só em memória (não persiste em AsyncStorage entre
 * reinicializações do app): elimina o risco de reabrir o app e servir um
 * cache "congelado" de uma sessão anterior, o que seria pior do que não
 * cachear nada. O ganho de reduzir leituras dentro de uma mesma sessão
 * (ex.: cliente navegando entre a lista de barbeiros e a tela de
 * agendamento) já é o que mais importa em custo/latência.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class CacheService {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * Retorna o valor em cache se ainda válido (dentro do TTL); senão chama
   * `fetchFn`, guarda o resultado e retorna. `fetchFn` só é chamada em caso
   * de cache miss/expirado — nunca especulativamente.
   */
  async getOrFetch<T>(key: string, ttlMs: number, fetchFn: () => Promise<T>): Promise<T> {
    const cached = this.store.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const value = await fetchFn();
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  /** Remove uma chave específica — chamar sempre após escrever o dado correspondente. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Remove todas as chaves que começam com um prefixo (ex.: listas paginadas). */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Limpa todo o cache — usado em testes e pode ser chamado no logout. */
  clear(): void {
    this.store.clear();
  }
}

export default new CacheService();
