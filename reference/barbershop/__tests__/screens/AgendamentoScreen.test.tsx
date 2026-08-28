import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import AgendamentoScreen from '../../src/screens/AgendamentoScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { getHorariosOcupados, liberarSlotsDoAgendamento } from '../../src/services/OcupacaoService';
import { criarAgendamento, atualizarStatus } from '../../src/data/repositories/AgendamentoRepository';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { estaBanido } from '../../src/data/repositories/BanimentoRepository';
import { entrarNaFila, jaEstaNaFila } from '../../src/data/repositories/ListaEsperaRepository';
import useUserProfile from '../../src/hooks/useUserProfile';
import WhatsAppService from '../../src/services/WhatsAppService';
import { registrarErro } from '../../src/services/ObservabilityService';
import type { Barbeiro, ServicoBarbeiro, ConfiguracaoAgenda, Agendamento } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// `getDatesDisponiveis` é a ÚNICA função de agendaSlots.ts mockada: é a única
// que depende de `new Date()` ("hoje" real, não controlável sem fake timers).
// Todo o resto (gerarSlots, filtrarBloqueiosHorario, isTimeInPast,
// timeToMinutes, minutesToTime) usa a implementação REAL — já coberta em
// __tests__/utils/agendaSlots.test.ts, e aqui exercitada de ponta a ponta
// (config → slots renderizados) para não duplicar a mesma matemática com
// dados falsos, só substituir "qual é o calendário de hoje" por um fixo.
// Datas em 2030 — bem longe da data real de qualquer execução deste teste —
// eliminam qualquer dependência do dia em que a suíte é rodada.
const DATAS_FIXAS = ['2030-01-15', '2030-01-16', '2030-01-17', '2030-01-18', '2030-01-19'];
const mockedGetDatesDisponiveis = jest.fn(
  (_config: ConfiguracaoAgenda, datasBloqueadas: string[] = []) =>
    DATAS_FIXAS.filter((d) => !datasBloqueadas.includes(d)).map((d) => ({ date: d, display: d })),
);
jest.mock('../../src/utils/agendaSlots', () => {
  const real = jest.requireActual('../../src/utils/agendaSlots');
  return {
    ...real,
    getDatesDisponiveis: (...args: any[]) => (mockedGetDatesDisponiveis as any)(...args),
  };
});

jest.mock('../../src/services/OcupacaoService', () => ({
  getHorariosOcupados: jest.fn(),
  liberarSlotsDoAgendamento: jest.fn(),
}));

jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  criarAgendamento: jest.fn(),
  atualizarStatus: jest.fn(),
}));

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/BanimentoRepository', () => ({
  estaBanido: jest.fn(),
}));

jest.mock('../../src/data/repositories/ListaEsperaRepository', () => ({
  entrarNaFila: jest.fn(),
  jaEstaNaFila: jest.fn(),
}));

jest.mock('../../src/hooks/useUserProfile', () => jest.fn());

jest.mock('../../src/services/WhatsAppService', () => ({
  __esModule: true,
  default: {
    sendTextMessage: jest.fn(),
    gerarMensagemAgendamento: jest.fn(() => 'mensagem gerada'),
  },
}));

jest.mock('../../src/services/ObservabilityService', () => ({
  registrarErro: jest.fn(() => Promise.resolve()),
}));

// PaymentModal é uma peça própria (já testada em
// __tests__/components/PaymentModal.test.tsx, com PaymentService real). Aqui
// mockamos como um par de botões que disparam `onPaymentSuccess`/`onClose`
// diretamente — o que a AgendamentoScreen precisa garantir é que ela abre o
// modal com os dados certos e reage certo às duas saídas, não reimplementar
// o fluxo de pagamento presencial do componente filho.
jest.mock('../../src/components/PaymentModal', () => {
  const RN = require('react-native');
  return function MockPaymentModal({ visible, onPaymentSuccess, onClose, agendamento }: any) {
    if (!visible) return null;
    return (
      <RN.View testID="mock-payment-modal">
        <RN.Text testID="mock-payment-agendamento-servico">{agendamento?.servico}</RN.Text>
        <RN.TouchableOpacity testID="mock-payment-success" onPress={() => onPaymentSuccess({})}>
          <RN.Text>confirmar pagamento mock</RN.Text>
        </RN.TouchableOpacity>
        <RN.TouchableOpacity testID="mock-payment-close" onPress={onClose}>
          <RN.Text>fechar mock</RN.Text>
        </RN.TouchableOpacity>
      </RN.View>
    );
  };
});

const mockedGetHorariosOcupados = getHorariosOcupados as jest.Mock;
const mockedLiberarSlotsDoAgendamento = liberarSlotsDoAgendamento as jest.Mock;
const mockedCriarAgendamento = criarAgendamento as jest.Mock;
const mockedAtualizarStatus = atualizarStatus as jest.Mock;
const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedEstaBanido = estaBanido as jest.Mock;
const mockedEntrarNaFila = entrarNaFila as jest.Mock;
const mockedJaEstaNaFila = jaEstaNaFila as jest.Mock;
const mockedUseUserProfile = useUserProfile as jest.Mock;
const mockedSendTextMessage = WhatsAppService.sendTextMessage as jest.Mock;
const mockedRegistrarErro = registrarErro as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() } as any;

// horaInicio 09:00 / horaFim 11:00, serviço de 30min, sem buffer → 4 slots:
// 09:00, 09:30, 10:00, 10:30 (10:30+30=11:00<=11:00; 11:00+30>11:00 para).
const CONFIG_BASE: ConfiguracaoAgenda = {
  horaInicio: '09:00',
  horaFim: '11:00',
  almocoInicio: '',
  almocoFim: '',
  antecedenciaMinutos: 0,
  antecedenciaMaximaDias: 14,
  diasAtendimento: [0, 1, 2, 3, 4, 5, 6],
};

const SERVICO_CORTE: ServicoBarbeiro = {
  id: 's1',
  nome: 'Corte Masculino',
  duracaoMinutos: 30,
  precoEmCentavos: 3000,
};
const SERVICO_BARBA: ServicoBarbeiro = {
  id: 's2',
  nome: 'Barba',
  duracaoMinutos: 30,
  precoEmCentavos: 2000,
};

const BARBEIRO: Barbeiro = {
  id: 'b1',
  nome: 'João Barbeiro',
  telefone: '5511999999999',
  especialidade: 'Corte clássico',
} as Barbeiro;

const dadosBarbeiro = (overrides: Partial<Barbeiro> = {}) => ({
  configuracaoAgenda: CONFIG_BASE,
  servicos: [SERVICO_CORTE, SERVICO_BARBA],
  mensagemPosAgendamento: undefined,
  bloqueiosHorario: [],
  bannerPromocional: undefined,
  datasBloqueadas: [],
  clientesBanidos: [],
  ...overrides,
});

const renderScreen = (
  params: { barbeiro?: Barbeiro; servicoId?: string; agendamentoParaSubstituir?: Agendamento } = {},
) => {
  const route = { params: { barbeiro: BARBEIRO, ...params } } as any;
  return renderWithTheme(<AgendamentoScreen navigation={mockNavigation} route={route} />);
};

/** Aguarda a tela sair do loading inicial (header do barbeiro visível). */
const aguardarCarregamento = async (utils: ReturnType<typeof renderScreen>) => {
  await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());
  await waitFor(() => expect(utils.getByText(`Agendar com ${BARBEIRO.nome}`)).toBeTruthy());
  // Deixa a chamada automática de fetchHorariosDisponiveis (disparada pelo
  // efeito de montagem, que já tem selectedDate+servicoSelecionado prontos)
  // resolver antes de cada teste continuar.
  await act(async () => {
    await Promise.resolve();
  });
};

/** Cria uma Promise controlável de fora — mesmo padrão de HistoricoScreen.test.tsx. */
function criarPromiseControlavel<T>() {
  let resolver!: (value: T) => void;
  let rejeitador!: (erro: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolver = resolve;
    rejeitador = reject;
  });
  return { promise, resolve: resolver, reject: rejeitador };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetBarbeiro.mockResolvedValue(dadosBarbeiro());
  mockedEstaBanido.mockResolvedValue(false);
  mockedGetHorariosOcupados.mockResolvedValue([]);
  mockedLiberarSlotsDoAgendamento.mockResolvedValue(undefined);
  mockedCriarAgendamento.mockResolvedValue('novo-agendamento-id');
  mockedAtualizarStatus.mockResolvedValue(undefined);
  mockedEntrarNaFila.mockResolvedValue('fila-1');
  mockedJaEstaNaFila.mockResolvedValue(false);
  mockedUseUserProfile.mockReturnValue({
    profile: { nome: 'Cliente Teste', telefone: '5511988887777' },
    loading: false,
    refresh: jest.fn(),
  });
  mockedSendTextMessage.mockResolvedValue(true);
});

// ─── Carregamento de serviços / dados do barbeiro ────────────────────────────

describe('AgendamentoScreen — carregamento dos dados do profissional', () => {
  it('busca a configuração e os serviços do barbeiro e do banimento em paralelo', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(mockedGetBarbeiro).toHaveBeenCalledWith('b1');
    expect(mockedEstaBanido).toHaveBeenCalledWith('b1', 'test-uid');
  });

  it('mostra a lista de serviços do barbeiro quando não há serviço pré-selecionado', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(utils.getByText('Selecione o Serviço')).toBeTruthy();
    expect(utils.getByText('Corte Masculino')).toBeTruthy();
    expect(utils.getByText('Barba')).toBeTruthy();
  });

  it('quando o barbeiro não tem serviços cadastrados, mostra o aviso e nenhuma etapa de seleção', async () => {
    mockedGetBarbeiro.mockResolvedValue(dadosBarbeiro({ servicos: [] }));
    const utils = renderScreen();

    await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());
    await waitFor(() => expect(utils.getByText('Serviços não configurados')).toBeTruthy());
    expect(utils.queryByText('Selecione o Serviço')).toBeNull();
  });

  it('em caso de falha ao carregar o profissional, cai no fallback e a tela continua utilizável', async () => {
    mockedGetBarbeiro.mockRejectedValue(new Error('offline'));
    mockedEstaBanido.mockResolvedValue(false);
    const utils = renderScreen();

    await waitFor(() => expect(mockedRegistrarErro).toHaveBeenCalled());
    // Sem dados do barbeiro, `servicos` fica vazio (fallback), mas a tela
    // segue renderizando (datas calculadas com CONFIG_PADRAO) em vez de travar.
    await waitFor(() => expect(utils.getByText('Serviços não configurados')).toBeTruthy());
  });
});

// ─── Seleção de serviço, duração e preço ─────────────────────────────────────

describe('AgendamentoScreen — seleção de serviço', () => {
  it('mostra duração e preço de cada serviço e seleciona o primeiro por padrão', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    // Os dois serviços do fixture têm a mesma duração (30min) — o texto
    // "⏱ 30 min" aparece uma vez por card.
    expect(utils.getAllByText('⏱ 30 min')).toHaveLength(2);
    expect(utils.getByText('R$ 30,00')).toBeTruthy();
    expect(utils.getByText('R$ 20,00')).toBeTruthy();
    expect(
      utils.getByLabelText('Serviço Corte Masculino, 30 minutos, R$ 30,00').props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));
  });

  it('trocar de serviço atualiza a seleção e a antiga marcação de horário', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    await act(async () => {
      fireEvent.press(
        utils.getByLabelText('Serviço Barba, 30 minutos, R$ 20,00'),
      );
      await Promise.resolve();
    });

    const cardBarba = utils.getByLabelText('Serviço Barba, 30 minutos, R$ 20,00');
    expect(cardBarba.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  });

  it('quando vem com servicoId da rota, pula a etapa de seleção e mostra o nome do serviço no subtítulo', async () => {
    const utils = renderScreen({ servicoId: 's2' });
    await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());
    await waitFor(() => expect(utils.getByText(`Agendar com ${BARBEIRO.nome}`)).toBeTruthy());

    expect(utils.queryByText('Selecione o Serviço')).toBeNull();
    expect(utils.getByText('Barba')).toBeTruthy();
  });
});

// ─── Datas disponíveis / folgas ──────────────────────────────────────────────

describe('AgendamentoScreen — datas disponíveis e folgas', () => {
  it('renderiza um botão de data para cada data disponível', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(utils.getAllByTestId('date-button')).toHaveLength(DATAS_FIXAS.length);
  });

  it('passa as folgas do barbeiro (datasBloqueadas) para o cálculo de datas, removendo-as da lista', async () => {
    mockedGetBarbeiro.mockResolvedValue(dadosBarbeiro({ datasBloqueadas: ['2030-01-16'] }));
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(mockedGetDatesDisponiveis).toHaveBeenCalledWith(
      CONFIG_BASE,
      ['2030-01-16'],
    );
    expect(utils.getAllByTestId('date-button')).toHaveLength(DATAS_FIXAS.length - 1);
  });
});

// ─── Horários disponíveis / ocupados / bloqueios / almoço ────────────────────

describe('AgendamentoScreen — horários disponíveis', () => {
  it('busca os horários ocupados do barbeiro na data selecionada e mostra os slots livres', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    await waitFor(() => expect(utils.getAllByTestId('time-button')).toHaveLength(4));
    expect(mockedGetHorariosOcupados).toHaveBeenCalledWith('b1', '2030-01-15');
  });

  it('remove da grade um horário que já está ocupado', async () => {
    mockedGetHorariosOcupados.mockResolvedValue(['09:30']);
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    await waitFor(() => expect(utils.getAllByTestId('time-button')).toHaveLength(3));
    expect(utils.queryByLabelText('Horário 09:30')).toBeNull();
    expect(utils.getByLabelText('Horário 09:00')).toBeTruthy();
  });

  it('remove da grade um horário coberto por um bloqueio de evento pessoal (não é a hora de almoço)', async () => {
    mockedGetBarbeiro.mockResolvedValue(
      dadosBarbeiro({
        bloqueiosHorario: [
          { id: 'bloq1', data: '2030-01-15', horaInicio: '10:00', horaFim: '10:30' },
        ],
      }),
    );
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    await waitFor(() => expect(utils.getAllByTestId('time-button')).toHaveLength(3));
    expect(utils.queryByLabelText('Horário 10:00')).toBeNull();
  });

  it('remove os horários dentro do intervalo de almoço configurado', async () => {
    mockedGetBarbeiro.mockResolvedValue(
      dadosBarbeiro({
        configuracaoAgenda: { ...CONFIG_BASE, almocoInicio: '10:00', almocoFim: '10:30' },
      }),
    );
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    // 09:00, 09:30, (10:00 cai no almoço) 10:30 → 3 slots.
    await waitFor(() => expect(utils.getAllByTestId('time-button')).toHaveLength(3));
    expect(utils.queryByLabelText('Horário 10:00')).toBeNull();
    expect(utils.getByLabelText('Horário 10:30')).toBeTruthy();
  });

  it('mostra "Verificando disponibilidade..." enquanto a busca de horários está pendente', async () => {
    const pendente = criarPromiseControlavel<string[]>();
    mockedGetHorariosOcupados.mockReturnValue(pendente.promise);

    const utils = renderScreen();
    await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());

    await waitFor(() => expect(utils.getByText('Verificando disponibilidade...')).toBeTruthy());

    await act(async () => {
      pendente.resolve([]);
      await Promise.resolve();
    });
    await waitFor(() => expect(utils.getAllByTestId('time-button')).toHaveLength(4));
  });
});

// ─── Condição de corrida (requisicaoHorariosRef) ─────────────────────────────

describe('AgendamentoScreen — condição de corrida ao trocar de data (requisicaoHorariosRef)', () => {
  it('descarta uma resposta de horários obsoleta que chega depois da resposta da data mais recente', async () => {
    // 1ª chamada: automática, disparada pelo efeito de montagem para a data
    // padrão (dates[0] = '2030-01-15'). Resolve rápido para a tela sair do
    // carregamento inicial e os botões de data existirem.
    mockedGetHorariosOcupados.mockResolvedValueOnce([]);
    const utils = renderScreen();
    await aguardarCarregamento(utils);
    await waitFor(() => expect(mockedGetHorariosOcupados).toHaveBeenCalledTimes(1));

    const lenta = criarPromiseControlavel<string[]>();
    const rapida = criarPromiseControlavel<string[]>();
    // 2ª chamada (troca para '2030-01-16'): LENTA, marca TUDO como ocupado
    // (para ficar óbvio se ela vazar pro estado por engano).
    // 3ª chamada (troca para '2030-01-17'): RÁPIDA, nada ocupado.
    mockedGetHorariosOcupados
      .mockImplementationOnce(() => lenta.promise)
      .mockImplementationOnce(() => rapida.promise);

    const botoesData = utils.getAllByTestId('date-button');

    await act(async () => {
      fireEvent.press(botoesData[1]); // '2030-01-16' — lenta
      await Promise.resolve();
    });
    await waitFor(() => expect(mockedGetHorariosOcupados).toHaveBeenCalledTimes(2));

    await act(async () => {
      fireEvent.press(botoesData[2]); // '2030-01-17' — rápida, ANTES da lenta responder
      await Promise.resolve();
    });
    await waitFor(() => expect(mockedGetHorariosOcupados).toHaveBeenCalledTimes(3));

    // A resposta RÁPIDA (data mais recente) chega primeiro: todos os 4 slots livres.
    await act(async () => {
      rapida.resolve([]);
      await Promise.resolve();
    });
    await waitFor(() => expect(utils.getAllByTestId('time-button')).toHaveLength(4));

    // A resposta LENTA (já obsoleta) chega depois, marcando tudo ocupado —
    // não pode sobrescrever a tela, que deve continuar mostrando os 4 slots
    // livres da requisição mais recente.
    await act(async () => {
      lenta.resolve(['09:00', '09:30', '10:00', '10:30']);
      await Promise.resolve();
    });
    expect(utils.getAllByTestId('time-button')).toHaveLength(4);
  });
});

// ─── Confirmação do agendamento ──────────────────────────────────────────────

describe('AgendamentoScreen — confirmação do agendamento', () => {
  const selecionarPrimeiroHorario = async (utils: ReturnType<typeof renderScreen>) => {
    await aguardarCarregamento(utils);
    await waitFor(() => expect(utils.getAllByTestId('time-button').length).toBeGreaterThan(0));
    await act(async () => {
      fireEvent.press(utils.getAllByTestId('time-button')[0]);
    });
  };

  it('mostra o resumo com serviço, duração, data e horário antes de confirmar', async () => {
    const utils = renderScreen();
    await selecionarPrimeiroHorario(utils);

    expect(utils.getByText('Resumo do Agendamento')).toBeTruthy();
    // "Corte Masculino" aparece no card de seleção E na linha "Serviço:" do resumo.
    expect(utils.getAllByText('Corte Masculino').length).toBeGreaterThanOrEqual(2);
    expect(utils.getByText('30 min')).toBeTruthy();
    // "09:00" aparece no botão de horário selecionado E na linha "Horário:" do resumo.
    expect(utils.getAllByText('09:00').length).toBeGreaterThanOrEqual(2);
  });

  it('cria o agendamento e abre o modal de pagamento', async () => {
    const utils = renderScreen();
    await selecionarPrimeiroHorario(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId('confirm-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedCriarAgendamento).toHaveBeenCalledWith(
      expect.objectContaining({
        barbeiroId: 'b1',
        clienteUid: 'test-uid',
        data: '2030-01-15',
        horario: '09:00',
        servico: 'Corte Masculino',
        servicoId: 's1',
        precoEmCentavos: 3000,
        status: 'pendente',
      }),
    );
    await waitFor(() => expect(utils.getByTestId('mock-payment-modal')).toBeTruthy());
  });

  it('duplo clique: a confirmação troca a tela inteira pelo indicador de carregamento, retirando o botão da árvore e evitando um segundo envio', async () => {
    // `confirmarAgendamento` usa o MESMO `loading` que controla a renderização
    // de tela cheia (`if (loading) return <ActivityIndicator />`) — assim que
    // a primeira confirmação começa, a tela inteira vira um spinner e o botão
    // "Confirmar Agendamento" some da árvore. Não sobra nada para um segundo
    // toque físico disparar antes da primeira chamada terminar.
    const pendente = criarPromiseControlavel<string>();
    mockedCriarAgendamento.mockReturnValue(pendente.promise);
    const utils = renderScreen();
    await selecionarPrimeiroHorario(utils);

    fireEvent.press(utils.getByTestId('confirm-button'));

    await waitFor(() => expect(utils.queryByTestId('confirm-button')).toBeNull());
    expect(mockedCriarAgendamento).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendente.resolve('novo-agendamento-id');
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('quando a Cloud Function recusa por horário já existir (already-exists), avisa e recarrega os horários', async () => {
    mockedCriarAgendamento.mockRejectedValue({ code: 'functions/already-exists', message: 'já existe' });
    const utils = renderScreen();
    await selecionarPrimeiroHorario(utils);

    mockedGetHorariosOcupados.mockClear();
    await act(async () => {
      fireEvent.press(utils.getByTestId('confirm-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith(
      'Horário já ocupado',
      expect.stringContaining('Alguém confirmou este horário'),
    );
    await waitFor(() => expect(mockedGetHorariosOcupados).toHaveBeenCalled());
  });

  it('reagendamento: quando a rota vem com agendamentoParaSubstituir, cancela o agendamento antigo e libera os slots antigos assim que o novo é criado', async () => {
    const AGENDAMENTO_ANTIGO: Agendamento = {
      id: 'agendamento-antigo-id',
      barbeiroId: 'b1',
      barbeiroNome: 'João Barbeiro',
      barbeiroTelefone: '5511999999999',
      cliente: 'cliente@teste.com',
      clienteUid: 'test-uid',
      clienteNome: 'Cliente Teste',
      clienteTelefone: '5511988887777',
      status: 'confirmado',
      data: '2030-01-10',
      horario: '09:00',
      servico: 'Corte Masculino',
      servicoId: 's1',
      preco: '30,00',
      precoEmCentavos: 3000,
    } as Agendamento;

    const utils = renderScreen({ agendamentoParaSubstituir: AGENDAMENTO_ANTIGO });
    await selecionarPrimeiroHorario(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId('confirm-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // O cancelamento do antigo acontece assim que `criarAgendamento` (o novo)
    // tem sucesso — não depende de nenhuma interação com o modal de pagamento,
    // que nunca chegou a ser tocado neste teste.
    expect(mockedAtualizarStatus).toHaveBeenCalledWith(
      'agendamento-antigo-id',
      'cancelado',
      { cancelledBy: 'cliente' },
    );
    expect(mockedLiberarSlotsDoAgendamento).toHaveBeenCalledWith(AGENDAMENTO_ANTIGO);
    await waitFor(() => expect(utils.getByTestId('mock-payment-modal')).toBeTruthy());
  });

  const AGENDAMENTO_ANTIGO_PARA_SUBSTITUIR: Agendamento = {
    id: 'agendamento-antigo-id',
    barbeiroId: 'b1',
    barbeiroNome: 'João Barbeiro',
    barbeiroTelefone: '5511999999999',
    cliente: 'cliente@teste.com',
    clienteUid: 'test-uid',
    clienteNome: 'Cliente Teste',
    clienteTelefone: '5511988887777',
    status: 'confirmado',
    data: '2030-01-10',
    horario: '09:00',
    servico: 'Corte Masculino',
    servicoId: 's1',
    preco: '30,00',
    precoEmCentavos: 3000,
  } as Agendamento;

  it('reagendamento — falha ao cancelar o antigo: o NOVO agendamento continua válido (não é desfeito) e registrarErro é chamado', async () => {
    mockedAtualizarStatus.mockRejectedValue(new Error('falha ao cancelar o antigo'));
    const utils = renderScreen({ agendamentoParaSubstituir: AGENDAMENTO_ANTIGO_PARA_SUBSTITUIR });
    await selecionarPrimeiroHorario(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId('confirm-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // O novo agendamento JÁ foi criado com sucesso antes da tentativa de
    // cancelar o antigo — uma falha ao limpar o antigo nunca desfaz o novo:
    // o modal de pagamento do agendamento recém-criado continua abrindo
    // normalmente, sem nenhum alerta de erro genérico para o cliente.
    expect(mockedCriarAgendamento).toHaveBeenCalled();
    await waitFor(() => expect(utils.getByTestId('mock-payment-modal')).toBeTruthy());
    expect(mockedAlert).not.toHaveBeenCalledWith('Erro', expect.any(String));

    // liberarSlotsDoAgendamento não é chamado quando atualizarStatus (que
    // vem antes, dentro do mesmo try/catch) já rejeitou.
    expect(mockedLiberarSlotsDoAgendamento).not.toHaveBeenCalled();

    // A falha é registrada com a operação específica de limpeza do
    // reagendamento — não com 'criar-reserva' (esse erro não é do novo
    // agendamento, que teve sucesso).
    expect(mockedRegistrarErro).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: 'agendamento', operacao: 'cancelar-antigo-no-reagendamento' }),
    );
  });

  it('reagendamento — falha ao criar o NOVO agendamento: o antigo nunca é tocado (atualizarStatus não é chamado)', async () => {
    mockedCriarAgendamento.mockRejectedValue(new Error('sem conexão'));
    const utils = renderScreen({ agendamentoParaSubstituir: AGENDAMENTO_ANTIGO_PARA_SUBSTITUIR });
    await selecionarPrimeiroHorario(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId('confirm-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // O cancelamento do agendamento antigo só pode acontecer DEPOIS que
    // criarAgendamento (o novo) resolve com sucesso — como ele rejeitou,
    // nem atualizarStatus nem liberarSlotsDoAgendamento podem ter sido
    // chamados, e o cliente não fica sem nenhum agendamento válido.
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
    expect(mockedLiberarSlotsDoAgendamento).not.toHaveBeenCalled();

    expect(mockedRegistrarErro).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: 'agendamento', operacao: 'criar-reserva' }),
    );
    expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Não foi possível realizar o agendamento. Tente novamente.',
    );
  });

  it('em erro inesperado ao criar o agendamento, registra o erro e mostra alerta genérico', async () => {
    mockedCriarAgendamento.mockRejectedValue(new Error('falha de rede'));
    const utils = renderScreen();
    await selecionarPrimeiroHorario(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId('confirm-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedRegistrarErro).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: 'agendamento', operacao: 'criar-reserva' }),
    );
    expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Não foi possível realizar o agendamento. Tente novamente.',
    );
  });
});

// ─── Sucesso do pagamento / navegação ────────────────────────────────────────

describe('AgendamentoScreen — sucesso e navegação após confirmar', () => {
  const irAtePagamento = async (utils: ReturnType<typeof renderScreen>) => {
    await aguardarCarregamento(utils);
    await waitFor(() => expect(utils.getAllByTestId('time-button').length).toBeGreaterThan(0));
    await act(async () => {
      fireEvent.press(utils.getAllByTestId('time-button')[0]);
    });
    await act(async () => {
      fireEvent.press(utils.getByTestId('confirm-button'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(utils.getByTestId('mock-payment-modal')).toBeTruthy());
  };

  // Onda E: a tela PAROU de enviar WhatsApp após o pagamento — o trigger
  // reativo `notificarAgendamentoCriado` (functions/index.js, disparado na
  // criação do agendamento) cobre esse aviso agora, e melhor: também avisa
  // o dono quando é uma equipe, o que a tela nunca fazia. Mandar daqui
  // duplicaria a notificação.
  it('ao confirmar o pagamento, NÃO envia mais WhatsApp da tela e navega para a confirmação com whatsappEnviado=false', async () => {
    const utils = renderScreen();
    await irAtePagamento(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId('mock-payment-success'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedSendTextMessage).not.toHaveBeenCalled();
    expect(mockNavigation.replace).toHaveBeenCalledWith(
      'AgendamentoConfirmado',
      expect.objectContaining({
        agendamento: expect.objectContaining({ id: 'novo-agendamento-id', servico: 'Corte Masculino' }),
        barbeiro: BARBEIRO,
        whatsappEnviado: false,
      }),
    );
  });

  it('mesmo quando o barbeiro não tem telefone cadastrado, navega normalmente sem tentar enviar WhatsApp', async () => {
    const utils = renderScreen({ barbeiro: { ...BARBEIRO, telefone: undefined } });
    await irAtePagamento(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId('mock-payment-success'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedSendTextMessage).not.toHaveBeenCalled();
    expect(mockNavigation.replace).toHaveBeenCalledWith(
      'AgendamentoConfirmado',
      expect.objectContaining({ whatsappEnviado: false }),
    );
  });
});

// ─── Acesso bloqueado (profissional indisponível para este cliente) ─────────

describe('AgendamentoScreen — profissional indisponível para este cliente', () => {
  it('cliente banido pelo barbeiro: mostra alerta de acesso bloqueado e volta para a tela anterior', async () => {
    mockedEstaBanido.mockResolvedValue(true);
    renderScreen();

    await waitFor(() => expect(mockedAlert).toHaveBeenCalledWith(
      'Acesso bloqueado',
      'Você não pode agendar com este barbeiro.',
      expect.any(Array),
    ));

    const chamada = mockedAlert.mock.calls.find((c) => c[0] === 'Acesso bloqueado');
    await act(async () => {
      chamada[2][0].onPress();
    });
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('cliente banido pela lista legada (clientesBanidos) também é bloqueado', async () => {
    mockedEstaBanido.mockResolvedValue(false);
    mockedGetBarbeiro.mockResolvedValue(
      dadosBarbeiro({ clientesBanidos: [{ uid: 'test-uid', nome: 'x', email: 'x@x.com' }] as any }),
    );
    renderScreen();

    await waitFor(() => expect(mockedAlert).toHaveBeenCalledWith(
      'Acesso bloqueado',
      'Você não pode agendar com este barbeiro.',
      expect.any(Array),
    ));
  });

  it('profissional sem dados carregáveis (removido/desativado): cai no fallback sem travar a tela', async () => {
    mockedGetBarbeiro.mockResolvedValue(null);
    mockedEstaBanido.mockResolvedValue(false);
    const utils = renderScreen();

    await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());
    await waitFor(() => expect(utils.getByText('Serviços não configurados')).toBeTruthy());
    expect(mockedAlert).not.toHaveBeenCalledWith('Acesso bloqueado', expect.any(String), expect.any(Array));
  });
});

// ─── Lista de espera (fluxo auxiliar quando não há horário livre) ───────────

describe('AgendamentoScreen — lista de espera quando não há horário livre', () => {
  it('permite entrar na lista de espera quando a data escolhida não tem nenhum horário disponível', async () => {
    mockedGetHorariosOcupados.mockResolvedValue(['09:00', '09:30', '10:00', '10:30']);
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    await waitFor(() => expect(utils.getByText('📋 Entrar na lista de espera')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByText('📋 Entrar na lista de espera'));
      await Promise.resolve();
    });

    expect(mockedEntrarNaFila).toHaveBeenCalledWith(
      expect.objectContaining({ barbeiroId: 'b1', clienteUid: 'test-uid', data: '2030-01-15' }),
    );
    await waitFor(() =>
      expect(utils.getByText('✅ Você está na lista de espera para esta data!')).toBeTruthy(),
    );
  });
});

// ─── P0-1: nenhuma reserva de slot do lado cliente ───────────────────────────

describe('AgendamentoScreen — P0-1 (item 2 do plano de testes)', () => {
  // A Cloud Function `criarAgendamentoSeguro` (functions/index.js) já reserva
  // todos os slots atomicamente, na MESMA transação que cria o agendamento.
  // Antes da correção, a tela também chamava `reservarSlots` do lado
  // cliente depois de criar o agendamento — uma segunda reserva redundante
  // que podia apagar um agendamento válido sem liberar o slot que o servidor
  // já tinha reservado, se essa segunda chamada falhasse por qualquer
  // motivo (inclusive erro de permissão). O mock de OcupacaoService no topo
  // deste arquivo só expõe `getHorariosOcupados`/`liberarSlotsDoAgendamento`
  // — se a tela ainda chamasse `reservarSlots`, TODOS os testes de
  // confirmação acima já teriam quebrado com "reservarSlots is not a
  // function". Este teste é a checagem estática complementar (mesmo padrão
  // de __tests__/data/UsuarioRepository.test.ts, "não importa nada de
  // firebase/firestore... checagem estática"): prova que o arquivo de
  // PRODUÇÃO nem importa `reservarSlots`, não só que o mock não o expõe.
  it('não importa reservarSlots de OcupacaoService no código-fonte (checagem estática)', () => {
    const fs = require('fs');
    const path = require('path');
    const codigo = fs.readFileSync(
      path.join(__dirname, '../../src/screens/AgendamentoScreen.tsx'),
      'utf8',
    );
    expect(codigo).not.toMatch(/reservarSlots/);
    // Confirma que o import de OcupacaoService continua existindo (não é um
    // falso-positivo por o arquivo ter sido esvaziado) e traz só as duas
    // funções esperadas.
    expect(codigo).toMatch(
      /import\s*\{\s*getHorariosOcupados\s*,\s*liberarSlotsDoAgendamento\s*\}\s*from\s*['"]\.\.\/services\/OcupacaoService['"]/,
    );
  });
});
