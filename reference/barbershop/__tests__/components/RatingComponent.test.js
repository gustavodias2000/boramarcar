import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import RatingComponent from '../../src/components/RatingComponent';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { atualizarStatus } from '../../src/data/repositories/AgendamentoRepository';
import { criarAvaliacao } from '../../src/data/repositories/AvaliacaoRepository';

// Fase 1 (design): RatingComponent passou a usar useTheme (para o Icone de
// estrela) — precisa de ThemeProvider no ar para renderizar, como em uso
// real (o app inteiro fica dentro de um único ThemeProvider).
const renderComponent = (props) =>
  render(
    <ThemeProvider>
      <RatingComponent {...props} />
    </ThemeProvider>
  );

// Mock Firebase
jest.mock('../../firebaseConfig', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'uid-cliente', email: 'test@example.com' }
  }
}));

// ARCH-002 (auditoria): RatingComponent não acessa mais o Firestore
// diretamente — passou a chamar os repositórios abaixo. Mockar os
// repositórios (não mais `firebase/firestore`) é o que prova isso.
jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  atualizarStatus: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/data/repositories/AvaliacaoRepository', () => ({
  criarAvaliacao: jest.fn(() => Promise.resolve()),
}));

const mockAgendamento = {
  id: 'test-id',
  barbeiroId: 'barbeiro-1',
  barbeiroNome: 'João Silva',
  clienteNome: 'Cliente Teste'
};

describe('RatingComponent', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly when visible', () => {
    const { getByText } = renderComponent({
      visible: true,
      onClose: mockOnClose,
      agendamento: mockAgendamento,
    });

    expect(getByText('Avaliar Atendimento')).toBeTruthy();
    expect(getByText('Como foi seu atendimento com João Silva?')).toBeTruthy();
  });

  it('should not render when not visible', () => {
    const { queryByText } = renderComponent({
      visible: false,
      onClose: mockOnClose,
      agendamento: mockAgendamento,
    });

    expect(queryByText('Avaliar Atendimento')).toBeNull();
  });

  it('should allow selecting stars', () => {
    const { getAllByLabelText } = renderComponent({
      visible: true,
      onClose: mockOnClose,
      agendamento: mockAgendamento,
    });

    // Fase 1: a estrela virou Icone (SVG), não mais texto '⭐' — a estrela
    // continua identificável pelo accessibilityLabel que já existia.
    const stars = getAllByLabelText(/Avaliar com \d estrelas?/);
    expect(stars).toHaveLength(5);

    // Simular clique na terceira estrela
    fireEvent.press(stars[2]);

    // Verificar se as primeiras 3 estrelas estão selecionadas
    // (Teste visual seria necessário para verificar a cor)
  });

  it('should show error when trying to submit without rating', async () => {
    const { getByText } = renderComponent({
      visible: true,
      onClose: mockOnClose,
      agendamento: mockAgendamento,
    });

    const submitButton = getByText('Enviar');
    fireEvent.press(submitButton);

    // Verificar se o Alert foi chamado (seria necessário mock do Alert)
  });

  it('should call onClose when cancel button is pressed', () => {
    const { getByText } = renderComponent({
      visible: true,
      onClose: mockOnClose,
      agendamento: mockAgendamento,
    });

    const cancelButton = getByText('Cancelar');
    fireEvent.press(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should update comment text', () => {
    const { getByPlaceholderText } = renderComponent({
      visible: true,
      onClose: mockOnClose,
      agendamento: mockAgendamento,
    });

    const commentInput = getByPlaceholderText('Deixe um comentário (opcional)');
    fireEvent.changeText(commentInput, 'Excelente atendimento!');

    expect(commentInput.props.value).toBe('Excelente atendimento!');
  });

  it('ao enviar, salva a avaliação via AvaliacaoRepository (não mais via firebase/firestore direto)', async () => {
    const { getAllByLabelText, getByPlaceholderText, getByText } = renderComponent({
      visible: true,
      onClose: mockOnClose,
      agendamento: mockAgendamento,
    });

    fireEvent.press(getAllByLabelText(/Avaliar com \d estrelas?/)[4]); // 5 estrelas
    fireEvent.changeText(
      getByPlaceholderText('Deixe um comentário (opcional)'),
      'Excelente atendimento!'
    );
    fireEvent.press(getByText('Enviar'));

    await waitFor(() => expect(criarAvaliacao).toHaveBeenCalledWith('test-id', {
      barbeiroId: 'barbeiro-1',
      barbeiroNome: 'João Silva',
      cliente: 'test@example.com',
      clienteUid: 'uid-cliente',
      clienteNome: 'Cliente Teste',
      rating: 5,
      comment: 'Excelente atendimento!',
    }));
    expect(atualizarStatus).toHaveBeenCalledWith('test-id', 'avaliado', { rating: 5 });
    expect(mockOnClose).toHaveBeenCalled();
  });
});