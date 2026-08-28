/**
 * Lista de espera — o cliente que não achou horário e pediu para ser avisado.
 *
 * O erro caro aqui é silencioso: se a consulta perder um filtro, o
 * profissional avisa quem já foi atendido (ou quem desistiu), e se perder o
 * `orderBy` a fila deixa de ser fila. Os testes fixam os filtros exatos —
 * eles também definem o índice composto que o Firestore exige, então mudar a
 * consulta sem criar o índice quebra aqui e não em produção.
 */
import {
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
  addDoc,
  updateDoc,
  doc,
  orderBy,
} from 'firebase/firestore';
import {
  entrarNaFila,
  listarFilaDoBarbeiro,
  contarFilaDoBarbeiro,
  jaEstaNaFila,
  atualizarStatusFila,
} from '../../src/data/repositories/ListaEsperaRepository';

const mockedCollection = collection as jest.Mock;
const mockedQuery = query as jest.Mock;
const mockedWhere = where as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedAddDoc = addDoc as jest.Mock;
const mockedUpdateDoc = updateDoc as jest.Mock;
const mockedDoc = doc as jest.Mock;
const mockedOrderBy = orderBy as jest.Mock;
const mockedGetCount = getCountFromServer as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedCollection.mockImplementation((_db: unknown, ...p: string[]) => ({ path: p.join('/') }));
  mockedDoc.mockImplementation((_db: unknown, ...p: string[]) => ({ path: p.join('/') }));
  mockedWhere.mockImplementation((campo: string, op: string, valor: unknown) => ({
    __where: [campo, op, valor],
  }));
  mockedOrderBy.mockImplementation((campo: string, dir: string) => ({ __orderBy: [campo, dir] }));
  mockedQuery.mockImplementation((ref: unknown, ...c: unknown[]) => ({ ref, constraints: c }));
  mockedAddDoc.mockResolvedValue({ id: 'entrada1' });
  mockedUpdateDoc.mockResolvedValue(undefined);
  mockedGetDocs.mockResolvedValue({ docs: [], empty: true });
  mockedGetCount.mockResolvedValue({ data: () => ({ count: 0 }) });
});

describe('entrarNaFila', () => {
  it('entra sempre como "aguardando" — o cliente não escolhe o status', async () => {
    await expect(
      entrarNaFila({ barbeiroId: 'b1', clienteUid: 'c1', data: '2026-08-01' } as any),
    ).resolves.toBe('entrada1');

    expect(mockedCollection).toHaveBeenCalledWith({}, 'listaEspera');
    expect(mockedAddDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        barbeiroId: 'b1',
        clienteUid: 'c1',
        data: '2026-08-01',
        status: 'aguardando',
      }),
    );
  });

  it('carimba createdAt pelo relógio do servidor — a ordem da fila depende disso', async () => {
    // Se o horário viesse do aparelho, um celular com data errada furaria a
    // fila de todo mundo.
    await entrarNaFila({ barbeiroId: 'b1', clienteUid: 'c1' } as any);

    const [, dados] = mockedAddDoc.mock.calls[0];
    expect(dados.createdAt).toEqual({ __serverTimestamp: true });
  });
});

describe('listarFilaDoBarbeiro', () => {
  it('filtra por barbeiro e status, e ordena do mais antigo para o mais novo', async () => {
    await listarFilaDoBarbeiro('b1');

    expect(mockedWhere).toHaveBeenCalledWith('barbeiroId', '==', 'b1');
    expect(mockedWhere).toHaveBeenCalledWith('status', '==', 'aguardando');
    // 'asc': quem pediu primeiro é avisado primeiro.
    expect(mockedOrderBy).toHaveBeenCalledWith('createdAt', 'asc');
  });

  it('não filtra por data quando a data é omitida', async () => {
    await listarFilaDoBarbeiro('b1');

    const filtrosDeData = mockedWhere.mock.calls.filter(([campo]) => campo === 'data');
    expect(filtrosDeData).toHaveLength(0);
  });

  it('acrescenta o filtro de data quando ela é informada', async () => {
    await listarFilaDoBarbeiro('b1', '2026-08-01');
    expect(mockedWhere).toHaveBeenCalledWith('data', '==', '2026-08-01');
  });

  it('nunca devolve quem já foi atendido ou desistiu', async () => {
    await listarFilaDoBarbeiro('b1', '2026-08-01');

    const constraints = mockedQuery.mock.calls[0].slice(1);
    // O filtro de status é obrigatório, com ou sem data.
    expect(constraints).toContainEqual({ __where: ['status', '==', 'aguardando'] });
  });

  it('devolve as entradas com o id do documento', async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [
        { id: 'e1', data: () => ({ clienteUid: 'c1', clienteNome: 'João' }) },
        { id: 'e2', data: () => ({ clienteUid: 'c2', clienteNome: 'Ana' }) },
      ],
      empty: false,
    });

    await expect(listarFilaDoBarbeiro('b1')).resolves.toEqual([
      { id: 'e1', clienteUid: 'c1', clienteNome: 'João' },
      { id: 'e2', clienteUid: 'c2', clienteNome: 'Ana' },
    ]);
  });

  it('devolve lista vazia quando ninguém está esperando', async () => {
    await expect(listarFilaDoBarbeiro('b1')).resolves.toEqual([]);
  });
});

describe('jaEstaNaFila — impede o cliente de entrar duas vezes', () => {
  it('cruza barbeiro, cliente, data e status', async () => {
    mockedGetDocs.mockResolvedValue({ docs: [{ id: 'e1' }], empty: false });

    await expect(jaEstaNaFila('b1', 'c1', '2026-08-01')).resolves.toBe(true);

    expect(mockedWhere).toHaveBeenCalledWith('barbeiroId', '==', 'b1');
    expect(mockedWhere).toHaveBeenCalledWith('clienteUid', '==', 'c1');
    expect(mockedWhere).toHaveBeenCalledWith('data', '==', '2026-08-01');
    expect(mockedWhere).toHaveBeenCalledWith('status', '==', 'aguardando');
  });

  it('devolve false quando a consulta não acha nada', async () => {
    await expect(jaEstaNaFila('b1', 'c1', '2026-08-01')).resolves.toBe(false);
  });

  it('uma entrada já atendida não bloqueia o cliente de entrar de novo', async () => {
    // O filtro de status garante isso: só "aguardando" conta como já na fila.
    await jaEstaNaFila('b1', 'c1', '2026-08-01');
    const constraints = mockedQuery.mock.calls[0].slice(1);
    expect(constraints).toContainEqual({ __where: ['status', '==', 'aguardando'] });
  });
});

describe('atualizarStatusFila', () => {
  it('atualiza só o status da entrada informada', async () => {
    await atualizarStatusFila('e1', 'atendido' as any);

    expect(mockedDoc).toHaveBeenCalledWith({}, 'listaEspera', 'e1');
    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'listaEspera/e1' }),
      { status: 'atendido' },
    );
  });
});


/**
 * P2 — o Início só queria o TAMANHO da fila, e para isso baixava as entradas
 * inteiras (nome, telefone, data, observação de cada pessoa) a cada foco.
 * Agora é uma agregação no servidor.
 *
 * O risco de uma contagem que "só conta" é ela recortar um conjunto diferente
 * do que a tela lista — o dono veria "3 na lista de espera" no aviso e abriria
 * uma tela com 2 pessoas. Por isso o teste central compara as constraints das
 * duas consultas em vez de conferir só o número.
 */
describe('contarFilaDoBarbeiro — P2', () => {
  it('conta com AS MESMAS constraints da listagem (mesmo indice, mesmo conjunto)', async () => {
    await listarFilaDoBarbeiro('b1');
    await contarFilaDoBarbeiro('b1');

    const queryDaLista = mockedGetDocs.mock.calls[0][0];
    const queryDoCount = mockedGetCount.mock.calls[0][0];

    expect(queryDoCount.constraints).toEqual(queryDaLista.constraints);
    expect(queryDoCount.ref).toEqual(queryDaLista.ref);
    // O recorte explícito, para o teste falhar se alguém "simplificar" um dos lados.
    expect(queryDoCount.constraints).toEqual([
      { __where: ['barbeiroId', '==', 'b1'] },
      { __where: ['status', '==', 'aguardando'] },
      { __orderBy: ['createdAt', 'asc'] },
    ]);
  });

  it('o filtro opcional de data também entra nos dois lados', async () => {
    await listarFilaDoBarbeiro('b1', '2026-08-20');
    await contarFilaDoBarbeiro('b1', '2026-08-20');

    expect(mockedGetCount.mock.calls[0][0].constraints).toEqual(
      mockedGetDocs.mock.calls[0][0].constraints,
    );
    expect(mockedGetCount.mock.calls[0][0].constraints).toContainEqual({
      __where: ['data', '==', '2026-08-20'],
    });
  });

  it('devolve a contagem do servidor sem baixar as entradas', async () => {
    mockedGetCount.mockResolvedValue({ data: () => ({ count: 7 }) });

    await expect(contarFilaDoBarbeiro('b1')).resolves.toBe(7);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('sem barbeiroId devolve 0 e não consulta', async () => {
    await expect(contarFilaDoBarbeiro(null)).resolves.toBe(0);
    await expect(contarFilaDoBarbeiro(undefined)).resolves.toBe(0);
    expect(mockedGetCount).not.toHaveBeenCalled();
  });
});
