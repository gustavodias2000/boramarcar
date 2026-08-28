/**
 * Regressão da coleção `despesas` (lançamentos manuais de gasto do
 * barbeiro, usados na coluna "Despesas" dos relatórios financeiros).
 * Cobre a query por período (mesmo índice barbeiroId+data de
 * `AgendamentoRepository.listarPorBarbeiroEPeriodo`) e a listagem geral
 * (que reaproveita esse índice ordenando ascendente e revertendo em
 * memória — ver comentário no repository).
 */
import { where, orderBy, getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import {
  criarDespesa,
  listarPorBarbeiroEPeriodo,
  listarDoBarbeiro,
  removerDespesa,
} from '../../src/data/repositories/DespesaRepository';

const mockedWhere = where as jest.Mock;
const mockedOrderBy = orderBy as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedAddDoc = addDoc as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;

describe('DespesaRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('criarDespesa', () => {
    it('grava barbeiroId, descrição, valor e data, com createdAt do servidor', async () => {
      mockedAddDoc.mockResolvedValue({ id: 'd1' });

      const id = await criarDespesa({
        barbeiroId: 'uid1',
        descricao: 'Aluguel',
        valorEmCentavos: 8000,
        data: '2026-07-24',
      });

      expect(id).toBe('d1');
      const [, dados] = mockedAddDoc.mock.calls[0];
      expect(dados).toEqual(
        expect.objectContaining({
          barbeiroId: 'uid1',
          descricao: 'Aluguel',
          valorEmCentavos: 8000,
          data: '2026-07-24',
        }),
      );
    });
  });

  describe('listarPorBarbeiroEPeriodo', () => {
    it('filtra por barbeiroId e pelo intervalo de data (>= início, <= fim)', async () => {
      mockedGetDocs.mockResolvedValue({
        docs: [{ id: 'd1', data: () => ({ barbeiroId: 'uid1', data: '2026-07-24', valorEmCentavos: 8000 }) }],
      });

      const resultado = await listarPorBarbeiroEPeriodo('uid1', '2026-07-01', '2026-07-31');

      expect(resultado).toEqual([
        { id: 'd1', barbeiroId: 'uid1', data: '2026-07-24', valorEmCentavos: 8000 },
      ]);
      expect(mockedWhere).toHaveBeenCalledWith('barbeiroId', '==', 'uid1');
      expect(mockedWhere).toHaveBeenCalledWith('data', '>=', '2026-07-01');
      expect(mockedWhere).toHaveBeenCalledWith('data', '<=', '2026-07-31');
    });

    it('retorna lista vazia sem tocar o Firestore quando não há barbeiroId', async () => {
      const resultado = await listarPorBarbeiroEPeriodo('', '2026-07-01', '2026-07-31');
      expect(resultado).toEqual([]);
      expect(mockedGetDocs).not.toHaveBeenCalled();
    });
  });

  describe('listarDoBarbeiro', () => {
    it('ordena por data ascendente na query e reverte em memória (mais recente primeiro)', async () => {
      mockedGetDocs.mockResolvedValue({
        docs: [
          { id: 'antiga', data: () => ({ barbeiroId: 'uid1', data: '2026-07-01', valorEmCentavos: 1000 }) },
          { id: 'recente', data: () => ({ barbeiroId: 'uid1', data: '2026-07-24', valorEmCentavos: 2000 }) },
        ],
      });

      const resultado = await listarDoBarbeiro('uid1');

      expect(resultado.map((d) => d.id)).toEqual(['recente', 'antiga']);
      expect(mockedWhere).toHaveBeenCalledWith('barbeiroId', '==', 'uid1');
      expect(mockedOrderBy).toHaveBeenCalledWith('data', 'asc');
    });

    it('retorna lista vazia sem tocar o Firestore quando não há barbeiroId', async () => {
      const resultado = await listarDoBarbeiro('');
      expect(resultado).toEqual([]);
      expect(mockedGetDocs).not.toHaveBeenCalled();
    });
  });

  describe('plano B quando o índice composto ainda está sendo construído', () => {
    // Cenário real: logo após `firebase deploy --only firestore:indexes` o
    // índice `barbeiroId + data` fica minutos em "Building" e a query com
    // range falha. Em vez de propagar o erro (que travava a tela de
    // Relatórios), o repository refaz a busca só com a igualdade — que o
    // índice de campo único já atende — e recorta em memória.
    const erroIndice = Object.assign(
      new Error(
        'The query requires an index. That index is currently building and cannot be used yet.',
      ),
      { code: 'failed-precondition' },
    );

    it('listarPorBarbeiroEPeriodo refaz sem range e filtra o período em memória', async () => {
      mockedGetDocs
        .mockRejectedValueOnce(erroIndice)
        .mockResolvedValueOnce({
          docs: [
            { id: 'antes', data: () => ({ barbeiroId: 'uid1', data: '2026-06-30', valorEmCentavos: 500 }) },
            { id: 'dentro', data: () => ({ barbeiroId: 'uid1', data: '2026-07-24', valorEmCentavos: 8000 }) },
            { id: 'depois', data: () => ({ barbeiroId: 'uid1', data: '2026-08-01', valorEmCentavos: 900 }) },
          ],
        });

      const resultado = await listarPorBarbeiroEPeriodo('uid1', '2026-07-01', '2026-07-31');

      expect(resultado.map((d) => d.id)).toEqual(['dentro']);
      expect(mockedGetDocs).toHaveBeenCalledTimes(2);
    });

    it('listarDoBarbeiro refaz sem orderBy e ordena em memória (mais recente primeiro)', async () => {
      mockedGetDocs
        .mockRejectedValueOnce(erroIndice)
        .mockResolvedValueOnce({
          docs: [
            { id: 'antiga', data: () => ({ barbeiroId: 'uid1', data: '2026-07-01', valorEmCentavos: 1000 }) },
            { id: 'recente', data: () => ({ barbeiroId: 'uid1', data: '2026-07-24', valorEmCentavos: 2000 }) },
          ],
        });

      const resultado = await listarDoBarbeiro('uid1');

      expect(resultado.map((d) => d.id)).toEqual(['recente', 'antiga']);
    });

    it('respeita o limite máximo mesmo no plano B', async () => {
      mockedGetDocs
        .mockRejectedValueOnce(erroIndice)
        .mockResolvedValueOnce({
          docs: [
            { id: 'a', data: () => ({ barbeiroId: 'uid1', data: '2026-07-01', valorEmCentavos: 1 }) },
            { id: 'b', data: () => ({ barbeiroId: 'uid1', data: '2026-07-02', valorEmCentavos: 2 }) },
            { id: 'c', data: () => ({ barbeiroId: 'uid1', data: '2026-07-03', valorEmCentavos: 3 }) },
          ],
        });

      const resultado = await listarDoBarbeiro('uid1', 2);

      expect(resultado.map((d) => d.id)).toEqual(['c', 'b']);
    });

    it('NÃO engole erros de outra natureza (ex.: permissão negada)', async () => {
      const erroPermissao = Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      });
      mockedGetDocs.mockRejectedValueOnce(erroPermissao);

      await expect(listarPorBarbeiroEPeriodo('uid1', '2026-07-01', '2026-07-31')).rejects.toThrow(
        'Missing or insufficient permissions.',
      );
      expect(mockedGetDocs).toHaveBeenCalledTimes(1);
    });
  });

  describe('removerDespesa', () => {
    it('chama deleteDoc para o id informado', async () => {
      await removerDespesa('d1');
      expect(mockedDeleteDoc).toHaveBeenCalled();
    });
  });
});
