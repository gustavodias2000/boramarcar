import React from 'react';
import { render } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import DisponibilidadeChip from '../../src/components/DisponibilidadeChip';
import { ThemeProvider } from '../../src/context/ThemeContext';

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('DisponibilidadeChip', () => {
  it('não renderiza nada quando status é null', () => {
    const { toJSON } = renderWithTheme(<DisponibilidadeChip status={null} />);
    expect(toJSON()).toBeNull();
  });

  it('não renderiza nada quando status é undefined', () => {
    const { toJSON } = renderWithTheme(<DisponibilidadeChip />);
    expect(toJSON()).toBeNull();
  });

  it('renderiza "Hoje" para status "hoje"', () => {
    const { getByText } = renderWithTheme(<DisponibilidadeChip status="hoje" />);
    expect(getByText('Hoje')).toBeTruthy();
  });

  it('renderiza "Disponível amanhã" para status "amanha"', () => {
    const { getByText } = renderWithTheme(<DisponibilidadeChip status="amanha" />);
    expect(getByText('Disponível amanhã')).toBeTruthy();
  });
});
