import React from 'react';
import { Animated, TouchableOpacity } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import HistoricoScreen from '../../src/screens/HistoricoScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { listarDoCliente } from '../../src/data/repositories/AgendamentoRepository';
import type { Agendamento } from '../../src/types';

// Mesmo achado documentado em __tests__/screens/ClienteHome.test.tsx: o
// `RefreshControl` real de 'react-native' quebra a árvore no ambiente Jest
// deste projeto. HistoricoScreen usa pull-to-refresh (FlatList), então
// precisa do mesmo contorno local.
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () => ({
  __esModule: true,
  default: 'RefreshControl',
}));

jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  listarDoCliente: jest.fn(),
  atualizarStatus: jest.fn(),
}));

jest.mock('../../src/services/WhatsAppService', () => ({
  __esModule: true,
  default: { sendTextMessage: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../src/services/OcupacaoService', () => ({
  liberarSlotsDoAgendamento: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/components/RatingComponent', () => 'RatingComponent');

// Mesmo achado do ClienteHome.test.tsx: Animated.loop usado pelo Skeleton
// (exibido enquanto `loading` está true) estoura a pilha em looping síncrono
// nos testes. Neutralizado só neste arquivo.
jest.spyOn(Animated, 'loop').mockImplementation(
  () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }) as any,
);

const mockedListarDoCliente = listarDoCliente as jest.Mock;

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const mockNavigation = { navigate: jest.fn() } as any;

const criarAgendamento = (overrides: Partial<Agendamento>): Agendamento => ({
  id: overrides.id ?? 'a1',
  barbeiroId: 'b1',
  barbeiroNome: 'João',
  cliente: 'cliente@teste.com',
  clienteUid: 'test-uid',
  clienteNome: 'Cliente Teste',
  status: 'pendente',
  data: '2026-08-10',
  horario: '10:00',
  ...overrides,
} as Agendamento);

/** Cria uma Promise controlável de fora — permite decidir quando cada
 * chamada de `listarDoCliente` resolve, para simular respostas fora de ordem. */
function criarPromiseControlavel<T>() {
  let resolver!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolve: resolver };
}

beforeEach(() => {
  // `mockReset` (não só `clearAllMocks`) é necessário aqui: o primeiro teste
  // desta suíte usa `mockImplementationOnce` encadeado, e se um teste anterior
  // falhar antes de consumir todas as implementações enfileiradas, elas
  // vazam para o próximo teste e travam a tela em loading para sempre.
  jest.clearAllMocks();
  mockedListarDoCliente.mockReset();
});

describe('HistoricoScreen — condição de corrida ao trocar filtro (PERF-001)', () => {
  it('descarta uma resposta lenta do filtro anterior que chega depois da resposta rápida do filtro atual', async () => {
    // A carga inicial (montagem, filtro "todos") resolve rápido — é preciso
    // que a tela saia do skeleton de loading para os botões de filtro
    // existirem e podermos capturar as referências dos handlers abaixo.
    mockedListarDoCliente.mockResolvedValueOnce([]);

    const utils = renderWithTheme(<HistoricoScreen navigation={mockNavigation} route={{} as any} />);

    await waitFor(() => expect(mockedListarDoCliente).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(utils.getByText('Pendentes')).toBeTruthy());

    // Captura os handlers `onPress` dos dois botões de filtro (via o
    // componente `TouchableOpacity`, que carrega o prop diretamente — a
    // instância retornada por `getByLabelText`/`getByText` é o nó nativo
    // filho, sem `onPress`) ENQUANTO ainda estão na árvore: a tela troca
    // para o skeleton de loading assim que o primeiro filtro é pressionado,
    // escondendo os botões — por isso não dá para "clicar" no segundo
    // depois. Chamamos a função capturada direto, reproduzindo exatamente o
    // que um segundo toque rápido dispararia.
    const botoesFiltro = utils.UNSAFE_getAllByType(TouchableOpacity);
    const onPressPendentes = botoesFiltro.find(
      (b) => b.props.accessibilityLabel === 'Filtrar por: Pendentes',
    )!.props.onPress;
    const onPressConfirmados = botoesFiltro.find(
      (b) => b.props.accessibilityLabel === 'Filtrar por: Confirmados',
    )!.props.onPress;

    // Primeiro filtro (Pendentes): dispara uma chamada LENTA.
    const lenta = criarPromiseControlavel<Agendamento[]>();
    // Segundo filtro (Confirmados): dispara uma chamada RÁPIDA.
    const rapida = criarPromiseControlavel<Agendamento[]>();
    mockedListarDoCliente
      .mockImplementationOnce(() => lenta.promise)
      .mockImplementationOnce(() => rapida.promise);

    await act(async () => {
      onPressPendentes();
    });
    await waitFor(() => expect(mockedListarDoCliente).toHaveBeenCalledTimes(2));

    // Troca de filtro de novo, rápido, ANTES da primeira resposta chegar.
    await act(async () => {
      onPressConfirmados();
    });
    await waitFor(() => expect(mockedListarDoCliente).toHaveBeenCalledTimes(3));

    // A resposta RÁPIDA (segundo filtro, Confirmados) chega primeiro.
    await act(async () => {
      rapida.resolve([criarAgendamento({ id: 'confirmado-1', status: 'confirmado', barbeiroNome: 'Filtro Novo' })]);
      await Promise.resolve();
    });

    await waitFor(() => expect(utils.getByText('Filtro Novo')).toBeTruthy());

    // A resposta LENTA (primeiro filtro, Pendentes — já obsoleta) chega depois.
    await act(async () => {
      lenta.resolve([criarAgendamento({ id: 'pendente-1', status: 'pendente', barbeiroNome: 'Filtro Antigo' })]);
      await Promise.resolve();
    });

    // A tela continua mostrando os dados do SEGUNDO filtro — a resposta
    // antiga não pode sobrescrever o state.
    expect(utils.getByText('Filtro Novo')).toBeTruthy();
    expect(utils.queryByText('Filtro Antigo')).toBeNull();
  });

  it('em condições normais (sem corrida), mostra os dados da única resposta recebida', async () => {
    mockedListarDoCliente.mockResolvedValue([
      criarAgendamento({ id: 'x1', barbeiroNome: 'Barbeiro Único' }),
    ]);

    const utils = renderWithTheme(<HistoricoScreen navigation={mockNavigation} route={{} as any} />);

    await waitFor(() => expect(utils.getByText('Barbeiro Único')).toBeTruthy());
  });
});

// ─── CRÍTICO 1: o botão "Avaliar" estava no estado errado ───────────────────
//
// Este é o bloco que o app inteiro não tinha. `HistoricoScreen` é a ÚNICA
// tela com ação de avaliar, e o bloco de botões estava condicionado a
// `status === 'confirmado'`. A regra do Firestore
// (`statusPermitidoAoCliente`, firestore.rules:379-381) só aceita a
// transição para 'avaliado' a PARTIR de 'concluido'. Ou seja: o único botão
// de avaliação do produto disparava uma escrita que a regra nega, e o estado
// que a regra autoriza não tinha botão nenhum. A coleção `avaliacoes` nunca
// recebeu um documento em produção — e 1409 testes verdes não acusaram,
// porque nenhum deles exercitava o USO, só a defesa.
//
// O teste que impede a volta do defeito é o segundo ('confirmado' NÃO
// oferece avaliar). Sem ele, alguém "conserta" o primeiro trocando a
// condição por `!== 'cancelado'` e o app volta a escrever o que a regra nega.
describe('HistoricoScreen — CRÍTICO 1: "Avaliar" só existe no estado que a regra autoriza', () => {
  /** O modal de avaliação está mockado como componente de host ('RatingComponent'):
   *  dá para ler os props que a tela passa — é assim que se prova que o botão
   *  está ligado ao fluxo de avaliação, e não apenas que existe um texto. */
  const modalDeAvaliacao = (utils: ReturnType<typeof renderWithTheme>) =>
    utils.UNSAFE_getByType('RatingComponent' as any);

  it('agendamento CONCLUÍDO oferece "Avaliar" e o botão abre o modal com aquele agendamento', async () => {
    mockedListarDoCliente.mockResolvedValue([
      criarAgendamento({ id: 'ag-concluido', status: 'concluido', barbeiroNome: 'João' }),
    ]);

    const utils = renderWithTheme(<HistoricoScreen navigation={mockNavigation} route={{} as any} />);
    await waitFor(() => expect(utils.getByText('João')).toBeTruthy());

    // O modal nasce fechado — se já nascesse aberto, a asserção depois do
    // toque não provaria nada.
    expect(modalDeAvaliacao(utils).props.visible).toBe(false);

    const botaoAvaliar = utils.getByLabelText('Avaliar João');
    await act(async () => {
      fireEvent.press(botaoAvaliar);
    });

    // O ponto: o toque abre o modal COM o agendamento certo. É esse
    // `agendamento` que o RatingComponent usa para escrever a avaliação e
    // mover o status para 'avaliado' — a transição que a regra só aceita a
    // partir de 'concluido'.
    const modal = modalDeAvaliacao(utils);
    expect(modal.props.visible).toBe(true);
    expect(modal.props.agendamento).toMatchObject({ id: 'ag-concluido', status: 'concluido' });
  });

  it('agendamento CONFIRMADO não oferece "Avaliar" (era o defeito: escrita que a regra nega)', async () => {
    mockedListarDoCliente.mockResolvedValue([
      criarAgendamento({ id: 'ag-confirmado', status: 'confirmado', barbeiroNome: 'João' }),
    ]);

    const utils = renderWithTheme(<HistoricoScreen navigation={mockNavigation} route={{} as any} />);
    await waitFor(() => expect(utils.getByText('João')).toBeTruthy());

    // Guarda contra falso-verde: o card REALMENTE renderizou (tem a ação que
    // o estado 'confirmado' deve ter). Sem isto, uma tela vazia por qualquer
    // motivo faria as duas asserções de ausência passarem sozinhas.
    expect(utils.getByLabelText('Cancelar este agendamento')).toBeTruthy();

    expect(utils.queryByLabelText('Avaliar João')).toBeNull();
    expect(utils.queryByText('Avaliar')).toBeNull();
  });

  it('agendamento JÁ AVALIADO não oferece avaliar de novo (estado terminal para o cliente)', async () => {
    mockedListarDoCliente.mockResolvedValue([
      criarAgendamento({ id: 'ag-avaliado', status: 'avaliado', barbeiroNome: 'João' }),
    ]);

    const utils = renderWithTheme(<HistoricoScreen navigation={mockNavigation} route={{} as any} />);
    await waitFor(() => expect(utils.getByText('João')).toBeTruthy());

    // O card renderizou de verdade — o badge de status prova.
    expect(utils.getByLabelText('Status: Avaliado')).toBeTruthy();

    expect(utils.queryByText('Avaliar')).toBeNull();
    // 'avaliado' é terminal para o cliente: a regra só deixa o barbeiro mexer
    // em campos neutros depois disso. Nenhuma ação de escrita na tela.
    expect(utils.queryByText('Cancelar')).toBeNull();
    expect(utils.queryByText('Reagendar')).toBeNull();
  });

  it('CONCLUÍDO mostra Reagendar E Avaliar — as duas ações convivem', async () => {
    mockedListarDoCliente.mockResolvedValue([
      criarAgendamento({ id: 'ag-concluido', status: 'concluido', barbeiroNome: 'João' }),
    ]);

    const utils = renderWithTheme(<HistoricoScreen navigation={mockNavigation} route={{} as any} />);
    await waitFor(() => expect(utils.getByText('João')).toBeTruthy());

    expect(utils.getByText('Avaliar')).toBeTruthy();
    expect(utils.getByText('Reagendar')).toBeTruthy();
  });

  it('PENDENTE oferece cancelar, nunca avaliar', async () => {
    mockedListarDoCliente.mockResolvedValue([
      criarAgendamento({ id: 'ag-pendente', status: 'pendente', barbeiroNome: 'João' }),
    ]);

    const utils = renderWithTheme(<HistoricoScreen navigation={mockNavigation} route={{} as any} />);
    await waitFor(() => expect(utils.getByText('João')).toBeTruthy());

    expect(utils.getByLabelText('Cancelar este agendamento')).toBeTruthy();
    expect(utils.queryByText('Avaliar')).toBeNull();
  });
});
