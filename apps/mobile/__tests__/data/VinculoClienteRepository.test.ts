/**
 * VinculoClienteRepository — único ponto de acesso ao vínculo do cliente com
 * uma barbearia/profissional e às Cloud Functions que criam esse vínculo.
 * Cobre: filtro em memória de vínculos inativos, normalização do código
 * digitado (trim + uppercase) antes de enviar ao servidor, e a propagação
 * de erro/resultado das três Cloud Functions envolvidas.
 */
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from '../../src/services/CloudFunctionsClient';
import {
  listarVinculosDoCliente,
  resgatarConvitePorCodigo,
  resgatarConvitePorBarbeiroLegado,
  obterOuCriarConviteProprio,
} from '../../src/data/repositories/VinculoClienteRepository';

jest.mock('../../src/services/CloudFunctionsClient', () => ({
  httpsCallable: jest.fn(),
}));

const mockedCollection = collection as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedHttpsCallable = httpsCallable as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedCollection.mockImplementation((_db: unknown, ...p: string[]) => ({ path: p.join('/') }));
});

describe('listarVinculosDoCliente', () => {
  it('lê a subcoleção usuarios/{uid}/vinculos', async () => {
    mockedGetDocs.mockResolvedValue({ docs: [] });

    await listarVinculosDoCliente('cliente-1');

    expect(mockedCollection).toHaveBeenCalledWith(expect.anything(), 'usuarios', 'cliente-1', 'vinculos');
    expect(mockedGetDocs).toHaveBeenCalledWith(expect.objectContaining({ path: 'usuarios/cliente-1/vinculos' }));
  });

  it('devolve os vínculos com o id embutido', async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [
        { id: 'v1', data: () => ({ tipo: 'profissional', alvoId: 'b1' }) },
        { id: 'v2', data: () => ({ tipo: 'negocio', alvoId: 'neg1' }) },
      ],
    });

    await expect(listarVinculosDoCliente('cliente-1')).resolves.toEqual([
      { id: 'v1', tipo: 'profissional', alvoId: 'b1' },
      { id: 'v2', tipo: 'negocio', alvoId: 'neg1' },
    ]);
  });

  it('filtra em memória os vínculos com ativo: false', async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [
        { id: 'v1', data: () => ({ tipo: 'profissional', alvoId: 'b1', ativo: true }) },
        { id: 'v2', data: () => ({ tipo: 'profissional', alvoId: 'b2', ativo: false }) },
        { id: 'v3', data: () => ({ tipo: 'negocio', alvoId: 'neg1' }) }, // sem campo ativo = considera ativo
      ],
    });

    const resultado = await listarVinculosDoCliente('cliente-1');

    expect(resultado.map((v) => v.id)).toEqual(['v1', 'v3']);
  });
});

describe('resgatarConvitePorCodigo', () => {
  it('chama criarVinculoCliente com o código normalizado (trim + uppercase) e a origem', async () => {
    const enviar = jest.fn().mockResolvedValue({ data: { tipo: 'negocio', alvoId: 'neg1' } });
    mockedHttpsCallable.mockReturnValue(enviar);

    await resgatarConvitePorCodigo('  ab12cd34  ', 'qr');

    expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'criarVinculoCliente');
    expect(enviar).toHaveBeenCalledWith({ codigo: 'AB12CD34', origem: 'qr' });
  });

  it('propaga o resultado (resultado.data)', async () => {
    const dadosResposta = {
      tipo: 'negocio',
      alvoId: 'neg1',
      barbeiroOrigemId: 'b1',
      nome: 'Barbearia Central',
      jaVinculado: false,
    };
    mockedHttpsCallable.mockReturnValue(jest.fn().mockResolvedValue({ data: dadosResposta }));

    await expect(resgatarConvitePorCodigo('ABCD1234', 'codigo')).resolves.toEqual(dadosResposta);
  });

  it('propaga o erro sem engolir', async () => {
    const erro = Object.assign(new Error('Código não encontrado.'), { code: 'functions/not-found' });
    mockedHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue(erro));

    await expect(resgatarConvitePorCodigo('ABCD1234', 'link')).rejects.toBe(erro);
  });
});

describe('resgatarConvitePorBarbeiroLegado', () => {
  it('chama criarVinculoCliente com barbeiroIdLegado e origem "link"', async () => {
    const enviar = jest.fn().mockResolvedValue({ data: { tipo: 'profissional', alvoId: 'b1' } });
    mockedHttpsCallable.mockReturnValue(enviar);

    await resgatarConvitePorBarbeiroLegado('b1');

    expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'criarVinculoCliente');
    expect(enviar).toHaveBeenCalledWith({ barbeiroIdLegado: 'b1', origem: 'link' });
  });

  it('propaga o resultado e o erro como resgatarConvitePorCodigo', async () => {
    const dadosResposta = { tipo: 'profissional', alvoId: 'b1', barbeiroOrigemId: 'b1', nome: 'João', jaVinculado: true };
    mockedHttpsCallable.mockReturnValue(jest.fn().mockResolvedValue({ data: dadosResposta }));
    await expect(resgatarConvitePorBarbeiroLegado('b1')).resolves.toEqual(dadosResposta);

    const erro = Object.assign(new Error('offline'), { code: 'functions/unavailable' });
    mockedHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue(erro));
    await expect(resgatarConvitePorBarbeiroLegado('b1')).rejects.toBe(erro);
  });
});

describe('obterOuCriarConviteProprio', () => {
  it('chama garantirConvite sem argumentos e devolve o resultado', async () => {
    const dadosResposta = { codigo: 'AB12CD34', tipo: 'profissional', alvoId: 'b1' };
    const enviar = jest.fn().mockResolvedValue({ data: dadosResposta });
    mockedHttpsCallable.mockReturnValue(enviar);

    await expect(obterOuCriarConviteProprio()).resolves.toEqual(dadosResposta);

    expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'garantirConvite');
    expect(enviar).toHaveBeenCalledWith({});
  });

  it('propaga o erro sem engolir', async () => {
    const erro = Object.assign(new Error('falha'), { code: 'functions/internal' });
    mockedHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue(erro));

    await expect(obterOuCriarConviteProprio()).rejects.toBe(erro);
  });
});
