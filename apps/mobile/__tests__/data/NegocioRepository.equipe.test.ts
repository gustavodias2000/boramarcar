/**
 * NegocioRepository — o modelo de equipe (dono + profissionais sem login).
 *
 * O detalhe que faz este arquivo existir: profissionais criados pelo dono
 * (Opção A do plano) NÃO têm conta no Firebase Auth. O id do documento
 * `barbeiros/{id}` é gerado pelo Firestore e não corresponde a uid nenhum.
 * Por isso este repositório escreve direto em `barbeiros/{id}` em vez de usar
 * `upsertBarbeiro` — que sempre grava `uid: id` e criaria um uid falso, com
 * duas consequências práticas: as regras passariam a comparar um uid que não
 * existe, e o dono perderia a permissão de editar o próprio profissional.
 *
 * O outro risco coberto aqui é o cache: a vitrine do cliente lê de
 * `barbeiros:list:*`. Toda escrita feita por fora do BarbeiroRepository tem
 * que invalidar essas chaves, senão o profissional recém-cadastrado (ou
 * recém-desativado) continua aparecendo errado até o TTL expirar.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  writeBatch,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import {
  atualizarProfissional,
  atualizarProfissionalSeNaoMudou,
  getNegocio,
  criarNegocio,
  listarMembros,
  getMembro,
  upsertMembro,
  definirComissao,
  listarProfissionaisDoNegocio,
  criarProfissional,
  definirAtivoProfissional,
} from '../../src/data/repositories/NegocioRepository';
import {
  upsertBarbeiro,
  getBarbeiro,
  gravarBarbeiroSeNaoMudou,
} from '../../src/data/repositories/BarbeiroRepository';
import CacheService from '../../src/services/CacheService';

// Release B1: `criarNegocio` dispara a callable
// `carimbarAgendamentosDoNovoNegocio` depois do `upsertBarbeiro`. Mockada aqui
// para os testes deste arquivo não dependerem de `fetch` — o contrato dela
// (ordem da chamada, e falha que não derruba a criação) é provado em
// NegocioRepository.test.ts.
jest.mock('../../src/services/CloudFunctionsClient', () => ({
  httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: { carimbados: 0 } }))),
}));

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  // `ehConflitoDeVersao` e `ConflitoDeVersaoError` entram pela implementação
  // REAL: são lógica pura (checagem de tipo/nome do erro), sem I/O. Mocká-las
  // faria o teste provar que o mock funciona, não que o código funciona — e
  // é justamente a classificação do erro que decide se o cache é invalidado.
  ...jest.requireActual('../../src/data/repositories/BarbeiroRepository'),
  getBarbeiro: jest.fn(),
  upsertBarbeiro: jest.fn(() => Promise.resolve()),
  // DOM-01: a transação em si é testada em BarbeiroRepository.test.ts. Aqui
  // interessa o que ESTE repositório acrescenta em volta dela — o payload sem
  // `uid` e as três invalidações de cache.
  gravarBarbeiroSeNaoMudou: jest.fn(() => Promise.resolve()),
}));

const mockedCollection = collection as jest.Mock;
const mockedDoc = doc as jest.Mock;
const mockedGetDoc = getDoc as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;
const mockedAddDoc = addDoc as jest.Mock;
const mockedWriteBatch = writeBatch as jest.Mock;
const mockedQuery = query as jest.Mock;
const mockedWhere = where as jest.Mock;
const mockedUpsertBarbeiro = upsertBarbeiro as jest.Mock;
const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedGravarSeNaoMudou = gravarBarbeiroSeNaoMudou as jest.Mock;

let contadorIdAutomatico = 0;

const snapshotCom = (docs: Array<{ id: string; dados: Record<string, unknown> }>) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.dados })),
});

// DB-03/DB-04 (Lote B): criarProfissional e definirAtivoProfissional agora
// gravam via writeBatch em vez de setDoc solto — cada `batch.set(...)` desta
// suíte é empurrado aqui, no MESMO formato `[ref, dados, opcoes]` de uma
// chamada de setDoc, para `escritasEm` continuar funcionando sem precisar
// reescrever cada teste individualmente.
let escritasDeBatch: Array<[{ path?: string }, unknown, unknown?]> = [];

/** Todas as chamadas de setDoc/batch.set cujo caminho bate com o regex. */
const escritasEm = (padrao: RegExp) =>
  [...mockedSetDoc.mock.calls, ...escritasDeBatch].filter((c) => padrao.test(c[0]?.path ?? ''));

/**
 * O CacheService não expõe get/set — a única porta é `getOrFetch`. Então
 * "semear" é buscar uma vez (o valor fica guardado pelo TTL) e "conferir se
 * foi invalidado" é buscar de novo e ver se a função de busca precisou rodar.
 * Isso testa o comportamento que importa para o usuário: depois de escrever,
 * a próxima leitura vai ao Firestore em vez de devolver o dado velho.
 */
const TTL_LONGO = 60_000;

const semearCache = async (chave: string, valor: unknown) => {
  await CacheService.getOrFetch(chave, TTL_LONGO, async () => valor);
};

/** `true` se a chave saiu do cache (a próxima leitura teve que buscar de novo). */
const precisouBuscarDeNovo = async (chave: string) => {
  const busca = jest.fn(async () => 'valor-recem-lido');
  await CacheService.getOrFetch(chave, TTL_LONGO, busca);
  return busca.mock.calls.length > 0;
};

beforeEach(() => {
  jest.clearAllMocks();
  CacheService.clear();
  contadorIdAutomatico = 0;
  escritasDeBatch = [];
  mockedWriteBatch.mockImplementation(() => ({
    set: jest.fn((ref: { path?: string }, dados: unknown, opcoes?: unknown) => {
      escritasDeBatch.push([ref, dados, opcoes]);
    }),
    commit: jest.fn().mockResolvedValue(undefined),
  }));

  mockedCollection.mockImplementation((primeiro: any, ...partes: string[]) => ({
    path: [primeiro?.path, ...partes].filter(Boolean).join('/'),
  }));
  // `doc(db, 'colecao', 'id')`, `doc(refDeColecao, 'id')` e `doc(refDeColecao)`
  // (id gerado pelo Firestore) — os três formatos são usados aqui.
  mockedDoc.mockImplementation((primeiro: any, ...partes: string[]) => {
    const base = primeiro?.path ? [primeiro.path] : [];
    if (base.length && partes.length === 0) {
      contadorIdAutomatico += 1;
      const id = `auto-${contadorIdAutomatico}`;
      return { id, path: `${primeiro.path}/${id}` };
    }
    const caminho = [...base, ...partes].join('/');
    return { id: partes[partes.length - 1], path: caminho };
  });
  mockedWhere.mockImplementation((campo, op, valor) => ({ tipo: 'where', campo, op, valor }));
  mockedQuery.mockImplementation((ref, ...cs) => ({ ref, cs }));
  mockedSetDoc.mockResolvedValue(undefined);
  mockedAddDoc.mockResolvedValue({ id: 'negocio-novo' });
  mockedGetDocs.mockResolvedValue(snapshotCom([]));
  mockedGetDoc.mockResolvedValue({ exists: () => false });
});

describe('getNegocio', () => {
  it('busca por ID conhecido — get(), nunca query', async () => {
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'negocio-1',
      data: () => ({ donoUid: 'dono', nome: 'Barbearia do João' }),
    });

    await expect(getNegocio('negocio-1')).resolves.toEqual({
      id: 'negocio-1',
      donoUid: 'dono',
      nome: 'Barbearia do João',
    });
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('negócio inexistente devolve null em vez de um objeto vazio', async () => {
    await expect(getNegocio('sumiu')).resolves.toBeNull();
  });

  it('sem id não consulta nada', async () => {
    await expect(getNegocio(null)).resolves.toBeNull();
    await expect(getNegocio('')).resolves.toBeNull();
    expect(mockedGetDoc).not.toHaveBeenCalled();
  });
});

describe('criarNegocio — "transformar minha barbearia em equipe"', () => {
  it('cria o negócio, registra o dono como membro e denormaliza no barbeiro', async () => {
    const negocio = await criarNegocio('dono-uid', 'Barbearia do João');

    expect(negocio).toEqual({
      id: 'negocio-novo',
      donoUid: 'dono-uid',
      nome: 'Barbearia do João',
    });

    // 1) o documento do negócio
    expect(mockedAddDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'negocios' }),
      expect.objectContaining({ donoUid: 'dono-uid', nome: 'Barbearia do João' }),
    );

    // 2) o dono como membro, com papel de dono
    const [refMembro, dadosMembro] = escritasEm(/^negocios\/negocio-novo\/membros\//)[0];
    expect(refMembro.path).toBe('negocios/negocio-novo/membros/dono-uid');
    expect(dadosMembro).toMatchObject({ barbeiroId: 'dono-uid', papel: 'dono', ativo: true });

    // 3) o negocioId no doc do próprio barbeiro — é por ele que
    //    getNegocioPorDono acha o negócio sem precisar de query.
    expect(mockedUpsertBarbeiro).toHaveBeenCalledWith('dono-uid', {
      negocioId: 'negocio-novo',
      negocioNome: 'Barbearia do João',
    });
  });

  it('o dono entra ATIVO — senão ele some da própria vitrine', async () => {
    await criarNegocio('dono-uid', 'Barbearia');
    const [, dados] = escritasEm(/membros/)[0];
    expect(dados.ativo).toBe(true);
  });

  it('carimba createdAt com a hora do servidor', async () => {
    await criarNegocio('dono-uid', 'Barbearia');
    expect(mockedAddDoc.mock.calls[0][1].createdAt).toEqual({ __serverTimestamp: true });
  });
});

describe('criarProfissional — o profissional sem login', () => {
  beforeEach(() => {
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'negocio-1',
      data: () => ({ donoUid: 'dono', nome: 'Barbearia do João' }),
    });
  });

  it('NÃO grava um campo uid — o profissional não tem conta no Auth', async () => {
    // Este é o ponto inteiro do repositório: `upsertBarbeiro` gravaria
    // `uid: id`, criando um uid que não existe no Firebase Auth.
    const barbeiro = await criarProfissional('negocio-1', { nome: 'Carlos' });

    expect(barbeiro).not.toHaveProperty('uid');
    const [, dados] = escritasEm(/^barbeiros\//)[0];
    expect(dados).not.toHaveProperty('uid');
    expect(mockedUpsertBarbeiro).not.toHaveBeenCalled();
  });

  it('usa um id gerado pelo Firestore, não um uid inventado', async () => {
    const barbeiro = await criarProfissional('negocio-1', { nome: 'Carlos' });
    expect(barbeiro.id).toBe('auto-1');
  });

  it('herda o nome do negócio para a vitrine mostrar a barbearia', async () => {
    const barbeiro = await criarProfissional('negocio-1', { nome: 'Carlos' });

    expect(barbeiro).toMatchObject({
      nome: 'Carlos',
      negocioId: 'negocio-1',
      negocioNome: 'Barbearia do João',
      ativo: true,
    });
  });

  it('omite campos opcionais em vez de gravar undefined', async () => {
    // O Firestore REJEITA `undefined` explícito: o cadastro inteiro falharia
    // só porque o dono não preencheu a especialidade.
    const barbeiro = await criarProfissional('negocio-1', { nome: 'Carlos' });

    expect(barbeiro).not.toHaveProperty('especialidade');
    expect(Object.values(escritasEm(/^barbeiros\//)[0][1])).not.toContain(undefined);
  });

  it('inclui a especialidade quando ela foi preenchida', async () => {
    const barbeiro = await criarProfissional('negocio-1', {
      nome: 'Carlos',
      especialidade: 'Barba',
    });
    expect(barbeiro.especialidade).toBe('Barba');
  });

  it('omite negocioNome quando o negócio não foi encontrado', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => false });

    const barbeiro = await criarProfissional('negocio-1', { nome: 'Carlos' });

    expect(barbeiro).not.toHaveProperty('negocioNome');
    expect(barbeiro.negocioId).toBe('negocio-1');
  });

  it('registra o profissional como membro do negócio, com papel "profissional"', async () => {
    await criarProfissional('negocio-1', { nome: 'Carlos' });

    const [ref, dados] = escritasEm(/^negocios\/negocio-1\/membros\//)[0];
    expect(ref.path).toBe('negocios/negocio-1/membros/auto-1');
    expect(dados).toMatchObject({ barbeiroId: 'auto-1', papel: 'profissional', ativo: true });
  });

  it('limpa o cache da vitrine — o profissional novo aparece na hora', async () => {
    await semearCache('barbeiros:list:10', [{ id: 'antigo' }]);

    await criarProfissional('negocio-1', { nome: 'Carlos' });

    expect(await precisouBuscarDeNovo('barbeiros:list:10')).toBe(true);
  });
});

describe('atualizarProfissional', () => {
  it('faz merge — editar a especialidade não pode apagar a agenda', async () => {
    await atualizarProfissional('barbeiro1', { especialidade: 'Degradê' });

    const [ref, dados, opcoes] = mockedSetDoc.mock.calls[0];
    expect(ref.path).toBe('barbeiros/barbeiro1');
    expect(dados).toMatchObject({ especialidade: 'Degradê' });
    expect(opcoes).toEqual({ merge: true });
  });

  it('carimba updatedAt com a hora do servidor', async () => {
    await atualizarProfissional('barbeiro1', { nome: 'Carlos' });
    expect(mockedSetDoc.mock.calls[0][1].updatedAt).toEqual({ __serverTimestamp: true });
    expect(serverTimestamp).toHaveBeenCalled();
  });

  it('invalida o cache do profissional E o da lista da vitrine', async () => {
    await semearCache('barbeiro:barbeiro1', { id: 'barbeiro1', nome: 'antigo' });
    await semearCache('barbeiros:list:10', [{ id: 'barbeiro1' }]);

    await atualizarProfissional('barbeiro1', { nome: 'Carlos' });

    expect(await precisouBuscarDeNovo('barbeiro:barbeiro1')).toBe(true);
    expect(await precisouBuscarDeNovo('barbeiros:list:10')).toBe(true);
  });
});

/**
 * DOM-01 — o caminho de equipe do ConfigServicosScreen (o dono editando os
 * serviços de um profissional). Mesma escrita de `atualizarProfissional`, com
 * a recusa por conflito de versão em cima.
 */
describe('atualizarProfissionalSeNaoMudou', () => {
  beforeEach(() => {
    mockedGravarSeNaoMudou.mockResolvedValue(undefined);
    mockedGetBarbeiro.mockResolvedValue({ id: 'barbeiro1', negocioId: 'negocio-1' });
  });

  it('NÃO grava um campo uid — o profissional continua sem conta no Auth', async () => {
    await atualizarProfissionalSeNaoMudou('barbeiro1', { nome: 'Carlos' }, '100.0');

    const [id, campos, marca] = mockedGravarSeNaoMudou.mock.calls[0];
    expect(id).toBe('barbeiro1');
    expect(campos).toEqual({ nome: 'Carlos' });
    expect(campos).not.toHaveProperty('uid');
    expect(marca).toBe('100.0');
  });

  it('repassa a marca nula de um documento sem `updatedAt`', async () => {
    await atualizarProfissionalSeNaoMudou('barbeiro1', { nome: 'Carlos' }, null);
    expect(mockedGravarSeNaoMudou.mock.calls[0][2]).toBeNull();
  });

  it('invalida as MESMAS três chaves de cache do atualizarProfissional', async () => {
    await semearCache('barbeiro:barbeiro1', { id: 'barbeiro1', nome: 'antigo' });
    await semearCache('barbeiros:list:10', [{ id: 'barbeiro1' }]);
    await semearCache('negocio:negocio-1:profissionais', [{ id: 'barbeiro1' }]);

    await atualizarProfissionalSeNaoMudou('barbeiro1', { servicos: [] }, '100.0');

    expect(await precisouBuscarDeNovo('barbeiro:barbeiro1')).toBe(true);
    expect(await precisouBuscarDeNovo('barbeiros:list:10')).toBe(true);
    expect(await precisouBuscarDeNovo('negocio:negocio-1:profissionais')).toBe(true);
  });

  it('no conflito TAMBÉM invalida — o cache é comprovadamente o documento velho', async () => {
    // Sem isto, o "Recarregar" oferecido pela tela devolve exatamente a mesma
    // versão desatualizada por até 2min, e o dono fica preso no aviso.
    await semearCache('barbeiro:barbeiro1', { id: 'barbeiro1', nome: 'antigo' });
    await semearCache('negocio:negocio-1:profissionais', [{ id: 'barbeiro1' }]);
    const conflito = Object.assign(new Error('conflito'), { name: 'ConflitoDeVersaoError' });
    mockedGravarSeNaoMudou.mockRejectedValue(conflito);

    await expect(
      atualizarProfissionalSeNaoMudou('barbeiro1', { servicos: [] }, '100.0'),
    ).rejects.toBe(conflito);

    expect(await precisouBuscarDeNovo('barbeiro:barbeiro1')).toBe(true);
    expect(await precisouBuscarDeNovo('negocio:negocio-1:profissionais')).toBe(true);
  });

  it('erro de rede não invalida — ali não se provou nada sobre o servidor', async () => {
    await semearCache('barbeiro:barbeiro1', { id: 'barbeiro1', nome: 'antigo' });
    mockedGravarSeNaoMudou.mockRejectedValue(new Error('offline'));

    await expect(
      atualizarProfissionalSeNaoMudou('barbeiro1', { servicos: [] }, '100.0'),
    ).rejects.toThrow('offline');

    expect(await precisouBuscarDeNovo('barbeiro:barbeiro1')).toBe(false);
  });
});

describe('membros e comissão', () => {
  it('listarMembros lê a subcoleção privada do negócio', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshotCom([{ id: 'b1', dados: { barbeiroId: 'b1', papel: 'profissional' } }]),
    );

    await expect(listarMembros('negocio-1')).resolves.toEqual([
      { id: 'b1', barbeiroId: 'b1', papel: 'profissional' },
    ]);
    expect(mockedCollection).toHaveBeenCalledWith(expect.anything(), 'negocios', 'negocio-1', 'membros');
  });

  it('listarMembros sem negócio devolve vazio sem consultar', async () => {
    await expect(listarMembros(null)).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('getMembro exige negócio e profissional', async () => {
    await expect(getMembro(null, 'b1')).resolves.toBeNull();
    await expect(getMembro('negocio-1', null)).resolves.toBeNull();
    expect(mockedGetDoc).not.toHaveBeenCalled();
  });

  it('getMembro devolve null quando o profissional não é membro', async () => {
    await expect(getMembro('negocio-1', 'estranho')).resolves.toBeNull();
  });

  it('getMembro devolve a config do membro com o id', async () => {
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'b1',
      data: () => ({ barbeiroId: 'b1', comissaoTipo: 'percentual', comissaoPercentual: 40 }),
    });

    await expect(getMembro('negocio-1', 'b1')).resolves.toEqual({
      id: 'b1',
      barbeiroId: 'b1',
      comissaoTipo: 'percentual',
      comissaoPercentual: 40,
    });
  });

  it('upsertMembro faz merge e reafirma o barbeiroId', async () => {
    await upsertMembro('negocio-1', 'b1', { ativo: false });

    const [ref, dados, opcoes] = mockedSetDoc.mock.calls[0];
    expect(ref.path).toBe('negocios/negocio-1/membros/b1');
    expect(dados).toMatchObject({ id: 'b1', barbeiroId: 'b1', ativo: false });
    expect(opcoes).toEqual({ merge: true });
  });

  it('comissão percentual não deixa resíduo de valor fixo', async () => {
    // Trocar de R$ 30 fixos para 40% e sobrar o campo antigo faria o
    // fechamento somar as duas regras no mesmo profissional.
    await definirComissao('negocio-1', 'b1', 'percentual', 40);

    expect(mockedSetDoc.mock.calls[0][1]).toMatchObject({
      comissaoTipo: 'percentual',
      comissaoPercentual: 40,
      comissaoFixaCentavos: undefined,
    });
  });

  it('comissão fixa não deixa resíduo de percentual', async () => {
    await definirComissao('negocio-1', 'b1', 'fixo', 3000);

    expect(mockedSetDoc.mock.calls[0][1]).toMatchObject({
      comissaoTipo: 'fixo',
      comissaoFixaCentavos: 3000,
      comissaoPercentual: undefined,
    });
  });
});

describe('listarProfissionaisDoNegocio', () => {
  it('filtra a vitrine pelo negócio', async () => {
    await listarProfissionaisDoNegocio('negocio-1');
    expect(mockedWhere).toHaveBeenCalledWith('negocioId', '==', 'negocio-1');
  });

  it('sem negócio devolve vazio sem consultar', async () => {
    await expect(listarProfissionaisDoNegocio(undefined)).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('anexa o id do documento a cada profissional', async () => {
    mockedGetDocs.mockResolvedValue(snapshotCom([{ id: 'b1', dados: { nome: 'Carlos' } }]));
    await expect(listarProfissionaisDoNegocio('negocio-1')).resolves.toEqual([
      { id: 'b1', nome: 'Carlos' },
    ]);
  });
});

describe('definirAtivoProfissional — desativar não é apagar', () => {
  it('espelha o estado nos DOIS lugares: membro privado e doc público', async () => {
    // Só no membro: o cliente continuaria vendo o profissional na vitrine.
    // Só no público: o dono perderia o controle na tela de Equipe.
    await definirAtivoProfissional('negocio-1', 'b1', false);

    expect(escritasEm(/^negocios\/negocio-1\/membros\/b1$/)[0][1]).toMatchObject({ ativo: false });
    expect(escritasEm(/^barbeiros\/b1$/)[0][1]).toMatchObject({ ativo: false });
  });

  it('não apaga o documento — o histórico de agendamentos é preservado', async () => {
    // Espera exatamente 2 escritas (membro privado + doc público), as duas
    // no MESMO writeBatch — nunca um delete, nunca um setDoc solto.
    await definirAtivoProfissional('negocio-1', 'b1', false);
    expect(escritasDeBatch).toHaveLength(2);
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it('reativar volta a marcar ativo nos dois lugares', async () => {
    await definirAtivoProfissional('negocio-1', 'b1', true);

    expect(escritasEm(/membros/)[0][1]).toMatchObject({ ativo: true });
    expect(escritasEm(/^barbeiros\/b1$/)[0][1]).toMatchObject({ ativo: true });
  });

  it('limpa o cache da vitrine ao desativar', async () => {
    await semearCache('barbeiros:list:10', [{ id: 'b1' }]);
    await definirAtivoProfissional('negocio-1', 'b1', false);
    expect(await precisouBuscarDeNovo('barbeiros:list:10')).toBe(true);
  });
});

describe('controle do próprio medidor de cache', () => {
  // Sem este teste, os três testes de invalidação acima passariam mesmo que
  // `semearCache` não guardasse nada — "precisou buscar de novo" seria
  // sempre verdade por vacuidade.
  it('uma chave semeada e não invalidada continua servindo do cache', async () => {
    await semearCache('barbeiros:list:10', [{ id: 'b1' }]);

    await listarMembros('negocio-1'); // leitura pura, não invalida nada

    expect(await precisouBuscarDeNovo('barbeiros:list:10')).toBe(false);
  });
});
