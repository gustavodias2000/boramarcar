/**
 * AvaliacaoRepository — ARCH-002 da auditoria (Onda 3).
 *
 * O que estes testes travam:
 *  - o id do documento é sempre o id do agendamento avaliado (nunca um id
 *    gerado à parte) — é o que garante no máximo uma avaliação por
 *    agendamento;
 *  - `criarAvaliacao` grava exatamente os mesmos campos que o `setDoc`
 *    direto que existia antes em `RatingComponent.tsx`, com `createdAt` do
 *    servidor;
 *  - `existeAvaliacaoParaAgendamento` é um `get` pontual, nunca uma query
 *    de coleção.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  criarAvaliacao,
  existeAvaliacaoParaAgendamento,
} from '../../src/data/repositories/AvaliacaoRepository';

const mockedDoc = doc as jest.Mock;
const mockedGetDoc = getDoc as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedDoc.mockImplementation((_db: unknown, ...partes: string[]) => ({
    path: partes.join('/'),
  }));
  mockedSetDoc.mockResolvedValue(undefined);
});

describe('criarAvaliacao', () => {
  it('grava no documento cujo id é o id do agendamento', async () => {
    await criarAvaliacao('ag1', {
      barbeiroId: 'b1',
      barbeiroNome: 'João',
      cliente: 'cliente@ex.com',
      clienteUid: 'uid-cliente',
      clienteNome: 'Maria',
      rating: 5,
      comment: 'Ótimo atendimento',
    });

    expect(mockedDoc).toHaveBeenCalledWith(expect.anything(), 'avaliacoes', 'ag1');
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'avaliacoes/ag1' }),
      expect.objectContaining({
        agendamentoId: 'ag1',
        barbeiroId: 'b1',
        barbeiroNome: 'João',
        cliente: 'cliente@ex.com',
        clienteUid: 'uid-cliente',
        clienteNome: 'Maria',
        rating: 5,
        comment: 'Ótimo atendimento',
        createdAt: { __serverTimestamp: true },
      }),
    );
  });

  it('carimba a criação com a hora do SERVIDOR', async () => {
    await criarAvaliacao('ag1', {
      barbeiroId: 'b1',
      rating: 4,
      comment: '',
    });

    const [, dados] = mockedSetDoc.mock.calls[0];
    expect(dados.createdAt).toEqual({ __serverTimestamp: true });
  });

  it('duas avaliações do mesmo agendamento sobrescrevem o mesmo documento (idempotente por id)', async () => {
    await criarAvaliacao('ag1', { barbeiroId: 'b1', rating: 3, comment: 'ok' });
    await criarAvaliacao('ag1', { barbeiroId: 'b1', rating: 5, comment: 'melhorou' });

    expect(mockedDoc).toHaveBeenCalledTimes(2);
    expect(mockedDoc).toHaveBeenNthCalledWith(1, expect.anything(), 'avaliacoes', 'ag1');
    expect(mockedDoc).toHaveBeenNthCalledWith(2, expect.anything(), 'avaliacoes', 'ag1');
  });

  it('propaga o erro — quem chama precisa saber que a avaliação não foi salva', async () => {
    mockedSetDoc.mockRejectedValue(new Error('permission-denied'));
    await expect(
      criarAvaliacao('ag1', { barbeiroId: 'b1', rating: 5, comment: '' }),
    ).rejects.toThrow('permission-denied');
  });
});

describe('existeAvaliacaoParaAgendamento', () => {
  it('faz um get pontual pelo id do agendamento — nunca uma query de coleção', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => true });

    await expect(existeAvaliacaoParaAgendamento('ag1')).resolves.toBe(true);
    expect(mockedDoc).toHaveBeenCalledWith(expect.anything(), 'avaliacoes', 'ag1');
    expect(mockedGetDoc).toHaveBeenCalledTimes(1);
  });

  it('devolve false quando ainda não existe avaliação', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => false });
    await expect(existeAvaliacaoParaAgendamento('ag1')).resolves.toBe(false);
  });

  it('sem id de agendamento devolve false sem consultar o Firestore', async () => {
    await expect(existeAvaliacaoParaAgendamento(null)).resolves.toBe(false);
    await expect(existeAvaliacaoParaAgendamento(undefined)).resolves.toBe(false);
    await expect(existeAvaliacaoParaAgendamento('')).resolves.toBe(false);
    expect(mockedGetDoc).not.toHaveBeenCalled();
  });
});
