import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ConfiguracaoRelatoriosEmailScreen from '../../src/screens/ConfiguracaoRelatoriosEmailScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import {
  getConfiguracaoRelatorioEmail,
  resolverAlvoRelatorioEmail,
  salvarConfiguracaoRelatorioEmail,
} from '../../src/data/repositories/RelatorioEmailRepository';

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({ getBarbeiro: jest.fn() }));
jest.mock('../../src/data/repositories/RelatorioEmailRepository', () => ({
  getConfiguracaoRelatorioEmail: jest.fn(),
  resolverAlvoRelatorioEmail: jest.fn(),
  salvarConfiguracaoRelatorioEmail: jest.fn(),
}));

const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedGetConfig = getConfiguracaoRelatorioEmail as jest.Mock;
const mockedResolverAlvo = resolverAlvoRelatorioEmail as jest.Mock;
const mockedSalvar = salvarConfiguracaoRelatorioEmail as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

const renderScreen = () => render(
  <ThemeProvider><ConfiguracaoRelatoriosEmailScreen /></ThemeProvider>,
);

const aguardarCarregamento = async (utils: ReturnType<typeof renderScreen>) => {
  await waitFor(() => expect(utils.getByLabelText('Receber relatório semanal por e-mail')).toBeTruthy());
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetBarbeiro.mockResolvedValue({ id: 'test-uid', nome: 'Dono' });
  mockedResolverAlvo.mockReturnValue({ tipo: 'autonomo', id: 'test-uid' });
  mockedGetConfig.mockResolvedValue({ semanal: true, mensal: false });
  mockedSalvar.mockResolvedValue(undefined);
});

describe('ConfiguracaoRelatoriosEmailScreen', () => {
  it('mantém envio semanal marcado e usa o email da conta quando não há preferência salva', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(utils.getByLabelText('Receber relatório semanal por e-mail').props.value).toBe(true);
    expect(utils.getByLabelText('Receber relatório mensal por e-mail').props.value).toBe(false);
    expect(utils.getByLabelText('E-mail para receber relatórios').props.value).toBe('test@example.com');
  });

  it('carrega frequência e destinatário previamente escolhidos', async () => {
    mockedGetConfig.mockResolvedValue({ semanal: false, mensal: true, emailDestino: 'financeiro@barbearia.com' });
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(utils.getByLabelText('Receber relatório semanal por e-mail').props.value).toBe(false);
    expect(utils.getByLabelText('Receber relatório mensal por e-mail').props.value).toBe(true);
    expect(utils.getByLabelText('E-mail para receber relatórios').props.value).toBe('financeiro@barbearia.com');
  });

  it('salva as duas frequências e normaliza o e-mail', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);
    fireEvent(utils.getByLabelText('Receber relatório mensal por e-mail'), 'valueChange', true);
    fireEvent.changeText(utils.getByLabelText('E-mail para receber relatórios'), ' FINANCEIRO@BARBEARIA.COM ');

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Salvar preferências de relatório por e-mail'));
      await Promise.resolve();
    });

    expect(mockedSalvar).toHaveBeenCalledWith(
      { tipo: 'autonomo', id: 'test-uid' },
      { semanal: true, mensal: true, emailDestino: 'financeiro@barbearia.com' },
      'test-uid',
    );
    expect(mockedAlert).toHaveBeenCalledWith('Preferências salvas', expect.any(String));
  });

  it('permite pausar todos os envios sem exigir destinatário', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);
    fireEvent(utils.getByLabelText('Receber relatório semanal por e-mail'), 'valueChange', false);
    fireEvent.changeText(utils.getByLabelText('E-mail para receber relatórios'), '');

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Salvar preferências de relatório por e-mail'));
      await Promise.resolve();
    });

    expect(mockedSalvar).toHaveBeenCalledWith(
      { tipo: 'autonomo', id: 'test-uid' },
      { semanal: false, mensal: false },
      'test-uid',
    );
  });

  it('não aceita e-mail inválido', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);
    fireEvent.changeText(utils.getByLabelText('E-mail para receber relatórios'), 'invalido');
    fireEvent.press(utils.getByLabelText('Salvar preferências de relatório por e-mail'));

    expect(mockedSalvar).not.toHaveBeenCalled();
    expect(mockedAlert).toHaveBeenCalledWith('E-mail inválido', expect.any(String));
  });
});
