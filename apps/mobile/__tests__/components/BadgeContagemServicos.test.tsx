import React from 'react';
import { render } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import BadgeContagemServicos from '../../src/components/BadgeContagemServicos';
import { ThemeProvider } from '../../src/context/ThemeContext';

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('BadgeContagemServicos', () => {
  it('não renderiza nada quando count é undefined', () => {
    const { toJSON } = renderWithTheme(<BadgeContagemServicos />);
    expect(toJSON()).toBeNull();
  });

  it('não renderiza nada quando count é 0', () => {
    const { toJSON, queryByText } = renderWithTheme(<BadgeContagemServicos count={0} />);
    expect(toJSON()).toBeNull();
    expect(queryByText(/servi/, { includeHiddenElements: true })).toBeNull();
  });

  // O badge é decorativo (accessibilityElementsHidden), então as queries de
  // texto precisam incluir elementos ocultos da árvore de acessibilidade.
  it('mostra "1 serviço" (singular) quando count é 1', () => {
    const { getByText } = renderWithTheme(<BadgeContagemServicos count={1} />);
    expect(getByText('1 serviço', { includeHiddenElements: true })).toBeTruthy();
  });

  it('mostra "N serviços" (plural) quando count é maior que 1', () => {
    const { getByText } = renderWithTheme(<BadgeContagemServicos count={3} />);
    expect(getByText('3 serviços', { includeHiddenElements: true })).toBeTruthy();
  });
});
