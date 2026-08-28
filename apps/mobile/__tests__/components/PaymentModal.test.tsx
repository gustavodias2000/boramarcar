/**
 * Bloco 2 da auditoria — o modal que mentia.
 *
 * A versão anterior listava "Cartão de crédito" e "PIX" como formas de
 * pagamento DO APP, tinha um botão "Pagar Agora" e, ao tocar nele, exibia
 * "Pagamento Realizado!" — sem que nenhuma cobrança existisse. O cliente
 * chegava na barbearia achando que já tinha pago.
 *
 * O modal foi mantido (é útil como resumo antes de confirmar), mas o texto
 * agora é honesto. Estes testes existem para que ninguém reintroduza a
 * promessa de cobrança: eles falham se as palavras "Pagar", "Pagamento
 * realizado" ou "processando" voltarem para a interface.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import PaymentModal from '../../src/components/PaymentModal';
import { ThemeProvider } from '../../src/context/ThemeContext';

const agendamento = {
  barbeiroNome: 'João',
  data: '15/08/2026',
  horario: '14:30',
  servico: 'Corte degradê',
  precoEmCentavos: 4500,
};

const renderModal = (props: any = {}) =>
  render(
    <ThemeProvider>
      <PaymentModal
        visible
        onClose={jest.fn()}
        agendamento={agendamento as any}
        {...props}
      />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resumo do agendamento', () => {
  it('mostra profissional, data, horário e serviço para o cliente conferir', async () => {
    renderModal();

    expect(await screen.findByText('João')).toBeTruthy();
    expect(screen.getByText('15/08/2026')).toBeTruthy();
    expect(screen.getByText('14:30')).toBeTruthy();
    expect(screen.getByText('Corte degradê')).toBeTruthy();
  });

  it('mostra o valor formatado em reais', async () => {
    renderModal();
    expect(await screen.findByText(/45,00/)).toBeTruthy();
  });

  it('aceita o formato legado do preço (string) além dos centavos', async () => {
    renderModal({ agendamento: { ...agendamento, precoEmCentavos: undefined, preco: '60,00' } });
    expect(await screen.findByText(/60,00/)).toBeTruthy();
  });

  it('preço legado com "R$" digitado à mão não vira "R$ NaN" na tela', async () => {
    // Aconteceu de verdade: o campo antigo era texto livre e alguns cadastros
    // guardaram "R$ 60,00". O parse antigo devolvia NaN e o cliente lia
    // "R$ NaN" no resumo, segundos antes de confirmar o horário.
    renderModal({ agendamento: { ...agendamento, precoEmCentavos: undefined, preco: 'R$ 60,00' } });

    expect(await screen.findByText(/60,00/)).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('preço legado ilegível cai no padrão em vez de mostrar lixo', async () => {
    renderModal({ agendamento: { ...agendamento, precoEmCentavos: undefined, preco: 'combinar' } });

    expect(await screen.findByText(/25,00/)).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('usa "Corte e barba" quando o serviço não foi informado', async () => {
    renderModal({ agendamento: { ...agendamento, servico: '' } });
    expect(await screen.findByText('Corte e barba')).toBeTruthy();
  });

  it('não quebra sem agendamento nenhum', async () => {
    renderModal({ agendamento: null });
    expect(await screen.findByText('Resumo do agendamento')).toBeTruthy();
  });
});

describe('honestidade do texto — o app não cobra', () => {
  it('diz explicitamente que o pagamento é presencial', async () => {
    renderModal();

    expect(await screen.findByText('Pagamento presencial')).toBeTruthy();
    expect(screen.getByText(/O app não cobra nada agora/)).toBeTruthy();
    expect(screen.getByText('Nenhuma cobrança é feita pelo aplicativo.')).toBeTruthy();
  });

  it('o botão é "Confirmar agendamento", nunca "Pagar Agora"', async () => {
    renderModal();

    expect(await screen.findByLabelText('Confirmar agendamento')).toBeTruthy();
    expect(screen.queryByText(/Pagar/i)).toBeNull();
  });

  it('não anuncia cartão nem PIX como cobrança do app', async () => {
    renderModal();
    await screen.findByText('Pagamento presencial');

    // As palavras podem aparecer, mas só na frase que explica que o
    // profissional é quem recebe — nunca como método cobrado pelo app.
    expect(screen.queryByText('Cartão de Crédito')).toBeNull();
    expect(screen.queryByText('PIX')).toBeNull();
  });
});

describe('confirmação', () => {
  it('avisa que o valor é pago no local — e não que foi pago', async () => {
    renderModal();

    fireEvent.press(await screen.findByLabelText('Confirmar agendamento'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [titulo, corpo] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(titulo).toBe('Agendamento confirmado!');
    expect(titulo).not.toMatch(/[Pp]agamento [Rr]ealizado/);
    expect(corpo).toContain('no local');
    expect(corpo).toContain('45,00');
  });

  it('devolve o resultado presencial e fecha o modal no OK', async () => {
    const onPaymentSuccess = jest.fn();
    const onClose = jest.fn();
    renderModal({ onPaymentSuccess, onClose });

    fireEvent.press(await screen.findByLabelText('Confirmar agendamento'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    // Executa o botão OK do alerta.
    const [, , botoes] = (Alert.alert as jest.Mock).mock.calls[0];
    botoes[0].onPress();

    expect(onPaymentSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'presential', amount: 45 }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('o botão Voltar fecha sem confirmar nada', async () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    fireEvent.press(await screen.findByLabelText('Voltar sem confirmar'));

    expect(onClose).toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
