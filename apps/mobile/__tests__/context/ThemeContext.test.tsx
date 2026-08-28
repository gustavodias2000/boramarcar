/**
 * ThemeContext — a preferência de tema é o único estado do app que precisa
 * sobreviver ao fechamento sem passar pelo Firestore.
 *
 * O que estes testes protegem:
 *  - a escolha do usuário ("sempre claro") não pode ser atropelada pelo tema
 *    do sistema quando o Android entra em modo escuro automático à noite;
 *  - o modo "system" precisa continuar seguindo o aparelho;
 *  - uma falha do AsyncStorage não pode derrubar a árvore inteira — o
 *    ThemeProvider embrulha o app todo, então uma exceção aqui é tela branca.
 */
import React from 'react';
import { Text, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, act } from '@testing-library/react-native';
import {
  ThemeProvider,
  useTheme,
  lightTheme,
  darkTheme,
  type ThemeMode,
  type Theme,
} from '../../src/context/ThemeContext';

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

/** Expõe o valor do contexto para as asserções, sem depender de nenhuma tela. */
let contexto: ReturnType<typeof useTheme>;
function Sonda() {
  contexto = useTheme();
  return <Text>{contexto.isDarkMode ? 'escuro' : 'claro'}</Text>;
}

const renderizar = () =>
  render(
    <ThemeProvider>
      <Sonda />
    </ThemeProvider>,
  );

/** O provider carrega a preferência num efeito assíncrono. */
const aguardarCarregamento = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  getItem.mockResolvedValue(null);
  (useColorScheme as unknown as jest.Mock)?.mockReset?.();
});

describe('primeira abertura — sem preferência salva', () => {
  it('segue o tema do sistema', async () => {
    jest.spyOn(require('react-native'), 'useColorScheme').mockReturnValue('dark');

    renderizar();
    await aguardarCarregamento();

    expect(contexto.themeMode).toBe('system');
    expect(contexto.isDarkMode).toBe(true);
    expect(contexto.theme).toBe(darkTheme);
  });

  it('sistema claro resulta em tema claro', async () => {
    jest.spyOn(require('react-native'), 'useColorScheme').mockReturnValue('light');

    renderizar();
    await aguardarCarregamento();

    expect(contexto.isDarkMode).toBe(false);
    expect(contexto.theme).toBe(lightTheme);
  });
});

describe('preferência salva vence o sistema', () => {
  it.each<[ThemeMode, boolean]>([
    ['light', false],
    ['dark', true],
  ])('modo "%s" salvo é respeitado mesmo com o sistema no oposto', async (modo, esperaEscuro) => {
    // Cenário real: o usuário escolheu "sempre claro" e o Android liga o modo
    // escuro sozinho às 18h. A escolha dele tem que ganhar.
    jest
      .spyOn(require('react-native'), 'useColorScheme')
      .mockReturnValue(esperaEscuro ? 'light' : 'dark');
    getItem.mockResolvedValue(modo);

    renderizar();
    await aguardarCarregamento();

    expect(contexto.themeMode).toBe(modo);
    expect(contexto.isDarkMode).toBe(esperaEscuro);
  });

  it('modo "system" salvo volta a seguir o aparelho', async () => {
    jest.spyOn(require('react-native'), 'useColorScheme').mockReturnValue('dark');
    getItem.mockResolvedValue('system');

    renderizar();
    await aguardarCarregamento();

    expect(contexto.themeMode).toBe('system');
    expect(contexto.isDarkMode).toBe(true);
  });

  it('lê a chave "themeMode" — mudar o nome apaga a preferência de todo mundo', async () => {
    renderizar();
    await aguardarCarregamento();

    expect(getItem).toHaveBeenCalledWith('themeMode');
  });
});

describe('toggleTheme', () => {
  it('grava a escolha e aplica na hora', async () => {
    jest.spyOn(require('react-native'), 'useColorScheme').mockReturnValue('light');
    renderizar();
    await aguardarCarregamento();

    await act(async () => {
      await contexto.toggleTheme('dark');
    });

    expect(setItem).toHaveBeenCalledWith('themeMode', 'dark');
    expect(contexto.isDarkMode).toBe(true);
    expect(screen.getByText('escuro')).toBeTruthy();
  });

  it('voltar para "system" reassume o tema do aparelho', async () => {
    jest.spyOn(require('react-native'), 'useColorScheme').mockReturnValue('dark');
    getItem.mockResolvedValue('light');
    renderizar();
    await aguardarCarregamento();
    expect(contexto.isDarkMode).toBe(false);

    await act(async () => {
      await contexto.toggleTheme('system');
    });

    expect(contexto.isDarkMode).toBe(true);
  });
});

describe('resiliência — o provider embrulha o app inteiro', () => {
  it('leitura falhando não derruba a árvore: cai no tema do sistema', async () => {
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(require('react-native'), 'useColorScheme').mockReturnValue('light');
    getItem.mockRejectedValue(new Error('storage corrompido'));

    renderizar();
    await aguardarCarregamento();

    expect(screen.getByText('claro')).toBeTruthy();
    erro.mockRestore();
  });

  it('escrita falhando ainda muda o tema na sessão atual', async () => {
    // Perder a persistência é ruim; ignorar o toque do usuário é pior.
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(require('react-native'), 'useColorScheme').mockReturnValue('light');
    setItem.mockRejectedValue(new Error('disco cheio'));

    renderizar();
    await aguardarCarregamento();
    await act(async () => {
      await contexto.toggleTheme('dark');
    });

    expect(contexto.themeMode).toBe('dark');
    erro.mockRestore();
  });
});

describe('useTheme fora do provider', () => {
  it('avisa em vez de devolver undefined silenciosamente', () => {
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Sonda />)).toThrow('useTheme deve ser usado dentro de ThemeProvider');

    erro.mockRestore();
  });
});

describe('paletas — contraste é requisito, não estética', () => {
  it('as duas paletas definem exatamente as mesmas chaves de cor', () => {
    // Uma cor faltando no tema escuro vira `undefined` num style e a RN
    // renderiza transparente — texto invisível, sem erro nenhum.
    expect(Object.keys(darkTheme.colors).sort()).toEqual(Object.keys(lightTheme.colors).sort());
  });

  it('nenhuma cor vem vazia ou indefinida', () => {
    for (const tema of [lightTheme, darkTheme]) {
      for (const [nome, valor] of Object.entries(tema.colors)) {
        expect(`${nome}:${valor}`).toMatch(/^[a-zA-Z]+:#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('fundo e texto não podem ser a mesma cor em nenhum dos temas', () => {
    expect(lightTheme.colors.text).not.toBe(lightTheme.colors.background);
    expect(darkTheme.colors.text).not.toBe(darkTheme.colors.background);
  });

  it('o tema escuro está marcado como escuro (usado por StatusBar e ícones)', () => {
    expect(darkTheme.isDark).toBe(true);
    expect(lightTheme.isDark).toBe(false);
  });
});

describe('tokens de banner e header (UI-001/UI-002 — auditoria de tema, onda 7)', () => {
  // Mesmo método usado para validar `background`×`surfaceVariant` numa onda
  // anterior desta auditoria: luminância relativa sRGB (WCAG 2.x), aplicado
  // aqui aos pares fundo×texto dos banners (meta >=4.5:1, texto normal) e ao
  // par header×surface (meta >=3:1, WCAG 1.4.11, limite de UI não-textual).
  const paraLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminancia = (hex: string) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return 0.2126 * paraLinear(r) + 0.7152 * paraLinear(g) + 0.0722 * paraLinear(b);
  };
  const contraste = (a: string, b: string) => {
    const l1 = luminancia(a);
    const l2 = luminancia(b);
    const [claro, escuro] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (claro + 0.05) / (escuro + 0.05);
  };

  it.each<['light' | 'dark', Theme]>([
    ['light', lightTheme],
    ['dark', darkTheme],
  ])('banner de aviso tem texto legível sobre o próprio fundo (%s, >=4.5:1)', (_nome, tema) => {
    expect(contraste(tema.colors.bannerWarningText, tema.colors.bannerWarningBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each<['light' | 'dark', Theme]>([
    ['light', lightTheme],
    ['dark', darkTheme],
  ])('banner informativo tem texto legível sobre o próprio fundo (%s, >=4.5:1)', (_nome, tema) => {
    expect(contraste(tema.colors.bannerInfoText, tema.colors.bannerInfoBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each<['light' | 'dark', Theme]>([
    ['light', lightTheme],
    ['dark', darkTheme],
  ])('headerBorder separa o header de `surface` com contraste suficiente (%s, >=3:1)', (_nome, tema) => {
    expect(contraste(tema.colors.headerBorder, tema.colors.surface)).toBeGreaterThanOrEqual(3);
  });

  it('headerBorder tem mais contraste contra `surface` do que o `border` genérico', () => {
    // Prova de que o token novo resolve o problema que motivou sua criação —
    // não é só "uma cor a mais", é estritamente melhor que a alternativa que
    // já existia para essa mesma finalidade.
    for (const tema of [lightTheme, darkTheme]) {
      const antes = contraste(tema.colors.border, tema.colors.surface);
      const depois = contraste(tema.colors.headerBorder, tema.colors.surface);
      expect(depois).toBeGreaterThan(antes);
    }
  });
});
