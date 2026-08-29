import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import FiltroChips, { CHIPS } from '../../src/components/FiltroChips';
import { ThemeProvider } from '../../src/context/ThemeContext';

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('FiltroChips', () => {
  it('renderiza todos os chips definidos (Todos/Corte/Barba/Combos)', () => {
    const { getByText } = renderWithTheme(<FiltroChips ativo="Todos" onSelecionar={jest.fn()} />);
    CHIPS.forEach((chip) => {
      expect(getByText(chip)).toBeTruthy();
    });
  });

  it('chama onSelecionar com o chip pressionado', () => {
    const onSelecionar = jest.fn();
    const { getByText } = renderWithTheme(
      <FiltroChips ativo="Todos" onSelecionar={onSelecionar} />,
    );

    fireEvent.press(getByText('Barba'));

    expect(onSelecionar).toHaveBeenCalledWith('Barba');
  });

  it('marca o chip ativo como selecionado para leitores de tela', () => {
    const { getByLabelText } = renderWithTheme(
      <FiltroChips ativo="Corte" onSelecionar={jest.fn()} />,
    );

    expect(getByLabelText('Filtrar por Corte').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByLabelText('Filtrar por Barba').props.accessibilityState).toEqual({
      selected: false,
    });
  });
});
