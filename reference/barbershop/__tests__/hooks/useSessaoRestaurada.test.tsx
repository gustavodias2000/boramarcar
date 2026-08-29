/**
 * O hook que decide a rota inicial do App. O teste-chave é o primeiro:
 * quem já está logado NÃO passa pela tela de Login.
 */
import { onAuthStateChanged } from 'firebase/auth';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useSessaoRestaurada } from '../../src/hooks/useSessaoRestaurada';
import { rotaInicialParaUsuario } from '../../src/services/SessaoService';

jest.mock('../../src/services/SessaoService', () => ({
  rotaInicialParaUsuario: jest.fn(),
}));

const mockedOnAuthStateChanged = onAuthStateChanged as jest.Mock;
const mockedRotaInicial = rotaInicialParaUsuario as jest.Mock;

/** Deixa o teste controlar QUANDO o Firebase responde. */
const emissaoManual = () => {
  let emitir: (user: unknown) => void = () => {};
  const parar = jest.fn();
  mockedOnAuthStateChanged.mockImplementation((_auth, callback) => {
    emitir = callback;
    return parar;
  });
  return { emitir: (user: unknown) => emitir(user), parar };
};

describe('useSessaoRestaurada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('abre direto na área do barbeiro quando a sessão foi restaurada', async () => {
    const { emitir } = emissaoManual();
    mockedRotaInicial.mockResolvedValue('Barbeiro');

    const { result } = renderHook(() => useSessaoRestaurada());
    emitir({ uid: 'uid1' });

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.rotaInicial).toBe('Barbeiro');
    expect(mockedRotaInicial).toHaveBeenCalledWith({ uid: 'uid1' });
  });

  it('fica carregando enquanto o Firebase não respondeu (não pisca o Login)', () => {
    emissaoManual();
    mockedRotaInicial.mockResolvedValue('Cliente');

    const { result } = renderHook(() => useSessaoRestaurada());

    expect(result.current.carregando).toBe(true);
  });

  it('vai para o Welcome quando não há ninguém logado', async () => {
    const { emitir } = emissaoManual();
    mockedRotaInicial.mockResolvedValue('Welcome');

    const { result } = renderHook(() => useSessaoRestaurada());
    emitir(null);

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.rotaInicial).toBe('Welcome');
    expect(mockedRotaInicial).toHaveBeenCalledWith(null);
  });

  it('ignora emissões seguintes (login/logout navegam por conta própria)', async () => {
    const { emitir } = emissaoManual();
    mockedRotaInicial.mockResolvedValue('Cliente');

    const { result } = renderHook(() => useSessaoRestaurada());
    emitir({ uid: 'uid1' });
    await waitFor(() => expect(result.current.carregando).toBe(false));

    emitir(null);
    emitir({ uid: 'outro' });

    expect(mockedRotaInicial).toHaveBeenCalledTimes(1);
    expect(result.current.rotaInicial).toBe('Cliente');
  });

  it('cancela a inscrição ao desmontar', () => {
    const { parar } = emissaoManual();
    mockedRotaInicial.mockResolvedValue('Login');

    const { unmount } = renderHook(() => useSessaoRestaurada());
    unmount();

    expect(parar).toHaveBeenCalled();
  });

  it('abre o Login em vez de travar se a restauração estourar', async () => {
    const { emitir } = emissaoManual();
    mockedRotaInicial.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useSessaoRestaurada());
    emitir({ uid: 'uid1' });

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.rotaInicial).toBe('Login');
  });
});
