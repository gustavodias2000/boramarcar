import React from 'react';
import { Alert } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import AbrirRelatoriosScreen from '../../src/screens/AbrirRelatoriosScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { auth } from '../../firebaseConfig';
import { getProfile } from '../../src/data/repositories/UsuarioRepository';
import { guardarRelatorioPendente } from '../../src/services/DeepLinkService';

jest.mock('../../src/data/repositories/UsuarioRepository', () => ({
  getProfile: jest.fn(),
}));

jest.mock('../../src/services/DeepLinkService', () => ({
  guardarRelatorioPendente: jest.fn(),
}));

const mockedGetProfile = getProfile as jest.Mock;
const mockedGuardarRelatorio = guardarRelatorioPendente as jest.Mock;
const mockNavigation = { reset: jest.fn() } as any;

const renderTela = () => render(
  <ThemeProvider>
    <AbrirRelatoriosScreen navigation={mockNavigation} route={{} as any} />
  </ThemeProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'dono-1', emailVerified: true };
  mockedGetProfile.mockResolvedValue({ tipo: 'barbeiro' });
  mockedGuardarRelatorio.mockResolvedValue(undefined);
});

describe('AbrirRelatoriosScreen — deep link autenticado do e-mail', () => {
  it('abre somente a aba Analytics quando o perfil é de barbeiro', async () => {
    renderTela();

    await waitFor(() => expect(mockNavigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Barbeiro', params: { screen: 'Analytics' } }],
    }));
    expect(mockedGetProfile).toHaveBeenCalledWith('dono-1');
  });

  it('manda sessão pública para Login sem consultar o perfil', async () => {
    (auth as any).currentUser = null;
    renderTela();

    await waitFor(() => expect(mockNavigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Login' }],
    }));
    expect(mockedGetProfile).not.toHaveBeenCalled();
    expect(mockedGuardarRelatorio).toHaveBeenCalledTimes(1);
  });

  it('não libera relatório para e-mail ainda não confirmado', async () => {
    (auth as any).currentUser = { uid: 'dono-1', emailVerified: false };
    renderTela();

    await waitFor(() => expect(mockNavigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'VerifyEmail' }],
    }));
    expect(mockedGetProfile).not.toHaveBeenCalled();
    expect(mockedGuardarRelatorio).toHaveBeenCalledTimes(1);
  });

  it('mantém cliente autenticado na área de cliente, sem abrir Analytics', async () => {
    mockedGetProfile.mockResolvedValue({ tipo: 'cliente' });
    renderTela();

    await waitFor(() => expect(mockNavigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Cliente' }],
    }));
  });

  it('falha fechado quando não consegue confirmar o perfil', async () => {
    mockedGetProfile.mockRejectedValue(new Error('offline'));
    renderTela();

    await waitFor(() => expect(mockNavigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Login' }],
    }));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Não foi possível abrir o relatório',
      'Verifique sua conexão e tente abrir o link novamente.',
    );
  });
});
