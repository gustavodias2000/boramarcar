/**
 * InicioScreen — **ARQ-01**, lado do painel de entrada do barbeiro.
 *
 * Esta tela tem DUAS consultas de agendamento (a semana e o mês corrente), e
 * as duas somavam só o atendimento do próprio dono. Corrigidas, ambas passam
 * pelo escopo financeiro — mas o `negocioId` é resolvido UMA vez, antes do
 * `Promise.all`: um `getNegocioIdDoDono` por consulta seria leitura duplicada.
 *
 * O ponto delicado é o modo de falhar. Se a resolução do negócio ficasse
 * dentro do `Promise.all` cru, ou fora de um `comFallback`, uma recusa
 * pontual do Firestore (regra recém-publicada, índice em construção, rede)
 * derrubaria o painel INTEIRO — inclusive avisos, clientes e agenda da
 * semana, que não têm nada a ver com o negócio. Degradar para o escopo
 * próprio sub-reporta o mês; é o lado aceitável de errar aqui.
 *
 * Depois do P1, este arquivo cobre três eixos: o ESCOPO dos dados (ARQ-01), o
 * CUSTO das consultas de cliente (PERF) e a soma de dinheiro do dia (P0). O
 * onboarding continua sem cobertura própria.
 */
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import InicioScreen from '../../src/screens/InicioScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import {
  listarDoEscopoFinanceiroPorPeriodo,
  contarPendentesDoBarbeiro,
} from '../../src/data/repositories/AgendamentoRepository';
import { listarPorBarbeiroEPeriodo as listarDespesasPorPeriodo } from '../../src/data/repositories/DespesaRepository';
import { getNegocioIdDoDono } from '../../src/data/repositories/NegocioRepository';
import {
  listarClientesDoBarbeiro,
  contarClientes,
  contarClientesDesde,
  listarAniversariantesNaJanela,
} from '../../src/data/repositories/ClienteContatoRepository';
import { contarFilaDoBarbeiro } from '../../src/data/repositories/ListaEsperaRepository';
import useUserProfile from '../../src/hooks/useUserProfile';
import { toLocalDateString, formatMoney } from '../../src/utils/dateUtils';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@react-navigation/native', () => {
  const ReactLocal = require('react');
  return {
    useFocusEffect: (callback: () => void) => ReactLocal.useEffect(callback, [callback]),
  };
});

// Defeito de EMPACOTAMENTO do próprio React Native 0.80 (não deste projeto):
// `react-native/jest/setup.js` mocka o RefreshControl fazendo `requireActual`
// de um arquivo `__mocks__/RefreshControlMock` que não é publicado no pacote.
// Qualquer tela com pull-to-refresh explode no render. Mesmo contorno já
// usado em BarbeiroHome.concluir.test.tsx e ClienteAgendamentosTab.test.tsx.
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () => ({
  __esModule: true,
  default: 'RefreshControl',
}));

jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  listarDoEscopoFinanceiroPorPeriodo: jest.fn(),
  contarPendentesDoBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/DespesaRepository', () => ({
  listarPorBarbeiroEPeriodo: jest.fn(),
}));

jest.mock('../../src/data/repositories/NegocioRepository', () => ({
  getNegocioIdDoDono: jest.fn(),
}));

// `listarClientesDoBarbeiro` continua mockada de propósito: é ela que os
// testes de PERF abaixo provam NUNCA ser chamada por esta tela.
jest.mock('../../src/data/repositories/ClienteContatoRepository', () => ({
  listarClientesDoBarbeiro: jest.fn(),
  contarClientes: jest.fn(),
  contarClientesDesde: jest.fn(),
  listarAniversariantesNaJanela: jest.fn(),
}));

jest.mock('../../src/data/repositories/ListaEsperaRepository', () => ({
  contarFilaDoBarbeiro: jest.fn(),
}));

jest.mock('../../src/hooks/useUserProfile', () => jest.fn());

const mockedListarEscopo = listarDoEscopoFinanceiroPorPeriodo as jest.Mock;
const mockedContarPendentes = contarPendentesDoBarbeiro as jest.Mock;
const mockedListarDespesas = listarDespesasPorPeriodo as jest.Mock;
const mockedGetNegocioIdDoDono = getNegocioIdDoDono as jest.Mock;
const mockedListarClientes = listarClientesDoBarbeiro as jest.Mock;
const mockedContarClientes = contarClientes as jest.Mock;
const mockedContarClientesDesde = contarClientesDesde as jest.Mock;
const mockedListarAniversariantes = listarAniversariantesNaJanela as jest.Mock;
const mockedContarFila = contarFilaDoBarbeiro as jest.Mock;
const mockedUseUserProfile = useUserProfile as jest.Mock;

// PERF (Onda 4): a tela resolve o negócio por `getNegocioIdDoDono`, que
// devolve só o ID (vindo do doc do barbeiro, cacheado) e não lê
// `negocios/{id}` — esta tela nunca usou outro campo do negócio.
const NEGOCIO_ID = 'negocio-1';

const renderTela = () =>
  render(
    <ThemeProvider>
      <InicioScreen
        navigation={{ navigate: jest.fn() } as any}
        route={{ params: {} } as any}
      />
    </ThemeProvider>,
  );

/** Argumento `negocioId` de cada chamada ao escopo financeiro. */
const escoposUsados = () => mockedListarEscopo.mock.calls.map((c) => c[1]);

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetNegocioIdDoDono.mockResolvedValue(NEGOCIO_ID);
  mockedListarEscopo.mockResolvedValue([]);
  mockedListarDespesas.mockResolvedValue([]);
  mockedContarPendentes.mockResolvedValue(0);
  mockedListarClientes.mockResolvedValue([]);
  mockedContarClientes.mockResolvedValue(0);
  mockedContarClientesDesde.mockResolvedValue(0);
  mockedListarAniversariantes.mockResolvedValue([]);
  mockedContarFila.mockResolvedValue(0);
  mockedUseUserProfile.mockReturnValue({ profile: { nome: 'Zé Dono' }, loading: false, refresh: jest.fn() });
});

describe('InicioScreen — ARQ-01: escopo do painel', () => {
  it('resolve o negócio UMA vez e usa o mesmo escopo nas duas consultas (semana e mês)', async () => {
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    // Duas consultas de agendamento, um único getNegocioIdDoDono.
    expect(mockedGetNegocioIdDoDono).toHaveBeenCalledTimes(1);
    expect(escoposUsados()).toEqual(['negocio-1', 'negocio-1']);
  });

  it('falha ao resolver o negócio NÃO derruba o painel — degrada para o escopo próprio', async () => {
    mockedGetNegocioIdDoDono.mockRejectedValue(new Error('permission-denied'));

    const utils = renderTela();

    // O painel abre inteiro: a semana, os clientes e os avisos não dependem
    // do negócio e não podem sumir por causa dele.
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());
    expect(utils.getByText('Clientes')).toBeTruthy();

    // E as consultas acontecem, com escopo próprio em vez de escopo nenhum.
    expect(escoposUsados()).toEqual([null, null]);
    expect(mockedListarDespesas).toHaveBeenCalled();
    expect(mockedContarPendentes).toHaveBeenCalledWith('test-uid');
  });

  it('barbeiro solo: escopo null nas duas consultas', async () => {
    mockedGetNegocioIdDoDono.mockResolvedValue(null);
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    expect(escoposUsados()).toEqual([null, null]);
  });

  it('as DESPESAS continuam consultadas pelo uid do dono, mesmo com equipe', async () => {
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    // Ver a mesma nota em BarbeiroRelatoriosTab: a regra do Firestore só deixa
    // o próprio dono criar despesa, então despesa do negócio já é despesa do
    // dono — trocar por escopo de negócio não acharia nada a mais.
    expect(mockedListarDespesas).toHaveBeenCalledWith(
      'test-uid',
      expect.any(String),
      expect.any(String),
    );
  });
});

/**
 * PERF (P1) — o painel parou de baixar a agenda de clientes.
 *
 * Antes, esta tela chamava `listarClientesDoBarbeiro` (subcoleção inteira,
 * sem `limit` — ~280 documentos numa barbearia em operação) a cada foco, e
 * usava o resultado para produzir TRÊS números: quantos clientes existem,
 * quantos entraram no mês, e quem faz aniversário nos próximos 6 dias.
 * Nenhum dos três precisa dos documentos.
 *
 * Agora são duas contagens agregadas no servidor e uma consulta por faixa de
 * "MM-DD". O teste que segura a economia é o primeiro: se alguém reintroduzir
 * a listagem "só para pegar mais um campo", ele quebra.
 *
 * `listarClientesDoBarbeiro` em si NÃO mudou — os 4 consumidores que
 * realmente precisam da lista (Clientes, Aniversariantes, Promoção,
 * AgendamentoManual) continuam com o mesmo cache de 5 min.
 */
describe('InicioScreen — PERF: os tres agregados de cliente', () => {
  it('NAO baixa mais a subcolecao de clientes', async () => {
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    expect(mockedListarClientes).not.toHaveBeenCalled();
    expect(mockedContarClientes).toHaveBeenCalledWith('test-uid');
    expect(mockedListarAniversariantes).toHaveBeenCalledWith('test-uid', expect.any(Date));
  });

  it('exibe a contagem que veio do servidor, e nao o tamanho de uma lista', async () => {
    mockedContarClientes.mockResolvedValue(280);
    mockedContarClientesDesde.mockResolvedValue(12);

    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    expect(utils.getByText('280')).toBeTruthy();
    expect(utils.getByText('12')).toBeTruthy();
  });

  it('conta os novos a partir do dia 1 do mes corrente', async () => {
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    const [, inicioMes] = mockedContarClientesDesde.mock.calls[0];
    const agora = new Date();
    expect(inicioMes.getDate()).toBe(1);
    expect(inicioMes.getMonth()).toBe(agora.getMonth());
    expect(inicioMes.getFullYear()).toBe(agora.getFullYear());
  });

  it('o aviso de aniversariantes usa a lista ja recortada pela consulta', async () => {
    mockedListarAniversariantes.mockResolvedValue([
      { id: 'a', nome: 'Ana', origem: 'manual', aniversario: '07-23' },
      { id: 'b', nome: 'Bruno', origem: 'manual', aniversario: '07-24' },
    ]);

    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    expect(utils.getByText('2 aniversariantes essa semana')).toBeTruthy();
  });

  /**
   * O `forcar`/`ignorarCache` saiu junto com a listagem — mas o gesto não
   * pode ter virado enfeite. Nenhuma das consultas que restaram é cacheada,
   * então o refresh vai à rede por natureza; este teste fixa isso.
   */
  it('o pull-to-refresh refaz as tres consultas de cliente', async () => {
    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());
    expect(mockedContarClientes).toHaveBeenCalledTimes(1);

    fireEvent(utils.UNSAFE_getByType('RefreshControl' as any), 'refresh');

    await waitFor(() => expect(mockedContarClientes).toHaveBeenCalledTimes(2));
    expect(mockedContarClientesDesde).toHaveBeenCalledTimes(2);
    expect(mockedListarAniversariantes).toHaveBeenCalledTimes(2);
    expect(mockedListarClientes).not.toHaveBeenCalled();
  });

  it('falha numa das agregadas nao derruba o painel', async () => {
    mockedContarClientes.mockRejectedValue(new Error('permission-denied'));
    mockedListarAniversariantes.mockRejectedValue(new Error('index-building'));

    const utils = renderTela();

    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());
    expect(utils.getByText('Clientes')).toBeTruthy();
  });
});

/**
 * P0 — o dinheiro do dia parava de contar quando o cliente avaliava.
 *
 * A faixa da semana (e o hero "previsto hoje", que lê o dia de hoje dessa
 * mesma faixa) somava só `'confirmado' | 'concluido'`. Mas `'avaliado'` é
 * `'concluido'` + avaliação do cliente: quando o cliente tocava nas estrelas,
 * o atendimento saía da soma e o faturamento do dia ENCOLHIA sozinho, sem
 * nada ter acontecido no mundo real.
 *
 * `calcularResumoFinanceiro` (src/utils/relatorioUtils.ts) sempre tratou
 * 'concluido' e 'avaliado' como o mesmo caso — a tela é que divergia. Estes
 * testes fixam a equivalência: avaliar não pode mexer no número.
 */
describe('InicioScreen — P0: avaliar o atendimento não pode derrubar a soma do dia', () => {
  const HOJE = toLocalDateString(new Date());

  const agendamento = (status: string, precoEmCentavos: number, id = status) => ({
    id,
    data: HOJE,
    status,
    precoEmCentavos,
  });

  /**
   * A tela faz DUAS consultas ao escopo financeiro, nesta ordem: semana e
   * depois mês. Aqui só a da semana devolve dados — o card de Relatórios (que
   * usa a do mês) fica zerado de propósito, para os valores conferidos abaixo
   * virem exclusivamente do hero e da faixa da semana.
   */
  const semanaCom = (lista: unknown[]) => {
    mockedListarEscopo.mockReset();
    mockedListarEscopo.mockResolvedValueOnce(lista).mockResolvedValue([]);
  };

  /** Hero "previsto hoje" + linha de hoje na faixa da semana = 2 ocorrências. */
  const OCORRENCIAS_DO_DIA = 2;

  it('um agendamento AVALIADO de hoje entra na soma do dia', async () => {
    semanaCom([agendamento('avaliado', 5000)]);

    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    expect(utils.getAllByText(formatMoney(5000))).toHaveLength(OCORRENCIAS_DO_DIA);
  });

  it('o hero NÃO muda quando o status vai de concluido para avaliado', async () => {
    semanaCom([agendamento('concluido', 5000, 'ag-1')]);
    const antes = renderTela();
    await waitFor(() => expect(antes.getByText('Esta semana')).toBeTruthy());
    const comConcluido = antes.getAllByText(formatMoney(5000)).length;
    antes.unmount();

    // Mesmo agendamento, mesmo preço — o cliente só avaliou.
    semanaCom([agendamento('avaliado', 5000, 'ag-1')]);
    const depois = renderTela();
    await waitFor(() => expect(depois.getByText('Esta semana')).toBeTruthy());

    expect(depois.getAllByText(formatMoney(5000)).length).toBe(comConcluido);
    expect(comConcluido).toBe(OCORRENCIAS_DO_DIA);
  });

  it('confirmado + concluido + avaliado somam juntos; pendente e cancelado ficam de fora', async () => {
    semanaCom([
      agendamento('confirmado', 1000, 'a'),
      agendamento('concluido', 2000, 'b'),
      agendamento('avaliado', 4000, 'c'),
      agendamento('pendente', 8000, 'd'),
      agendamento('cancelado', 16000, 'e'),
    ]);

    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    // 1000 + 2000 + 4000 = 7000 — pendente e cancelado não entram na soma.
    expect(utils.getAllByText(formatMoney(7000))).toHaveLength(OCORRENCIAS_DO_DIA);
  });
});


/**
 * P2 — o aviso "N clientes na lista de espera" era `fila.length`: a tela
 * baixava as entradas inteiras (nome, telefone, data, observação de cada
 * pessoa) a cada foco para renderizar um inteiro.
 */
describe('InicioScreen — P2: a fila de espera vem por contagem', () => {
  it('conta a fila em vez de baixá-la, e mostra o número no aviso', async () => {
    mockedContarFila.mockResolvedValue(3);

    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    expect(mockedContarFila).toHaveBeenCalledWith('test-uid');
    expect(utils.getByText('3 clientes na lista de espera')).toBeTruthy();
  });

  it('fila vazia não gera aviso', async () => {
    mockedContarFila.mockResolvedValue(0);

    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    expect(utils.queryByText(/lista de espera/)).toBeNull();
  });

  it('singular quando é uma pessoa só', async () => {
    mockedContarFila.mockResolvedValue(1);

    const utils = renderTela();
    await waitFor(() => expect(utils.getByText('Esta semana')).toBeTruthy());

    expect(utils.getByText('1 cliente na lista de espera')).toBeTruthy();
  });
});
