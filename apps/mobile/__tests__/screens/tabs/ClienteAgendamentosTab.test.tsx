import React from 'react';
import { Alert, Animated } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import ClienteAgendamentosTab from '../../../src/screens/tabs/ClienteAgendamentosTab';
import { ThemeProvider } from '../../../src/context/ThemeContext';
import { listarDoCliente, atualizarStatus } from '../../../src/data/repositories/AgendamentoRepository';
import { liberarSlotsDoAgendamento } from '../../../src/services/OcupacaoService';
import { registrarErro } from '../../../src/services/ObservabilityService';
import type { Agendamento } from '../../../src/types';

// Mesmo achado documentado em __tests__/screens/ClienteHome.test.tsx: o
// `RefreshControl` real de 'react-native' quebra a árvore inteira ("Element
// type is invalid") dentro do FlatList neste ambiente de Jest. Mock local
// só para destravar este arquivo — ClienteAgendamentosTab é uma das telas
// citadas naquele achado que ainda não tinha teste próprio.
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () => ({
  __esModule: true,
  default: 'RefreshControl',
}));

// ClienteAgendamentosTab usa useFocusEffect (recarrega ao ganhar foco, ex.:
// depois de agendar/cancelar/reagendar). Mesmo mock de
// __tests__/screens/ClienteHome.test.tsx: roda como useEffect comum, sem
// exigir um NavigationContainer real.
jest.mock('@react-navigation/native', () => {
  const ReactModule = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => ReactModule.useEffect(effect, [effect]),
  };
});

jest.mock('../../../src/data/repositories/AgendamentoRepository', () => ({
  listarDoCliente: jest.fn(),
  atualizarStatus: jest.fn(),
}));

jest.mock('../../../src/services/OcupacaoService', () => ({
  liberarSlotsDoAgendamento: jest.fn(),
}));

// ARQ-05: o `catch {}` vazio do cancelamento virou um evento de telemetria.
// Mockado aqui pelo mesmo motivo de AgendamentoScreen.test.tsx — o que se
// verifica é o evento montado pela tela, não o transporte até a Function.
jest.mock('../../../src/services/ObservabilityService', () => ({
  registrarErro: jest.fn(() => Promise.resolve()),
  registrarAviso: jest.fn(() => Promise.resolve()),
}));

// Mesmo achado documentado em __tests__/screens/ClienteHome.test.tsx:
// jest.setup.js faz Animated.timing/spring completarem SINCRONAMENTE.
// Combinado com Animated.loop — usado por SkeletonList, exibido enquanto
// ClienteAgendamentosTab está com loading=true (estado inicial) — o loop
// reinicia a si mesmo dentro da MESMA call stack a cada término síncrono e
// estoura a pilha (RangeError: Maximum call stack size exceeded) antes
// mesmo do render() retornar. Neutralizamos Animated.loop só neste arquivo
// para conseguir testar o que vem DEPOIS do carregamento; não é uma
// correção do problema, só o mesmo contorno local já usado em ClienteHome.
jest.spyOn(Animated, 'loop').mockImplementation(
  () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }) as any,
);

const mockedListarDoCliente = listarDoCliente as jest.Mock;
const mockedAtualizarStatus = atualizarStatus as jest.Mock;
const mockedLiberarSlotsDoAgendamento = liberarSlotsDoAgendamento as jest.Mock;
const mockedRegistrarErro = registrarErro as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);
const mockNavigation = { navigate: jest.fn() } as any;

const AGENDAMENTO_ATIVO: Agendamento = {
  id: 'agendamento-1',
  barbeiroId: 'b1',
  barbeiroNome: 'João Barbeiro',
  barbeiroTelefone: '5511999999999',
  negocioId: 'negocio-1',
  cliente: 'cliente@teste.com',
  clienteUid: 'test-uid',
  clienteNome: 'Cliente Teste',
  clienteTelefone: '+5511977776666',
  status: 'confirmado',
  data: '2030-01-15',
  horario: '09:00',
  servico: 'Corte Masculino',
  servicoId: 's1',
  preco: '30,00',
  precoEmCentavos: 3000,
} as Agendamento;

const renderTela = () =>
  renderWithTheme(<ClienteAgendamentosTab navigation={mockNavigation} route={{} as any} />);

/** Simula o usuário confirmando o Alert de confirmação de cancelamento. */
const confirmarCancelamentoNoAlert = async () => {
  await waitFor(() => expect(mockedAlert).toHaveBeenCalledWith(
    'Cancelar Agendamento',
    expect.any(String),
    expect.any(Array),
  ));
  const chamada = mockedAlert.mock.calls.find((c) => c[0] === 'Cancelar Agendamento')!;
  const botaoConfirmar = chamada[2].find((b: any) => b.text === 'Sim, cancelar');
  await act(async () => {
    await botaoConfirmar.onPress();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedListarDoCliente.mockResolvedValue([AGENDAMENTO_ATIVO]);
  mockedAtualizarStatus.mockResolvedValue(undefined);
  mockedLiberarSlotsDoAgendamento.mockResolvedValue(undefined);
  // `clearAllMocks` limpa chamadas, não implementações: sem isto o teste que
  // força a telemetria a rejeitar contaminaria os seguintes.
  mockedRegistrarErro.mockResolvedValue(undefined);
});

describe('ClienteAgendamentosTab — cancelamento (P0-2 / item 3 do plano de testes)', () => {
  it('ao ganhar foco, recarrega e mostra o novo agendamento com o cancelamento disponível', async () => {
    const utils = renderTela();

    await waitFor(() => expect(mockedListarDoCliente).toHaveBeenCalledWith(
      'test-uid',
      { max: 50 },
    ));
    expect(utils.getByText('João Barbeiro')).toBeTruthy();
    expect(utils.getByText('Confirmado')).toBeTruthy();
    expect(utils.getByLabelText('Cancelar agendamento com João Barbeiro')).toBeTruthy();
  });

  it('ao confirmar o cancelamento, chama atualizarStatus(...,"cancelado",...) E liberarSlotsDoAgendamento(...)', async () => {
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('João Barbeiro')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Cancelar agendamento com João Barbeiro'));
    });
    await confirmarCancelamentoNoAlert();

    expect(mockedAtualizarStatus).toHaveBeenCalledWith(
      'agendamento-1',
      'cancelado',
      { cancelledBy: 'cliente' },
    );
    expect(mockedLiberarSlotsDoAgendamento).toHaveBeenCalledWith(AGENDAMENTO_ATIVO);
    // atualizarStatus tem que ser chamado ANTES de liberarSlotsDoAgendamento
    // (é a ordem que o código promete — ver AgendamentoScreen.tsx para o
    // mesmo padrão no reagendamento).
    const ordemAtualizar = mockedAtualizarStatus.mock.invocationCallOrder[0];
    const ordemLiberar = mockedLiberarSlotsDoAgendamento.mock.invocationCallOrder[0];
    expect(ordemAtualizar).toBeLessThan(ordemLiberar);

    await waitFor(() => expect(mockedAlert).toHaveBeenCalledWith(
      'Cancelado',
      'Agendamento cancelado com sucesso.',
    ));
  });

  it('recarrega a lista de agendamentos depois de cancelar com sucesso', async () => {
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('João Barbeiro')).toBeTruthy());
    mockedListarDoCliente.mockClear();

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Cancelar agendamento com João Barbeiro'));
    });
    await confirmarCancelamentoNoAlert();

    await waitFor(() => expect(mockedListarDoCliente).toHaveBeenCalled());
  });

  // ─── item 4 do plano de testes: falha de liberação (RISCO CONHECIDO) ──────
  //
  // Comportamento ATUAL (não corrigido nesta onda — ver
  // OcupacaoService.liberarSlot/liberarSlotsDoAgendamento): as duas funções
  // engolem o próprio erro internamente (`console.warn`) e SEMPRE resolvem a
  // Promise, nunca rejeitam. Cobertura direta dessa engolição já existe em
  // __tests__/services/OcupacaoService.test.ts ("não derruba o cancelamento
  // se o Firestore recusar a limpeza" / "engole o erro do Firestore"). Este
  // teste aqui prova a CONSEQUÊNCIA no nível da tela: mesmo que o mock seja
  // forçado a rejeitar (simulando um cenário hipotético em que a engolição
  // não acontecesse, ou um bug futuro que a remova sem querer), o app não
  // trava — mas ele mostra "Não foi possível cancelar" mesmo o cancelamento
  // (atualizarStatus) já tendo sido persistido com sucesso. Esse texto é
  // ENGANOSO para o usuário nesse cenário hipotético — registrado como risco
  // residual no relatório, não corrigido aqui.
  it('RISCO CONHECIDO: se liberarSlotsDoAgendamento rejeitar, o app não trava, mas mostra alerta de erro mesmo com o cancelamento já persistido', async () => {
    mockedLiberarSlotsDoAgendamento.mockRejectedValue(new Error('falha simulada ao liberar slot'));
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('João Barbeiro')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Cancelar agendamento com João Barbeiro'));
    });
    await confirmarCancelamentoNoAlert();

    // atualizarStatus JÁ foi chamado e resolveu (o cancelamento em si
    // aconteceu de verdade no banco) antes da falha de liberarSlots.
    expect(mockedAtualizarStatus).toHaveBeenCalledWith(
      'agendamento-1',
      'cancelado',
      { cancelledBy: 'cliente' },
    );
    // Não trava/crasha: o catch do componente é acionado e mostra erro
    // genérico — mesmo que o cancelamento já tenha sido persistido.
    await waitFor(() => expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Não foi possível cancelar. Tente novamente.',
    ));
    expect(mockedAlert).not.toHaveBeenCalledWith('Cancelado', expect.any(String));
  });
});

// ─── ARQ-05: o cancelamento que falha deixou de ser invisível ───────────────
//
// Antes, o `catch {}` desta tela descartava o erro e só mostrava um Alert. O
// cliente achava que tinha cancelado (ou desistia), o agendamento continuava
// ATIVO no banco, o barbeiro segurava o horário — e ninguém do lado do
// negócio ficava sabendo. Agora a falha vira evento em `eventosOperacionais`.
//
// NÍVEL 'error' (não 'warning'): quem falha aqui é `atualizarStatus`, a
// operação PRINCIPAL — `liberarSlotsDoAgendamento` engole o próprio erro e
// nunca rejeita. Cair no catch significa que o cancelamento NÃO aconteceu.
describe('ClienteAgendamentosTab — telemetria do cancelamento (ARQ-05)', () => {
  const cancelarEFalhar = async () => {
    mockedAtualizarStatus.mockRejectedValue(new Error('permission-denied'));
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('João Barbeiro')).toBeTruthy());
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Cancelar agendamento com João Barbeiro'));
    });
    await confirmarCancelamentoNoAlert();
    return utils;
  };

  it('registra ERRO com area/operacao próprios quando o cancelamento falha', async () => {
    await cancelarEFalhar();

    expect(mockedRegistrarErro).toHaveBeenCalledTimes(1);
    const [erro, contexto] = mockedRegistrarErro.mock.calls[0];
    expect(erro).toBeInstanceOf(Error);
    expect(contexto).toMatchObject({
      area: 'agendamento',
      operacao: 'cancelar-pelo-cliente',
      agendamentoId: 'agendamento-1',
      barbeiroId: 'b1',
      negocioId: 'negocio-1',
      data: '2030-01-15',
      horario: '09:00',
    });
  });

  // A restrição mais fácil de violar sem perceber: `item` é o agendamento
  // inteiro, com nome/email/telefone do cliente e nome/telefone do barbeiro.
  // Um `{ ...item }` no contexto passaria despercebido numa revisão. A
  // asserção é sobre o contexto ANTES da sanitização — prova que a TELA não
  // entrega dado pessoal, em vez de confiar em sanitizacao.ts como rede.
  it('NUNCA manda dado pessoal: contexto sem nome, email ou telefone', async () => {
    await cancelarEFalhar();

    const contexto = mockedRegistrarErro.mock.calls[0][1];

    expect(Object.keys(contexto).sort()).toEqual([
      'agendamentoId',
      'area',
      'barbeiroId',
      'data',
      'horario',
      'negocioId',
      'operacao',
    ]);
    ['clienteNome', 'clienteTelefone', 'cliente', 'clienteUid', 'barbeiroNome', 'barbeiroTelefone']
      .forEach((chave) => expect(contexto).not.toHaveProperty(chave));

    const serializado = JSON.stringify(contexto);
    expect(serializado).not.toContain('Cliente Teste');
    expect(serializado).not.toContain('cliente@teste.com');
    expect(serializado).not.toContain('5511977776666');
    expect(serializado).not.toContain('João Barbeiro');
    expect(serializado).not.toContain('5511999999999');
  });

  it('nada muda para o usuário: o mesmo Alert de erro continua aparecendo', async () => {
    await cancelarEFalhar();

    expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Não foi possível cancelar. Tente novamente.',
    );
    expect(mockedAlert).not.toHaveBeenCalledWith('Cancelado', expect.any(String));
  });

  it('telemetria caindo não derruba o fluxo — o Alert de erro sai igual', async () => {
    mockedRegistrarErro.mockRejectedValue(new Error('telemetria fora do ar'));

    await cancelarEFalhar();

    expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Não foi possível cancelar. Tente novamente.',
    );
  });

  it('cancelamento bem-sucedido não gera evento nenhum (nada de ruído)', async () => {
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('João Barbeiro')).toBeTruthy());
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Cancelar agendamento com João Barbeiro'));
    });
    await confirmarCancelamentoNoAlert();

    expect(mockedRegistrarErro).not.toHaveBeenCalled();
  });
});
