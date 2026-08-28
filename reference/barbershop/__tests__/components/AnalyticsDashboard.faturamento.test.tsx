/**
 * AnalyticsDashboard — **ALTO-6a**: avaliar não pode encolher o faturamento.
 *
 * O card "Faturamento Mês" somava `status in ['confirmado','concluido']`.
 * Avaliar move o agendamento de 'concluido' para 'avaliado' — então, no
 * instante em que o cliente dá as estrelas, o valor daquele atendimento
 * SUMIA do relatório do dono. Dinheiro real desaparecendo de um número que
 * ninguém consegue reconciliar.
 *
 * O bug ficou invisível porque estava MASCARADO pelo CRÍTICO 1: nenhum
 * cliente conseguia avaliar (o botão só existia em 'confirmado', estado que a
 * regra do Firestore nega), então nada nunca chegava em 'avaliado'. Consertar
 * a avaliação é o que ATIVA este defeito — por isso os dois andam juntos.
 *
 * ─── Por que um backend de mentira, e não `mockResolvedValue` ─────────────
 *
 * A conta que interessa acontece DENTRO do Firestore (`getAggregateFromServer`
 * com `where('status','in',[...])`). Mockar a agregação com um número pronto
 * testaria só que a tela imprime o que recebeu — o filtro de status, que é
 * exatamente o que a correção mudou, nunca seria exercido.
 *
 * Aqui os stubs globais de `firebase/firestore` (jest.setup.js) ganham uma
 * implementação que AVALIA as restrições da consulta contra um universo fixo
 * de documentos. Trocar o status de um documento no universo e reexecutar é o
 * que reproduz "o cliente avaliou". Mesma filosofia do `backendPorEscopo` em
 * __tests__/screens/tabs/BarbeiroRelatoriosTab.test.tsx.
 */
import React from 'react';
import { render, waitFor, within } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import AnalyticsDashboard from '../../src/components/AnalyticsDashboard';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { formatMoney, toLocalDateString } from '../../src/utils/dateUtils';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer,
  getAggregateFromServer,
  count,
  sum,
  average,
} from 'firebase/firestore';

// ─── Backend de mentira: um Firestore que realmente filtra ──────────────────

type Documento = Record<string, any>;
type Restricao =
  | { tipo: 'where'; campo: string; op: string; valor: any }
  | { tipo: 'orderBy'; campo: string; direcao?: string }
  | { tipo: 'limit'; n: number };
interface Consulta {
  colecao: string;
  restricoes: Restricao[];
}

/** Universo de documentos visível às consultas. Cada teste o redefine. */
const universo: Record<string, Documento[]> = { agendamentos: [], avaliacoes: [] };

const passaNoFiltro = (doc: Documento, r: Extract<Restricao, { tipo: 'where' }>): boolean => {
  const valor = doc[r.campo];
  switch (r.op) {
    case '==':
      return valor === r.valor;
    case '>=':
      return valor != null && valor >= r.valor;
    case 'in':
      return (r.valor as any[]).includes(valor);
    default:
      // Falhar alto é proposital: um operador novo na tela que este backend
      // não entenda passaria despercebido como "consulta sem filtro".
      throw new Error(`operador não suportado pelo backend de mentira: ${r.op}`);
  }
};

const executar = (q: Consulta): Documento[] => {
  let docs = [...(universo[q.colecao] ?? [])];
  q.restricoes.forEach((r) => {
    if (r.tipo === 'where') docs = docs.filter((d) => passaNoFiltro(d, r));
  });
  const ordem = q.restricoes.find((r) => r.tipo === 'orderBy') as any;
  if (ordem) {
    docs.sort((a, b) =>
      ordem.direcao === 'desc'
        ? Number(b[ordem.campo]) - Number(a[ordem.campo])
        : Number(a[ordem.campo]) - Number(b[ordem.campo]),
    );
  }
  const corte = q.restricoes.find((r) => r.tipo === 'limit') as any;
  if (corte) docs = docs.slice(0, corte.n);
  return docs;
};

const instalarBackend = () => {
  (collection as jest.Mock).mockImplementation((_db: unknown, nome: string) => ({
    colecao: nome,
    restricoes: [] as Restricao[],
  }));
  (where as unknown as jest.Mock).mockImplementation(
    (campo: string, op: string, valor: unknown) => ({ tipo: 'where', campo, op, valor }),
  );
  (orderBy as unknown as jest.Mock).mockImplementation((campo: string, direcao?: string) => ({
    tipo: 'orderBy',
    campo,
    direcao,
  }));
  (limit as unknown as jest.Mock).mockImplementation((n: number) => ({ tipo: 'limit', n }));
  (query as unknown as jest.Mock).mockImplementation((base: Consulta, ...rest: Restricao[]) => ({
    colecao: base.colecao,
    restricoes: [...base.restricoes, ...rest],
  }));
  (count as unknown as jest.Mock).mockImplementation(() => ({ agg: 'count' }));
  (sum as unknown as jest.Mock).mockImplementation((campo: string) => ({ agg: 'sum', campo }));
  (average as unknown as jest.Mock).mockImplementation((campo: string) => ({
    agg: 'average',
    campo,
  }));

  (getCountFromServer as unknown as jest.Mock).mockImplementation(async (q: Consulta) => ({
    data: () => ({ count: executar(q).length }),
  }));

  (getAggregateFromServer as unknown as jest.Mock).mockImplementation(
    async (q: Consulta, especificacoes: Record<string, any>) => {
      const docs = executar(q);
      const resultado: Record<string, number | null> = {};
      Object.entries(especificacoes).forEach(([chave, spec]) => {
        if (spec.agg === 'count') {
          resultado[chave] = docs.length;
        } else if (spec.agg === 'sum') {
          resultado[chave] = docs.reduce(
            (t, d) => t + (typeof d[spec.campo] === 'number' ? d[spec.campo] : 0),
            0,
          );
        } else {
          const valores = docs.map((d) => d[spec.campo]).filter((v) => typeof v === 'number');
          resultado[chave] = valores.length
            ? valores.reduce((a, b) => a + b, 0) / valores.length
            : null;
        }
      });
      return { data: () => resultado };
    },
  );

  (getDocs as unknown as jest.Mock).mockImplementation(async (q: Consulta) => ({
    docs: executar(q).map((d) => ({ data: () => d })),
  }));
};

// ─── Fixtures ───────────────────────────────────────────────────────────────

const HOJE = new Date();
const HOJE_STR = toLocalDateString(HOJE);

const agendamento = (id: string, status: string, precoEmCentavos: number): Documento => ({
  id,
  barbeiroId: 'test-uid',
  status,
  precoEmCentavos,
  // `createdAt` de hoje garante que o documento cai dentro do mês corrente,
  // que é a janela que a tela consulta (`createdAt >= inicioMes`).
  createdAt: HOJE,
  data: HOJE_STR,
  horario: '10:00',
});

const renderDashboard = () =>
  render(
    <ThemeProvider>
      <AnalyticsDashboard barbeiroId="test-uid" />
    </ThemeProvider>,
  );

/**
 * Sobe do texto até o `<View>` do card que o contém.
 *
 * `.parent` do elemento devolvido por `getByText` é o componente COMPOSTO
 * `Text` (RNTL 13), não o container — daí a subida até o primeiro host
 * 'View', que é o `<View style={s.card}>` de `renderCard`. Sem isso,
 * `within(...)` escoparia no próprio texto e não acharia nada, e o teste
 * falharia por motivo errado.
 */
const cardDoPainel = (utils: ReturnType<typeof renderDashboard>, titulo: string) => {
  let no: any = utils.getByText(titulo);
  while (no && !(typeof no.type === 'string' && no.type === 'View')) no = no.parent;
  if (!no) throw new Error(`card "${titulo}" não encontrado no painel`);
  return no;
};

/** Lê o valor em reais impresso num card específico do painel. */
const valorDoCard = async (
  utils: ReturnType<typeof renderDashboard>,
  titulo: string,
): Promise<string> => {
  await waitFor(() => expect(utils.getByText(titulo)).toBeTruthy());
  const emReais = within(cardDoPainel(utils, titulo)).getAllByText(/^R\$/);
  // Exatamente um valor monetário por card — se a estrutura do card mudar,
  // este teste falha em vez de ler o número do card vizinho em silêncio.
  expect(emReais).toHaveLength(1);
  return String(emReais[0].props.children);
};

/** Monta o universo, renderiza e devolve o "Faturamento Mês" impresso. */
const faturamentoCom = async (agendamentos: Documento[]): Promise<string> => {
  universo.agendamentos = agendamentos;
  universo.avaliacoes = [];
  const utils = renderDashboard();
  const valor = await valorDoCard(utils, 'Faturamento Mês');
  utils.unmount();
  return valor;
};

beforeEach(() => {
  jest.clearAllMocks();
  instalarBackend();
  universo.agendamentos = [];
  universo.avaliacoes = [];
});

// ─── O backend precisa ser confiável antes de provar qualquer coisa ─────────

describe('AnalyticsDashboard — o backend de mentira filtra de verdade', () => {
  it('status fora da lista de faturamento NÃO entra na soma', async () => {
    // Se o `where('status','in',[...])` fosse ignorado pelo backend, o
    // cancelado de R$ 999,00 apareceria — e TODOS os testes abaixo passariam
    // por vacuidade, provando apenas que a tela soma tudo que existe.
    const soConfirmado = await faturamentoCom([agendamento('a1', 'confirmado', 5000)]);
    const comCanceladoCaro = await faturamentoCom([
      agendamento('a1', 'confirmado', 5000),
      agendamento('a2', 'cancelado', 99900),
      agendamento('a3', 'pendente', 99900),
    ]);

    expect(soConfirmado).toBe(formatMoney(5000));
    expect(comCanceladoCaro).toBe(soConfirmado);
  });
});

// ─── ALTO-6a ────────────────────────────────────────────────────────────────

describe('AnalyticsDashboard — ALTO-6a: "avaliado" conta no faturamento', () => {
  it('um agendamento AVALIADO entra na soma do mês', async () => {
    const semAvaliado = await faturamentoCom([agendamento('a1', 'confirmado', 5000)]);
    const comAvaliado = await faturamentoCom([
      agendamento('a1', 'confirmado', 5000),
      agendamento('a2', 'avaliado', 3000),
    ]);

    expect(semAvaliado).toBe(formatMoney(5000));
    expect(comAvaliado).toBe(formatMoney(8000));
  });

  /**
   * O TESTE QUE MAIS IMPORTA.
   *
   * Mesmo universo, mesmo dinheiro, mesma barbearia. A única coisa que muda
   * entre as duas leituras é o que o CLIENTE fez: avaliou o atendimento. O
   * faturamento do dono não pode sentir isso.
   *
   * Com o defeito de volta ('avaliado' fora do filtro), a segunda leitura cai
   * de R$ 130,00 para R$ 50,00 — os R$ 80,00 do atendimento avaliado somem.
   */
  it('o faturamento NÃO muda quando um agendamento vai de concluído para avaliado', async () => {
    const antesDeAvaliar = await faturamentoCom([
      agendamento('a1', 'confirmado', 5000),
      agendamento('a2', 'concluido', 8000),
    ]);

    // O cliente avalia: o MESMO agendamento, com o MESMO preço, só troca de
    // estado. Nada de dinheiro aconteceu.
    const depoisDeAvaliar = await faturamentoCom([
      agendamento('a1', 'confirmado', 5000),
      agendamento('a2', 'avaliado', 8000),
    ]);

    expect(depoisDeAvaliar).toBe(antesDeAvaliar);
    // E não é o empate trivial de dois zeros: o valor está lá, inteiro.
    expect(antesDeAvaliar).toBe(formatMoney(13000));
  });

  it('avaliar também não derruba os "Dias Ativos" do mês', async () => {
    // A mesma lista de status alimenta o contador de dias com atendimento —
    // se um dia perdesse seu único atendimento por causa da avaliação, o dono
    // veria o mês encolher em duas métricas de uma vez.
    universo.agendamentos = [agendamento('a1', 'concluido', 8000)];
    let utils = renderDashboard();
    await waitFor(() => expect(utils.getByText('Dias Ativos')).toBeTruthy());
    expect(within(cardDoPainel(utils, 'Dias Ativos')).getByText('1')).toBeTruthy();
    utils.unmount();

    universo.agendamentos = [agendamento('a1', 'avaliado', 8000)];
    utils = renderDashboard();
    await waitFor(() => expect(utils.getByText('Dias Ativos')).toBeTruthy());
    expect(within(cardDoPainel(utils, 'Dias Ativos')).getByText('1')).toBeTruthy();
    utils.unmount();
  });
});
