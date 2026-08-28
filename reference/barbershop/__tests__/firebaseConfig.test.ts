/**
 * Regressão da causa-raiz do pedido de 25/07/2026 ("toda vez preciso colocar
 * login e senha"): no React Native, `getAuth()` deixa a sessão apenas em
 * memória. É obrigatório inicializar com
 * `getReactNativePersistence(AsyncStorage)` para o login sobreviver ao
 * fechamento do app.
 *
 * Este teste existe para que ninguém volte a trocar `initializeAuth` por
 * `getAuth` sem perceber que está reintroduzindo o bug.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// O jest.setup mocka './firebaseConfig' para todas as telas; aqui queremos o
// módulo de verdade.
jest.unmock('../firebaseConfig');

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({ name: 'app-de-teste' })),
  getApps: jest.fn(() => []),
  getApp: jest.fn(() => ({ name: 'app-de-teste' })),
}));

describe('firebaseConfig', () => {
  const carregar = () => {
    let modulo: typeof import('../firebaseConfig');
    jest.isolateModules(() => {
      modulo = require('../firebaseConfig');
    });
    return modulo!;
  };

  beforeEach(() => jest.clearAllMocks());

  it('inicializa o Auth com persistência no AsyncStorage', () => {
    const { initializeAuth, getReactNativePersistence, getAuth } = require('firebase/auth');
    const persistencia = { __persistencia: true };
    (getReactNativePersistence as jest.Mock).mockReturnValue(persistencia);

    carregar();

    expect(getReactNativePersistence).toHaveBeenCalledWith(AsyncStorage);
    expect(initializeAuth).toHaveBeenCalledWith(expect.anything(), { persistence: persistencia });
    // getAuth só serve de escape quando o Auth já foi inicializado antes.
    expect(getAuth).not.toHaveBeenCalled();
  });

  it('reaproveita a instância existente quando o Auth já foi inicializado', () => {
    const { initializeAuth, getAuth } = require('firebase/auth');
    (initializeAuth as jest.Mock).mockImplementationOnce(() => {
      throw Object.assign(new Error('já inicializado'), { code: 'auth/already-initialized' });
    });
    (getAuth as jest.Mock).mockReturnValue({ languageCode: null });

    carregar();

    expect(getAuth).toHaveBeenCalled();
    // Erro esperado: não deve alarmar o console.
    expect(console.error).not.toHaveBeenCalled();
  });

  it('grita no console se a persistência falhar por qualquer outro motivo', () => {
    const { initializeAuth, getAuth } = require('firebase/auth');
    (initializeAuth as jest.Mock).mockImplementationOnce(() => {
      throw new Error('AsyncStorage indisponível');
    });
    (getAuth as jest.Mock).mockReturnValue({ languageCode: null });

    carregar();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('persistência da sessão'),
      expect.anything(),
    );
  });

  it('mantém os emails do Firebase em português', () => {
    const { getReactNativePersistence } = require('firebase/auth');
    (getReactNativePersistence as jest.Mock).mockReturnValue({});

    const { auth } = carregar();

    expect(auth.languageCode).toBe('pt-BR');
  });
});
