/**
 * Recorrências — o cliente fiel que vem toda semana no mesmo dia e horário.
 * É a receita mais previsível da barbearia, e a que mais dói perder por um
 * erro de consulta: se `listarRecorrenciasDoBarbeiro` filtrar errado, o
 * profissional simplesmente não vê os fixos dele e para de reservar o horário.
 */
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
} from 'firebase/firestore';
import {
  criarRecorrencia,
  listarRecorrenciasDoBarbeiro,
  toggleRecorrencia,
  removerRecorrencia,
} from '../../src/data/repositories/RecorrenciaRepository';

const mockedCollection = collection as jest.Mock;
const mockedQuery = query as jest.Mock;
const mockedWhere = where as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedAddDoc = addDoc as jest.Mock;
const mockedUpdateDoc = updateDoc as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedDoc = doc as jest.Mock;
const mockedOrderBy = orderBy as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedCollection.mockImplementation((_db: unknown, ...p: string[]) => ({ path: p.join('/') }));
  mockedDoc.mockImplementation((_db: unknown, ...p: string[]) => ({ path: p.join('/') }));
  mockedWhere.mockImplementation((c: string, o: string, v: unknown) => ({ __where: [c, o, v] }));
  mockedOrderBy.mockImplementation((c: string, d: string) => ({ __orderBy: [c, d] }));
  mockedQuery.mockImplementation((ref: unknown, ...c: unknown[]) => ({ ref, constraints: c }));
  mockedAddDoc.mockResolvedValue({ id: 'rec1' });
  mockedUpdateDoc.mockResolvedValue(undefined);
  mockedDeleteDoc.mockResolvedValue(undefined);
  mockedGetDocs.mockResolvedValue({ docs: [] });
});

describe('criarRecorrencia', () => {
  it('grava na coleção recorrencias e devolve o id gerado', async () => {
    const id = await criarRecorrencia({
      barbeiroId: 'b1',
      clienteUid: 'c1',
      diaSemana: 3,
      horario: '14:00',
      ativo: true,
    } as any);

    expect(id).toBe('rec1');
    expect(mockedCollection).toHaveBeenCalledWith({}, 'recorrencias');
    expect(mockedAddDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ barbeiroId: 'b1', diaSemana: 3, horario: '14:00' }),
    );
  });

  it('carimba createdAt no servidor', async () => {
    await criarRecorrencia({ barbeiroId: 'b1' } as any);
    const [, dados] = mockedAddDoc.mock.calls[0];
    expect(dados.createdAt).toEqual({ __serverTimestamp: true });
  });
});

describe('listarRecorrenciasDoBarbeiro', () => {
  it('filtra pelo barbeiro e traz as mais recentes primeiro', async () => {
    await listarRecorrenciasDoBarbeiro('b1');

    expect(mockedWhere).toHaveBeenCalledWith('barbeiroId', '==', 'b1');
    expect(mockedOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });

  it('não filtra por `ativo` na consulta — a tela mostra ativas e pausadas', async () => {
    // Filtrar aqui esconderia as recorrências pausadas, e o profissional não
    // teria como reativá-las pela tela.
    await listarRecorrenciasDoBarbeiro('b1');

    const filtrosDeAtivo = mockedWhere.mock.calls.filter(([campo]) => campo === 'ativo');
    expect(filtrosDeAtivo).toHaveLength(0);
  });

  it('devolve as recorrências com o id do documento', async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [
        { id: 'r1', data: () => ({ clienteNome: 'João', diaSemana: 3 }) },
        { id: 'r2', data: () => ({ clienteNome: 'Ana', diaSemana: 5 }) },
      ],
    });

    await expect(listarRecorrenciasDoBarbeiro('b1')).resolves.toEqual([
      { id: 'r1', clienteNome: 'João', diaSemana: 3 },
      { id: 'r2', clienteNome: 'Ana', diaSemana: 5 },
    ]);
  });

  it('devolve lista vazia quando o profissional ainda não tem fixos', async () => {
    await expect(listarRecorrenciasDoBarbeiro('b1')).resolves.toEqual([]);
  });
});

describe('toggleRecorrencia / removerRecorrencia', () => {
  it('pausar altera só o campo ativo — o histórico do fixo é preservado', async () => {
    await toggleRecorrencia('r1', false);

    expect(mockedDoc).toHaveBeenCalledWith({}, 'recorrencias', 'r1');
    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'recorrencias/r1' }),
      { ativo: false },
    );
  });

  it('reativar volta o mesmo campo para true', async () => {
    await toggleRecorrencia('r1', true);
    expect(mockedUpdateDoc).toHaveBeenCalledWith(expect.anything(), { ativo: true });
  });

  it('remover apaga o documento', async () => {
    await removerRecorrencia('r1');
    expect(mockedDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'recorrencias/r1' }),
    );
  });
});
