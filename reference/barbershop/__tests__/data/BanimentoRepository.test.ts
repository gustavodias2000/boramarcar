/**
 * Bloco 1 da auditoria — vazamento de dado pessoal.
 *
 * A lista de clientes banidos ficava dentro de `barbeiros/{uid}`, que é a
 * VITRINE PÚBLICA: qualquer usuário logado conseguia ler nome e email de
 * todo cliente banido de todo profissional. A correção move a lista para a
 * subcoleção privada `barbeiros/{uid}/banidos/{clienteUid}`.
 *
 * O que estes testes travam:
 *  - a leitura do cliente é um `get` num doc específico (o único formato que
 *    as regras autorizam para o titular) e NUNCA uma listagem;
 *  - a checagem de banimento falha em ABERTO — se as regras negarem, a tela
 *    de agendamento continua funcionando em vez de quebrar;
 *  - a migração copia o array legado e depois APAGA o campo público (senão o
 *    vazamento continua lá, só que agora duplicado);
 *  - banir é idempotente, porque o id do documento é o uid do cliente.
 */
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  deleteField,
} from 'firebase/firestore';
import {
  listarBanidos,
  estaBanido,
  banirCliente,
  desbanirCliente,
  migrarBanidosLegado,
} from '../../src/data/repositories/BanimentoRepository';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import CacheService from '../../src/services/CacheService';

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(() => Promise.resolve(null)),
}));

const mockedCollection = collection as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedGetDoc = getDoc as jest.Mock;
const mockedDoc = doc as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedUpdateDoc = updateDoc as jest.Mock;
const mockedDeleteField = deleteField as jest.Mock;
const mockedGetBarbeiro = getBarbeiro as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  CacheService.clear();
  mockedCollection.mockImplementation((_db: unknown, ...partes: string[]) => ({
    path: partes.join('/'),
  }));
  mockedDoc.mockImplementation((_db: unknown, ...partes: string[]) => ({
    path: partes.join('/'),
  }));
  mockedGetDocs.mockResolvedValue({ docs: [] });
  mockedSetDoc.mockResolvedValue(undefined);
  mockedDeleteDoc.mockResolvedValue(undefined);
  mockedUpdateDoc.mockResolvedValue(undefined);
  mockedGetBarbeiro.mockResolvedValue(null);
});

describe('listarBanidos', () => {
  it('lê a subcoleção privada, não o documento público da vitrine', async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [
        { id: 'cli1', data: () => ({ nome: 'João', email: 'joao@ex.com' }) },
        { id: 'cli2', data: () => ({ nome: 'Ana', email: 'ana@ex.com' }) },
      ],
    });

    const banidos = await listarBanidos('barbeiro1');

    expect(mockedCollection).toHaveBeenCalledWith({}, 'barbeiros', 'barbeiro1', 'banidos');
    expect(banidos).toEqual([
      { uid: 'cli1', nome: 'João', email: 'joao@ex.com' },
      { uid: 'cli2', nome: 'Ana', email: 'ana@ex.com' },
    ]);
  });

  it('usa o id do documento como uid do cliente', async () => {
    // O uid não é gravado dentro do doc justamente para não duplicar a
    // informação — quem lista precisa recompor a partir do id.
    mockedGetDocs.mockResolvedValue({
      docs: [{ id: 'uid-do-cliente', data: () => ({ nome: 'Zé' }) }],
    });

    const [banido] = await listarBanidos('barbeiro1');
    expect(banido.uid).toBe('uid-do-cliente');
  });

  it('roda a migração do formato antigo antes de listar', async () => {
    await listarBanidos('barbeiro1');
    expect(mockedGetBarbeiro).toHaveBeenCalledWith('barbeiro1');
  });
});

describe('estaBanido — checagem feita pelo próprio cliente', () => {
  it('faz um get num doc específico (nunca uma listagem)', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => true });

    await expect(estaBanido('barbeiro1', 'cli1')).resolves.toBe(true);

    expect(mockedDoc).toHaveBeenCalledWith({}, 'barbeiros', 'barbeiro1', 'banidos', 'cli1');
    // Uma listagem aqui seria negada pelas regras para o cliente.
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('devolve false quando o cliente não está banido', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => false });
    await expect(estaBanido('barbeiro1', 'cli1')).resolves.toBe(false);
  });

  it('não toca o Firestore sem barbeiro ou sem cliente', async () => {
    await expect(estaBanido(null, 'cli1')).resolves.toBe(false);
    await expect(estaBanido('barbeiro1', null)).resolves.toBe(false);
    await expect(estaBanido(undefined, undefined)).resolves.toBe(false);
    expect(mockedGetDoc).not.toHaveBeenCalled();
  });

  it('falha em ABERTO: erro de permissão não pode derrubar a tela de agendar', async () => {
    // Preferimos deixar passar um banido (o profissional recusa na mão) a
    // impedir todo mundo de agendar por causa de uma regra mal configurada.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedGetDoc.mockRejectedValue(new Error('permission-denied'));

    await expect(estaBanido('barbeiro1', 'cli1')).resolves.toBe(false);
    warn.mockRestore();
  });
});

describe('banirCliente / desbanirCliente', () => {
  it('grava com o uid do cliente como id do documento (idempotente)', async () => {
    await banirCliente('barbeiro1', { uid: 'cli1', nome: 'João', email: 'joao@ex.com' } as any);

    expect(mockedDoc).toHaveBeenCalledWith({}, 'barbeiros', 'barbeiro1', 'banidos', 'cli1');
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nome: 'João', email: 'joao@ex.com' }),
    );
  });

  it('normaliza nome e email ausentes para string vazia', async () => {
    await banirCliente('barbeiro1', { uid: 'cli1' } as any);

    const [, dados] = mockedSetDoc.mock.calls[0];
    expect(dados.nome).toBe('');
    expect(dados.email).toBe('');
  });

  it('banir duas vezes não duplica: mesmo caminho de documento', async () => {
    await banirCliente('barbeiro1', { uid: 'cli1', nome: 'João' } as any);
    await banirCliente('barbeiro1', { uid: 'cli1', nome: 'João' } as any);

    const caminhos = mockedSetDoc.mock.calls.map(([ref]) => ref.path);
    expect(caminhos[0]).toBe(caminhos[1]);
  });

  it('desbanir apaga o documento do cliente', async () => {
    await desbanirCliente('barbeiro1', 'cli1');

    expect(mockedDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'barbeiros/barbeiro1/banidos/cli1' }),
    );
  });
});

describe('migrarBanidosLegado — tira o dado pessoal da vitrine pública', () => {
  it('copia cada banido do array antigo para a subcoleção privada', async () => {
    mockedGetBarbeiro.mockResolvedValue({
      id: 'barbeiro1',
      clientesBanidos: [
        { uid: 'cli1', nome: 'João', email: 'joao@ex.com' },
        { uid: 'cli2', nome: 'Ana', email: 'ana@ex.com' },
      ],
    });

    await migrarBanidosLegado('barbeiro1');

    expect(mockedSetDoc).toHaveBeenCalledTimes(2);
    // `merge: true` para não sobrescrever um banimento já migrado.
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'barbeiros/barbeiro1/banidos/cli1' }),
      expect.objectContaining({ nome: 'João', email: 'joao@ex.com' }),
      { merge: true },
    );
  });

  it('APAGA o campo público depois de copiar — senão o vazamento continua', async () => {
    mockedGetBarbeiro.mockResolvedValue({
      id: 'barbeiro1',
      clientesBanidos: [{ uid: 'cli1', nome: 'João' }],
    });

    await migrarBanidosLegado('barbeiro1');

    expect(mockedDeleteField).toHaveBeenCalled();
    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'barbeiros/barbeiro1' }),
      { clientesBanidos: { __deleteField: true } },
    );
  });

  it('invalida o cache do barbeiro para a vitrine não servir o array apagado', async () => {
    mockedGetBarbeiro.mockResolvedValue({
      id: 'barbeiro1',
      clientesBanidos: [{ uid: 'cli1' }],
    });
    const invalidate = jest.spyOn(CacheService, 'invalidate');

    await migrarBanidosLegado('barbeiro1');

    expect(invalidate).toHaveBeenCalledWith('barbeiro:barbeiro1');
    invalidate.mockRestore();
  });

  it('ignora entradas sem uid em vez de gravar documento com id vazio', async () => {
    mockedGetBarbeiro.mockResolvedValue({
      id: 'barbeiro1',
      clientesBanidos: [{ uid: 'cli1' }, { nome: 'sem uid' }, { uid: '' }],
    });

    await migrarBanidosLegado('barbeiro1');

    expect(mockedSetDoc).toHaveBeenCalledTimes(1);
  });

  it('não escreve nada quando não há nada a migrar', async () => {
    mockedGetBarbeiro.mockResolvedValue({ id: 'barbeiro1', clientesBanidos: [] });
    await migrarBanidosLegado('barbeiro1');
    expect(mockedSetDoc).not.toHaveBeenCalled();
    expect(mockedUpdateDoc).not.toHaveBeenCalled();

    mockedGetBarbeiro.mockResolvedValue({ id: 'barbeiro1' });
    await migrarBanidosLegado('barbeiro1');
    expect(mockedUpdateDoc).not.toHaveBeenCalled();
  });

  it('é silenciosa: o cliente também chama listarBanidos e não pode quebrar', async () => {
    // O cliente não tem permissão de escrita no doc do barbeiro. A migração
    // simplesmente não acontece para ele — sem exceção subindo para a tela.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedGetBarbeiro.mockResolvedValue({
      id: 'barbeiro1',
      clientesBanidos: [{ uid: 'cli1' }],
    });
    mockedUpdateDoc.mockRejectedValue(new Error('permission-denied'));

    await expect(migrarBanidosLegado('barbeiro1')).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
