import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import LoginScreen from '../../src/screens/LoginScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getProfile } from '../../src/data/repositories/UsuarioRepository';
import { lembrarSessao } from '../../src/services/SessaoService';
import {
  consumirAgendamentoPendente,
  consumirConvitePendente,
  consumirRelatorioPendente,
} from '../../src/services/DeepLinkService';

const renderWithTheme = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('../../firebaseConfig', () => ({
  auth: {}
}));

jest.mock('../../src/data/repositories/UsuarioRepository', () => ({
  getProfile: jest.fn(),
}));

jest.mock('../../src/services/SessaoService', () => ({
  lembrarSessao: jest.fn(),
}));

jest.mock('../../src/services/DeepLinkService', () => ({
  consumirAgendamentoPendente: jest.fn(),
  consumirConvitePendente: jest.fn(),
  consumirRelatorioPendente: jest.fn(),
}));

// Mock navigation
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockReset = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  replace: mockReplace,
  reset: mockReset,
  canGoBack: () => false,
};

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render login form correctly', () => {
    const { getByText, getByPlaceholderText, getByLabelText } = renderWithTheme(
      <LoginScreen navigation={mockNavigation} />
    );

    // O hero de marca+manifesto migrou para a WelcomeScreen; o Login agora
    // mostra um título curto de "bem-vindo de volta".
    expect(getByText('Bem-vindo\nde volta.')).toBeTruthy();
    expect(getByText('Entrar na conta')).toBeTruthy();
    expect(getByPlaceholderText('seu@email.com')).toBeTruthy();
    expect(getByPlaceholderText('Sua senha')).toBeTruthy();
    expect(getByLabelText('Entrar no aplicativo')).toBeTruthy();
  });

  it('should show error for invalid email', async () => {
    const { getByPlaceholderText, getByLabelText, queryByText } = renderWithTheme(
      <LoginScreen navigation={mockNavigation} />
    );

    const emailInput = getByPlaceholderText('seu@email.com');
    const loginButton = getByLabelText('Entrar no aplicativo');

    fireEvent.changeText(emailInput, 'email-invalido');
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(queryByText(/Email inválido/)).toBeTruthy();
    });
  });

  it('should show error for short password', async () => {
    const { getByPlaceholderText, getByLabelText, queryByText } = renderWithTheme(
      <LoginScreen navigation={mockNavigation} />
    );

    const emailInput = getByPlaceholderText('seu@email.com');
    const passwordInput = getByPlaceholderText('Sua senha');
    const loginButton = getByLabelText('Entrar no aplicativo');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, '123');
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(queryByText(/Mínimo 6 caracteres/)).toBeTruthy();
    });
  });

  it('should clear error when user starts typing', async () => {
    const { getByPlaceholderText, getByLabelText, queryByText } = renderWithTheme(
      <LoginScreen navigation={mockNavigation} />
    );

    const emailInput = getByPlaceholderText('seu@email.com');
    const loginButton = getByLabelText('Entrar no aplicativo');

    // Trigger error
    fireEvent.changeText(emailInput, 'email-invalido');
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(queryByText(/Email inválido/)).toBeTruthy();
    });

    // Start typing to clear error
    fireEvent.changeText(emailInput, 'test@example.com');

    await waitFor(() => {
      expect(queryByText(/Email inválido/)).toBeNull();
    });
  });

  it('should validate form before submission', async () => {
    const { getByLabelText } = renderWithTheme(
      <LoginScreen navigation={mockNavigation} />
    );

    const loginButton = getByLabelText('Entrar no aplicativo');
    fireEvent.press(loginButton);

    // Should not call navigation if form is invalid
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// Retomada de convite/agendamento pendente após o login — o cliente que
// escaneou um QR Code/link antes de ter conta é redirecionado direto para o
// fluxo pendente em vez de cair na Home. Convite tem prioridade sobre
// agendamento (mesma ordem implementada em LoginScreen.handleLogin).
describe('LoginScreen — retomada pós-login', () => {
  const login = async () => {
    const { getByPlaceholderText, getByLabelText } = renderWithTheme(
      <LoginScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('seu@email.com'), 'cliente@exemplo.com');
    fireEvent.changeText(getByPlaceholderText('Sua senha'), 'senha123');
    fireEvent.press(getByLabelText('Entrar no aplicativo'));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    signInWithEmailAndPassword.mockResolvedValue({
      user: {
        uid: 'cliente-1',
        emailVerified: true,
        getIdToken: jest.fn().mockResolvedValue('token'),
      },
    });
    getProfile.mockResolvedValue({ tipo: 'cliente' });
    lembrarSessao.mockResolvedValue(undefined);
    consumirConvitePendente.mockResolvedValue(null);
    consumirAgendamentoPendente.mockResolvedValue(null);
    consumirRelatorioPendente.mockResolvedValue(false);
  });

  it('sem nada pendente, reinicia a pilha em Cliente', async () => {
    await login();

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Cliente' }],
    }));
    expect(mockReplace).not.toHaveBeenCalledWith('Cliente');
  });

  it('sem nada pendente, reinicia a pilha em Barbeiro', async () => {
    getProfile.mockResolvedValue({ tipo: 'barbeiro' });

    await login();

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Barbeiro' }],
    }));
    expect(mockReplace).not.toHaveBeenCalledWith('Barbeiro');
  });

  it('retoma o relatório pendente somente para barbeiro', async () => {
    getProfile.mockResolvedValue({ tipo: 'barbeiro' });
    consumirRelatorioPendente.mockResolvedValue(true);

    await login();

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Barbeiro', params: { screen: 'Analytics' } }],
    }));
  });

  it('cliente consome e descarta o relatório pendente sem acessar Analytics', async () => {
    consumirRelatorioPendente.mockResolvedValue(true);

    await login();

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Cliente' }],
    }));
    expect(consumirRelatorioPendente).toHaveBeenCalledTimes(1);
  });

  it('com convite pendente, navega para AbrirConvite com o código e a origem', async () => {
    consumirConvitePendente.mockResolvedValue({ codigo: 'ABCD1234', origem: 'qr' });

    await login();

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith({
      index: 1,
      routes: [
        { name: 'Cliente' },
        { name: 'AbrirConvite', params: { codigo: 'ABCD1234', origem: 'qr' } },
      ],
    }));
  });

  it('sem convite mas com agendamento pendente, navega para AbrirAgendamento', async () => {
    consumirAgendamentoPendente.mockResolvedValue('barbeiro-1');

    await login();

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith({
      index: 1,
      routes: [
        { name: 'Cliente' },
        { name: 'AbrirAgendamento', params: { barbeiroId: 'barbeiro-1' } },
      ],
    }));
  });

  it('convite pendente tem prioridade sobre agendamento pendente quando os dois existem', async () => {
    consumirConvitePendente.mockResolvedValue({ codigo: 'ABCD1234', origem: 'link' });
    consumirAgendamentoPendente.mockResolvedValue('barbeiro-1');

    await login();

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith({
      index: 1,
      routes: [
        { name: 'Cliente' },
        { name: 'AbrirConvite', params: { codigo: 'ABCD1234', origem: 'link' } },
      ],
    }));
    expect(mockReset).not.toHaveBeenCalledWith(expect.objectContaining({
      routes: expect.arrayContaining([
        expect.objectContaining({ name: 'AbrirAgendamento' }),
      ]),
    }));
  });
});
