/**
 * FotoPerfilService — upload e remoção da foto de perfil do barbeiro no
 * Firebase Storage (`barbeiros/{barbeiroId}/perfil.jpg`).
 *
 * Cobre os dois contratos de que o resto do app depende:
 *  - upload bem-sucedido grava `fotoUrl` (já com cache-busting) no doc do
 *    barbeiro via `upsertBarbeiro` — sem isso a foto sobe no Storage mas a
 *    vitrine e o próprio AvatarIlustrado nunca refletem a mudança;
 *  - `apagarFotoPerfil` é tolerante a "a foto nunca existiu"
 *    (`storage/object-not-found`) mas PROPAGA qualquer outro erro — usado
 *    tanto na tela de perfil quanto na exclusão de conta (ver
 *    ExclusaoContaService), que depende de erros reais subindo para não
 *    encerrar a conta com um blob órfão no Storage.
 */
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { uploadFotoPerfil, apagarFotoPerfil } from '../../src/services/FotoPerfilService';
import { upsertBarbeiro } from '../../src/data/repositories/BarbeiroRepository';

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  upsertBarbeiro: jest.fn(() => Promise.resolve()),
}));

const mockedRef = ref as jest.Mock;
const mockedUploadBytes = uploadBytes as jest.Mock;
const mockedGetDownloadURL = getDownloadURL as jest.Mock;
const mockedDeleteObject = deleteObject as jest.Mock;
const mockedUpsertBarbeiro = upsertBarbeiro as jest.Mock;

// Objeto de referência "opaco" devolvido pelo `ref()` mockado — só precisa
// ser o mesmo valor usado depois em uploadBytes/getDownloadURL/deleteObject.
const FAKE_REF = { fullPath: 'barbeiros/barbeiro-1/perfil.jpg' };

beforeEach(() => {
  jest.clearAllMocks();
  mockedRef.mockReturnValue(FAKE_REF);
  mockedUploadBytes.mockResolvedValue(undefined);
  mockedGetDownloadURL.mockResolvedValue(
    'https://storage.example.com/barbeiros%2Fbarbeiro-1%2Fperfil.jpg',
  );
  mockedDeleteObject.mockResolvedValue(undefined);
  mockedUpsertBarbeiro.mockResolvedValue(undefined);

  // fetch(uri).blob() — o jest.setup.js mocka um fetch genérico (json), aqui
  // precisamos de um que responda `.blob()`, como o uploadFotoPerfil espera.
  global.fetch = jest.fn(() =>
    Promise.resolve({
      blob: () => Promise.resolve({ type: 'image/jpeg' }),
    }),
  ) as any;

  jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('uploadFotoPerfil', () => {
  it('sobe o blob sempre no path fixo barbeiros/{barbeiroId}/perfil.jpg', async () => {
    await uploadFotoPerfil('barbeiro-1', 'file:///tmp/foto.jpg');

    expect(mockedRef).toHaveBeenCalledWith(expect.anything(), 'barbeiros/barbeiro-1/perfil.jpg');
    expect(mockedUploadBytes).toHaveBeenCalledWith(
      FAKE_REF,
      { type: 'image/jpeg' },
      { contentType: 'image/jpeg' },
    );
  });

  it('grava fotoUrl com cache-busting no doc do barbeiro e retorna a mesma URL', async () => {
    const url = await uploadFotoPerfil('barbeiro-1', 'file:///tmp/foto.jpg');

    const esperado = 'https://storage.example.com/barbeiros%2Fbarbeiro-1%2Fperfil.jpg?v=1700000000000';
    expect(url).toBe(esperado);
    expect(mockedUpsertBarbeiro).toHaveBeenCalledWith('barbeiro-1', { fotoUrl: esperado });
  });

  it('usa image/jpeg como fallback quando o blob não informa contentType', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      blob: () => Promise.resolve({ type: '' }),
    });

    await uploadFotoPerfil('barbeiro-1', 'file:///tmp/foto.jpg');

    expect(mockedUploadBytes).toHaveBeenCalledWith(
      FAKE_REF,
      { type: '' },
      { contentType: 'image/jpeg' },
    );
  });

  it('propaga erro de upload e NÃO grava fotoUrl (doc e Storage não podem divergir)', async () => {
    mockedUploadBytes.mockRejectedValue(new Error('storage/unauthorized'));

    await expect(uploadFotoPerfil('barbeiro-1', 'file:///tmp/foto.jpg')).rejects.toThrow(
      'storage/unauthorized',
    );
    expect(mockedUpsertBarbeiro).not.toHaveBeenCalled();
  });

  it('propaga erro de getDownloadURL e NÃO grava fotoUrl', async () => {
    mockedGetDownloadURL.mockRejectedValue(new Error('network error'));

    await expect(uploadFotoPerfil('barbeiro-1', 'file:///tmp/foto.jpg')).rejects.toThrow(
      'network error',
    );
    expect(mockedUpsertBarbeiro).not.toHaveBeenCalled();
  });
});

describe('apagarFotoPerfil', () => {
  it('engole storage/object-not-found (foto nunca existiu — ex.: usuário sem upload)', async () => {
    mockedDeleteObject.mockRejectedValue({ code: 'storage/object-not-found' });

    await expect(apagarFotoPerfil('barbeiro-1')).resolves.toBeUndefined();
  });

  it('propaga qualquer outro erro do Storage (ex.: unauthorized, offline)', async () => {
    mockedDeleteObject.mockRejectedValue({ code: 'storage/unauthorized', message: 'nope' });

    await expect(apagarFotoPerfil('barbeiro-1')).rejects.toMatchObject({
      code: 'storage/unauthorized',
    });
  });

  it('apaga no mesmo path fixo usado pelo upload', async () => {
    await apagarFotoPerfil('barbeiro-1');

    expect(mockedRef).toHaveBeenCalledWith(expect.anything(), 'barbeiros/barbeiro-1/perfil.jpg');
    expect(mockedDeleteObject).toHaveBeenCalledWith(FAKE_REF);
  });

  it('resolve normalmente quando a foto existe e é apagada com sucesso', async () => {
    await expect(apagarFotoPerfil('barbeiro-1')).resolves.toBeUndefined();
    expect(mockedDeleteObject).toHaveBeenCalledTimes(1);
  });
});
