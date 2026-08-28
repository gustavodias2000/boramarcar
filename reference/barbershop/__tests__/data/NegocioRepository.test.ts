/**
 * Teste de regressão do bug crítico da sessão 23/07/2026: `getNegocioPorDono`
 * derrubava Agenda/Equipe/Comissões/Cadastrar Profissional para TODO
 * barbeiro porque fazia uma QUERY (`where donoUid == uid`) em `negocios`,
 * que o Firestore não consegue autorizar para listas (só para `get()` por
 * ID conhecido) — ver firestore.rules e NegocioRepository.ts para o
 * histórico completo.
 *
 * A correção trocou a query por dois `get()` simples: primeiro busca
 * `barbeiros/{uid}.negocioId` (denormalizado), depois `negocios/{negocioId}`
 * por ID. Este teste existe especificamente para impedir que alguém
 * reintroduza a query antiga sem perceber a regressão — se `query`/`where`
 * voltarem a ser chamados aqui, o teste falha.
 */
import {
  getDoc, query, where, getDocs, doc, setDoc, addDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import {
  getNegocioPorDono,
  getNegocioIdDoDono,
  listarProfissionaisDoNegocio,
  atualizarProfissional,
  definirAtivoProfissional,
  criarProfissional,
  criarNegocio,
} from '../../src/data/repositories/NegocioRepository';
import CacheService from '../../src/services/CacheService';
import { httpsCallable } from '../../src/services/CloudFunctionsClient';
import { registrarAviso } from '../../src/services/ObservabilityService';

// Release B1: `criarNegocio` passou a disparar a callable
// `carimbarAgendamentosDoNovoNegocio`. Mockado aqui (e não deixado no
// cliente real) por dois motivos: o cliente real faria `fetch` de verdade em
// TODO teste que cria negócio — lento e não determinístico —, e o teste
// precisa controlar a falha da chamada para provar que ela não derruba a
// criação do negócio.
jest.mock('../../src/services/CloudFunctionsClient', () => ({
  httpsCallable: jest.fn(),
}));
// `registrarAviso` sai por outra Callable (registrarEventoOperacional); aqui
// interessa só QUE ele foi chamado, com que contexto e em que nível.
jest.mock('../../src/services/ObservabilityService', () => ({
  registrarAviso: jest.fn(() => Promise.resolve()),
  registrarErro: jest.fn(() => Promise.resolve()),
}));

const mockedHttpsCallable = httpsCallable as jest.Mock;
const mockedRegistrarAviso = registrarAviso as jest.Mock;
const chamadaDaCallable = jest.fn();

const mockedGetDoc = getDoc as jest.Mock;
const mockedQuery = query as jest.Mock;
const mockedWhere = where as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedDoc = doc as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;
const mockedAddDoc = addDoc as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedWriteBatch = writeBatch as jest.Mock;

describe('getNegocioPorDono — regressão do bug de permission-denied', () => {
  beforeEach(() => {
    CacheService.clear();
    jest.clearAllMocks();
  });

  it('busca via dois get() por ID (barbeiro -> negocioId -> negocio), nunca via query/where', async () => {
    mockedGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        id: 'dono-uid',
        data: () => ({ nome: 'João', negocioId: 'negocio-1' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        id: 'negocio-1',
        data: () => ({ donoUid: 'dono-uid', nome: 'Barbearia do João' }),
      });

    const negocio = await getNegocioPorDono('dono-uid');

    expect(negocio).toEqual({ id: 'negocio-1', donoUid: 'dono-uid', nome: 'Barbearia do João' });
    expect(mockedGetDoc).toHaveBeenCalledTimes(2);
    // A regressão que causou o bug era exatamente isto: uma query de lista
    // em `negocios`. Se voltar a acontecer, este teste denuncia.
    expect(mockedQuery).not.toHaveBeenCalled();
    expect(mockedWhere).not.toHaveBeenCalled();
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('retorna null sem tocar o Firestore quando não há uid', async () => {
    const negocio = await getNegocioPorDono(null);
    expect(negocio).toBeNull();
    expect(mockedGetDoc).not.toHaveBeenCalled();
  });

  it('retorna null quando o barbeiro não tem negocioId (profissional solo)', async () => {
    mockedGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'solo-uid',
      data: () => ({ nome: 'Barbeiro Solo' }), // sem negocioId
    });

    const negocio = await getNegocioPorDono('solo-uid');

    expect(negocio).toBeNull();
    // Não deveria nem tentar buscar o negócio se não há negocioId.
    expect(mockedGetDoc).toHaveBeenCalledTimes(1);
  });
});

/**
 * PERF (Onda 4): `getNegocioIdDoDono` existe para NÃO ler `negocios/{id}`.
 *
 * Sete das oito telas que chamavam `getNegocioPorDono` usavam exclusivamente
 * `negocio.id` — e esse id já vem denormalizado no doc do barbeiro
 * (`criarNegocio` grava `negocioId`/`negocioNome` via `upsertBarbeiro`), que
 * já está cacheado por `getBarbeiro`. A segunda leitura era descartada.
 *
 * O custo não era 1 leitura, era ~2: a regra de `negocios/{id}` avalia
 * `isDonoDoNegocio(negocioId)`, que faz `exists()` + `get()` na subcoleção
 * `membros`, e access calls de regra são cobradas como leitura.
 *
 * A asserção central destes testes é NEGATIVA — nenhum toque na coleção
 * `negocios`. Se alguém "simplificar" isto de volta para
 * `(await getNegocioPorDono(uid))?.id`, o ganho evapora em silêncio (o valor
 * de retorno seria idêntico) e só este teste denuncia.
 */
describe('getNegocioIdDoDono — resolve o negócio sem ler `negocios/{id}`', () => {
  /** Toda coleção citada em qualquer chamada a `doc(db, ...)`. */
  const colecoesTocadas = () =>
    mockedDoc.mock.calls.map((args: unknown[]) => args[1]);

  beforeEach(() => {
    CacheService.clear();
    jest.clearAllMocks();
    mockedDoc.mockImplementation((...args: unknown[]) => ({
      path: args.filter((a) => typeof a === 'string').join('/'),
    }));
  });

  it('devolve o negocioId com UMA leitura, e nunca na coleção `negocios`', async () => {
    mockedGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'dono-uid',
      data: () => ({ nome: 'João', negocioId: 'negocio-1', negocioNome: 'Barbearia do João' }),
    });

    const negocioId = await getNegocioIdDoDono('dono-uid');

    expect(negocioId).toBe('negocio-1');
    // Uma leitura só — a do doc do barbeiro, que o cache de `getBarbeiro`
    // costuma já ter quente quando a tela abre.
    expect(mockedGetDoc).toHaveBeenCalledTimes(1);
    expect(colecoesTocadas()).toEqual(['barbeiros']);
    expect(colecoesTocadas()).not.toContain('negocios');
  });

  it('devolve o MESMO id que `getNegocioPorDono` devolveria, com metade das leituras', async () => {
    // Prova que a troca é equivalente para quem só quer o id: mesmo doc de
    // barbeiro, mesma resposta, sem a segunda ida à rede.
    mockedGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        id: 'dono-uid',
        data: () => ({ negocioId: 'negocio-1' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        id: 'negocio-1',
        data: () => ({ donoUid: 'dono-uid', nome: 'Barbearia do João' }),
      });

    const completo = await getNegocioPorDono('dono-uid');
    const leiturasDoCompleto = mockedGetDoc.mock.calls.length;

    CacheService.clear();
    mockedGetDoc.mockClear();
    mockedGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'dono-uid',
      data: () => ({ negocioId: 'negocio-1' }),
    });

    const soId = await getNegocioIdDoDono('dono-uid');

    expect(soId).toBe(completo?.id);
    expect(leiturasDoCompleto).toBe(2);
    expect(mockedGetDoc).toHaveBeenCalledTimes(1);
  });

  it('retorna null quando o barbeiro não tem negocioId (profissional solo)', async () => {
    mockedGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'solo-uid',
      data: () => ({ nome: 'Barbeiro Solo' }), // sem negocioId
    });

    expect(await getNegocioIdDoDono('solo-uid')).toBeNull();
    expect(colecoesTocadas()).not.toContain('negocios');
  });

  it('retorna null quando o doc do barbeiro nem existe', async () => {
    mockedGetDoc.mockResolvedValueOnce({ exists: () => false });

    expect(await getNegocioIdDoDono('fantasma')).toBeNull();
  });

  it('retorna null sem tocar o Firestore quando não há uid', async () => {
    expect(await getNegocioIdDoDono(null)).toBeNull();
    expect(await getNegocioIdDoDono(undefined)).toBeNull();
    expect(await getNegocioIdDoDono('')).toBeNull();
    expect(mockedGetDoc).not.toHaveBeenCalled();
  });

  it('herda o cache de `getBarbeiro` — dois focos seguidos, uma leitura só', async () => {
    // Nenhuma chave de cache nova foi criada: a invalidação continua sendo a
    // que `upsertBarbeiro`/`atualizarProfissional` já fazem em
    // `barbeiro:{uid}`.
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'dono-uid',
      data: () => ({ negocioId: 'negocio-1' }),
    });

    await getNegocioIdDoDono('dono-uid');
    await getNegocioIdDoDono('dono-uid');

    expect(mockedGetDoc).toHaveBeenCalledTimes(1);
  });

  it('donos diferentes não compartilham resposta — isolamento multi-tenant', async () => {
    mockedGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        id: 'dono-A',
        data: () => ({ negocioId: 'negocio-A' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        id: 'dono-B',
        data: () => ({ negocioId: 'negocio-B' }),
      });

    expect(await getNegocioIdDoDono('dono-A')).toBe('negocio-A');
    expect(await getNegocioIdDoDono('dono-B')).toBe('negocio-B');
  });
});

/**
 * COST-004 (auditoria — Onda 2): `listarProfissionaisDoNegocio` não tinha
 * cache, diferente do resto do repositório (ver `getBarbeiro` em
 * BarbeiroRepository.ts, mesmo padrão usado aqui). Estes testes cobrem
 * acerto de cache, isolamento entre negócios (nunca compartilhar cache
 * entre tenants), expiração por TTL e invalidação em todo ponto que altera
 * um profissional (`criarProfissional`, `atualizarProfissional`,
 * `definirAtivoProfissional`).
 */
describe('listarProfissionaisDoNegocio — cache (COST-004)', () => {
  beforeEach(() => {
    CacheService.clear();
    jest.clearAllMocks();
  });

  it('não busca no Firestore duas vezes dentro do TTL (cache hit)', async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [{ id: 'p1', data: () => ({ nome: 'Ana' }) }],
    });

    const a = await listarProfissionaisDoNegocio('negocio-1');
    const b = await listarProfissionaisDoNegocio('negocio-1');

    expect(a).toEqual([{ id: 'p1', nome: 'Ana' }]);
    expect(b).toEqual([{ id: 'p1', nome: 'Ana' }]);
    expect(mockedGetDocs).toHaveBeenCalledTimes(1);
  });

  it('negócios diferentes não compartilham cache — isolamento multi-tenant', async () => {
    mockedGetDocs
      .mockResolvedValueOnce({ docs: [{ id: 'p1', data: () => ({ nome: 'Ana' }) }] })
      .mockResolvedValueOnce({ docs: [{ id: 'p2', data: () => ({ nome: 'Bruno' }) }] });

    const negocioA = await listarProfissionaisDoNegocio('negocio-A');
    const negocioB = await listarProfissionaisDoNegocio('negocio-B');

    expect(negocioA).toEqual([{ id: 'p1', nome: 'Ana' }]);
    expect(negocioB).toEqual([{ id: 'p2', nome: 'Bruno' }]);
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);

    // Reler o negócio A não deve tocar o Firestore de novo (cache dele
    // intacto, não foi afetado pela leitura do negócio B).
    await listarProfissionaisDoNegocio('negocio-A');
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });

  it('busca de novo depois que o TTL (2min) expira', async () => {
    jest.useFakeTimers();
    try {
      mockedGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'p1', data: () => ({ nome: 'Ana' }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'p1', data: () => ({ nome: 'Ana (editada por fora do cache)' }) }] });

      const antes = await listarProfissionaisDoNegocio('negocio-1');
      jest.advanceTimersByTime(2 * 60 * 1000 + 1);
      const depois = await listarProfissionaisDoNegocio('negocio-1');

      expect(antes[0].nome).toBe('Ana');
      expect(depois[0].nome).toBe('Ana (editada por fora do cache)');
      expect(mockedGetDocs).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('atualizarProfissional invalida a lista cacheada do negócio (negocioId vindo de `dados`)', async () => {
    mockedGetDocs.mockResolvedValue({ docs: [{ id: 'p1', data: () => ({ nome: 'Ana' }) }] });
    await listarProfissionaisDoNegocio('negocio-1');
    expect(mockedGetDocs).toHaveBeenCalledTimes(1);

    mockedDoc.mockReturnValue({ path: 'barbeiros/p1' });
    mockedSetDoc.mockResolvedValue(undefined);
    await atualizarProfissional('p1', { nome: 'Ana Paula', negocioId: 'negocio-1' } as any);

    mockedGetDocs.mockResolvedValue({ docs: [{ id: 'p1', data: () => ({ nome: 'Ana Paula' }) }] });
    const depois = await listarProfissionaisDoNegocio('negocio-1');

    expect(depois[0].nome).toBe('Ana Paula');
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });

  it('atualizarProfissional descobre o negocioId via getBarbeiro quando `dados` não o inclui', async () => {
    // A maioria das telas (agenda, serviços, bloqueios, folgas) só edita
    // outros campos, sem passar `negocioId` — atualizarProfissional precisa
    // descobrir sozinho em qual negócio invalidar a lista.
    mockedGetDocs.mockResolvedValue({ docs: [{ id: 'p1', data: () => ({ nome: 'Ana' }) }] });
    await listarProfissionaisDoNegocio('negocio-1');

    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'p1',
      data: () => ({ negocioId: 'negocio-1' }),
    });
    mockedDoc.mockReturnValue({ path: 'barbeiros/p1' });
    mockedSetDoc.mockResolvedValue(undefined);
    await atualizarProfissional('p1', { especialidade: 'Barba' } as any); // sem negocioId

    mockedGetDocs.mockResolvedValue({
      docs: [{ id: 'p1', data: () => ({ nome: 'Ana', especialidade: 'Barba' }) }],
    });
    const depois = await listarProfissionaisDoNegocio('negocio-1');

    expect(depois[0].especialidade).toBe('Barba');
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });

  it('não quebra quando o profissional não é encontrado por getBarbeiro (segue sem invalidar cache de negócio)', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => false });
    mockedDoc.mockReturnValue({ path: 'barbeiros/orfao' });
    mockedSetDoc.mockResolvedValue(undefined);

    await expect(atualizarProfissional('orfao', { nome: 'X' } as any)).resolves.toBeUndefined();
  });

  it('definirAtivoProfissional invalida a lista cacheada do negócio (via writeBatch)', async () => {
    mockedGetDocs.mockResolvedValue({ docs: [{ id: 'p1', data: () => ({ nome: 'Ana', ativo: true }) }] });
    await listarProfissionaisDoNegocio('negocio-1');

    mockedDoc.mockReturnValue({ path: 'negocios/negocio-1/membros/p1' });
    const batch = { set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) };
    mockedWriteBatch.mockReturnValue(batch);
    await definirAtivoProfissional('negocio-1', 'p1', false);

    // As duas escritas (membro privado + doc público) entram no MESMO batch.
    expect(batch.set).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalledTimes(1);

    mockedGetDocs.mockResolvedValue({ docs: [{ id: 'p1', data: () => ({ nome: 'Ana', ativo: false }) }] });
    const depois = await listarProfissionaisDoNegocio('negocio-1');

    expect(depois[0].ativo).toBe(false);
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
    // Não deveria ter precisado de getDoc para descobrir o negocioId — já
    // veio como parâmetro.
    expect(mockedGetDoc).not.toHaveBeenCalled();
  });

  it('criarProfissional invalida a lista cacheada do negócio (via writeBatch)', async () => {
    mockedDoc.mockImplementation((...args: unknown[]) => {
      if (args.length === 1) return { id: 'novo-id', path: 'barbeiros/novo-id' };
      return { id: args[args.length - 1], path: args.filter((a) => typeof a === 'string').join('/') };
    });
    mockedGetDoc.mockResolvedValue({ exists: () => false }); // getNegocio(negocioId) -> null
    const batch = { set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) };
    mockedWriteBatch.mockReturnValue(batch);

    mockedGetDocs.mockResolvedValue({ docs: [{ id: 'p1', data: () => ({ nome: 'Ana' }) }] });
    await listarProfissionaisDoNegocio('negocio-1');
    expect(mockedGetDocs).toHaveBeenCalledTimes(1);

    await criarProfissional('negocio-1', { nome: 'Bruno' });

    expect(batch.set).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalledTimes(1);

    mockedGetDocs.mockResolvedValue({
      docs: [
        { id: 'p1', data: () => ({ nome: 'Ana' }) },
        { id: 'novo-id', data: () => ({ nome: 'Bruno' }) },
      ],
    });
    const depois = await listarProfissionaisDoNegocio('negocio-1');

    expect(depois).toHaveLength(2);
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });
});

/**
 * DB-03 (Lote B): `criarNegocio` compensa o negócio órfão se a escrita do
 * membro-dono falhar — não pode ser um writeBatch (ver comentário no código
 * de produção: get() dentro de regra de segurança não enxerga escritas
 * pendentes do mesmo batch), então as duas escritas são sequenciais e a
 * segunda precisa de tratamento de erro manual.
 */
describe('criarNegocio — compensação quando a escrita do membro-dono falha (DB-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cria o negócio e o membro-dono no caminho feliz, sem apagar nada', async () => {
    mockedAddDoc.mockResolvedValue({ id: 'negocio-1' });
    mockedDoc.mockReturnValue({ path: 'negocios/negocio-1/membros/dono-uid' });
    mockedSetDoc.mockResolvedValue(undefined);

    const negocio = await criarNegocio('dono-uid', 'Barbearia do João');

    expect(negocio).toEqual({ id: 'negocio-1', donoUid: 'dono-uid', nome: 'Barbearia do João' });
    expect(mockedDeleteDoc).not.toHaveBeenCalled();
  });

  it('apaga o negócio recém-criado se a escrita do membro-dono falhar, e propaga o erro original', async () => {
    const negocioDocRef = { id: 'negocio-orfao' };
    mockedAddDoc.mockResolvedValue(negocioDocRef);
    mockedDoc.mockReturnValue({ path: 'negocios/negocio-orfao/membros/dono-uid' });
    const erroOriginal = new Error('permission-denied');
    mockedSetDoc.mockRejectedValue(erroOriginal);
    mockedDeleteDoc.mockResolvedValue(undefined);

    await expect(criarNegocio('dono-uid', 'Barbearia do João')).rejects.toBe(erroOriginal);

    // Apaga exatamente o ref do negócio recém-criado (não o ref do membro).
    expect(mockedDeleteDoc).toHaveBeenCalledWith(negocioDocRef);
  });

  it('não deixa a falha de compensação (deleteDoc) mascarar o erro original', async () => {
    mockedAddDoc.mockResolvedValue({ id: 'negocio-orfao' });
    mockedDoc.mockReturnValue({ path: 'negocios/negocio-orfao/membros/dono-uid' });
    const erroOriginal = new Error('permission-denied');
    mockedSetDoc.mockRejectedValue(erroOriginal);
    mockedDeleteDoc.mockRejectedValue(new Error('falha ao apagar'));

    await expect(criarNegocio('dono-uid', 'Barbearia do João')).rejects.toBe(erroOriginal);
  });

  /**
   * Red Team, `FURO L` (Onda 2, avaliado na Onda 4): "a compensação apaga o
   * negócio mas nada limpa `barbeiros/{dono}.negocioId`, que pode ficar
   * apontando para um negócio inexistente".
   *
   * O furo foi AVALIADO e recusado, porque a premissa é falsa — e o que a
   * torna falsa é exclusivamente a ORDEM das três escritas de `criarNegocio`:
   *
   *   1. addDoc(negocios)                    → id novo, ainda só em memória
   *   2. setDoc(membros/{dono})              → se falhar: deleteDoc(1) e throw
   *   3. upsertBarbeiro(dono, {negocioId})   → só chega aqui se 2 deu certo
   *
   * O id do passo 1 não é gravado em lugar nenhum antes do passo 3. Logo, no
   * caminho da compensação o `deleteDoc` apaga um id que ninguém referencia.
   * Os dois testes abaixo travam essa ordem: se alguém mover o
   * `upsertBarbeiro` para antes da escrita do membro — a mudança que
   * transformaria o `FURO L` em furo de verdade — eles quebram.
   *
   * O lado das regras está em rules/redteam-onda2.test.js, no
   * `comportamento conhecido:` do describe da compensação.
   */
  it('NÃO grava negocioId no doc do barbeiro quando a escrita do membro falha (o que impede o órfão do FURO L)', async () => {
    mockedAddDoc.mockResolvedValue({ id: 'negocio-que-sera-apagado' });
    mockedDoc.mockReturnValue({ path: 'negocios/negocio-que-sera-apagado/membros/dono-uid' });
    mockedSetDoc.mockRejectedValue(new Error('permission-denied'));
    mockedDeleteDoc.mockResolvedValue(undefined);

    await expect(criarNegocio('dono-uid', 'Barbearia do João')).rejects.toThrow('permission-denied');

    // Uma única escrita foi TENTADA: a do membro. `upsertBarbeiro` (passo 3)
    // nunca roda, então nenhum `negocioId` chega ao doc do barbeiro.
    expect(mockedSetDoc).toHaveBeenCalledTimes(1);
    const payloadsComNegocioId = mockedSetDoc.mock.calls.filter(
      ([, dados]) => dados && 'negocioId' in dados,
    );
    expect(payloadsComNegocioId).toHaveLength(0);
  });

  it('só grava negocioId no doc do barbeiro DEPOIS que o membro-dono foi criado, e com o id do negócio que sobreviveu', async () => {
    mockedAddDoc.mockResolvedValue({ id: 'negocio-1' });
    mockedDoc.mockReturnValue({ path: 'qualquer' });
    mockedSetDoc.mockResolvedValue(undefined);

    await criarNegocio('dono-uid', 'Barbearia do João');

    // Ordem: [0] membro-dono, [1] doc do barbeiro (via upsertBarbeiro).
    expect(mockedSetDoc).toHaveBeenCalledTimes(2);
    expect(mockedSetDoc.mock.calls[0][1]).toMatchObject({
      barbeiroId: 'dono-uid',
      papel: 'dono',
    });
    expect(mockedSetDoc.mock.calls[0][1]).not.toHaveProperty('negocioId');
    expect(mockedSetDoc.mock.calls[1][1]).toMatchObject({
      uid: 'dono-uid',
      negocioId: 'negocio-1',
      negocioNome: 'Barbearia do João',
    });
    expect(mockedDeleteDoc).not.toHaveBeenCalled();
  });
});

/**
 * Release B1 — `criarNegocio` dispara `carimbarAgendamentosDoNovoNegocio`.
 *
 * POR QUE ISTO EXISTE. `negocioId` é denormalizado no agendamento no momento
 * da criação (functions/index.js). `criarNegocio` é o ÚNICO ponto do app em
 * que um barbeiro existente passa de sem-`negocioId` para com-`negocioId` —
 * ou seja, é a torneira que abre o buraco: todo atendimento anterior daquele
 * dono fica sem o campo, e é por isso que
 * `listarDoEscopoFinanceiroPorPeriodo` precisa consultar duas fontes e
 * deduplicar por id (o que impede trocar as telas de dinheiro por agregação
 * server-side). Um backfill único fecharia o passado e deixaria o futuro
 * aberto; a chamada testada aqui é o que fecha o futuro.
 *
 * Os dois invariantes travados abaixo:
 *  1. a callable é chamada DEPOIS do `upsertBarbeiro` — a Function lê
 *     `barbeiros/{dono}.negocioId` para provar que o carimbo é o correto e
 *     recusa com `failed-precondition` se for chamada antes;
 *  2. falha da callable NÃO derruba `criarNegocio` — o negócio já existe, já
 *     tem membro-dono e já está denormalizado; está válido. O carimbo é
 *     otimização de leitura, e o job agendado pega o que sobrar.
 */
describe('criarNegocio — carimbo dos agendamentos antigos (Release B1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAddDoc.mockResolvedValue({ id: 'negocio-1' });
    mockedDoc.mockReturnValue({ path: 'qualquer' });
    mockedSetDoc.mockResolvedValue(undefined);
    mockedHttpsCallable.mockReturnValue(chamadaDaCallable);
    chamadaDaCallable.mockResolvedValue({ data: { carimbados: 7 } });
  });

  it('chama a callable com o id do negócio recém-criado', async () => {
    await criarNegocio('dono-uid', 'Barbearia do João');

    expect(mockedHttpsCallable).toHaveBeenCalledWith(
      expect.anything(),
      'carimbarAgendamentosDoNovoNegocio',
    );
    expect(chamadaDaCallable).toHaveBeenCalledWith({ negocioId: 'negocio-1' });
  });

  it('chama a callable DEPOIS de gravar o negocioId no doc do barbeiro', async () => {
    // A ordem é o contrato: a Function LÊ `barbeiros/{dono}.negocioId` para
    // provar que o carimbo é o correto. Invertida, ela recusaria a chamada
    // toda vez e o carimbo nunca aconteceria.
    const ordem: string[] = [];
    mockedSetDoc.mockImplementation(async (_ref: unknown, dados: Record<string, unknown>) => {
      ordem.push('negocioId' in dados ? 'upsertBarbeiro' : 'membro');
    });
    chamadaDaCallable.mockImplementation(async () => {
      ordem.push('callable');
      return { data: { carimbados: 0 } };
    });

    await criarNegocio('dono-uid', 'Barbearia do João');

    expect(ordem).toEqual(['membro', 'upsertBarbeiro', 'callable']);
  });

  it('NÃO derruba a criação do negócio quando a callable falha', async () => {
    chamadaDaCallable.mockRejectedValue(new Error('functions/unavailable'));

    // O negócio criado continua sendo devolvido normalmente — quem chamou não
    // tem por que ver um erro de uma otimização de leitura.
    await expect(criarNegocio('dono-uid', 'Barbearia do João')).resolves.toEqual({
      id: 'negocio-1',
      donoUid: 'dono-uid',
      nome: 'Barbearia do João',
    });
    // E não compensa (não apaga) nada: o negócio é válido.
    expect(mockedDeleteDoc).not.toHaveBeenCalled();
  });

  it('registra aviso — não erro — quando a callable falha', async () => {
    // `warning`, não `error`: `alertarFalhasOperacionais` manda email a partir
    // de 5 eventos `error` em 15 minutos, e um carimbo adiado para o job da
    // madrugada não é incidente.
    const erro = new Error('functions/unavailable');
    chamadaDaCallable.mockRejectedValue(erro);

    await criarNegocio('dono-uid', 'Barbearia do João');

    expect(mockedRegistrarAviso).toHaveBeenCalledWith(erro, {
      area: 'negocio',
      operacao: 'carimbar-agendamentos-do-novo-negocio',
      negocioId: 'negocio-1',
    });
  });

  it('não chama a callable quando a criação do negócio nem chegou ao fim', async () => {
    // Membro-dono falhou: o negócio é apagado pela compensação (DB-03) e não
    // existe mais nada para carimbar.
    mockedSetDoc.mockRejectedValue(new Error('permission-denied'));
    mockedDeleteDoc.mockResolvedValue(undefined);

    await expect(criarNegocio('dono-uid', 'Barbearia')).rejects.toThrow('permission-denied');

    expect(chamadaDaCallable).not.toHaveBeenCalled();
  });
});
