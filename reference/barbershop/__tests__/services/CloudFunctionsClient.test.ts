/**
 * CloudFunctionsClient — substituto de `httpsCallable` do SDK do Firebase,
 * criado porque o mecanismo interno do SDK falhava com "internal" em ~3ms em
 * dispositivo real (Android), sem nunca chegar ao servidor (confirmado ao
 * vivo com fetch manual + getIdToken funcionando perfeitamente para a mesma
 * chamada — ver comentário no topo de CloudFunctionsClient.ts).
 *
 * Estes testes travam o contrato que os 5 chamadores (VinculoClienteRepository,
 * AgendamentoRepository, ObservabilityService, GeocodingService,
 * WhatsAppService) dependem: mesma assinatura de `httpsCallable`, mesmo
 * formato de erro (`FirebaseError`, `.code` = 'functions/<codigo>').
 */
import { httpsCallable } from '../../src/services/CloudFunctionsClient';
import { auth } from '../../firebaseConfig';

const mockedFetch = jest.fn();
global.fetch = mockedFetch as any;

const functionsInstance = {
  region: 'us-central1',
  app: { options: { projectId: 'barbershop-5dca2' } },
};

const respostaFetch = (status: number, corpo: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(corpo),
});

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'uid1', getIdToken: jest.fn().mockResolvedValue('token-falso') };
});

describe('httpsCallable — sucesso', () => {
  it('monta a URL a partir de region/projectId da instância e envia { data: dados }', async () => {
    mockedFetch.mockResolvedValue(respostaFetch(200, { result: { ok: true } }));

    await httpsCallable(functionsInstance, 'garantirConvite')({ codigo: 'ABC' });

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://us-central1-barbershop-5dca2.cloudfunctions.net/garantirConvite',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ data: { codigo: 'ABC' } }),
      }),
    );
  });

  it('anexa o token de auth como Authorization Bearer', async () => {
    mockedFetch.mockResolvedValue(respostaFetch(200, { result: {} }));

    await httpsCallable(functionsInstance, 'garantirConvite')({});

    const [, opcoes] = mockedFetch.mock.calls[0];
    expect(opcoes.headers.Authorization).toBe('Bearer token-falso');
  });

  it('envia sem Authorization quando não há usuário logado', async () => {
    (auth as any).currentUser = null;
    mockedFetch.mockResolvedValue(respostaFetch(200, { result: {} }));

    await httpsCallable(functionsInstance, 'garantirConvite')({});

    const [, opcoes] = mockedFetch.mock.calls[0];
    expect(opcoes.headers.Authorization).toBeUndefined();
  });

  it('devolve { data } a partir de corpo.result', async () => {
    mockedFetch.mockResolvedValue(respostaFetch(200, { result: { codigo: 'XYZ' } }));

    await expect(httpsCallable(functionsInstance, 'garantirConvite')({})).resolves.toEqual({
      data: { codigo: 'XYZ' },
    });
  });

  it('também aceita corpo.data (compatibilidade)', async () => {
    mockedFetch.mockResolvedValue(respostaFetch(200, { data: { codigo: 'XYZ' } }));

    await expect(httpsCallable(functionsInstance, 'garantirConvite')({})).resolves.toEqual({
      data: { codigo: 'XYZ' },
    });
  });

  it('sem argumento, envia { data: {} }', async () => {
    mockedFetch.mockResolvedValue(respostaFetch(200, { result: {} }));

    await httpsCallable(functionsInstance, 'garantirConvite')();

    const [, opcoes] = mockedFetch.mock.calls[0];
    expect(opcoes.body).toBe(JSON.stringify({ data: {} }));
  });
});

describe('httpsCallable — erro do servidor (HttpsError)', () => {
  it('mapeia o status da resposta para o código funcions/<codigo>', async () => {
    mockedFetch.mockResolvedValue(
      respostaFetch(404, { error: { status: 'NOT_FOUND', message: 'Código não encontrado.' } }),
    );

    await expect(httpsCallable(functionsInstance, 'criarVinculoCliente')({})).rejects.toMatchObject({
      name: 'FirebaseError',
      code: 'functions/not-found',
      message: 'Código não encontrado.',
    });
  });

  it('cobre todos os status HttpsError conhecidos', async () => {
    const casos: Array<[string, string]> = [
      ['UNAUTHENTICATED', 'functions/unauthenticated'],
      ['PERMISSION_DENIED', 'functions/permission-denied'],
      ['FAILED_PRECONDITION', 'functions/failed-precondition'],
      ['ALREADY_EXISTS', 'functions/already-exists'],
      ['INVALID_ARGUMENT', 'functions/invalid-argument'],
      ['RESOURCE_EXHAUSTED', 'functions/resource-exhausted'],
      ['INTERNAL', 'functions/internal'],
      ['UNAVAILABLE', 'functions/unavailable'],
    ];
    for (const [status, codigoEsperado] of casos) {
      mockedFetch.mockResolvedValue(respostaFetch(400, { error: { status, message: 'x' } }));
      await expect(httpsCallable(functionsInstance, 'x')({})).rejects.toMatchObject({ code: codigoEsperado });
    }
  });

  it('status desconhecido cai em functions/internal', async () => {
    mockedFetch.mockResolvedValue(respostaFetch(400, { error: { status: 'ALGO_NOVO', message: 'x' } }));

    await expect(httpsCallable(functionsInstance, 'x')({})).rejects.toMatchObject({
      code: 'functions/internal',
    });
  });
});

describe('httpsCallable — falhas de rede/infra', () => {
  it('fetch rejeitando vira functions/unavailable', async () => {
    mockedFetch.mockRejectedValue(new Error('Network request failed'));

    await expect(httpsCallable(functionsInstance, 'x')({})).rejects.toMatchObject({
      name: 'FirebaseError',
      code: 'functions/unavailable',
    });
  });

  it('resposta não-OK sem corpo de erro vira functions/internal', async () => {
    mockedFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error('sem corpo')) });

    await expect(httpsCallable(functionsInstance, 'x')({})).rejects.toMatchObject({
      code: 'functions/internal',
    });
  });
});
