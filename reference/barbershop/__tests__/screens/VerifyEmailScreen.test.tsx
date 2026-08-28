import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import VerifyEmailScreen from '../../src/screens/VerifyEmailScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { auth } from '../../firebaseConfig';
import { getProfile } from '../../src/data/repositories/UsuarioRepository';
import { upsertBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { lembrarSessao } from '../../src/services/SessaoService';
import {
  consumirAgendamentoPendente,
  consumirConvitePendente,
  consumirRelatorioPendente,
} from '../../src/services/DeepLinkService';

jest.mock('firebase/auth', () => ({
  sendEmailVerification: jest.fn(),
}));

jest.mock('../../firebaseConfig', () => ({
  auth: { currentUser: null },
}));

jest.mock('../../src/data/repositories/UsuarioRepository', () => ({
  getProfile: jest.fn(),
}));

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  upsertBarbeiro: jest.fn(),
}));

jest.mock('../../src/services/SessaoService', () => ({
  lembrarSessao: jest.fn(),
  encerrarSessao: jest.fn(),
}));

jest.mock('../../src/services/DeepLinkService', () => ({
  consumirAgendamentoPendente: jest.fn(),
  consumirConvitePendente: jest.fn(),
  consumirRelatorioPendente: jest.fn(),
}));

const mockedGetProfile = getProfile as jest.Mock;
const mockedUpsertBarbeiro = upsertBarbeiro as jest.Mock;
const mockedLembrarSessao = lembrarSessao as jest.Mock;
const mockedConsumirAgendamento = consumirAgendamentoPendente as jest.Mock;
const mockedConsumirConvite = consumirConvitePendente as jest.Mock;
const mockedConsumirRelatorio = consumirRelatorioPendente as jest.Mock;

const navigation = {
  replace: jest.fn(),
  reset: jest.fn(),
} as any;

const renderScreen = () => render(
  <ThemeProvider>
    <VerifyEmailScreen navigation={navigation} route={{} as any} />
  </ThemeProvider>,
);

const concluirVerificacao = () => {
  const tela = renderScreen();
  fireEvent.press(tela.getByLabelText('Já confirmei meu email'));
};

describe('VerifyEmailScreen — entrada autenticada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as any).currentUser = {
      uid: 'usuario-1',
      email: 'usuario@exemplo.com',
      emailVerified: true,
      reload: jest.fn().mockResolvedValue(undefined),
      getIdToken: jest.fn().mockResolvedValue('token'),
    };
    mockedGetProfile.mockResolvedValue({ tipo: 'cliente', nome: 'Cliente' });
    mockedUpsertBarbeiro.mockResolvedValue(undefined);
    mockedLembrarSessao.mockResolvedValue(undefined);
    mockedConsumirConvite.mockResolvedValue(null);
    mockedConsumirAgendamento.mockResolvedValue(null);
    mockedConsumirRelatorio.mockResolvedValue(false);
  });

  it('reinicia a pilha em Cliente depois da verificacao', async () => {
    concluirVerificacao();

    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Cliente' }],
    }));
  });

  it('reinicia a pilha em Barbeiro depois da verificacao', async () => {
    mockedGetProfile.mockResolvedValue({
      tipo: 'barbeiro', nome: 'Barbeiro', telefone: '11999999999', especialidade: 'Corte',
    });

    concluirVerificacao();

    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Barbeiro' }],
    }));
  });

  it('retoma o relatório pendente na aba Analytics para barbeiro', async () => {
    mockedGetProfile.mockResolvedValue({
      tipo: 'barbeiro', nome: 'Barbeiro', telefone: '11999999999', especialidade: 'Corte',
    });
    mockedConsumirRelatorio.mockResolvedValue(true);

    concluirVerificacao();

    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Barbeiro', params: { screen: 'Analytics' } }],
    }));
  });

  it('cliente consome e descarta relatório pendente', async () => {
    mockedConsumirRelatorio.mockResolvedValue(true);

    concluirVerificacao();

    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Cliente' }],
    }));
    expect(mockedConsumirRelatorio).toHaveBeenCalledTimes(1);
  });

  it('mantem Cliente como base ao retomar um convite pendente', async () => {
    mockedConsumirConvite.mockResolvedValue({ codigo: 'ABCD1234', origem: 'qr' });

    concluirVerificacao();

    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [
        { name: 'Cliente' },
        { name: 'AbrirConvite', params: { codigo: 'ABCD1234', origem: 'qr' } },
      ],
    }));
  });

  it('mantem Cliente como base ao retomar um agendamento pendente', async () => {
    mockedConsumirAgendamento.mockResolvedValue('barbeiro-1');

    concluirVerificacao();

    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [
        { name: 'Cliente' },
        { name: 'AbrirAgendamento', params: { barbeiroId: 'barbeiro-1' } },
      ],
    }));
  });
});
