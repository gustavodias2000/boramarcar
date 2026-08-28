/**
 * ToastContext — o aviso que substitui o `Alert.alert('Sucesso!')` de um botão.
 *
 * Dois riscos reais que estes testes travam:
 *  1. o toast ficar preso na tela (o timer de saída não roda) — ele é
 *     `position: absolute` sobre o conteúdo, então um toast eterno cobre
 *     botões de verdade;
 *  2. o toast virar bloqueio de toque. Ele tem que ser `pointerEvents="none"`:
 *     o usuário precisa conseguir tocar no que está embaixo enquanto o aviso
 *     some sozinho.
 */
import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider, darkTheme, lightTheme } from '../../src/context/ThemeContext';
import { ToastProvider, useToast, type ToastType } from '../../src/context/ToastContext';

function Disparador({ mensagem = 'Cliente salvo', tipo }: { mensagem?: string; tipo?: ToastType }) {
  const { showToast } = useToast();
  return (
    <Pressable accessibilityLabel="disparar" onPress={() => showToast(mensagem, tipo)}>
      <Text>conteúdo da tela</Text>
    </Pressable>
  );
}

const renderizar = (props: { mensagem?: string; tipo?: ToastType } = {}) =>
  render(
    <ThemeProvider>
      <ToastProvider>
        <Disparador {...props} />
      </ToastProvider>
    </ThemeProvider>,
  );

const disparar = () => fireEvent.press(screen.getByLabelText('disparar'));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('exibição', () => {
  it('não mostra nada antes de alguém pedir', () => {
    renderizar();
    expect(screen.queryByText('Cliente salvo')).toBeNull();
  });

  it('mostra a mensagem quando showToast é chamado', () => {
    renderizar();
    disparar();
    expect(screen.getByText('Cliente salvo')).toBeTruthy();
  });

  it('o conteúdo da tela continua renderizado por baixo', () => {
    // O provider envolve o app: se ele substituísse os filhos pelo toast,
    // a tela sumiria durante o aviso.
    renderizar();
    disparar();
    expect(screen.getByText('conteúdo da tela')).toBeTruthy();
  });

  it('some sozinho depois de alguns segundos', () => {
    renderizar();
    disparar();
    expect(screen.getByText('Cliente salvo')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.queryByText('Cliente salvo')).toBeNull();
  });

  it('ainda está visível antes do tempo acabar', () => {
    renderizar();
    disparar();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Cliente salvo')).toBeTruthy();
  });
});

describe('não pode bloquear a interface', () => {
  it('é pointerEvents="none" — o toque atravessa para a tela', () => {
    renderizar();
    disparar();

    const balao = screen.getByText('Cliente salvo').parent;
    // Sobe até a Animated.View que carrega o pointerEvents.
    let no: any = balao;
    let achou = false;
    while (no && !achou) {
      if (no.props?.pointerEvents === 'none') achou = true;
      no = no.parent;
    }
    expect(achou).toBe(true);
  });

  it('é anunciado por leitor de tela sem roubar o foco', () => {
    renderizar();
    disparar();

    let no: any = screen.getByText('Cliente salvo').parent;
    let regiao: string | undefined;
    while (no && !regiao) {
      regiao = no.props?.accessibilityLiveRegion;
      no = no.parent;
    }
    expect(regiao).toBe('polite');
  });

  it('limita a mensagem a duas linhas para não virar um painel', () => {
    renderizar({ mensagem: 'a'.repeat(400) });
    disparar();
    expect(screen.getByText('a'.repeat(400)).props.numberOfLines).toBe(2);
  });
});

describe('toasts em sequência', () => {
  it('um novo toast substitui o anterior em vez de empilhar', () => {
    const { rerender } = renderizar({ mensagem: 'Primeiro' });
    disparar();
    expect(screen.getByText('Primeiro')).toBeTruthy();

    rerender(
      <ThemeProvider>
        <ToastProvider>
          <Disparador mensagem="Segundo" />
        </ToastProvider>
      </ThemeProvider>,
    );
    disparar();

    expect(screen.getByText('Segundo')).toBeTruthy();
    expect(screen.queryByText('Primeiro')).toBeNull();
  });

  it('o segundo toast reinicia a contagem — não herda o tempo já gasto do primeiro', () => {
    const { rerender } = renderizar({ mensagem: 'Primeiro' });
    disparar();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    rerender(
      <ThemeProvider>
        <ToastProvider>
          <Disparador mensagem="Segundo" />
        </ToastProvider>
      </ThemeProvider>,
    );
    disparar();

    // Se o timer antigo não tivesse sido cancelado, 600ms bastariam para
    // apagar o segundo toast junto com o primeiro.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Segundo')).toBeTruthy();
  });
});

describe('tipos de aviso', () => {
  const corDoBalao = () => {
    let no: any = screen.getByText('Cliente salvo').parent;
    while (no) {
      const estilo = Array.isArray(no.props?.style) ? no.props.style : [no.props?.style];
      const achado = estilo.find((s: any) => s && s.backgroundColor);
      if (achado) return achado.backgroundColor;
      no = no.parent;
    }
    return undefined;
  };

  it.each<[ToastType, keyof typeof lightTheme.colors]>([
    ['success', 'success'],
    ['error', 'error'],
    ['info', 'info'],
  ])('o tipo "%s" usa a cor semântica do tema', (tipo, chave) => {
    renderizar({ tipo });
    disparar();

    expect([lightTheme.colors[chave], darkTheme.colors[chave]]).toContain(corDoBalao());
  });

  it('sem tipo informado, assume sucesso', () => {
    renderizar();
    disparar();
    expect([lightTheme.colors.success, darkTheme.colors.success]).toContain(corDoBalao());
  });
});

describe('useToast fora do provider', () => {
  it('não quebra a tela: showToast vira uma função inofensiva', () => {
    // Diferente do useTheme (que lança), aqui o padrão é silencioso de
    // propósito — um aviso que não aparece não pode derrubar um cadastro
    // que já foi salvo.
    render(<Disparador />);
    expect(() => disparar()).not.toThrow();
  });
});
