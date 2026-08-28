/**
 * ComissoesScreen — **PERF**: o relatório de fechamento não pode ser
 * reconsultado a cada tecla digitada.
 *
 * O defeito: `atualizarLinha` recria o array `linhas` a cada caractere do
 * campo de valor; `linhas` estava nas dependências de `carregarRelatorio`,
 * que por sua vez estava nas dependências do callback do `useFocusEffect`.
 * Digitar "40" disparava DUAS execuções completas de
 * `listarConcluidosPorNegocio` — a consulta de todos os agendamentos
 * concluídos do negócio no período — e piscava o spinner no meio da
 * digitação. O guard `linhas.length > 0` não protegia nada: o `.length`
 * continuava igual, mas a IDENTIDADE da função mudava.
 *
 * A correção separa o agregado cru (estado, dependente só de
 * `[negocioId, periodo]`) do join com os nomes (derivado, `useMemo` sobre
 * `linhas`). Os testes abaixo travam as duas metades:
 *   - o que NÃO pode mais acontecer: refetch ao digitar e ao trocar de chip;
 *   - o que NÃO pode ter morrido junto: o refetch legítimo ao trocar de
 *     período, e o nome do profissional vindo de `linhas`.
 *
 * ESCOPO DELIBERADAMENTE ESTREITO: só o ciclo de consulta do relatório e o
 * join. Salvar comissão, validação de valor e estados de erro continuam sem
 * cobertura própria.
 *
 * Padrão de mock: `jest.mock` por arquivo — o `jest.setup.js` deste repo NÃO
 * mocka `react-native` globalmente, de propósito (CLAUDE.md §6) — e nunca
 * `restoreAllMocks()`, que derrubaria o spy de `Alert.alert` do setup global.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import ComissoesScreen from '../../src/screens/ComissoesScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import {
  getNegocioIdDoDono,
  listarMembros,
  listarProfissionaisDoNegocio,
} from '../../src/data/repositories/NegocioRepository';
import { listarConcluidosPorNegocio } from '../../src/data/repositories/AgendamentoRepository';
import { formatMoney } from '../../src/utils/dateUtils';
import type { Agendamento, Barbeiro, MembroEquipe } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// `useFocusEffect` real depende de `navigation.addListener`, que o mock global
// de @react-navigation/native não fornece. Vira um `useEffect` com o callback
// nas dependências — que é EXATAMENTE a semântica que importa aqui: o efeito
// re-executa quando a identidade do callback muda, que é o mecanismo do bug.
jest.mock('@react-navigation/native', () => {
  const ReactLocal = require('react');
  return {
    useFocusEffect: (callback: () => void) => ReactLocal.useEffect(callback, [callback]),
  };
});

// O módulo de agendamentos expõe aqui SOMENTE `listarConcluidosPorNegocio`:
// é a consulta cara que este arquivo inteiro existe para contar.
jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  listarConcluidosPorNegocio: jest.fn(),
}));

jest.mock('../../src/data/repositories/NegocioRepository', () => ({
  getNegocioIdDoDono: jest.fn(),
  listarMembros: jest.fn(),
  listarProfissionaisDoNegocio: jest.fn(),
  definirComissao: jest.fn(),
}));

const mockedGetNegocioIdDoDono = getNegocioIdDoDono as jest.Mock;
const mockedListarMembros = listarMembros as jest.Mock;
const mockedListarProfissionais = listarProfissionaisDoNegocio as jest.Mock;
const mockedListarConcluidos = listarConcluidosPorNegocio as jest.Mock;

// ─── Fixtures ───────────────────────────────────────────────────────────────

// PERF (Onda 4): a tela resolve o negócio por `getNegocioIdDoDono` — só o
// ID, sem ler `negocios/{id}`. Ela nunca usou outro campo do negócio.
const NEGOCIO_ID = 'negocio-1';

const MEMBROS: MembroEquipe[] = [
  { id: 'dono-1', barbeiroId: 'dono-1', papel: 'dono', ativo: true },
  {
    id: 'b1',
    barbeiroId: 'b1',
    papel: 'profissional',
    ativo: true,
    comissaoTipo: 'percentual',
    comissaoPercentual: 40,
  },
  {
    id: 'b2',
    barbeiroId: 'b2',
    papel: 'profissional',
    ativo: true,
    comissaoTipo: 'percentual',
    comissaoPercentual: 50,
  },
];

const PROFISSIONAIS: Barbeiro[] = [
  { id: 'dono-1', nome: 'Zé Dono' },
  { id: 'b1', nome: 'Carlos' },
  { id: 'b2', nome: 'Bruno' },
];

/**
 * `barbeiroNome` aqui é PROPOSITALMENTE o nome errado: é o valor
 * denormalizado no agendamento, congelado no momento do atendimento. O
 * relatório tem que mostrar o nome atual, vindo de `linhas`.
 */
const concluido = (
  id: string,
  barbeiroId: string,
  precoEmCentavos: number,
  comissaoCentavos: number,
): Agendamento => ({
  id,
  barbeiroId,
  barbeiroNome: `nome-congelado-${barbeiroId}`,
  cliente: 'cliente@example.com',
  clienteUid: `uid-${id}`,
  clienteNome: 'Cliente Teste',
  precoEmCentavos,
  comissaoCentavos,
  status: 'concluido',
  data: '2026-08-10',
  horario: '10:00',
});

const CONCLUIDOS: Agendamento[] = [
  concluido('a1', 'b1', 5000, 2000),
  concluido('a2', 'b1', 3000, 1200),
  concluido('a3', 'b2', 4000, 2000),
  // O dono não vira linha de comissão — não pode aparecer no relatório nem
  // entrar no total.
  concluido('a4', 'dono-1', 9000, 9999),
];

const renderTela = () =>
  render(
    <ThemeProvider>
      <ComissoesScreen
        navigation={{ navigate: jest.fn() } as any}
        route={{ params: {} } as any}
      />
    </ThemeProvider>,
  );

/** Espera a tela terminar de carregar equipe + primeiro relatório. */
const aguardarRelatorio = async (utils: ReturnType<typeof renderTela>) => {
  await waitFor(() => expect(utils.getByText('Relatório de fechamento')).toBeTruthy());
  await waitFor(() => expect(mockedListarConcluidos).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(utils.getByText('Total de comissões no período')).toBeTruthy());
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetNegocioIdDoDono.mockResolvedValue(NEGOCIO_ID);
  mockedListarMembros.mockResolvedValue(MEMBROS);
  mockedListarProfissionais.mockResolvedValue(PROFISSIONAIS);
  mockedListarConcluidos.mockResolvedValue(CONCLUIDOS);
});

describe('ComissoesScreen — o relatório não pode ser reconsultado à toa', () => {
  it('carrega o relatório UMA vez ao abrir, com 2 profissionais na equipe', async () => {
    const utils = renderTela();
    await aguardarRelatorio(utils);

    expect(mockedListarConcluidos).toHaveBeenCalledTimes(1);
    expect(mockedListarConcluidos).toHaveBeenCalledWith(
      'negocio-1',
      expect.any(String),
      expect.any(String),
    );
  });

  it('DIGITAR no campo de valor não dispara consulta nenhuma', async () => {
    // Este é o teste que prova a correção: com `linhas` nas dependências de
    // `carregarRelatorio`, cada `changeText` re-executava o efeito de foco e
    // baixava de novo TODOS os concluídos do negócio no período.
    const utils = renderTela();
    await aguardarRelatorio(utils);

    const campos = utils.getAllByPlaceholderText('Ex.: 40');
    ['4', '45', '45,', '45,5', '45,50'].forEach((valor) =>
      fireEvent.changeText(campos[0], valor),
    );

    expect(mockedListarConcluidos).toHaveBeenCalledTimes(1);
    // E o valor digitado chegou de fato ao campo — senão o teste acima
    // passaria por não ter acontecido nada.
    expect(utils.getByDisplayValue('45,50')).toBeTruthy();
  });

  it('trocar o tipo de comissão para "Valor fixo" também não consulta', async () => {
    const utils = renderTela();
    await aguardarRelatorio(utils);

    fireEvent.press(utils.getByLabelText('Comissão de Carlos em valor fixo'));

    expect(mockedListarConcluidos).toHaveBeenCalledTimes(1);
    // O chip realmente mudou de estado (o placeholder acompanha o tipo).
    expect(utils.getAllByPlaceholderText('Ex.: 15,00')).toHaveLength(1);
  });

  it('trocar o PERÍODO continua consultando — o refetch legítimo não morreu junto', async () => {
    const utils = renderTela();
    await aguardarRelatorio(utils);

    fireEvent.press(utils.getByLabelText('Período 7 dias'));

    await waitFor(() => expect(mockedListarConcluidos).toHaveBeenCalledTimes(2));
  });

  it('o relatório usa o nome ATUAL do profissional, não o congelado no agendamento', async () => {
    const utils = renderTela();
    await aguardarRelatorio(utils);

    // Duas linhas de relatório (Carlos e Bruno), com o agregado por profissional.
    expect(
      utils.getByText(`2 atendimentos · faturamento ${formatMoney(8000)}`),
    ).toBeTruthy();
    expect(
      utils.getByText(`1 atendimento · faturamento ${formatMoney(4000)}`),
    ).toBeTruthy();

    // O nome vem de `linhas` (a equipe atual), nunca do `barbeiroNome`
    // denormalizado no agendamento.
    expect(utils.queryByText('nome-congelado-b1')).toBeNull();
    expect(utils.getAllByText('Carlos')).toHaveLength(2); // card de config + relatório

    // O dono ficou de fora: total = 2000 + 1200 + 2000, sem os 9999 dele.
    expect(utils.getByText(formatMoney(5200))).toBeTruthy();
    expect(utils.queryByText('Zé Dono')).toBeNull();
  });

  it('o relatório sobrevive à digitação — continua completo, sem novo fetch', async () => {
    // `relatorio` é derivado de `linhas`; se o join derivado quebrasse, a
    // primeira tecla esvaziaria a lista sem nenhuma consulta para repovoá-la.
    const utils = renderTela();
    await aguardarRelatorio(utils);

    fireEvent.changeText(utils.getAllByPlaceholderText('Ex.: 40')[0], '99');

    expect(
      utils.getByText(`2 atendimentos · faturamento ${formatMoney(8000)}`),
    ).toBeTruthy();
    expect(utils.getByText(formatMoney(5200))).toBeTruthy();
    expect(mockedListarConcluidos).toHaveBeenCalledTimes(1);
  });
});
