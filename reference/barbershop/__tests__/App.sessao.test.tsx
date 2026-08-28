/**
 * Garante o comportamento visível do pedido de 25/07/2026: enquanto o app
 * verifica se já existe sessão gravada, ele mostra a splash — nunca a tela
 * de login. Era isso que fazia parecer que o app "sempre pede a senha".
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../App';
import { useSessaoRestaurada } from '../src/hooks/useSessaoRestaurada';

jest.mock('../src/hooks/useSessaoRestaurada', () => ({
  useSessaoRestaurada: jest.fn(),
}));

const mockedUseSessao = useSessaoRestaurada as jest.Mock;

describe('App — restauração da sessão', () => {
  it('mostra a splash (e não a tela de boas-vindas) enquanto verifica a sessão', () => {
    mockedUseSessao.mockReturnValue({ carregando: true, rotaInicial: 'Welcome' });

    render(<App />);

    expect(screen.getByLabelText('Abrindo o aplicativo')).toBeTruthy();
    expect(screen.queryByLabelText('Ir para tela de login')).toBeNull();
  });

  it('só mostra a tela de boas-vindas depois de confirmar que ninguém está logado', async () => {
    mockedUseSessao.mockReturnValue({ carregando: false, rotaInicial: 'Welcome' });

    render(<App />);

    // `findBy` e não `getBy`: com a configuração de deep link (QR Code), o
    // NavigationContainer só renderiza as telas depois de resolver
    // `Linking.getInitialURL()`, que é assíncrono.
    expect(await screen.findByLabelText('Ir para tela de login')).toBeTruthy();
    expect(screen.queryByLabelText('Abrindo o aplicativo')).toBeNull();
  });
});
