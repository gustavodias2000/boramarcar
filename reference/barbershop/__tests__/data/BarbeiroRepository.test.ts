/**
 * BarbeiroRepository — a vitrine. É a coleção mais lida do app (toda vez que
 * o cliente volta pra Home) e por isso a única com cache em memória.
 *
 * O risco que estes testes cobrem não é o cache falhar — é o cache FUNCIONAR
 * e servir dado velho: o profissional troca o preço, salva, volta pra tela e
 * vê o valor antigo. Por isso toda escrita tem que invalidar a chave do
 * barbeiro E o prefixo da lista, inclusive quando a escrita dá erro.
 */
import { getDoc, doc, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import {
  getBarbeiro,
  upsertBarbeiro,
  removerBarbeiro,
  upsertBarbeiroSeNaoMudou,
  gravarBarbeiroSeNaoMudou,
  marcaDeVersaoBarbeiro,
  ehConflitoDeVersao,
  ConflitoDeVersaoError,
} from '../../src/data/repositories/BarbeiroRepository';
import CacheService from '../../src/services/CacheService';

const mockedGetDoc = getDoc as jest.Mock;
const mockedDoc = doc as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedRunTransaction = runTransaction as jest.Mock;

/** Dois carimbos distintos de `updatedAt`, no formato do Timestamp real. */
const CARGA = { seconds: 1_700_000_000, nanoseconds: 0 };
const OUTRO_APARELHO = { seconds: 1_700_000_042, nanoseconds: 500 };

/**
 * Firestore de mentira para as transações: um Map `path -> dados`. Se o
 * callback lançar, nada do que ele mandou gravar chega ao Map — que é
 * exatamente o que o Firestore faz, e é a garantia que DOM-01 depende.
 */
function firestoreFalsoCom(inicial: Record<string, unknown> = {}) {
  const store = new Map<string, any>(Object.entries(inicial));

  mockedRunTransaction.mockImplementation(async (_db: unknown, callback: any) => {
    const pendentes: Array<() => void> = [];
    const tx = {
      get: jest.fn(async (ref: { path: string }) => ({
        exists: () => store.has(ref.path),
        data: () => store.get(ref.path),
      })),
      set: jest.fn((ref: { path: string }, dados: any, opcoes?: { merge?: boolean }) => {
        pendentes.push(() => {
          store.set(ref.path, opcoes?.merge ? { ...store.get(ref.path), ...dados } : dados);
        });
      }),
    };
    await callback(tx);
    pendentes.forEach((aplicar) => aplicar());
  });

  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
  CacheService.clear();
  mockedDoc.mockImplementation((_db: unknown, ...p: string[]) => ({ path: p.join('/') }));
  mockedSetDoc.mockResolvedValue(undefined);
  mockedDeleteDoc.mockResolvedValue(undefined);
});

describe('getBarbeiro', () => {
  it('devolve o documento com o id embutido', async () => {
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'b1',
      data: () => ({ nome: 'João', precoBase: 50 }),
    });

    await expect(getBarbeiro('b1')).resolves.toEqual({
      id: 'b1',
      nome: 'João',
      precoBase: 50,
    });
    expect(mockedDoc).toHaveBeenCalledWith({}, 'barbeiros', 'b1');
  });

  it('devolve null quando o barbeiro não existe', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => false });
    await expect(getBarbeiro('inexistente')).resolves.toBeNull();
  });

  it('não vai ao Firestore duas vezes dentro do TTL', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => true, id: 'b1', data: () => ({ nome: 'João' }) });

    await getBarbeiro('b1');
    await getBarbeiro('b1');

    expect(mockedGetDoc).toHaveBeenCalledTimes(1);
  });

  it('cacheia por uid — barbeiros diferentes não se misturam', async () => {
    mockedGetDoc
      .mockResolvedValueOnce({ exists: () => true, id: 'b1', data: () => ({ nome: 'João' }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'b2', data: () => ({ nome: 'Ana' }) });

    expect((await getBarbeiro('b1'))?.nome).toBe('João');
    expect((await getBarbeiro('b2'))?.nome).toBe('Ana');
    expect(mockedGetDoc).toHaveBeenCalledTimes(2);
  });
});

describe('upsertBarbeiro — o dado salvo tem que aparecer na hora', () => {
  it('grava com merge e carimba id/uid no próprio documento', async () => {
    await upsertBarbeiro('b1', { nome: 'João' } as any);

    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'barbeiros/b1' }),
      expect.objectContaining({ id: 'b1', uid: 'b1', nome: 'João' }),
      { merge: true },
    );
  });

  // Achado real (reportado pelo usuário testando o app): telas como
  // ConfigAgendaScreen/BloqueiosScreen/EditarProfissionalScreen usam o
  // idioma `campo: valor.trim() || undefined` para "não gravar nada se o
  // campo ficar vazio". Sem essa limpeza, o SDK do Firestore lança
  // "Unsupported field value: undefined" assim que `setDoc` é chamado — a
  // tela mostra "Não foi possível salvar" mesmo a regra do Firestore nunca
  // chegando a ser avaliada.
  it('remove campos undefined do payload — nunca envia "undefined" explícito ao Firestore', async () => {
    await upsertBarbeiro('b1', {
      nome: 'João',
      mensagemPosAgendamento: undefined,
    } as any);

    const [, dadosGravados] = mockedSetDoc.mock.calls[0];
    expect(dadosGravados).not.toHaveProperty('mensagemPosAgendamento');
    expect(dadosGravados).toEqual(expect.objectContaining({ id: 'b1', uid: 'b1', nome: 'João' }));
  });

  it('invalida o cache do barbeiro: o próximo get busca de novo', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => true, id: 'b1', data: () => ({ precoBase: 50 }) });
    await getBarbeiro('b1');

    await upsertBarbeiro('b1', { precoBase: 70 } as any);

    mockedGetDoc.mockResolvedValue({ exists: () => true, id: 'b1', data: () => ({ precoBase: 70 }) });
    await expect(getBarbeiro('b1')).resolves.toMatchObject({ precoBase: 70 });
    expect(mockedGetDoc).toHaveBeenCalledTimes(2);
  });

  it('invalida o prefixo da vitrine (lista) além da chave individual do barbeiro', async () => {
    // `listarBarbeiros` foi removida (código morto — substituída por
    // `useBarbeariasVinculadas`/`VinculoClienteRepository`), mas o
    // `upsertBarbeiro` ainda invalida o prefixo por segurança; este teste
    // garante que a chamada de invalidação continua acontecendo.
    const spy = jest.spyOn(CacheService, 'invalidatePrefix');

    await upsertBarbeiro('b1', { nome: 'João' } as any);

    expect(spy).toHaveBeenCalledWith('barbeiros:list:');
    spy.mockRestore();
  });
});

/**
 * DOM-01 — perda silenciosa de atualização.
 *
 * ConfigServicosScreen carrega o array INTEIRO de serviços, deixa editar em
 * memória e reescreve o array inteiro. Com o tablet do balcão e o celular do
 * dono na mesma conta, o segundo a salvar apagava o trabalho do primeiro sem
 * ninguém ficar sabendo. A correção é recusar a escrita, não tentar merge:
 * quando os dois lados mudaram o PREÇO do mesmo serviço, qualquer escolha
 * automática é um chute — e chutar preço errado é pior que o bug original.
 */
describe('marcaDeVersaoBarbeiro — a identidade da versão carregada', () => {
  it('usa o `updatedAt` que toda escrita já carimba — nenhum campo novo', () => {
    expect(marcaDeVersaoBarbeiro({ updatedAt: CARGA })).toBe('1700000000.0');
  });

  it('preserva os nanossegundos: duas escritas no mesmo milissegundo são versões diferentes', () => {
    const a = marcaDeVersaoBarbeiro({ updatedAt: { seconds: 100, nanoseconds: 1_000 } });
    const b = marcaDeVersaoBarbeiro({ updatedAt: { seconds: 100, nanoseconds: 2_000 } });
    expect(a).not.toBe(b);
  });

  it('documento inexistente ou anterior ao carimbo não tem marca', () => {
    expect(marcaDeVersaoBarbeiro(null)).toBeNull();
    expect(marcaDeVersaoBarbeiro(undefined)).toBeNull();
    expect(marcaDeVersaoBarbeiro({})).toBeNull();
  });

  it('aceita as outras formas que o SDK pode devolver', () => {
    expect(marcaDeVersaoBarbeiro({ updatedAt: { toMillis: () => 4_200 } })).toBe('4200');
    expect(marcaDeVersaoBarbeiro({ updatedAt: new Date(4_200) })).toBe('4200');
  });

  it('um `serverTimestamp()` ainda pendente não vira marca', () => {
    // Sentinela de escrita, nunca aparece numa leitura — mas se aparecesse,
    // tratá-la como marca válida faria toda comparação bater por acidente.
    expect(marcaDeVersaoBarbeiro({ updatedAt: { __serverTimestamp: true } })).toBeNull();
  });
});

describe('gravarBarbeiroSeNaoMudou — concorrência otimista', () => {
  it('grava quando ninguém tocou no documento desde a carga', async () => {
    const store = firestoreFalsoCom({ 'barbeiros/b1': { nome: 'João', updatedAt: CARGA } });

    await gravarBarbeiroSeNaoMudou('b1', { servicos: [{ id: 's1' }] }, '1700000000.0');

    expect(store.get('barbeiros/b1')).toMatchObject({
      nome: 'João',
      servicos: [{ id: 's1' }],
      updatedAt: { __serverTimestamp: true },
    });
  });

  it('NÃO grava quando o documento mudou entre a carga e o salvamento', async () => {
    // O teste que prova a correção: o outro aparelho já salvou (updatedAt
    // diferente), então esta escrita — que traz o array inteiro de serviços —
    // é recusada em vez de sobrescrever o que ele gravou.
    const store = firestoreFalsoCom({
      'barbeiros/b1': { servicos: [{ id: 'do-outro-aparelho' }], updatedAt: OUTRO_APARELHO },
    });

    await expect(
      gravarBarbeiroSeNaoMudou('b1', { servicos: [{ id: 'meu' }] }, '1700000000.0'),
    ).rejects.toBeInstanceOf(ConflitoDeVersaoError);

    expect(store.get('barbeiros/b1').servicos).toEqual([{ id: 'do-outro-aparelho' }]);
  });

  it('escreve SÓ dentro da transação — nunca por um setDoc solto', async () => {
    // Um `setDoc` por fora reintroduziria o bug inteiro: a comparação de
    // versão só vale porque leitura e escrita acontecem no mesmo commit.
    firestoreFalsoCom({ 'barbeiros/b1': { updatedAt: CARGA } });

    await gravarBarbeiroSeNaoMudou('b1', { nome: 'João' }, '1700000000.0');

    expect(mockedRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it('primeiro salvamento (documento ainda não existe) passa com marca nula', async () => {
    const store = firestoreFalsoCom({});

    await gravarBarbeiroSeNaoMudou('b1', { nome: 'João' }, null);

    expect(store.get('barbeiros/b1')).toMatchObject({ nome: 'João' });
  });

  it('documento criado por outro entre a carga e o salvamento também é conflito', async () => {
    const store = firestoreFalsoCom({ 'barbeiros/b1': { nome: 'Do outro', updatedAt: CARGA } });

    await expect(
      gravarBarbeiroSeNaoMudou('b1', { nome: 'Meu' }, null),
    ).rejects.toBeInstanceOf(ConflitoDeVersaoError);

    expect(store.get('barbeiros/b1').nome).toBe('Do outro');
  });

  it('documento legado sem `updatedAt` e intocado continua salvável', async () => {
    // Não pode existir barbeiro impossível de editar só porque o documento é
    // anterior ao carimbo de updatedAt.
    const store = firestoreFalsoCom({ 'barbeiros/b1': { nome: 'Antigo' } });

    await gravarBarbeiroSeNaoMudou('b1', { nome: 'Novo' }, null);

    expect(store.get('barbeiros/b1').nome).toBe('Novo');
  });

  it('grava com merge — salvar serviços não pode apagar a agenda', async () => {
    const store = firestoreFalsoCom({
      'barbeiros/b1': { configuracaoAgenda: { abre: '09:00' }, updatedAt: CARGA },
    });

    await gravarBarbeiroSeNaoMudou('b1', { servicos: [] }, '1700000000.0');

    expect(store.get('barbeiros/b1').configuracaoAgenda).toEqual({ abre: '09:00' });
  });
});

describe('ehConflitoDeVersao', () => {
  it('reconhece o erro tipado', () => {
    expect(ehConflitoDeVersao(new ConflitoDeVersaoError('barbeiros/b1'))).toBe(true);
  });

  it('reconhece pelo `name` mesmo se o `instanceof` se perder na transpilação', () => {
    expect(ehConflitoDeVersao({ name: 'ConflitoDeVersaoError' })).toBe(true);
  });

  it('não confunde com erro de rede — esse caminho tem que continuar genérico', () => {
    expect(ehConflitoDeVersao(new Error('offline'))).toBe(false);
    expect(ehConflitoDeVersao(null)).toBe(false);
    expect(ehConflitoDeVersao(undefined)).toBe(false);
  });
});

describe('upsertBarbeiroSeNaoMudou — mesmo contrato do upsertBarbeiro', () => {
  it('carimba id/uid no documento, igual ao upsertBarbeiro', async () => {
    const store = firestoreFalsoCom({ 'barbeiros/b1': { updatedAt: CARGA } });

    await upsertBarbeiroSeNaoMudou('b1', { nome: 'João' } as any, '1700000000.0');

    expect(store.get('barbeiros/b1')).toMatchObject({ id: 'b1', uid: 'b1', nome: 'João' });
  });

  it('remove campos undefined do payload, igual ao upsertBarbeiro', async () => {
    const store = firestoreFalsoCom({ 'barbeiros/b1': { updatedAt: CARGA } });

    await upsertBarbeiroSeNaoMudou(
      'b1',
      { nome: 'João', mensagemPosAgendamento: undefined } as any,
      '1700000000.0',
    );

    expect(store.get('barbeiros/b1')).not.toHaveProperty('mensagemPosAgendamento');
  });

  it('invalida o cache do barbeiro E o prefixo da vitrine no sucesso', async () => {
    // Escrever por fora das invalidações deixaria a vitrine servindo preço
    // velho por até 2min — o cache seria o novo bug no lugar do antigo.
    firestoreFalsoCom({ 'barbeiros/b1': { updatedAt: CARGA } });
    const invalidar = jest.spyOn(CacheService, 'invalidate');
    const invalidarPrefixo = jest.spyOn(CacheService, 'invalidatePrefix');

    await upsertBarbeiroSeNaoMudou('b1', { nome: 'João' } as any, '1700000000.0');

    expect(invalidar).toHaveBeenCalledWith('barbeiro:b1');
    expect(invalidarPrefixo).toHaveBeenCalledWith('barbeiros:list:');
    invalidar.mockRestore();
    invalidarPrefixo.mockRestore();
  });

  it('no conflito TAMBÉM invalida — senão o "Recarregar" devolve a mesma versão velha', async () => {
    // A recusa prova que o documento em cache é o velho: foi ele que gerou a
    // marca recusada. Sem esta invalidação a tela oferece "Recarregar", o
    // `getBarbeiro` serve o mesmo documento do cache de 2min, e o usuário cai
    // no mesmo conflito de novo — preso, sem saída.
    firestoreFalsoCom({
      'barbeiros/b1': { nome: 'Do outro aparelho', updatedAt: OUTRO_APARELHO },
    });
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'b1',
      data: () => ({ nome: 'Do outro aparelho' }),
    });
    await getBarbeiro('b1'); // semeia o cache com a versão que a tela viu

    await expect(
      upsertBarbeiroSeNaoMudou('b1', { nome: 'Meu' } as any, '1700000000.0'),
    ).rejects.toBeInstanceOf(ConflitoDeVersaoError);

    await getBarbeiro('b1');
    expect(mockedGetDoc).toHaveBeenCalledTimes(2); // releu, não serviu do cache
  });

  it('erro de rede NÃO invalida — ali não se provou nada sobre o servidor', async () => {
    mockedRunTransaction.mockRejectedValue(new Error('offline'));
    const invalidar = jest.spyOn(CacheService, 'invalidate');

    await expect(
      upsertBarbeiroSeNaoMudou('b1', { nome: 'João' } as any, '1700000000.0'),
    ).rejects.toThrow('offline');

    expect(invalidar).not.toHaveBeenCalled();
    invalidar.mockRestore();
  });
});

describe('removerBarbeiro — usado na exclusão de conta (LGPD)', () => {
  it('apaga o documento da vitrine', async () => {
    await removerBarbeiro('b1');
    expect(mockedDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'barbeiros/b1' }),
    );
  });

  it('não lança quando o Firestore recusa — a exclusão de conta segue adiante', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedDeleteDoc.mockRejectedValue(new Error('permission-denied'));

    await expect(removerBarbeiro('b1')).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('invalida o cache MESMO quando a remoção falha', async () => {
    // Sem isso, uma falha deixaria o perfil apagado ainda visível na vitrine
    // em memória até o TTL expirar.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedGetDoc.mockResolvedValue({ exists: () => true, id: 'b1', data: () => ({ nome: 'João' }) });
    await getBarbeiro('b1');
    mockedDeleteDoc.mockRejectedValue(new Error('offline'));

    await removerBarbeiro('b1');

    await getBarbeiro('b1');
    expect(mockedGetDoc).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
