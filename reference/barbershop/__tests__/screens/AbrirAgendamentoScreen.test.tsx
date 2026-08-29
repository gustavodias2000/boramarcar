/**
 * AbrirAgendamentoScreen — porta de entrada do deep link legado
 * `barbershop://agendar/{barbeiroId}`. Requisito central desta fase: o link
 * antigo continua abrindo o agendamento exatamente como sempre, e o novo
 * registro de vínculo (`resgatarConvitePorBarbeiroLegado`) roda nos
 * bastidores — se ele falhar (rede, ou o backend recusar porque quem
 * escaneou é um barbeiro), a navegação para Agendamento não pode travar.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import AbrirAgendamentoScreen from '../../src/screens/AbrirAgendamentoScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { auth } from '../../firebaseConfig';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { resgatarConvitePorBarbeiroLegado } from '../../src/data/repositories/VinculoClienteRepository';
import { guardarAgendamentoPendente } from '../../src/services/DeepLinkService';

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/VinculoClienteRepository', () => ({
  resgatarConvitePorBarbeiroLegado: jest.fn(),
}));

jest.mock('../../src/services/DeepLinkService', () => ({
  guardarAgendamentoPendente: jest.fn(),
}));

const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedResgatarLegado = resgatarConvitePorBarbeiroLegado as jest.Mock;
const mockedGuardarPendente = guardarAgendamentoPendente as jest.Mock;

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const mockNavigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() } as any;

const renderTela = (barbeiroId = 'barbeiro-1') =>
  renderWithTheme(
    <AbrirAgendamentoScreen navigation={mockNavigation} route={{ params: { barbeiroId } } as any} />,
  );

const barbeiro = { id: 'barbeiro-1', nome: 'João' };

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'cliente-1', email: 'cliente@exemplo.com' };
  mockedGuardarPendente.mockResolvedValue(undefined);
  mockedGetBarbeiro.mockResolvedValue(barbeiro);
  mockedResgatarLegado.mockResolvedValue({ tipo: 'profissional', alvoId: 'barbeiro-1' });
});

describe('fluxo de sucesso — link antigo continua funcionando', () => {
  it('navega para Agendamento com o barbeiro encontrado', async () => {
    renderTela();

    await waitFor(() =>
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        'Agendamento',
        expect.objectContaining({ barbeiro: expect.objectContaining({ id: 'barbeiro-1' }) }),
      ),
    );
  });

  it('chama resgatarConvitePorBarbeiroLegado com o barbeiroId do link', async () => {
    renderTela('barbeiro-1');

    await waitFor(() => expect(mockedResgatarLegado).toHaveBeenCalledWith('barbeiro-1'));
  });
});

describe('resgatarConvitePorBarbeiroLegado falha — não pode quebrar o link antigo', () => {
  it('erro de rede: a navegação para Agendamento acontece mesmo assim', async () => {
    mockedResgatarLegado.mockRejectedValue(new Error('offline'));

    renderTela();

    await waitFor(() =>
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        'Agendamento',
        expect.objectContaining({ barbeiro: expect.objectContaining({ id: 'barbeiro-1' }) }),
      ),
    );
  });

  it('permission-denied (quem escaneou é um barbeiro, não cliente): navega mesmo assim, sem Alert de erro', async () => {
    mockedResgatarLegado.mockRejectedValue(
      Object.assign(new Error('Apenas contas de cliente podem adicionar barbearias.'), {
        code: 'functions/permission-denied',
      }),
    );

    renderTela();

    await waitFor(() =>
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        'Agendamento',
        expect.objectContaining({ barbeiro: expect.objectContaining({ id: 'barbeiro-1' }) }),
      ),
    );
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('sem barbeiroId', () => {
  it('mostra alerta de link inválido e volta para Cliente, sem chamar os repositórios', async () => {
    renderWithTheme(
      <AbrirAgendamentoScreen navigation={mockNavigation} route={{ params: { barbeiroId: '' } } as any} />,
    );

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));
    expect(Alert.alert).toHaveBeenCalledWith('Link inválido', 'Este link de agendamento está incompleto.');
    expect(mockedGetBarbeiro).not.toHaveBeenCalled();
    expect(mockedResgatarLegado).not.toHaveBeenCalled();
  });
});

describe('ninguém logado', () => {
  it('guarda o link pendente e navega para Login, sem buscar o barbeiro', async () => {
    (auth as any).currentUser = null;

    renderTela('barbeiro-1');

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Login'));
    expect(mockedGuardarPendente).toHaveBeenCalledWith('barbeiro-1');
    expect(mockedGetBarbeiro).not.toHaveBeenCalled();
    expect(mockedResgatarLegado).not.toHaveBeenCalled();
  });
});

describe('profissional não encontrado', () => {
  it('mostra alerta e volta para Cliente, sem tentar registrar o vínculo', async () => {
    mockedGetBarbeiro.mockResolvedValue(null);

    renderTela();

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Profissional não encontrado',
      'Este QR Code aponta para um profissional que não está mais disponível no app.',
    );
    expect(mockedResgatarLegado).not.toHaveBeenCalled();
  });
});
