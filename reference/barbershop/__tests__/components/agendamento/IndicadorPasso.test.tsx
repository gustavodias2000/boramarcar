import React from 'react';
import { render } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import IndicadorPasso from '../../../src/components/agendamento/IndicadorPasso';
import { ThemeProvider } from '../../../src/context/ThemeContext';

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const PASSOS = ['Serviço', 'Data', 'Horário', 'Confirmação'];

describe('IndicadorPasso', () => {
  it('mostra o rótulo de todos os passos recebidos', () => {
    const { getByText } = renderWithTheme(<IndicadorPasso passos={PASSOS} passoAtual={0} />);
    PASSOS.forEach((rotulo) => expect(getByText(rotulo)).toBeTruthy());
  });

  it('descreve o passo atual em accessibilityLabel/accessibilityValue, 1-based', () => {
    const { getByTestId } = renderWithTheme(<IndicadorPasso passos={PASSOS} passoAtual={2} />);
    const barra = getByTestId('indicador-passo');
    expect(barra.props.accessibilityLabel).toBe('Passo 3 de 4: Horário');
    expect(barra.props.accessibilityValue).toEqual({ min: 1, max: 4, now: 3 });
  });

  it('primeiro passo (índice 0) descreve "Passo 1 de N"', () => {
    const { getByTestId } = renderWithTheme(<IndicadorPasso passos={PASSOS} passoAtual={0} />);
    expect(getByTestId('indicador-passo').props.accessibilityLabel).toBe('Passo 1 de 4: Serviço');
  });

  it('último passo descreve "Passo N de N" mesmo se passoAtual vier igual ao total', () => {
    const { getByTestId } = renderWithTheme(<IndicadorPasso passos={PASSOS} passoAtual={4} />);
    expect(getByTestId('indicador-passo').props.accessibilityLabel).toBe('Passo 4 de 4: Confirmação');
  });

  it('funciona com uma lista de passos menor (serviço pré-selecionado)', () => {
    const passos = ['Data', 'Horário', 'Confirmação'];
    const { getByText, getByTestId } = renderWithTheme(
      <IndicadorPasso passos={passos} passoAtual={1} />,
    );
    passos.forEach((rotulo) => expect(getByText(rotulo)).toBeTruthy());
    expect(getByTestId('indicador-passo').props.accessibilityValue).toEqual({ min: 1, max: 3, now: 2 });
  });
});
