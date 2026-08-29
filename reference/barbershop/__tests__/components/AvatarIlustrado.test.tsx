import React from 'react';
import { render } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import AvatarIlustrado from '../../src/components/AvatarIlustrado';
import { ThemeProvider } from '../../src/context/ThemeContext';

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

function extrairBackgroundColor(tree: any): string | undefined {
  if (!tree) return undefined;
  const nodes = Array.isArray(tree) ? tree : [tree];
  for (const node of nodes) {
    const style = node?.props?.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
    if (flat?.backgroundColor) return flat.backgroundColor;
    if (node?.children) {
      const encontrada = extrairBackgroundColor(node.children);
      if (encontrada) return encontrada;
    }
  }
  return undefined;
}

describe('AvatarIlustrado', () => {
  it('mesmo id produz sempre a mesma cor de fundo (determinismo)', () => {
    const a = renderWithTheme(<AvatarIlustrado id="barbeiro-123" nome="João" size={52} />);
    const b = renderWithTheme(<AvatarIlustrado id="barbeiro-123" nome="Outro Nome" size={52} />);

    const bgA = extrairBackgroundColor(a.toJSON());
    const bgB = extrairBackgroundColor(b.toJSON());

    expect(bgA).toBeTruthy();
    expect(bgA).toBe(bgB);
  });

  it('ids diferentes podem gerar cores diferentes (não cai sempre na mesma cor fixa)', () => {
    // Não há garantia matemática de que dois ids específicos nunca colidam,
    // mas com 5 cores na paleta e vários ids distintos o esperado é ver mais
    // de uma cor — evita um teste que passaria mesmo se o hash não variasse.
    const ids = ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff', 'ggggggg'];
    const cores = new Set(
      ids.map((id) => {
        const r = renderWithTheme(<AvatarIlustrado id={id} nome="X" size={40} />);
        return extrairBackgroundColor(r.toJSON());
      }),
    );
    expect(cores.size).toBeGreaterThan(1);
  });

  it('renderiza um bloco de iniciais quando fotoUrl não é passada', () => {
    // O bloco de iniciais é decorativo (accessibilityElementsHidden), então
    // a query precisa incluir elementos ocultos da árvore de acessibilidade.
    const { getByText } = renderWithTheme(<AvatarIlustrado id="x1" nome="Carlos" size={52} />);
    expect(getByText('C', { includeHiddenElements: true })).toBeTruthy();
  });

  it('renderiza Image em vez do bloco de iniciais quando fotoUrl é passada', () => {
    const { UNSAFE_queryAllByType, queryByText } = renderWithTheme(
      <AvatarIlustrado id="x2" nome="Carlos" fotoUrl="https://exemplo.com/foto.jpg" size={52} />,
    );
    const { Image } = require('react-native');
    const imagens = UNSAFE_queryAllByType(Image);
    expect(imagens).toHaveLength(1);
    expect(imagens[0].props.source).toEqual({ uri: 'https://exemplo.com/foto.jpg' });
    expect(queryByText('C', { includeHiddenElements: true })).toBeNull();
  });

  it('usa "?" como iniciais quando nome está vazio', () => {
    const { getByText } = renderWithTheme(<AvatarIlustrado id="x3" nome="" size={52} />);
    expect(getByText('?', { includeHiddenElements: true })).toBeTruthy();
  });
});
