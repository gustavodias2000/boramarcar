/**
 * BarbeiroRelatoriosTab — **ARQ-01**: o relatório do dono é do NEGÓCIO.
 *
 * Antes, os três cards do mês somavam `listarPorBarbeiroEPeriodo(uid)` — só o
 * atendimento do próprio dono. Num negócio com equipe isso sub-reporta o
 * faturamento em tudo que os outros profissionais fizeram, e ninguém percebe:
 * profissionais de equipe não têm login próprio, então quem olha o relatório
 * é sempre o dono, e o número simplesmente vem menor do que a realidade.
 *
 * O que este arquivo trava:
 *  1. com equipe, o card Vendas soma a receita dos DOIS profissionais;
 *  2. sem equipe (solo), o número é exatamente o de antes — sem regressão;
 *  3. nos dois casos, as DESPESAS continuam no escopo do `uid`.
 *
 * ESCOPO DELIBERADAMENTE ESTREITO: cobre o escopo dos dados, não a tela
 * inteira (navegação dos cards, aviso de erro, percentuais de compromissos e
 * o AnalyticsDashboard seguem sem cobertura própria).
 *
 * Padrão de mock: `jest.mock` por arquivo (o `jest.setup.js` deste repo NÃO
 * mocka `react-native` globalmente, de propósito — CLAUDE.md §6).
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import BarbeiroRelatoriosTab from '../../../src/screens/tabs/BarbeiroRelatoriosTab';
import { ThemeProvider } from '../../../src/context/ThemeContext';
import { listarDoEscopoFinanceiroPorPeriodo } from '../../../src/data/repositories/AgendamentoRepository';
import { listarPorBarbeiroEPeriodo as listarDespesasPorPeriodo } from '../../../src/data/repositories/DespesaRepository';
import { getNegocioIdDoDono } from '../../../src/data/repositories/NegocioRepository';
import { formatMoney } from '../../../src/utils/dateUtils';
import { MESES_NOME } from '../../../src/utils/relatorioUtils';
import CacheService from '../../../src/services/CacheService';
import { getDoc, doc } from 'firebase/firestore';
import type { Agendamento, Despesa } from '../../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@react-navigation/native', () => {
  const ReactLocal = require('react');
  return {
    useFocusEffect: (callback: () => void) => ReactLocal.useEffect(callback, [callback]),
  };
});

// O AnalyticsDashboard tem carregamento próprio (agregações no servidor) e
// escopo próprio — deliberadamente continua em `uid`, é outra frente. Aqui ele
// só não pode disputar o render com os cards que estão sendo medidos.
jest.mock('../../../src/components/AnalyticsDashboard', () => {
  const RN = require('react-native');
  return { __esModule: true, default: () => <RN.View testID="analytics-dashboard" /> };
});

// ATENÇÃO — parte da asserção de ARQ-01, não encanamento: o módulo expõe
// aqui SOMENTE `listarDoEscopoFinanceiroPorPeriodo`. Se a tela voltasse a
// chamar `listarPorBarbeiroEPeriodo` direto (o bug que ARQ-01 corrige), o
// render quebraria com "is not a function".
jest.mock('../../../src/data/repositories/AgendamentoRepository', () => ({
  listarDoEscopoFinanceiroPorPeriodo: jest.fn(),
}));

jest.mock('../../../src/data/repositories/DespesaRepository', () => ({
  listarPorBarbeiroEPeriodo: jest.fn(),
}));

jest.mock('../../../src/data/repositories/NegocioRepository', () => ({
  getNegocioIdDoDono: jest.fn(),
}));

const mockedListarEscopo = listarDoEscopoFinanceiroPorPeriodo as jest.Mock;
const mockedListarDespesas = listarDespesasPorPeriodo as jest.Mock;
const mockedGetNegocioIdDoDono = getNegocioIdDoDono as jest.Mock;
const mockedGetDoc = getDoc as jest.Mock;
const mockedDoc = doc as jest.Mock;

// A implementação REAL, para o teste de custo de leitura mais abaixo poder
// medir o caminho de verdade em vez do contrato do mock.
const repositorioReal = jest.requireActual('../../../src/data/repositories/NegocioRepository');

// ─── Fixtures ───────────────────────────────────────────────────────────────

const DO_DONO = {
  id: 'ag-do-dono',
  barbeiroId: 'test-uid',
  negocioId: 'negocio-1',
  status: 'concluido',
  data: '2026-08-10',
  precoEmCentavos: 5000,
} as Agendamento;

const DO_PROFISSIONAL = {
  id: 'ag-do-profissional',
  barbeiroId: 'prof-2',
  negocioId: 'negocio-1',
  status: 'concluido',
  data: '2026-08-11',
  precoEmCentavos: 8000,
} as Agendamento;

const DESPESA = { id: 'd1', barbeiroId: 'test-uid', valorEmCentavos: 1000 } as Despesa;

/**
 * Backend de mentira com um universo FIXO: devolve o que a função real
 * devolveria para cada escopo. Assim os dois testes abaixo comparam o mesmo
 * mundo visto de duas formas — em vez de comparar dois arrays escolhidos a
 * dedo, que provariam só que a tela soma o que recebe.
 */
const backendPorEscopo = () => {
  mockedListarEscopo.mockImplementation((_uid: string, negocioId: string | null) =>
    Promise.resolve(negocioId ? [DO_DONO, DO_PROFISSIONAL] : [DO_DONO]),
  );
};

const renderTela = () =>
  render(
    <ThemeProvider>
      <BarbeiroRelatoriosTab
        navigation={{ navigate: jest.fn() } as any}
        route={{ params: {} } as any}
      />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  backendPorEscopo();
  mockedListarDespesas.mockResolvedValue([DESPESA]);
  mockedGetNegocioIdDoDono.mockResolvedValue('negocio-1');
});

describe('BarbeiroRelatoriosTab — ARQ-01: escopo financeiro do relatório', () => {
  it('dono de equipe: o card Vendas soma a receita dos DOIS profissionais', async () => {
    const utils = renderTela();

    // R$ 50,00 (dono) + R$ 80,00 (profissional) = R$ 130,00 de receita real.
    await waitFor(() => expect(utils.getByText(formatMoney(13000))).toBeTruthy());
    // Total do card = Real + Projetado − Despesas = 13000 − 1000.
    expect(utils.getByText(formatMoney(12000))).toBeTruthy();

    expect(mockedListarEscopo).toHaveBeenCalledWith(
      'test-uid',
      'negocio-1',
      expect.stringMatching(/^\d{4}-\d{2}-01$/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('barbeiro solo: mesmo mundo, número idêntico ao de antes de ARQ-01', async () => {
    mockedGetNegocioIdDoDono.mockResolvedValue(null);
    const utils = renderTela();

    // Só o atendimento do próprio dono: R$ 50,00 — exatamente o que a tela
    // mostrava quando chamava `listarPorBarbeiroEPeriodo(uid, ...)`. O caminho
    // solo delega para essa mesma função (ver a suíte do repositório), então
    // o número é o de antes por construção.
    await waitFor(() => expect(utils.getAllByText(formatMoney(5000)).length).toBeGreaterThan(0));
    expect(utils.getByText(formatMoney(4000))).toBeTruthy();

    // Sem negócio, o escopo vai explicitamente como `null`.
    expect(mockedListarEscopo).toHaveBeenCalledWith(
      'test-uid',
      null,
      expect.any(String),
      expect.any(String),
    );
  });

  it('falha ao resolver o negócio degrada para o escopo próprio, sem derrubar a tela', async () => {
    mockedGetNegocioIdDoDono.mockRejectedValue(new Error('permission-denied'));
    const utils = renderTela();

    // Sub-reportar por um carregamento é ruim; deixar o dono sem relatório
    // nenhum é pior.
    await waitFor(() => expect(utils.getAllByText(formatMoney(5000)).length).toBeGreaterThan(0));
    expect(mockedListarEscopo).toHaveBeenCalledWith('test-uid', null, expect.any(String), expect.any(String));
  });

  it.each([
    ['com equipe', 'negocio-1'],
    ['solo', null],
  ])('%s: as DESPESAS continuam consultadas pelo uid do dono', async (_caso, negocioId) => {
    mockedGetNegocioIdDoDono.mockResolvedValue(negocioId);
    renderTela();

    // Não é esquecimento: a regra do Firestore exige
    // `barbeiroId == request.auth.uid` para criar despesa, e DespesasScreen é
    // o único escritor — profissionais de equipe não têm conta no Auth. Toda
    // despesa do negócio já é despesa do dono.
    await waitFor(() => expect(mockedListarDespesas).toHaveBeenCalled());
    expect(mockedListarDespesas).toHaveBeenCalledWith(
      'test-uid',
      expect.any(String),
      expect.any(String),
    );
  });

  /**
   * PERF (Onda 4) — o custo de abrir a aba.
   *
   * Este teste roda a implementação REAL de `getNegocioIdDoDono` por dentro da
   * tela (os outros casos usam o mock, porque o que medem é o escopo, não o
   * custo). Sem isso a asserção seria vazia: um mock nunca lê o Firestore, e
   * "não houve getDoc" seria verdade mesmo com a regressão presente.
   *
   * O que trava: a resolução do escopo custa UMA leitura, no doc do barbeiro.
   * A leitura de `negocios/{id}` que existia aqui era descartada inteira (a
   * aba só usa o id) e cobrada em dobro — a regra de `negocios` avalia
   * `isDonoDoNegocio`, que faz `exists()` + `get()` na subcoleção `membros`,
   * e access calls de regra contam como leitura. Pior: era um `await` em
   * série, antes do `Promise.all`, no caminho do primeiro paint.
   */
  it('um foco da aba não faz NENHUM getDoc em `negocios` — resolver o escopo custa 1 leitura', async () => {
    CacheService.clear();
    mockedDoc.mockImplementation((...args: unknown[]) => ({
      path: args.filter((a) => typeof a === 'string').join('/'),
    }));
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'test-uid',
      data: () => ({ nome: 'Zé Dono', negocioId: 'negocio-1' }),
    });
    mockedGetNegocioIdDoDono.mockImplementation(repositorioReal.getNegocioIdDoDono);

    const utils = renderTela();

    // O escopo continua sendo o do negócio: o ganho não pode vir às custas de
    // sub-reportar o faturamento (que é o defeito que ARQ-01 corrigiu).
    await waitFor(() => expect(utils.getByText(formatMoney(13000))).toBeTruthy());
    expect(mockedListarEscopo).toHaveBeenCalledWith(
      'test-uid',
      'negocio-1',
      expect.any(String),
      expect.any(String),
    );

    const colecoesLidas = mockedDoc.mock.calls.map((c: unknown[]) => c[1]);
    expect(colecoesLidas).not.toContain('negocios');
    expect(colecoesLidas).toEqual(['barbeiros']);
    expect(mockedGetDoc).toHaveBeenCalledTimes(1);
  });

  it('o divisor diz que as métricas de baixo são só do atendimento do dono', async () => {
    const utils = renderTela();

    // O AnalyticsDashboard continua em `uid` (outra frente). Sem esse rótulo,
    // a mesma tela afirmaria duas coisas diferentes sobre o mesmo mês.
    await waitFor(() => expect(utils.getByText('Mais métricas do seu atendimento')).toBeTruthy());
  });

  it('no mês, explicita o período e separa resultado realizado, recebido, a receber e despesas', async () => {
    const PENDENTE = {
      id: 'ag-projetado',
      barbeiroId: 'test-uid',
      negocioId: 'negocio-1',
      status: 'pendente',
      data: '2026-08-12',
      precoEmCentavos: 3000,
    } as Agendamento;
    mockedListarEscopo.mockResolvedValue([DO_DONO, DO_PROFISSIONAL, PENDENTE]);
    const utils = renderTela();

    // Um relatório útil precisa dizer a que janela os números pertencem e
    // não chamar de resultado uma receita que ainda é só prevista. Com esta
    // fixture: recebido = 130, a receber = 30, despesas = 10, resultado =
    // 120 (não 150).
    const mesAtual = MESES_NOME[new Date().getMonth()];
    await waitFor(() => expect(utils.getAllByText(mesAtual).length).toBeGreaterThan(0));
    expect(utils.getByText('Resultado realizado')).toBeTruthy();
    expect(utils.getByText('Recebido')).toBeTruthy();
    expect(utils.getByText('A receber')).toBeTruthy();
    expect(utils.getAllByText('Despesas').length).toBeGreaterThan(0);
    expect(utils.getByText('Ticket médio')).toBeTruthy();
    expect(utils.getByText('Operação do período')).toBeTruthy();
    expect(utils.getByText(formatMoney(12000))).toBeTruthy();
    expect(utils.getByText(formatMoney(13000))).toBeTruthy();
    expect(utils.getByText(formatMoney(3000))).toBeTruthy();
    expect(utils.getAllByText(formatMoney(1000)).length).toBeGreaterThan(0);
  });

  it('ao selecionar a semana, recarrega os dados atuais e o período anterior para comparação', async () => {
    const utils = renderTela();
    await waitFor(() => expect(utils.getByLabelText('Ver relatório da semana')).toBeTruthy());

    mockedListarEscopo.mockClear();
    mockedListarDespesas.mockClear();
    fireEvent.press(utils.getByLabelText('Ver relatório da semana'));

    await waitFor(() => expect(mockedListarEscopo).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedListarDespesas).toHaveBeenCalledTimes(2));
    expect(utils.getAllByText('Esta semana').length).toBeGreaterThan(0);
  });
});
