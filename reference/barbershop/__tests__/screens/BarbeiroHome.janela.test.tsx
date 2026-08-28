/**
 * BarbeiroHome — **CRÍTICO 2**: a Agenda omitia agendamentos.
 *
 * A tela carregava a agenda com `listarDoBarbeiro(uid, 50)` /
 * `listarPorNegocio(negocioId, 50)` — as 50 marcações mais recentemente
 * CRIADAS (`orderBy('createdAt','desc') + limit(50)`) — e só depois filtrava
 * por data no dispositivo. Numa equipe com volume, 50 criações se esgotam em
 * pouco mais de um dia: um horário marcado há semanas para amanhã cai fora
 * da janela das 50 últimas criações e SOME da Agenda. O agendamento existe,
 * está pago, o cliente vai aparecer — e o barbeiro não vê.
 *
 * A correção troca o critério: busca por INTERVALO DE DATA (o mês exibido no
 * calendário) via `listarDoEscopoFinanceiroPorPeriodo`, e ordena por
 * `data`+`horario`.
 *
 * ─── Por que um repositório de mentira com universo fixo ──────────────────
 *
 * `mockResolvedValue([...])` provaria só que a tela renderiza o array que
 * recebeu — o critério de busca, que é EXATAMENTE o que mudou, ficaria de
 * fora. Aqui o mock implementa as TRÊS funções (a nova por período e as duas
 * antigas por `createdAt desc + limit`) sobre o MESMO universo de
 * documentos. O universo é montado como o defeito de produção: um punhado de
 * marcações recém-criadas para o mês que vem, mais uma marcação antiga para
 * este mês. Sob o código corrigido, a antiga aparece; sob o código de antes,
 * ela é empurrada para fora pelas 50 criações mais novas — e este arquivo
 * fica vermelho. Mesma filosofia do `backendPorEscopo` em
 * __tests__/screens/tabs/BarbeiroRelatoriosTab.test.tsx.
 *
 * Escopo: janela de busca, escopo solo/equipe, stats e navegação de mês. A
 * conclusão pela Cloud Function e a telemetria vivem em
 * __tests__/screens/BarbeiroHome.concluir.test.tsx.
 *
 * Padrão de mock: por arquivo (o `jest.setup.js` NÃO mocka `react-native`
 * globalmente — CLAUDE.md §6) e nunca `restoreAllMocks()`.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import BarbeiroHome from '../../src/screens/BarbeiroHome';
import { ThemeProvider } from '../../src/context/ThemeContext';
import {
  listarDoEscopoFinanceiroPorPeriodo,
  listarPendentesDoEscopo,
  listarConfirmadosHojeDoEscopo,
  listarDoBarbeiro,
  listarPorNegocio,
  atualizarStatus,
} from '../../src/data/repositories/AgendamentoRepository';
import { getNegocioIdDoDono } from '../../src/data/repositories/NegocioRepository';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { migrarBanidosLegado } from '../../src/data/repositories/BanimentoRepository';
import { getOcupacoesPorPeriodo } from '../../src/services/OcupacaoService';
import useUserProfile from '../../src/hooks/useUserProfile';
import { toLocalDateString } from '../../src/utils/dateUtils';
import type { Agendamento } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// `useFocusEffect` aqui roda como `useEffect(efeito, [efeito])` — que é o que
// o hook REAL faz (react-navigation depende da identidade do callback). Não
// é detalhe: `BarbeiroHome` passa `useCallback(..., [calMes, calAno])`, então
// só com a dependência no efeito é que navegar o calendário refaz a busca. Um
// mock com `[]` (como o de BarbeiroHome.concluir.test.tsx, que não testa mês)
// congelaria a tela no mês da primeira renderização e tornaria o teste de
// navegação de mês vacuamente verde.
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const ReactLocal = require('react');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useRoute: () => ({ params: {} }),
    useFocusEffect: (callback: () => void) => {
      ReactLocal.useEffect(callback, [callback]);
    },
  };
});

// Filtros rápidos de status: fora da janela mensal.
describe('BarbeiroHome — filtros rápidos Pendentes e Confirmados', () => {
  const botaoPendente = (utils: ReturnType<typeof renderScreen>) => utils.getByLabelText(/pendentes/i);
  const botaoConfirmado = (utils: ReturnType<typeof renderScreen>) => utils.getByLabelText(/confirmados/i);

  it('Pendentes é botão acessível, representa o conjunto completo e revela pendência de outro mês', async () => {
    pendentesDoEscopo = [
      criar('pendente-antigo', 'Pendente De Outro Mês', DIA_15_DO_MES_QUE_VEM, { status: 'pendente' }),
      criar('pendente-hoje', 'Pendente De Hoje', HOJE_LOCAL, { status: 'pendente' }),
    ];
    universo = [criar('confirmado-normal', 'Confirmado Normal', DIA_10_DESTE_MES, { status: 'confirmado' })];

    const utils = renderScreen();
    await aguardarAgenda();

    expect(botaoPendente(utils).props.accessibilityRole).toBe('button');
    expect(botaoPendente(utils).props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    expect(stat(utils, 'Pendentes')).toBe(2);
    expect(utils.queryByText('Pendente De Outro Mês')).toBeNull();

    await act(async () => fireEvent.press(botaoPendente(utils)));

    await waitFor(() => expect(utils.getByText('Pendente De Outro Mês')).toBeTruthy());
    expect(utils.getByText('Pendente De Hoje')).toBeTruthy();
    expect(utils.queryByText('Confirmado Normal')).toBeNull();
    expect(utils.getByText('Mostrando todos os pendentes')).toBeTruthy();
    expect(botaoPendente(utils).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  });

  it('Pendentes exclui outros status, permite limpar no segundo toque e tem vazio específico', async () => {
    pendentesDoEscopo = [];
    universo = [
      criar('confirmado', 'Confirmado Não Pendente', DIA_10_DESTE_MES, { status: 'confirmado' }),
      criar('concluido', 'Concluído Não Pendente', DIA_15_DESTE_MES, { status: 'concluido' }),
      criar('cancelado', 'Cancelado Não Pendente', DIA_20_DESTE_MES, { status: 'cancelado' }),
    ];
    const utils = renderScreen();
    await aguardarAgenda();

    await act(async () => fireEvent.press(botaoPendente(utils)));
    await waitFor(() => expect(utils.getByText('Nenhum agendamento pendente')).toBeTruthy());
    expect(utils.queryByText(/Configure seus serviços/)).toBeNull();

    await act(async () => fireEvent.press(botaoPendente(utils)));
    await waitFor(() => expect(utils.getByText('Confirmado Não Pendente')).toBeTruthy());
    expect(utils.queryByText('Mostrando todos os pendentes')).toBeNull();
    expect(botaoPendente(utils).props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });

  it('Confirmados mostra só os atendimentos marcados para hoje, não confirmedAt', async () => {
    universo = [
      criar('confirmado-hoje', 'Confirmado De Hoje', HOJE_LOCAL, { status: 'confirmado' }),
      criar('confirmado-ontem', 'Confirmado De Ontem', ONTEM_LOCAL, { status: 'confirmado' }),
      criar('confirmado-amanha', 'Confirmado De Amanhã', AMANHA_LOCAL, { status: 'confirmado' }),
      criar('pendente-hoje', 'Pendente Marcado Hoje', HOJE_LOCAL, { status: 'pendente' }),
    ];

    const utils = renderScreen();
    await aguardarAgenda();

    expect(stat(utils, 'Confirmados')).toBe(1);
    expect(botaoConfirmado(utils).props.accessibilityRole).toBe('button');
    expect(botaoConfirmado(utils).props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));

    await act(async () => fireEvent.press(botaoConfirmado(utils)));

    await waitFor(() => expect(utils.getByText('Confirmado De Hoje')).toBeTruthy());
    expect(utils.queryByText('Confirmado De Ontem')).toBeNull();
    expect(utils.queryByText('Confirmado De Amanhã')).toBeNull();
    expect(utils.queryByText('Pendente Marcado Hoje')).toBeNull();
    expect(utils.getByText('Mostrando confirmados de hoje')).toBeTruthy();
    expect(botaoConfirmado(utils).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  });

  it('Confirmados tem estado vazio específico e selecionar data limpa o filtro rápido', async () => {
    universo = [
      criar('so-pendente-hoje', 'Pendente Hoje', HOJE_LOCAL, { status: 'pendente' }),
      criar('na-data', 'Agendamento Da Data', DIA_10_DESTE_MES, { status: 'concluido' }),
    ];
    const utils = renderScreen();
    await aguardarAgenda();

    await act(async () => fireEvent.press(botaoConfirmado(utils)));
    await waitFor(() => expect(utils.getByText('Nenhum agendamento confirmado para hoje')).toBeTruthy());

    await act(async () => fireEvent.press(utils.getByLabelText(/ver calendário/i)));
    await act(async () => fireEvent.press(utils.getByLabelText(/^Dia 10,/)));

    await waitFor(() => expect(utils.getByText('Agendamento Da Data')).toBeTruthy());
    expect(utils.queryByText('Mostrando confirmados de hoje')).toBeNull();
    expect(botaoConfirmado(utils).props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });

  it('confirmar dentro de Pendentes mantém o filtro ativo e atualiza lista e contadores', async () => {
    const pendente = criar('confirmar-ativo', 'Cliente A Confirmar', HOJE_LOCAL, { status: 'pendente' });
    universo = [pendente];
    pendentesDoEscopo = [pendente];
    mockedAtualizarStatus.mockImplementation(async (id: string, status: string) => {
      universo = universo.map((ag) => ag.id === id ? { ...ag, status } as Agendamento : ag);
      pendentesDoEscopo = pendentesDoEscopo.filter((ag) => ag.id !== id);
    });

    const utils = renderScreen();
    await aguardarAgenda();
    await act(async () => fireEvent.press(botaoPendente(utils)));
    await waitFor(() => expect(utils.getByText('Cliente A Confirmar')).toBeTruthy());
    expect(stat(utils, 'Pendentes')).toBe(1);
    expect(stat(utils, 'Confirmados')).toBe(0);

    await act(async () => fireEvent.press(utils.getByLabelText('Confirmar agendamento de Cliente A Confirmar')));
    const confirmacao = mockedAlert.mock.calls.find((chamada) => chamada[0] === 'Confirmar');
    await act(async () => await confirmacao[2].find((botao: { text: string }) => botao.text === 'Confirmar').onPress());

    await waitFor(() => expect(utils.getByText('Nenhum agendamento pendente')).toBeTruthy());
    expect(utils.getByText('Mostrando todos os pendentes')).toBeTruthy();
    expect(botaoPendente(utils).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(stat(utils, 'Pendentes')).toBe(0);
    expect(stat(utils, 'Confirmados')).toBe(1);
  });

  it('cancelar dentro de Confirmados mantém o filtro ativo e atualiza lista e contadores', async () => {
    const confirmado = criar('cancelar-ativo', 'Cliente A Cancelar', HOJE_LOCAL, { status: 'confirmado' });
    universo = [confirmado];
    mockedAtualizarStatus.mockImplementation(async (id: string, status: string) => {
      universo = universo.map((ag) => ag.id === id ? { ...ag, status } as Agendamento : ag);
    });

    const utils = renderScreen();
    await aguardarAgenda();
    await act(async () => fireEvent.press(botaoConfirmado(utils)));
    await waitFor(() => expect(utils.getByText('Cliente A Cancelar')).toBeTruthy());
    expect(stat(utils, 'Confirmados')).toBe(1);

    await act(async () => fireEvent.press(utils.getByLabelText('Cancelar agendamento de Cliente A Cancelar')));
    const confirmacao = mockedAlert.mock.calls.find((chamada) => chamada[0] === 'Cancelar');
    await act(async () => await confirmacao[2].find((botao: { text: string }) => botao.text === 'Sim, cancelar').onPress());

    await waitFor(() => expect(utils.getByText('Nenhum agendamento confirmado para hoje')).toBeTruthy());
    expect(utils.getByText('Mostrando confirmados de hoje')).toBeTruthy();
    expect(botaoConfirmado(utils).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(stat(utils, 'Pendentes')).toBe(0);
    expect(stat(utils, 'Confirmados')).toBe(0);
    expect(stat(utils, 'Total')).toBe(1);
  });
});

// Defeito de empacotamento do RN 0.80: o mock de RefreshControl do próprio
// pacote faz requireActual de um arquivo que não é publicado. Ver a
// explicação longa em BarbeiroHome.concluir.test.tsx.
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () => ({
  __esModule: true,
  default: 'RefreshControl',
}));

// `Animated.loop` + `Animated.timing` síncrono (jest.setup.js) = recursão
// infinita no primeiro render, que é o estado de skeleton. Ver a explicação
// longa em BarbeiroHome.concluir.test.tsx.
jest.mock('../../src/components/Skeleton', () => {
  const RN = require('react-native');
  return {
    __esModule: true,
    SkeletonList: () => <RN.View testID="skeleton-list" />,
    SkeletonCard: () => <RN.View testID="skeleton-card" />,
    SkeletonBlock: () => <RN.View testID="skeleton-block" />,
  };
});

// As TRÊS funções ficam expostas de propósito — inclusive as duas antigas.
// É isso que permite reverter a correção em `BarbeiroHome.tsx` e ver estes
// testes ficarem vermelhos por causa do CRITÉRIO DE BUSCA, e não por um
// "is not a function" acidental do mock.
jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  listarDoEscopoFinanceiroPorPeriodo: jest.fn(),
  listarPendentesDoEscopo: jest.fn(),
  listarConfirmadosHojeDoEscopo: jest.fn(),
  listarDoBarbeiro: jest.fn(),
  listarPorNegocio: jest.fn(),
  atualizarStatus: jest.fn(),
}));

jest.mock('../../src/data/repositories/NegocioRepository', () => ({
  getNegocioIdDoDono: jest.fn(),
}));

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/BanimentoRepository', () => ({
  migrarBanidosLegado: jest.fn(),
}));

jest.mock('../../src/services/OcupacaoService', () => ({
  getOcupacoesPorPeriodo: jest.fn(),
  liberarSlotsDoAgendamento: jest.fn(),
}));

jest.mock('../../src/services/CloudFunctionsClient', () => ({
  httpsCallable: jest.fn(() => jest.fn()),
}));

jest.mock('../../src/services/NotificationService', () => ({
  __esModule: true,
  default: { init: jest.fn() },
}));

jest.mock('../../src/services/ObservabilityService', () => ({
  registrarErro: jest.fn(() => Promise.resolve()),
  registrarAviso: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/hooks/useUserProfile', () => jest.fn());

const mockedListarEscopo = listarDoEscopoFinanceiroPorPeriodo as jest.Mock;
const mockedListarPendentes = listarPendentesDoEscopo as jest.Mock;
const mockedListarConfirmadosHoje = listarConfirmadosHojeDoEscopo as jest.Mock;
const mockedAtualizarStatus = atualizarStatus as jest.Mock;
const mockedListarDoBarbeiro = listarDoBarbeiro as jest.Mock;
const mockedListarPorNegocio = listarPorNegocio as jest.Mock;
const mockedGetNegocioIdDoDono = getNegocioIdDoDono as jest.Mock;
const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedMigrarBanidos = migrarBanidosLegado as jest.Mock;
const mockedGetOcupacoes = getOcupacoesPorPeriodo as jest.Mock;
const mockedUseUserProfile = useUserProfile as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

// ─── Universo de documentos e o repositório de mentira ──────────────────────

const UID = 'test-uid';
const HOJE = new Date();
const MES_ATUAL = HOJE.getMonth();
const ANO_ATUAL = HOJE.getFullYear();

/** Primeiro e último dia (YYYY-MM-DD) de um mês — espelho de `intervaloDoMes`. */
const janelaDoMes = (mes: number, ano: number) => ({
  dataInicio: toLocalDateString(new Date(ano, mes, 1)),
  dataFim: toLocalDateString(new Date(ano, mes + 1, 0)),
});

/**
 * Janela da LISTA — espelho de `intervaloDaLista`: o mês exibido, com 7 dias
 * de transbordo quando é o mês corrente. Existe porque com a janela colada no
 * fim do mês, no dia 31 um agendamento para o dia 1º do mês seguinte não
 * aparecia — e o último dia do mês é justamente quando o barbeiro mais olha
 * o amanhã. Meses navegados (passados/futuros) não transbordam.
 */
const janelaDaLista = (mes: number, ano: number) => {
  const base = janelaDoMes(mes, ano);
  const agora = new Date();
  if (mes !== agora.getMonth() || ano !== agora.getFullYear()) return base;
  const fim = new Date(ano, mes + 1, 0);
  fim.setDate(fim.getDate() + 7);
  return { dataInicio: base.dataInicio, dataFim: toLocalDateString(fim) };
};

const JANELA_ATUAL = janelaDaLista(MES_ATUAL, ANO_ATUAL);
const JANELA_PROXIMA = janelaDaLista(MES_ATUAL + 1, ANO_ATUAL);

/** Um dia qualquer, seguro em qualquer mês, do mês atual e do mês seguinte. */
const DIA_15_DESTE_MES = toLocalDateString(new Date(ANO_ATUAL, MES_ATUAL, 15));
const DIA_10_DESTE_MES = toLocalDateString(new Date(ANO_ATUAL, MES_ATUAL, 10));
const DIA_20_DESTE_MES = toLocalDateString(new Date(ANO_ATUAL, MES_ATUAL, 20));
const DIA_15_DO_MES_QUE_VEM = toLocalDateString(new Date(ANO_ATUAL, MES_ATUAL + 1, 15));

/** Datas relativas ao relógio local: não envelhecem quando o calendário vira. */
const diaRelativo = (delta: number) => {
  const data = new Date();
  data.setDate(data.getDate() + delta);
  return toLocalDateString(data);
};
const HOJE_LOCAL = diaRelativo(0);
const ONTEM_LOCAL = diaRelativo(-1);
const AMANHA_LOCAL = diaRelativo(1);

const DIA_EM_MS = 24 * 60 * 60 * 1000;
const diasAtras = (n: number) => new Date(HOJE.getTime() - n * DIA_EM_MS);

let universo: Agendamento[] = [];
let pendentesDoEscopo: Agendamento[] = [];

interface Opcoes {
  status?: string;
  barbeiroId?: string;
  negocioId?: string | null;
  horario?: string;
  criadoHaDias?: number;
}

const criar = (
  id: string,
  clienteNome: string,
  data: string,
  opcoes: Opcoes = {},
): Agendamento =>
  ({
    id,
    clienteNome,
    cliente: `${id}@teste.com`,
    clienteUid: `uid-${id}`,
    barbeiroId: opcoes.barbeiroId ?? UID,
    barbeiroNome: 'Barbeiro Teste',
    negocioId: opcoes.negocioId === undefined ? 'negocio-1' : opcoes.negocioId,
    status: opcoes.status ?? 'confirmado',
    data,
    horario: opcoes.horario ?? '09:00',
    servico: 'Corte Masculino',
    precoEmCentavos: 3000,
    createdAt: diasAtras(opcoes.criadoHaDias ?? 0),
  }) as unknown as Agendamento;

/**
 * Reproduz o contrato de `listarDoEscopoFinanceiroPorPeriodo`: recorte por
 * intervalo de DATA, união (deduplicada) de "o que é do negócio" com "o que
 * é do próprio barbeiro" quando há equipe; só o próprio barbeiro quando solo.
 */
const escopoPorPeriodo = (
  barbeiroId: string,
  negocioId: string | null | undefined,
  dataInicio: string,
  dataFim: string,
): Agendamento[] =>
  universo.filter((ag) => {
    if (ag.data < dataInicio || ag.data > dataFim) return false;
    return negocioId
      ? ag.negocioId === negocioId || ag.barbeiroId === barbeiroId
      : ag.barbeiroId === barbeiroId;
  });

/** O critério ANTIGO: as N marcações criadas mais recentemente, sem olhar `data`. */
const maisRecentesPorCriacao = (filtro: (ag: Agendamento) => boolean, max: number) =>
  universo
    .filter(filtro)
    .slice()
    .sort(
      (a, b) =>
        Number(b.createdAt as unknown as Date) - Number(a.createdAt as unknown as Date),
    )
    .slice(0, max);

// ─── Helpers de render/leitura ──────────────────────────────────────────────

const renderScreen = () =>
  render(
    <ThemeProvider>
      <BarbeiroHome
        navigation={{ navigate: jest.fn(), goBack: jest.fn() } as any}
        route={{ params: {} } as any}
      />
    </ThemeProvider>,
  );

/**
 * Espera a tela sair do skeleton — DE PROPÓSITO sem olhar qual função de
 * repositório foi chamada. Se este helper esperasse por `mockedListarEscopo`,
 * reverter a correção faria os oito testes falharem todos no mesmo ponto
 * ("a função nova não foi chamada"), escondendo o que importa: que a agenda
 * volta a MOSTRAR a lista errada. Com a espera no render, cada teste falha
 * pela sua própria asserção de conteúdo.
 */
const aguardarAgenda = async () => {
  await waitFor(() => expect(mockedGetNegocioIdDoDono).toHaveBeenCalled());
  await waitFor(() => expect(mockedListarEscopo.mock.calls.length +
    mockedListarDoBarbeiro.mock.calls.length +
    mockedListarPorNegocio.mock.calls.length).toBeGreaterThan(0));
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(mockedUseUserProfile).toHaveBeenCalled());
};

/**
 * Sobe do texto até o `<View>` que o contém. `.parent` de um resultado de
 * `getByText` é o componente COMPOSTO `Text` (RNTL 13), não o container.
 */
const blocoDoTexto = (utils: ReturnType<typeof renderScreen>, texto: string) => {
  let no: any = utils.getByText(texto);
  while (no && !(typeof no.type === 'string' && no.type === 'View')) no = no.parent;
  if (!no) throw new Error(`bloco de "${texto}" não encontrado`);
  return no;
};

/** Lê o número impresso no card de stats identificado pelo rótulo. */
const stat = (utils: ReturnType<typeof renderScreen>, rotulo: string): number =>
  Number(within(blocoDoTexto(utils, rotulo)).getByText(/^\d+$/).props.children);

beforeEach(() => {
  jest.clearAllMocks();
  universo = [];
  pendentesDoEscopo = [];

  mockedListarEscopo.mockImplementation(
    async (barbeiroId: string, negocioId: string | null, dataInicio: string, dataFim: string) =>
      escopoPorPeriodo(barbeiroId, negocioId, dataInicio, dataFim),
  );
  mockedListarPendentes.mockImplementation(async () => pendentesDoEscopo);
  mockedListarConfirmadosHoje.mockImplementation(async (_barbeiroId: string, _negocioId: string | null, hoje: string) =>
    escopoPorPeriodo(UID, null, hoje, hoje).filter((ag) => ag.status === 'confirmado'),
  );
  // As duas implementações do critério ANTIGO, sobre o mesmo universo — é o
  // que dá sentido ao teste de não-vacuidade descrito no cabeçalho.
  mockedListarDoBarbeiro.mockImplementation(async (barbeiroId: string, max: number) =>
    maisRecentesPorCriacao((ag) => ag.barbeiroId === barbeiroId, max),
  );
  mockedListarPorNegocio.mockImplementation(async (negocioId: string, max: number) =>
    maisRecentesPorCriacao((ag) => ag.negocioId === negocioId, max),
  );

  mockedGetNegocioIdDoDono.mockResolvedValue(null);
  mockedGetBarbeiro.mockResolvedValue({
    configuracaoAgenda: {
      horaInicio: '09:00', horaFim: '18:00', almocoInicio: '12:00', almocoFim: '13:00',
      antecedenciaMinutos: 0, antecedenciaMaximaDias: 365, diasAtendimento: [0, 1, 2, 3, 4, 5, 6],
    },
    datasBloqueadas: [],
  });
  mockedMigrarBanidos.mockResolvedValue(undefined);
  mockedGetOcupacoes.mockResolvedValue({});
  mockedUseUserProfile.mockReturnValue({
    profile: { nome: 'Barbeiro Teste' },
    loading: false,
    refresh: jest.fn(),
  });
});

// ─── O defeito real ─────────────────────────────────────────────────────────

describe('BarbeiroHome — CRÍTICO 2: a agenda busca por janela de data, não pelas últimas criações', () => {
  /**
   * O cenário do defeito, montado documento a documento: 55 marcações criadas
   * nos últimos dois dias (equipe com volume), todas para o MÊS QUE VEM, mais
   * uma marcação criada há 60 dias para ESTE mês.
   *
   * Pelo critério antigo, as 50 mais novas por `createdAt` são todas do mês
   * que vem e a marcação antiga fica de fora — some da Agenda. Pelo critério
   * novo (janela de data do mês exibido), ela é justamente a única que entra.
   */
  const universoDoDefeito = () => {
    const ruido = Array.from({ length: 55 }, (_, i) =>
      criar(`ruido-${i}`, `Ruido ${i}`, DIA_15_DO_MES_QUE_VEM, {
        criadoHaDias: 0,
        horario: '11:00',
      }),
    );
    const antigo = criar('ag-antigo', 'Cliente Marcado Ha Semanas', DIA_15_DESTE_MES, {
      criadoHaDias: 60,
    });
    universo = [...ruido, antigo];
  };

  it('agendamento com createdAt ANTIGO mas data dentro do mês exibido APARECE na agenda', async () => {
    universoDoDefeito();

    const utils = renderScreen();
    await aguardarAgenda();

    // Este é o cliente que sumia da Agenda em produção.
    await waitFor(() =>
      expect(utils.getByText('Cliente Marcado Ha Semanas')).toBeTruthy(),
    );

    // E a busca foi feita pela janela do mês exibido, com o escopo solo.
    expect(mockedListarEscopo).toHaveBeenCalledWith(
      UID,
      null,
      JANELA_ATUAL.dataInicio,
      JANELA_ATUAL.dataFim,
    );
  });

  it('agendamento com data FORA da janela não aparece — a correção não virou "buscar tudo"', async () => {
    universoDoDefeito();

    const utils = renderScreen();
    await aguardarAgenda();
    await waitFor(() => expect(utils.getByText('Cliente Marcado Ha Semanas')).toBeTruthy());

    // As 55 marcações do mês que vem estão no universo e foram as últimas
    // criadas — mas não pertencem à janela exibida.
    expect(utils.queryByText('Ruido 0')).toBeNull();
    expect(utils.queryByText('Ruido 54')).toBeNull();
  });

  it('a lista sai ordenada por data e horário, não por ordem de criação', async () => {
    // A ordem de CRIAÇÃO é o inverso exato da ordem de ATENDIMENTO — de
    // propósito. Com o critério antigo (`createdAt desc`) a lista sairia
    // Tarde → Meio → Cedo; se as duas ordens coincidissem, este teste
    // passaria com o defeito de volta e não valeria nada.
    universo = [
      criar('c', 'Cliente Tarde', DIA_20_DESTE_MES, { criadoHaDias: 0, horario: '09:00' }),
      criar('a', 'Cliente Cedo', DIA_10_DESTE_MES, { criadoHaDias: 30, horario: '15:00' }),
      criar('b', 'Cliente Meio', DIA_10_DESTE_MES, { criadoHaDias: 20, horario: '16:00' }),
    ];

    const utils = renderScreen();
    await aguardarAgenda();
    await waitFor(() => expect(utils.getByText('Cliente Cedo')).toBeTruthy());

    const nomes = utils
      .getAllByText(/^Cliente (Cedo|Meio|Tarde)$/)
      .map((n) => String(n.props.children));
    expect(nomes).toEqual(['Cliente Cedo', 'Cliente Meio', 'Cliente Tarde']);
  });
});

// ─── Stats: mesma janela que a lista ────────────────────────────────────────

describe('BarbeiroHome — CRÍTICO 2: os contadores contam a janela exibida', () => {
  it('stats somam só os agendamentos do mês exibido, não o universo inteiro', async () => {
    universo = [
      criar('p1', 'Pendente Um', DIA_10_DESTE_MES, { status: 'pendente' }),
      criar('c1', 'Confirmado Um', HOJE_LOCAL, { status: 'confirmado' }),
      criar('k1', 'Concluido Um', DIA_20_DESTE_MES, { status: 'concluido' }),
      // Fora da janela: criado agora (seria dos "50 mais recentes"), mas o
      // mês exibido não é o dele. Não pode entrar em nenhum contador.
      criar('f1', 'Pendente De Outro Mes', DIA_15_DO_MES_QUE_VEM, { status: 'pendente' }),
    ];

    pendentesDoEscopo = [universo[0], universo[3]];

    const utils = renderScreen();
    await aguardarAgenda();
    await waitFor(() => expect(utils.getByText('Pendente Um')).toBeTruthy());

    expect(stat(utils, 'Pendentes')).toBe(2);
    expect(stat(utils, 'Confirmados')).toBe(1);
    expect(stat(utils, 'Total')).toBe(3);

    // E o contador bate com o que a lista mostra — nem sobra, nem falta.
    expect(utils.queryByText('Pendente De Outro Mes')).toBeNull();
  });
});

// ─── Navegar o calendário refaz a busca ─────────────────────────────────────

describe('BarbeiroHome — CRÍTICO 2: navegar o mês move a janela', () => {
  it('avançar para o próximo mês busca a janela nova e troca a lista exibida', async () => {
    universo = [
      criar('deste', 'Cliente Deste Mes', DIA_15_DESTE_MES, { criadoHaDias: 40 }),
      criar('proximo', 'Cliente Do Mes Que Vem', DIA_15_DO_MES_QUE_VEM, { criadoHaDias: 40 }),
    ];

    const utils = renderScreen();
    await aguardarAgenda();
    await waitFor(() => expect(utils.getByText('Cliente Deste Mes')).toBeTruthy());
    expect(utils.queryByText('Cliente Do Mes Que Vem')).toBeNull();

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Próximo mês'));
    });

    // A busca foi refeita com a janela do mês seguinte…
    await waitFor(() =>
      expect(mockedListarEscopo).toHaveBeenCalledWith(
        UID,
        null,
        JANELA_PROXIMA.dataInicio,
        JANELA_PROXIMA.dataFim,
      ),
    );

    // …e a lista acompanhou: entrou o do mês que vem, saiu o deste mês.
    await waitFor(() => expect(utils.getByText('Cliente Do Mes Que Vem')).toBeTruthy());
    expect(utils.queryByText('Cliente Deste Mes')).toBeNull();
  });
});

// ─── Solo e equipe: o mesmo caminho, com o negocioId certo ──────────────────

describe('BarbeiroHome — CRÍTICO 2: solo e dono de equipe passam pela mesma função', () => {
  /**
   * Universo fixo visto de dois ângulos. O agendamento de OUTRO profissional
   * do mesmo negócio é o que separa os dois casos: o dono da equipe tem que
   * vê-lo, o barbeiro solo não. Comparar dois arrays escolhidos a dedo
   * provaria só que a tela renderiza o que recebe.
   */
  const universoDeEquipe = () => {
    universo = [
      criar('meu', 'Cliente Do Dono', DIA_10_DESTE_MES, { barbeiroId: UID }),
      criar('do-outro', 'Cliente Do Colega', DIA_15_DESTE_MES, {
        barbeiroId: 'prof-2',
        negocioId: 'negocio-1',
      }),
      // Agendamento antigo do próprio dono, de antes de a conta virar equipe
      // (sem `negocioId`) — a razão de a função consultar as duas fontes.
      criar('legado', 'Cliente Legado Sem Negocio', DIA_20_DESTE_MES, {
        barbeiroId: UID,
        negocioId: null,
      }),
    ];
  };

  it('barbeiro SOLO: chama com negocioId null e vê só os próprios agendamentos', async () => {
    universoDeEquipe();
    mockedGetNegocioIdDoDono.mockResolvedValue(null);

    const utils = renderScreen();
    await aguardarAgenda();
    await waitFor(() => expect(utils.getByText('Cliente Do Dono')).toBeTruthy());

    expect(mockedListarEscopo).toHaveBeenCalledWith(
      UID,
      null,
      JANELA_ATUAL.dataInicio,
      JANELA_ATUAL.dataFim,
    );
    expect(utils.getByText('Cliente Legado Sem Negocio')).toBeTruthy();
    expect(utils.queryByText('Cliente Do Colega')).toBeNull();
  });

  it('DONO DE EQUIPE: chama com o negocioId e vê também o agendamento do colega', async () => {
    universoDeEquipe();
    mockedGetNegocioIdDoDono.mockResolvedValue('negocio-1');

    const utils = renderScreen();
    await aguardarAgenda();
    await waitFor(() => expect(utils.getByText('Cliente Do Colega')).toBeTruthy());

    expect(mockedListarEscopo).toHaveBeenCalledWith(
      UID,
      'negocio-1',
      JANELA_ATUAL.dataInicio,
      JANELA_ATUAL.dataFim,
    );
    expect(utils.getByText('Cliente Do Dono')).toBeTruthy();
    // O agendamento legado do dono (sem negocioId) continua visível depois de
    // a conta virar equipe — era a razão de existir a consulta dupla.
    expect(utils.getByText('Cliente Legado Sem Negocio')).toBeTruthy();
    expect(stat(utils, 'Total')).toBe(3);
  });

  it('nos dois casos a agenda NUNCA usa o critério antigo de "últimas 50 criadas"', async () => {
    universoDeEquipe();

    mockedGetNegocioIdDoDono.mockResolvedValue(null);
    let utils = renderScreen();
    await aguardarAgenda();
    await waitFor(() => expect(utils.getByText('Cliente Do Dono')).toBeTruthy());
    utils.unmount();

    mockedGetNegocioIdDoDono.mockResolvedValue('negocio-1');
    utils = renderScreen();
    await aguardarAgenda();
    await waitFor(() => expect(utils.getByText('Cliente Do Colega')).toBeTruthy());

    // As duas funções antigas estão disponíveis no mock — e mesmo assim não
    // foram chamadas em nenhum dos dois caminhos.
    expect(mockedListarDoBarbeiro).not.toHaveBeenCalled();
    expect(mockedListarPorNegocio).not.toHaveBeenCalled();
  });

  /**
   * Regressão que a PRÓPRIA correção do CRÍTICO 2 introduziu e que foi
   * corrigida depois: com a janela colada no fim do mês, no dia 31 um
   * agendamento para o dia 1º do mês seguinte não aparecia — o barbeiro
   * precisava navegar de mês para ver o amanhã. É o pior dia possível para
   * esse defeito, porque é quando ele mais olha o dia seguinte.
   */
  it('a janela do mês CORRENTE transborda 7 dias — o agendamento do início do mês que vem aparece', async () => {
    const primeiroDoMesQueVem = toLocalDateString(new Date(ANO_ATUAL, MES_ATUAL + 1, 1));
    universo = [
      criar('deste-mes', 'Cliente Deste Mes', DIA_15_DESTE_MES, { barbeiroId: UID }),
      criar('virada', 'Cliente Da Virada', primeiroDoMesQueVem, { barbeiroId: UID }),
    ];
    mockedGetNegocioIdDoDono.mockResolvedValue(null);

    const utils = renderScreen();
    await aguardarAgenda();

    await waitFor(() => expect(utils.getByText('Cliente Da Virada')).toBeTruthy());
    expect(utils.getByText('Cliente Deste Mes')).toBeTruthy();
  });

  it('mas um mês NAVEGADO não transborda — ali o barbeiro pediu um mês específico', async () => {
    // Sem esta assimetria, navegar para um mês passado vazaria a semana
    // seguinte na lista e confundiria a leitura do período pedido.
    const janelaNavegada = janelaDaLista(MES_ATUAL + 1, ANO_ATUAL);
    const fimDoMesQueVem = toLocalDateString(new Date(ANO_ATUAL, MES_ATUAL + 2, 0));

    expect(janelaNavegada.dataFim).toBe(fimDoMesQueVem);
    expect(janelaNavegada.dataFim).not.toBe(JANELA_ATUAL.dataFim);
  });
});
