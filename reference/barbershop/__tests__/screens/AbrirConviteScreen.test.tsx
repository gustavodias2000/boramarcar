/**
 * AbrirConviteScreen — porta de entrada do deep link `barbershop://convite/{codigo}`.
 * Cobre os quatro desfechos documentados no cabeçalho da tela: ninguém
 * logado (guarda o convite pendente e manda para o Login), código
 * malformado (avisa e volta), sucesso (perfil do profissional ou Cliente) e
 * erro do backend (Alert com a mensagem mapeada, sem travar a navegação).
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import AbrirConviteScreen from '../../src/screens/AbrirConviteScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { auth } from '../../firebaseConfig';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { resgatarConvitePorCodigo } from '../../src/data/repositories/VinculoClienteRepository';
import { guardarConvitePendente } from '../../src/services/DeepLinkService';

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/VinculoClienteRepository', () => ({
  resgatarConvitePorCodigo: jest.fn(),
}));

jest.mock('../../src/services/DeepLinkService', () => ({
  guardarConvitePendente: jest.fn(),
}));

const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedResgatar = resgatarConvitePorCodigo as jest.Mock;
const mockedGuardarPendente = guardarConvitePendente as jest.Mock;

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const mockNavigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() } as any;

const renderTela = (params: { codigo?: string; origem?: string } = { codigo: 'ABCD1234' }) =>
  renderWithTheme(
    <AbrirConviteScreen navigation={mockNavigation} route={{ params } as any} />,
  );

const barbeiroResgatado = {
  tipo: 'profissional',
  alvoId: 'b1',
  barbeiroOrigemId: 'b1',
  nome: 'João',
  jaVinculado: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'cliente-1', email: 'cliente@exemplo.com' };
  mockedGuardarPendente.mockResolvedValue(undefined);
});

describe('ninguém logado', () => {
  it('guarda o convite pendente e navega para Login, sem chamar o repositório', async () => {
    (auth as any).currentUser = null;

    renderTela({ codigo: 'ABCD1234', origem: 'qr' });

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Login'));

    expect(mockedGuardarPendente).toHaveBeenCalledWith('ABCD1234', 'qr');
    expect(mockedResgatar).not.toHaveBeenCalled();
  });

  it('usa origem "link" quando route.params.origem não vem definida', async () => {
    (auth as any).currentUser = null;

    renderTela({ codigo: 'ABCD1234' });

    await waitFor(() => expect(mockedGuardarPendente).toHaveBeenCalledWith('ABCD1234', 'link'));
  });
});

describe('código malformado', () => {
  it('mostra alerta de link inválido e volta para Cliente, sem chamar o repositório', async () => {
    renderTela({ codigo: '' });

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));

    expect(Alert.alert).toHaveBeenCalledWith('Link inválido', 'Este link de convite está incompleto.');
    expect(mockedResgatar).not.toHaveBeenCalled();
  });

  it('trata params ausente da mesma forma', async () => {
    renderWithTheme(<AbrirConviteScreen navigation={mockNavigation} route={{} as any} />);

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));
    expect(mockedResgatar).not.toHaveBeenCalled();
  });
});

describe('sucesso', () => {
  it('navega para PerfilProfissional quando getBarbeiro resolve o profissional', async () => {
    mockedResgatar.mockResolvedValue(barbeiroResgatado);
    mockedGetBarbeiro.mockResolvedValue({ id: 'b1', nome: 'João' });

    renderTela();

    await waitFor(() =>
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        'PerfilProfissional',
        expect.objectContaining({ barbeiro: expect.objectContaining({ id: 'b1' }) }),
      ),
    );
  });

  it('navega para Cliente quando getBarbeiro falha', async () => {
    mockedResgatar.mockResolvedValue(barbeiroResgatado);
    mockedGetBarbeiro.mockRejectedValue(new Error('offline'));

    renderTela();

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));
  });

  it('navega para Cliente quando getBarbeiro devolve null', async () => {
    mockedResgatar.mockResolvedValue(barbeiroResgatado);
    mockedGetBarbeiro.mockResolvedValue(null);

    renderTela();

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));
  });

  it('navega para Cliente (não PerfilProfissional) quando o profissional do convite está desativado', async () => {
    // Vínculo de equipe aberto pelo código de UM profissional que foi
    // desativado entre a geração do convite e este resgate — o vínculo com
    // a barbearia continua válido, mas a tela dele não deve abrir.
    mockedResgatar.mockResolvedValue({ ...barbeiroResgatado, tipo: 'negocio', alvoId: 'negocio-1' });
    mockedGetBarbeiro.mockResolvedValue({ id: 'b1', nome: 'João', ativo: false });

    renderTela();

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));
    expect(mockNavigation.replace).not.toHaveBeenCalledWith('PerfilProfissional', expect.anything());
  });

  it('jaVinculado: true não é tratado como erro (sem Alert)', async () => {
    mockedResgatar.mockResolvedValue({ ...barbeiroResgatado, jaVinculado: true });
    mockedGetBarbeiro.mockResolvedValue({ id: 'b1', nome: 'João' });

    renderTela();

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('erro do backend — mostra alerta mapeado e não trava a navegação', () => {
  it.each([
    ['functions/not-found', 'Profissional não encontrado.'],
    ['functions/failed-precondition', 'Este código está inativo.'],
    ['functions/permission-denied', 'Apenas contas de cliente podem adicionar barbearias.'],
  ])('%s: mostra a mensagem do servidor e navega para Cliente', async (code, message) => {
    mockedResgatar.mockRejectedValue(Object.assign(new Error(message), { code }));

    renderTela();

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));
    expect(Alert.alert).toHaveBeenCalledWith('Não foi possível adicionar', message);
    expect(mockedGetBarbeiro).not.toHaveBeenCalled();
  });

  it('erro de infraestrutura (sem código reconhecido) usa mensagem genérica de conexão', async () => {
    mockedResgatar.mockRejectedValue(new Error('offline'));

    renderTela();

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Não foi possível adicionar',
      'Verifique sua conexão e tente novamente.',
    );
  });
});
