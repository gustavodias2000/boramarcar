/**
 * AdicionarCodigoScreen — entrada manual do código de convite (mesma Cloud
 * Function de AbrirConviteScreen, origem 'codigo'). Cobre: validação de
 * campo vazio, proteção contra duplo clique (o botão fica `disabled`
 * enquanto `loading` é true — ver AdicionarCodigoScreen.tsx linha do
 * TouchableOpacity `disabled={loading}`) e o mesmo mapeamento de
 * mensagens/navegação de erro usado no deep link.
 */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AdicionarCodigoScreen from '../../src/screens/AdicionarCodigoScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { resgatarConvitePorCodigo } from '../../src/data/repositories/VinculoClienteRepository';

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/VinculoClienteRepository', () => ({
  resgatarConvitePorCodigo: jest.fn(),
}));

const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedResgatar = resgatarConvitePorCodigo as jest.Mock;

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const mockNavigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() } as any;

const renderTela = () => renderWithTheme(<AdicionarCodigoScreen navigation={mockNavigation} route={{} as any} />);

const barbeiroResgatado = {
  tipo: 'profissional',
  alvoId: 'b1',
  barbeiroOrigemId: 'b1',
  nome: 'João',
  jaVinculado: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('submeter vazio', () => {
  it('mostra alerta de atenção e não chama o repositório', () => {
    const utils = renderTela();

    fireEvent.press(utils.getByLabelText('Adicionar barbearia'));

    expect(Alert.alert).toHaveBeenCalledWith('Atenção', 'Digite o código da barbearia.');
    expect(mockedResgatar).not.toHaveBeenCalled();
  });
});

describe('proteção contra duplo clique', () => {
  it('desabilita o botão (accessibilityState.disabled) enquanto o envio está em andamento', async () => {
    let resolver!: (value: typeof barbeiroResgatado) => void;
    mockedResgatar.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    mockedGetBarbeiro.mockResolvedValue({ id: 'b1', nome: 'João' });

    const utils = renderTela();
    fireEvent.changeText(utils.getByLabelText('Campo do código de convite'), 'ABCD1234');

    const botao = utils.getByLabelText('Adicionar barbearia');
    fireEvent.press(botao);

    // Enquanto a Promise não resolve, o botão precisa estar desabilitado —
    // um segundo toque não deve disparar uma segunda chamada.
    await waitFor(() => expect(botao.props.accessibilityState.disabled).toBe(true));
    fireEvent.press(botao);
    expect(mockedResgatar).toHaveBeenCalledTimes(1);

    resolver(barbeiroResgatado);
    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalled());
  });
});

describe('sucesso', () => {
  it('navega para PerfilProfissional quando getBarbeiro resolve o profissional', async () => {
    mockedResgatar.mockResolvedValue(barbeiroResgatado);
    mockedGetBarbeiro.mockResolvedValue({ id: 'b1', nome: 'João' });

    const utils = renderTela();
    fireEvent.changeText(utils.getByLabelText('Campo do código de convite'), 'ABCD1234');
    fireEvent.press(utils.getByLabelText('Adicionar barbearia'));

    await waitFor(() =>
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        'PerfilProfissional',
        expect.objectContaining({ barbeiro: expect.objectContaining({ id: 'b1' }) }),
      ),
    );
    expect(mockedResgatar).toHaveBeenCalledWith('ABCD1234', 'codigo');
  });

  it('navega para Cliente quando getBarbeiro falha', async () => {
    mockedResgatar.mockResolvedValue(barbeiroResgatado);
    mockedGetBarbeiro.mockRejectedValue(new Error('offline'));

    const utils = renderTela();
    fireEvent.changeText(utils.getByLabelText('Campo do código de convite'), 'ABCD1234');
    fireEvent.press(utils.getByLabelText('Adicionar barbearia'));

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));
  });

  it('navega para Cliente (não PerfilProfissional) quando o profissional do convite está desativado', async () => {
    mockedResgatar.mockResolvedValue({ ...barbeiroResgatado, tipo: 'negocio', alvoId: 'negocio-1' });
    mockedGetBarbeiro.mockResolvedValue({ id: 'b1', nome: 'João', ativo: false });

    const utils = renderTela();
    fireEvent.changeText(utils.getByLabelText('Campo do código de convite'), 'ABCD1234');
    fireEvent.press(utils.getByLabelText('Adicionar barbearia'));

    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('Cliente'));
    expect(mockNavigation.replace).not.toHaveBeenCalledWith('PerfilProfissional', expect.anything());
  });
});

describe('erro do backend — mesmo mapeamento de AbrirConviteScreen', () => {
  it.each([
    ['functions/not-found', 'Código não encontrado.'],
    ['functions/failed-precondition', 'Este código está inativo.'],
    ['functions/permission-denied', 'Apenas contas de cliente podem adicionar barbearias.'],
  ])('%s: mostra a mensagem do servidor', async (code, message) => {
    mockedResgatar.mockRejectedValue(Object.assign(new Error(message), { code }));

    const utils = renderTela();
    fireEvent.changeText(utils.getByLabelText('Campo do código de convite'), 'ABCD1234');
    fireEvent.press(utils.getByLabelText('Adicionar barbearia'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Não foi possível adicionar', message),
    );
    expect(mockedGetBarbeiro).not.toHaveBeenCalled();
  });

  it('erro de infraestrutura usa mensagem genérica de conexão', async () => {
    mockedResgatar.mockRejectedValue(new Error('offline'));

    const utils = renderTela();
    fireEvent.changeText(utils.getByLabelText('Campo do código de convite'), 'ABCD1234');
    fireEvent.press(utils.getByLabelText('Adicionar barbearia'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Não foi possível adicionar',
        'Verifique sua conexão e tente novamente.',
      ),
    );
  });
});
