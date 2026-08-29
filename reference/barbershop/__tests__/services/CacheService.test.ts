/**
 * CacheService é o item revivido da AUDITORIA.md (2.4/3.3): existia antes,
 * nunca foi usado, foi removido como código morto. Agora está conectado em
 * BarbeiroRepository/NegocioRepository — estes testes garantem o contrato
 * (hit dentro do TTL, miss depois de expirar, invalidação em escrita) pra
 * não reintroduzir o mesmo problema (ou pior: servir dado desatualizado).
 */
import CacheService from '../../src/services/CacheService';

describe('CacheService', () => {
  beforeEach(() => {
    CacheService.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('chama fetchFn só uma vez para chamadas repetidas dentro do TTL (cache hit)', async () => {
    const fetchFn = jest.fn().mockResolvedValue('valor');

    const a = await CacheService.getOrFetch('chave', 5000, fetchFn);
    const b = await CacheService.getOrFetch('chave', 5000, fetchFn);

    expect(a).toBe('valor');
    expect(b).toBe('valor');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('busca de novo depois que o TTL expira (cache miss)', async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce('primeiro').mockResolvedValueOnce('segundo');

    const a = await CacheService.getOrFetch('chave', 1000, fetchFn);
    jest.advanceTimersByTime(1001);
    const b = await CacheService.getOrFetch('chave', 1000, fetchFn);

    expect(a).toBe('primeiro');
    expect(b).toBe('segundo');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('invalidate() força um novo fetch mesmo dentro do TTL — é isso que evita dado desatualizado após um save', async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce('antigo').mockResolvedValueOnce('novo');

    await CacheService.getOrFetch('barbeiro:uid1', 60000, fetchFn);
    CacheService.invalidate('barbeiro:uid1');
    const resultado = await CacheService.getOrFetch('barbeiro:uid1', 60000, fetchFn);

    expect(resultado).toBe('novo');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('invalidatePrefix() limpa só as chaves que começam com o prefixo', async () => {
    await CacheService.getOrFetch('barbeiros:list:50', 60000, async () => ['a']);
    await CacheService.getOrFetch('barbeiro:uid1', 60000, async () => 'x');

    CacheService.invalidatePrefix('barbeiros:list:');

    const listaFetch = jest.fn().mockResolvedValue(['b']);
    const individualFetch = jest.fn().mockResolvedValue('x');

    await CacheService.getOrFetch('barbeiros:list:50', 60000, listaFetch);
    await CacheService.getOrFetch('barbeiro:uid1', 60000, individualFetch);

    expect(listaFetch).toHaveBeenCalledTimes(1); // foi invalidado, buscou de novo
    expect(individualFetch).not.toHaveBeenCalled(); // não foi afetado, continuou em cache
  });

  it('chaves diferentes não colidem entre si', async () => {
    await CacheService.getOrFetch('barbeiro:uid1', 60000, async () => 'valor-1');
    await CacheService.getOrFetch('barbeiro:uid2', 60000, async () => 'valor-2');

    const fetchFn1 = jest.fn().mockResolvedValue('novo-1');
    const resultado = await CacheService.getOrFetch('barbeiro:uid1', 60000, fetchFn1);

    expect(resultado).toBe('valor-1');
    expect(fetchFn1).not.toHaveBeenCalled();
  });
});
