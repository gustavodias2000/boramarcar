import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import AgendamentoConfirmadoScreen from '../../src/screens/AgendamentoConfirmadoScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import type { Barbeiro, NovoAgendamento } from '../../src/types';

jest.mock('../../src/services/CalendarService', () => ({
  __esModule: true,
  default: { addAgendamentoToCalendar: jest.fn() },
}));

const AGENDAMENTO: NovoAgendamento & { id: string } = {
  id: 'agendamento-novo',
  barbeiroId: 'barbeiro-1',
  barbeiroNome: 'João Barbeiro',
  barbeiroTelefone: '5511999999999',
  cliente: 'cliente@teste.com',
  clienteUid: 'cliente-1',
  clienteNome: 'Cliente Teste',
  status: 'pendente',
  data: '2030-01-15',
  horario: '09:00',
  servico: 'Corte Masculino',
  preco: '30,00',
  precoEmCentavos: 3000,
};

const BARBEIRO: Barbeiro = {
  id: 'barbeiro-1',
  nome: 'João Barbeiro',
  telefone: '5511999999999',
  especialidade: 'Cortes',
} as Barbeiro;

const criarNavigation = () => ({
  reset: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  popToTop: jest.fn(),
});

const renderTela = (navigation = criarNavigation()) => {
  const route = {
    params: {
      agendamento: AGENDAMENTO,
      barbeiro: BARBEIRO,
      whatsappEnviado: false,
      mensagemPosAgendamento: null,
    },
  } as any;

  return {
    ...render(
      <ThemeProvider>
        <AgendamentoConfirmadoScreen navigation={navigation as any} route={route} />
      </ThemeProvider>,
    ),
    navigation,
  };
};

describe('AgendamentoConfirmadoScreen', () => {
  it('mostra a confirmação e somente a ação Concluir', () => {
    const tela = renderTela();

    expect(tela.getByText('Agendamento confirmado!')).toBeTruthy();
    expect(tela.getByLabelText('Concluir')).toBeTruthy();
    expect(tela.queryByText('Cancelar Agendamento')).toBeNull();
    expect(tela.queryByLabelText('Cancelar agendamento')).toBeNull();
  });

  it('encerra o fluxo temporário na aba autenticada Meus Horários, sem voltar à confirmação', () => {
    const tela = renderTela();

    fireEvent.press(tela.getByLabelText('Concluir'));

    expect(tela.navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Cliente', params: { screen: 'Agendamentos' } }],
    });
    expect(tela.navigation.navigate).not.toHaveBeenCalled();
    expect(tela.navigation.replace).not.toHaveBeenCalled();
    expect(tela.navigation.goBack).not.toHaveBeenCalled();
    expect(tela.navigation.popToTop).not.toHaveBeenCalled();
  });

  it('ignora toques rápidos adicionais em Concluir para não disparar múltiplos resets', () => {
    const tela = renderTela();
    const concluir = tela.getByLabelText('Concluir');

    fireEvent.press(concluir);
    fireEvent.press(concluir);

    expect(tela.navigation.reset).toHaveBeenCalledTimes(1);
  });
});
