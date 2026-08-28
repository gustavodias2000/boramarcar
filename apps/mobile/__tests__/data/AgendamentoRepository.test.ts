/**
 * AgendamentoRepository — a coleção onde mora o dinheiro da barbearia.
 *
 * Dois pontos da auditoria estão travados aqui:
 *
 *  1. Bloco 1 (privacidade/identidade): o cliente é identificado por
 *     `clienteUid`, nunca por email. Email muda, é digitado errado e não é
 *     autenticável pelas regras do Firestore — filtrar por ele significava
 *     que trocar de email apagava o histórico do cliente, e que qualquer um
 *     que soubesse o email de outra pessoa listava os agendamentos dela.
 *
 *  2. Índices compostos: cada `where` + `orderBy` aqui depende de um índice
 *     declarado em `firestore.indexes.json`. Se alguém mudar a ordem ou
 *     acrescentar um filtro, o app não quebra em teste — quebra em produção,
 *     com "The query requires an index", na tela do cliente. Por isso as
 *     asserções conferem as restrições uma a uma: elas são a documentação
 *     executável dos índices.
 */
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { httpsCallable } from '../../src/services/CloudFunctionsClient';
import { registrarAviso, registrarErro } from '../../src/services/ObservabilityService';
import {
  listarDoCliente,
  listarDoBarbeiro,
  listarPorNegocio,
  listarConcluidosPorNegocio,
  listarPorBarbeiroEPeriodo,
  listarPorNegocioEPeriodo,
  listarDoEscopoFinanceiroPorPeriodo,
  listarPendentesDoEscopo,
  listarConfirmadosHojeDoEscopo,
  contarFuturosDoProfissional,
  contarNaFaixaBloqueada,
  listarPorClienteEBarbeiro,
  contarPendentesDoBarbeiro,
  contarDoCliente,
  criarAgendamento,
  removerAgendamento,
  atualizarStatus,
} from '../../src/data/repositories/AgendamentoRepository';

jest.mock('../../src/services/CloudFunctionsClient', () => ({
  httpsCallable: jest.fn(),
}));

// A sentinela da fonte dupla (P3) reporta por aqui. Mockado para o teste
// observar o que o repositório DECIDE mandar — a sanitização em si já tem
// cobertura própria em __tests__/utils/sanitizacao.test.ts.
jest.mock('../../src/services/ObservabilityService', () => ({
  registrarAviso: jest.fn(() => Promise.resolve()),
  registrarErro: jest.fn(() => Promise.resolve()),
}));

const mockedCollection = collection as jest.Mock;
const mockedQuery = query as jest.Mock;
const mockedWhere = where as jest.Mock;
const mockedOrderBy = orderBy as jest.Mock;
const mockedLimit = limit as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedGetCount = getCountFromServer as jest.Mock;
const mockedUpdateDoc = updateDoc as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedDoc = doc as jest.Mock;
const mockedHttpsCallable = httpsCallable as jest.Mock;
const mockedRegistrarAviso = registrarAviso as jest.Mock;
const mockedRegistrarErro = registrarErro as jest.Mock;

/** Monta um snapshot do Firestore com os documentos informados. */
const snapshotCom = (docs: Array<{ id: string; dados: Record<string, unknown> }>) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.dados })),
});

/** Restrições da n-ésima chamada ao `query()`, na ordem em que foram montadas. */
const restricoesDe = (n: number) => mockedQuery.mock.calls[n].slice(1);

/** Restrições passadas ao `query()`, na ordem em que foram montadas. */
const restricoes = () => restricoesDe(0);

beforeEach(() => {
  jest.clearAllMocks();
  mockedCollection.mockImplementation((_db: unknown, ...partes: string[]) => ({
    path: partes.join('/'),
  }));
  mockedDoc.mockImplementation((_db: unknown, ...partes: string[]) => ({
    path: partes.join('/'),
  }));
  mockedWhere.mockImplementation((campo, op, valor) => ({ tipo: 'where', campo, op, valor }));
  mockedOrderBy.mockImplementation((campo, dir) => ({ tipo: 'orderBy', campo, dir }));
  mockedLimit.mockImplementation((n) => ({ tipo: 'limit', n }));
  mockedQuery.mockImplementation((ref, ...cs) => ({ ref, cs }));
  mockedGetDocs.mockResolvedValue(snapshotCom([]));
});

describe('listarDoCliente — identidade por uid, nunca por email', () => {
  it('filtra por clienteUid (item 9.3 da auditoria)', async () => {
    await listarDoCliente('uid-cliente');

    expect(mockedWhere).toHaveBeenCalledWith('clienteUid', '==', 'uid-cliente');
    // O email fica no documento só para exibição — não pode virar filtro.
    expect(mockedWhere).not.toHaveBeenCalledWith('email', expect.anything(), expect.anything());
    expect(mockedWhere).not.toHaveBeenCalledWith(
      'clienteEmail',
      expect.anything(),
      expect.anything(),
    );
  });

  it('sem uid devolve lista vazia sem consultar o Firestore', async () => {
    // Chamado durante a montagem da tela, antes do auth resolver. Consultar
    // aqui só rende `permission-denied` no log.
    await expect(listarDoCliente(null)).resolves.toEqual([]);
    await expect(listarDoCliente(undefined)).resolves.toEqual([]);
    await expect(listarDoCliente('')).resolves.toEqual([]);

    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('ordena do mais recente para o mais antigo e limita a 50 por padrão', async () => {
    await listarDoCliente('uid-cliente');

    expect(mockedOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(mockedLimit).toHaveBeenCalledWith(50);
  });

  it('respeita o limite informado pela tela', async () => {
    await listarDoCliente('uid-cliente', { max: 10 });
    expect(mockedLimit).toHaveBeenCalledWith(10);
  });

  it('filtra por status quando a tela pede uma aba específica', async () => {
    await listarDoCliente('uid-cliente', { status: 'confirmado' });
    expect(mockedWhere).toHaveBeenCalledWith('status', '==', 'confirmado');
  });

  it('"todos" NÃO vira um where status == "todos"', async () => {
    // O valor sentinela da aba "Todos" resultaria em lista sempre vazia se
    // escapasse para dentro da consulta.
    await listarDoCliente('uid-cliente', { status: 'todos' });

    expect(mockedWhere).not.toHaveBeenCalledWith('status', '==', 'todos');
    expect(mockedWhere).toHaveBeenCalledTimes(1);
  });

  it('a ordem das restrições acompanha o índice composto declarado', async () => {
    await listarDoCliente('uid-cliente', { status: 'confirmado' });

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'clienteUid', op: '==', valor: 'uid-cliente' },
      { tipo: 'where', campo: 'status', op: '==', valor: 'confirmado' },
      { tipo: 'orderBy', campo: 'createdAt', dir: 'desc' },
      { tipo: 'limit', n: 50 },
    ]);
  });

  it('devolve os documentos com o id anexado', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshotCom([{ id: 'ag1', dados: { data: '2026-08-15', horario: '14:30' } }]),
    );

    await expect(listarDoCliente('uid-cliente')).resolves.toEqual([
      { id: 'ag1', data: '2026-08-15', horario: '14:30' },
    ]);
  });

  it('o id do documento vence um campo `id` gravado por engano dentro dele', async () => {
    mockedGetDocs.mockResolvedValue(snapshotCom([{ id: 'ag-real', dados: { id: 'ag-antigo' } }]));

    const [agendamento] = await listarDoCliente('uid-cliente');
    expect(agendamento.id).toBe('ag-real');
  });

  it('lê da coleção `agendamentos`', async () => {
    await listarDoCliente('uid-cliente');
    expect(mockedCollection).toHaveBeenCalledWith(expect.anything(), 'agendamentos');
  });
});

describe('listarDoBarbeiro', () => {
  it('filtra pelo profissional e ordena por data de criação', async () => {
    await listarDoBarbeiro('barbeiro1');

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'barbeiroId', op: '==', valor: 'barbeiro1' },
      { tipo: 'orderBy', campo: 'createdAt', dir: 'desc' },
      { tipo: 'limit', n: 50 },
    ]);
  });

  it('sem barbeiro não consulta nada', async () => {
    await expect(listarDoBarbeiro(null)).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('respeita o limite informado', async () => {
    await listarDoBarbeiro('barbeiro1', 200);
    expect(mockedLimit).toHaveBeenCalledWith(200);
  });
});

describe('listarPorNegocio — o dono vê a agenda da equipe inteira', () => {
  it('filtra por negocioId, não por barbeiroId', async () => {
    // Profissionais da equipe não têm login próprio: o dono gerencia todos
    // a partir da conta dele. Filtrar por barbeiroId aqui esconderia a
    // agenda do resto da equipe.
    await listarPorNegocio('negocio1');

    expect(mockedWhere).toHaveBeenCalledWith('negocioId', '==', 'negocio1');
    expect(mockedWhere).not.toHaveBeenCalledWith('barbeiroId', expect.anything(), expect.anything());
  });

  it('sem negócio devolve vazio', async () => {
    await expect(listarPorNegocio(undefined)).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });
});

describe('listarConcluidosPorNegocio — base do fechamento de comissões', () => {
  it('traz só o que foi concluído dentro do período', async () => {
    // Um agendamento cancelado entrando na soma vira comissão paga por
    // serviço que não aconteceu.
    await listarConcluidosPorNegocio('negocio1', '2026-07-01', '2026-07-31');

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'negocioId', op: '==', valor: 'negocio1' },
      { tipo: 'where', campo: 'status', op: '==', valor: 'concluido' },
      { tipo: 'where', campo: 'data', op: '>=', valor: '2026-07-01' },
      { tipo: 'where', campo: 'data', op: '<=', valor: '2026-07-31' },
    ]);
  });

  it('o intervalo é inclusive nas duas pontas (>= e <=)', async () => {
    // O último dia do mês tem que entrar no fechamento.
    await listarConcluidosPorNegocio('negocio1', '2026-07-01', '2026-07-31');

    const ops = mockedWhere.mock.calls.filter((c) => c[0] === 'data').map((c) => c[1]);
    expect(ops).toEqual(['>=', '<=']);
  });

  it('não aplica limit — um mês cheio não pode ser truncado no relatório', async () => {
    await listarConcluidosPorNegocio('negocio1', '2026-07-01', '2026-07-31');
    expect(mockedLimit).not.toHaveBeenCalled();
  });
});

describe('listarPorBarbeiroEPeriodo — resumo "Esta semana" da tela Início', () => {
  it('usa o índice composto barbeiroId + data', async () => {
    await listarPorBarbeiroEPeriodo('barbeiro1', '2026-07-20', '2026-07-26');

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'barbeiroId', op: '==', valor: 'barbeiro1' },
      { tipo: 'where', campo: 'data', op: '>=', valor: '2026-07-20' },
      { tipo: 'where', campo: 'data', op: '<=', valor: '2026-07-26' },
    ]);
  });

  it('devolve os documentos com o id anexado', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshotCom([{ id: 'a1', dados: { barbeiroId: 'barbeiro1', data: '2026-07-20' } }]),
    );

    await expect(
      listarPorBarbeiroEPeriodo('barbeiro1', '2026-07-19', '2026-07-25'),
    ).resolves.toEqual([{ id: 'a1', barbeiroId: 'barbeiro1', data: '2026-07-20' }]);
  });

  it('não ordena por createdAt — o range em `data` já define o índice', async () => {
    // Acrescentar um orderBy em outro campo aqui exigiria um índice novo e
    // derrubaria a tela Início com "The query requires an index".
    await listarPorBarbeiroEPeriodo('barbeiro1', '2026-07-20', '2026-07-26');
    expect(mockedOrderBy).not.toHaveBeenCalled();
  });

  it('sem barbeiro devolve vazio', async () => {
    await expect(listarPorBarbeiroEPeriodo('', '2026-07-20', '2026-07-26')).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });
});

// ─── ARQ-01: relatórios financeiros no escopo do NEGÓCIO ────────────────────
//
// Antes, Início, Relatórios e Vendas somavam `listarPorBarbeiroEPeriodo(uid)`
// — o atendimento do DONO apenas. Num negócio com equipe isso sub-reporta o
// faturamento em tudo que os outros profissionais fizeram (eles não têm login
// próprio: quem olha o relatório é sempre o dono).

describe('listarPorNegocioEPeriodo — receita da equipe inteira no período', () => {
  it('usa o índice composto negocioId + data, sem orderBy e sem limit', async () => {
    await listarPorNegocioEPeriodo('negocio1', '2026-08-01', '2026-08-31');

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'negocioId', op: '==', valor: 'negocio1' },
      { tipo: 'where', campo: 'data', op: '>=', valor: '2026-08-01' },
      { tipo: 'where', campo: 'data', op: '<=', valor: '2026-08-31' },
    ]);
    // Espelha `listarConcluidosPorNegocio`: um mês cheio de faturamento não
    // pode ser truncado em 50 documentos numa tela de dinheiro. E um orderBy
    // em outro campo exigiria um índice novo.
    expect(mockedLimit).not.toHaveBeenCalled();
    expect(mockedOrderBy).not.toHaveBeenCalled();
  });

  it('sem negocioId devolve vazio sem consultar o Firestore', async () => {
    await expect(listarPorNegocioEPeriodo('', '2026-08-01', '2026-08-31')).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('devolve os documentos com o id anexado', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshotCom([{ id: 'a1', dados: { negocioId: 'negocio1', data: '2026-08-10' } }]),
    );

    await expect(listarPorNegocioEPeriodo('negocio1', '2026-08-01', '2026-08-31')).resolves.toEqual([
      { id: 'a1', negocioId: 'negocio1', data: '2026-08-10' },
    ]);
  });

  it('índice ainda em construção: cai para a consulta só de igualdade e recorta o período em memória', async () => {
    // Janela real entre publicar o APK e o índice `negocioId + data` terminar
    // de construir. Sem esta ponte, o relatório do dono abriria zerado.
    const erroDeIndice = Object.assign(
      new Error('The query requires an index. That index is currently building and cannot be used yet.'),
      { code: 'failed-precondition' },
    );
    mockedGetDocs
      .mockRejectedValueOnce(erroDeIndice)
      .mockResolvedValueOnce(
        snapshotCom([
          { id: 'antes', dados: { data: '2026-07-31' } },
          { id: 'dentro-inicio', dados: { data: '2026-08-01' } },
          { id: 'dentro-fim', dados: { data: '2026-08-31' } },
          { id: 'depois', dados: { data: '2026-09-01' } },
        ]),
      );

    const resultado = await listarPorNegocioEPeriodo('negocio1', '2026-08-01', '2026-08-31');

    // O recorte em memória é inclusive nas duas pontas, igual ao do servidor.
    expect(resultado.map((a) => a.id)).toEqual(['dentro-inicio', 'dentro-fim']);
    // A segunda consulta é SÓ a igualdade — é o que o índice de campo único
    // (automático) atende sem depender de índice composto nenhum.
    expect(restricoesDe(1)).toEqual([
      { tipo: 'where', campo: 'negocioId', op: '==', valor: 'negocio1' },
    ]);
  });

  it('erro que NÃO é de índice continua propagando (não vira lista vazia silenciosa)', async () => {
    mockedGetDocs.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(
      listarPorNegocioEPeriodo('negocio1', '2026-08-01', '2026-08-31'),
    ).rejects.toThrow('permission-denied');
  });
});

describe('listarDoEscopoFinanceiroPorPeriodo — o escopo que as telas de dinheiro somam', () => {
  /**
   * Faz o `getDocs` responder conforme o FILTRO da consulta, e não conforme a
   * ordem em que as duas fontes são disparadas dentro do `Promise.all`. Se
   * alguém inverter essa ordem no código de produção, o teste continua
   * exercitando exatamente a mesma coisa.
   */
  const responderPorFonte = (
    doNegocio: Array<{ id: string; dados: Record<string, unknown> }>,
    doBarbeiro: Array<{ id: string; dados: Record<string, unknown> }>,
  ) => {
    mockedGetDocs.mockImplementation((q: { cs: Array<{ campo: string }> }) =>
      Promise.resolve(snapshotCom(q.cs.some((c) => c.campo === 'negocioId') ? doNegocio : doBarbeiro)),
    );
  };

  it('sem barbeiroId devolve vazio sem consultar', async () => {
    await expect(
      listarDoEscopoFinanceiroPorPeriodo('', 'negocio1', '2026-08-01', '2026-08-31'),
    ).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('barbeiro SOLO: uma única consulta, a de barbeiroId — idêntica à de antes', async () => {
    // Caminho de quem não tem equipe. Uma consulta, o mesmo índice de
    // sempre, o mesmo resultado: não regride por construção.
    await listarDoEscopoFinanceiroPorPeriodo('barbeiro1', null, '2026-08-01', '2026-08-31');

    expect(mockedGetDocs).toHaveBeenCalledTimes(1);
    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'barbeiroId', op: '==', valor: 'barbeiro1' },
      { tipo: 'where', campo: 'data', op: '>=', valor: '2026-08-01' },
      { tipo: 'where', campo: 'data', op: '<=', valor: '2026-08-31' },
    ]);
    expect(mockedWhere).not.toHaveBeenCalledWith('negocioId', expect.anything(), expect.anything());
  });

  it('undefined tem o mesmo efeito que null (tela sem negócio resolvido)', async () => {
    await listarDoEscopoFinanceiroPorPeriodo('barbeiro1', undefined, '2026-08-01', '2026-08-31');
    expect(mockedGetDocs).toHaveBeenCalledTimes(1);
  });

  it('O AGENDAMENTO DO DONO ENTRA UMA VEZ SÓ — a receita dele não dobra', async () => {
    // O risco mais caro desta tarefa: um agendamento do próprio dono tem
    // `negocioId` E `barbeiroId == uid`, então volta nas DUAS consultas.
    // Concatenar sem deduplicar por id dobraria o faturamento dele numa tela
    // de dinheiro — e ninguém notaria, porque o número só ficaria "bom".
    const doDono = { id: 'ag-do-dono', dados: { barbeiroId: 'dono', negocioId: 'negocio1', precoEmCentavos: 5000 } };
    responderPorFonte([doDono], [doDono]);

    const resultado = await listarDoEscopoFinanceiroPorPeriodo('dono', 'negocio1', '2026-08-01', '2026-08-31');

    expect(resultado.filter((a) => a.id === 'ag-do-dono')).toHaveLength(1);
    expect(resultado).toHaveLength(1);
    expect(resultado.reduce((acc, a) => acc + (a.precoEmCentavos || 0), 0)).toBe(5000);
  });

  it('agendamento ANTIGO do dono, sem negocioId, continua no resultado', async () => {
    // `negocioId` é denormalizado na criação: o que foi agendado ANTES de a
    // conta virar equipe não tem o campo. Se o relatório passasse a olhar só
    // `negocioId`, a receita do dono despencaria no dia em que ele criasse a
    // equipe — sem nada ter acontecido no mundo real.
    responderPorFonte(
      [{ id: 'novo', dados: { barbeiroId: 'dono', negocioId: 'negocio1', precoEmCentavos: 3000 } }],
      [
        { id: 'novo', dados: { barbeiroId: 'dono', negocioId: 'negocio1', precoEmCentavos: 3000 } },
        { id: 'antigo-sem-negocio', dados: { barbeiroId: 'dono', precoEmCentavos: 4000 } },
      ],
    );

    const resultado = await listarDoEscopoFinanceiroPorPeriodo('dono', 'negocio1', '2026-08-01', '2026-08-31');

    expect(resultado.map((a) => a.id).sort()).toEqual(['antigo-sem-negocio', 'novo']);
    expect(resultado.reduce((acc, a) => acc + (a.precoEmCentavos || 0), 0)).toBe(7000);
  });

  it('agendamento de OUTRO profissional da equipe entra no resultado', async () => {
    // É o furo que ARQ-01 fecha: quem atendeu foi o profissional, mas quem
    // fatura (e quem olha o relatório) é o dono.
    responderPorFonte(
      [
        { id: 'do-dono', dados: { barbeiroId: 'dono', negocioId: 'negocio1', precoEmCentavos: 5000 } },
        { id: 'do-profissional', dados: { barbeiroId: 'profissional-2', negocioId: 'negocio1', precoEmCentavos: 8000 } },
      ],
      [{ id: 'do-dono', dados: { barbeiroId: 'dono', negocioId: 'negocio1', precoEmCentavos: 5000 } }],
    );

    const resultado = await listarDoEscopoFinanceiroPorPeriodo('dono', 'negocio1', '2026-08-01', '2026-08-31');

    expect(resultado.map((a) => a.id).sort()).toEqual(['do-dono', 'do-profissional']);
    expect(resultado.reduce((acc, a) => acc + (a.precoEmCentavos || 0), 0)).toBe(13000);
  });

  it('com negócio, consulta as DUAS fontes', async () => {
    responderPorFonte([], []);
    await listarDoEscopoFinanceiroPorPeriodo('dono', 'negocio1', '2026-08-01', '2026-08-31');
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });
});

// ─── DOM-02: avisar antes de desativar um profissional ──────────────────────

describe('listarPendentesDoEscopo — filtro global Pendentes da Agenda', () => {
  const responderPorFonte = (
    doNegocio: Array<{ id: string; dados: Record<string, unknown> }>,
    doBarbeiro: Array<{ id: string; dados: Record<string, unknown> }>,
  ) => {
    mockedGetDocs.mockImplementation((q: { cs: Array<{ campo: string }> }) =>
      Promise.resolve(snapshotCom(q.cs.some((c) => c.campo === 'negocioId') ? doNegocio : doBarbeiro)),
    );
  };

  it('barbeiro solo recebe todos os pendentes, inclusive de outros meses, ordenados por data e horário', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshotCom([
        { id: 'futuro', dados: { status: 'pendente', data: '2026-10-02', horario: '09:00' } },
        { id: 'antigo-tarde', dados: { status: 'pendente', data: '2026-01-10', horario: '16:00' } },
        { id: 'antigo-cedo', dados: { status: 'pendente', data: '2026-01-10', horario: '08:00' } },
      ]),
    );

    const resultado = await listarPendentesDoEscopo('barbeiro1', null);

    expect(resultado.map((ag) => ag.id)).toEqual(['antigo-cedo', 'antigo-tarde', 'futuro']);
    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'barbeiroId', op: '==', valor: 'barbeiro1' },
      { tipo: 'where', campo: 'status', op: '==', valor: 'pendente' },
    ]);
    expect(mockedWhere).not.toHaveBeenCalledWith('data', expect.anything(), expect.anything());
    expect(mockedOrderBy).not.toHaveBeenCalled();
    expect(mockedLimit).not.toHaveBeenCalled();
  });

  it('dono recebe os pendentes da equipe, preserva legado próprio e deduplica por id', async () => {
    responderPorFonte(
      [
        { id: 'dono-atual', dados: { barbeiroId: 'dono', negocioId: 'negocio1', status: 'pendente', data: '2026-08-20', horario: '10:00' } },
        { id: 'profissional', dados: { barbeiroId: 'prof-2', negocioId: 'negocio1', status: 'pendente', data: '2026-08-19', horario: '10:00' } },
      ],
      [
        { id: 'dono-atual', dados: { barbeiroId: 'dono', negocioId: 'negocio1', status: 'pendente', data: '2026-08-20', horario: '10:00' } },
        { id: 'legado-sem-negocio', dados: { barbeiroId: 'dono', status: 'pendente', data: '2026-08-18', horario: '10:00' } },
      ],
    );

    const resultado = await listarPendentesDoEscopo('dono', 'negocio1');

    expect(resultado.map((ag) => ag.id)).toEqual(['legado-sem-negocio', 'profissional', 'dono-atual']);
    expect(resultado.filter((ag) => ag.id === 'dono-atual')).toHaveLength(1);
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
    expect(restricoesDe(0)).toEqual(expect.arrayContaining([
      { tipo: 'where', campo: 'negocioId', op: '==', valor: 'negocio1' },
      { tipo: 'where', campo: 'status', op: '==', valor: 'pendente' },
    ]));
    expect(restricoesDe(1)).toEqual(expect.arrayContaining([
      { tipo: 'where', campo: 'barbeiroId', op: '==', valor: 'dono' },
      { tipo: 'where', campo: 'status', op: '==', valor: 'pendente' },
    ]));
    expect(mockedWhere).not.toHaveBeenCalledWith('data', expect.anything(), expect.anything());
  });

  it('sem barbeiro não consulta o Firestore', async () => {
    await expect(listarPendentesDoEscopo('', 'negocio1')).resolves.toEqual([]);
    await expect(listarPendentesDoEscopo(null as any, null)).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });
});

describe('listarConfirmadosHojeDoEscopo — filtro Confirmados de hoje', () => {
  it('mantém somente confirmados da data local recebida e reutiliza o escopo por período', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshotCom([
        { id: 'confirmado', dados: { status: 'confirmado', data: '2026-08-18', horario: '15:00' } },
        { id: 'pendente-hoje', dados: { status: 'pendente', data: '2026-08-18', horario: '10:00' } },
      ]),
    );

    await expect(listarConfirmadosHojeDoEscopo('barbeiro1', null, '2026-08-18')).resolves.toEqual([
      { id: 'confirmado', status: 'confirmado', data: '2026-08-18', horario: '15:00' },
    ]);
    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'barbeiroId', op: '==', valor: 'barbeiro1' },
      { tipo: 'where', campo: 'data', op: '>=', valor: '2026-08-18' },
      { tipo: 'where', campo: 'data', op: '<=', valor: '2026-08-18' },
    ]);
  });

  it('sem barbeiro ou data local não consulta o Firestore', async () => {
    await expect(listarConfirmadosHojeDoEscopo('', null, '2026-08-18')).resolves.toEqual([]);
    await expect(listarConfirmadosHojeDoEscopo('barbeiro1', null, '')).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });
});

describe('contarFuturosDoProfissional — quantos compromissos o dono herda ao desativar', () => {
  /**
   * Aqui o `getDocs` SIMULA o Firestore aplicando as cláusulas realmente
   * passadas ao `query()` — só os operadores usados por esta função (`==`,
   * `in`, `>=`). Não é um Firestore de mentira de uso geral: é o mínimo para
   * que os testes de contagem exercitem a ligação entre as cláusulas
   * declaradas e o número que sai. Se alguém afrouxar o filtro de status ou
   * de data no código de produção, os testes abaixo acusam.
   */
  const universo = [
    { id: 'p-hoje', dados: { barbeiroId: 'prof-1', negocioId: 'negocio1', status: 'pendente', data: '2026-08-17' } },
    { id: 'c-amanha', dados: { barbeiroId: 'prof-1', negocioId: 'negocio1', status: 'confirmado', data: '2026-08-18' } },
    { id: 'concluido-futuro', dados: { barbeiroId: 'prof-1', negocioId: 'negocio1', status: 'concluido', data: '2026-08-20' } },
    { id: 'cancelado-futuro', dados: { barbeiroId: 'prof-1', negocioId: 'negocio1', status: 'cancelado', data: '2026-08-20' } },
    { id: 'ontem', dados: { barbeiroId: 'prof-1', negocioId: 'negocio1', status: 'confirmado', data: '2026-08-16' } },
    { id: 'de-outro-profissional', dados: { barbeiroId: 'prof-2', negocioId: 'negocio1', status: 'confirmado', data: '2026-08-19' } },
    { id: 'de-outro-negocio', dados: { barbeiroId: 'prof-1', negocioId: 'negocio2', status: 'confirmado', data: '2026-08-19' } },
  ];

  const comFirestoreSimulado = () => {
    mockedGetDocs.mockImplementation((q: { cs: Array<{ tipo: string; campo: string; op: string; valor: any }> }) =>
      Promise.resolve(
        snapshotCom(
          universo.filter((d) =>
            q.cs.every((c) => {
              const valor = (d.dados as Record<string, unknown>)[c.campo];
              if (c.op === '==') return valor === c.valor;
              if (c.op === 'in') return (c.valor as unknown[]).includes(valor);
              if (c.op === '>=') return (valor as string) >= c.valor;
              if (c.op === '<=') return (valor as string) <= c.valor;
              throw new Error(`operador não simulado: ${c.op}`);
            }),
          ),
        ),
      ),
    );
  };

  it('monta exatamente três cláusulas: negocioId ==, status in [pendente, confirmado], data >= hoje', async () => {
    await contarFuturosDoProfissional('negocio1', 'prof-1', '2026-08-17');

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'negocioId', op: '==', valor: 'negocio1' },
      { tipo: 'where', campo: 'status', op: 'in', valor: ['pendente', 'confirmado'] },
      { tipo: 'where', campo: 'data', op: '>=', valor: '2026-08-17' },
    ]);
    // Nada além disso. `barbeiroId` NÃO entra na consulta de propósito: assim
    // ela reusa o índice `negocioId + status + data` que já existe, e fixa o
    // campo que a regra de segurança lê para autorizar o dono
    // (`podeGerenciarAgendamento` → `isDonoDoNegocio`). Um filtro que a regra
    // não consegue provar faz o Firestore negar a consulta INTEIRA — já
    // aconteceu neste projeto (ver NegocioRepository.getNegocioPorDono).
    expect(mockedWhere).toHaveBeenCalledTimes(3);
    expect(mockedWhere).not.toHaveBeenCalledWith('barbeiroId', expect.anything(), expect.anything());
    expect(mockedOrderBy).not.toHaveBeenCalled();
    expect(mockedLimit).not.toHaveBeenCalled();
  });

  it('conta só os do profissional pedido, ignorando o resto da equipe', async () => {
    comFirestoreSimulado();
    // prof-1 tem 2 futuros ativos; prof-2 tem 1 — que não pode entrar, senão
    // o aviso diria um número maior do que o dono realmente herda.
    await expect(contarFuturosDoProfissional('negocio1', 'prof-1', '2026-08-17')).resolves.toBe(2);
    await expect(contarFuturosDoProfissional('negocio1', 'prof-2', '2026-08-17')).resolves.toBe(1);
  });

  it('concluído futuro, cancelado futuro e agendamento de ontem ficam de fora', async () => {
    comFirestoreSimulado();

    // O universo tem 5 documentos de prof-1 neste negócio; só 2 são
    // compromissos que o dono de fato herda.
    await expect(contarFuturosDoProfissional('negocio1', 'prof-1', '2026-08-17')).resolves.toBe(2);
  });

  it('o "hoje" é injetado — a data de corte é parâmetro, não o relógio da máquina', async () => {
    comFirestoreSimulado();

    // Rodar a contagem com o corte no dia seguinte tira o compromisso de hoje.
    await expect(contarFuturosDoProfissional('negocio1', 'prof-1', '2026-08-18')).resolves.toBe(1);
  });

  it('agendamento de OUTRO negócio nunca entra (isolamento entre empresas)', async () => {
    comFirestoreSimulado();
    await expect(contarFuturosDoProfissional('negocio2', 'prof-1', '2026-08-17')).resolves.toBe(1);
  });

  it('sem negócio ou sem profissional devolve 0 sem consultar', async () => {
    await expect(contarFuturosDoProfissional('', 'prof-1', '2026-08-17')).resolves.toBe(0);
    await expect(contarFuturosDoProfissional('negocio1', '', '2026-08-17')).resolves.toBe(0);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('propaga o erro — quem chama decide o que fazer sem o número', async () => {
    // EquipeScreen trata isso mostrando o aviso sem a contagem; engolir aqui
    // devolveria 0 e a tela desativaria em silêncio, como se não houvesse
    // nenhum compromisso.
    mockedGetDocs.mockRejectedValue(new Error('permission-denied'));
    await expect(contarFuturosDoProfissional('negocio1', 'prof-1', '2026-08-17')).rejects.toThrow(
      'permission-denied',
    );
  });
});

describe('listarPorClienteEBarbeiro — histórico do cliente com um profissional (ARCH-002)', () => {
  it('usa o índice composto clienteUid + barbeiroId + data, mais recente primeiro', async () => {
    await listarPorClienteEBarbeiro('uid-cliente', 'barbeiro1');

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'clienteUid', op: '==', valor: 'uid-cliente' },
      { tipo: 'where', campo: 'barbeiroId', op: '==', valor: 'barbeiro1' },
      { tipo: 'orderBy', campo: 'data', dir: 'desc' },
    ]);
  });

  it('não aplica limit — a tela precisa do histórico completo para calcular frequência/total gasto', async () => {
    await listarPorClienteEBarbeiro('uid-cliente', 'barbeiro1');
    expect(mockedLimit).not.toHaveBeenCalled();
  });

  it('sem clienteUid ou sem barbeiroId devolve vazio sem consultar o Firestore', async () => {
    await expect(listarPorClienteEBarbeiro(null, 'barbeiro1')).resolves.toEqual([]);
    await expect(listarPorClienteEBarbeiro('uid-cliente', null)).resolves.toEqual([]);
    await expect(listarPorClienteEBarbeiro(undefined, undefined)).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('devolve os documentos com o id anexado', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshotCom([{ id: 'ag1', dados: { data: '2026-08-01', horario: '10:00' } }]),
    );

    await expect(listarPorClienteEBarbeiro('uid-cliente', 'barbeiro1')).resolves.toEqual([
      { id: 'ag1', data: '2026-08-01', horario: '10:00' },
    ]);
  });
});

describe('contarPendentesDoBarbeiro — contagem no servidor', () => {
  beforeEach(() => {
    mockedGetCount.mockResolvedValue({ data: () => ({ count: 7 }) });
  });

  it('conta sem baixar os documentos', async () => {
    await expect(contarPendentesDoBarbeiro('barbeiro1')).resolves.toBe(7);

    expect(mockedGetCount).toHaveBeenCalled();
    // Baixar 200 agendamentos só para exibir um badge é banda e cota à toa.
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('conta apenas os pendentes do próprio profissional', async () => {
    await contarPendentesDoBarbeiro('barbeiro1');

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'barbeiroId', op: '==', valor: 'barbeiro1' },
      { tipo: 'where', campo: 'status', op: '==', valor: 'pendente' },
    ]);
  });

  it('sem barbeiro devolve 0 sem consultar', async () => {
    await expect(contarPendentesDoBarbeiro(null)).resolves.toBe(0);
    expect(mockedGetCount).not.toHaveBeenCalled();
  });
});

/**
 * O `ClienteHome` buscava 20 agendamentos para renderizar 3 e anunciava
 * "Ver todos (20)" para quem tinha 47 — número ERRADO, e 17 leituras jogadas
 * fora a cada foco. A contagem tem que usar exatamente as mesmas cláusulas da
 * listagem, senão vira um segundo número que diverge do primeiro.
 */
describe('contarDoCliente — o total de "Ver todos", sem baixar a lista', () => {
  beforeEach(() => {
    mockedGetCount.mockResolvedValue({ data: () => ({ count: 47 }) });
  });

  it('conta no servidor, sem baixar nenhum documento', async () => {
    await expect(contarDoCliente('cliente1')).resolves.toBe(47);

    expect(mockedGetCount).toHaveBeenCalled();
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('usa as MESMAS cláusulas da listagem — e nenhum limit', async () => {
    // Este é o teste que impede o total de divergir da lista: se alguém
    // acrescentar um filtro em `constraintsDoCliente` e esquecer a contagem,
    // ou puser um `limit` aqui, o número volta a mentir.
    await contarDoCliente('cliente1');

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'clienteUid', op: '==', valor: 'cliente1' },
      { tipo: 'orderBy', campo: 'createdAt', dir: 'desc' },
    ]);
  });

  it('filtra por status quando pedido, igual à listagem', async () => {
    await contarDoCliente('cliente1', { status: 'concluido' });

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'clienteUid', op: '==', valor: 'cliente1' },
      { tipo: 'where', campo: 'status', op: '==', valor: 'concluido' },
      { tipo: 'orderBy', campo: 'createdAt', dir: 'desc' },
    ]);
  });

  it("status 'todos' não vira filtro — conta o histórico inteiro", async () => {
    await contarDoCliente('cliente1', { status: 'todos' });

    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'clienteUid', op: '==', valor: 'cliente1' },
      { tipo: 'orderBy', campo: 'createdAt', dir: 'desc' },
    ]);
  });

  it('sem cliente devolve 0 sem consultar', async () => {
    await expect(contarDoCliente(null)).resolves.toBe(0);
    expect(mockedGetCount).not.toHaveBeenCalled();
  });
});

/**
 * AG-05 (Lote B): nem cliente nem barbeiro escrevem `agendamentos`
 * diretamente — os dois caminhos passam por Cloud Function
 * (`criarAgendamentoSeguro`/`criarAgendamentoManualSeguro`), cada uma com a
 * validação de agenda/serviço/disponibilidade do lado do servidor. Antes só
 * o caminho do cliente usava Function; o manual gravava via `addDoc` direto
 * — ver `AgendamentoManualScreen.tsx` e `functions/index.js`.
 */
describe('criarAgendamento', () => {
  describe('origem "manual" — barbeiro/dono lança atendimento em nome de um cliente sem conta', () => {
    it('chama criarAgendamentoManualSeguro com os campos certos e devolve o id', async () => {
      const enviar = jest.fn().mockResolvedValue({ data: { agendamento: { id: 'ag-novo' } } });
      mockedHttpsCallable.mockReturnValue(enviar);

      const id = await criarAgendamento({
        barbeiroId: 'b1',
        data: '2026-08-15',
        horario: '14:30',
        servicoId: 'corte',
        clienteNome: 'Fulano',
        clienteTelefone: '11999990000',
        origem: 'manual',
      } as any);

      expect(id).toBe('ag-novo');
      expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'criarAgendamentoManualSeguro');
      expect(enviar).toHaveBeenCalledWith({
        barbeiroId: 'b1',
        data: '2026-08-15',
        horario: '14:30',
        servicoId: 'corte',
        clienteNome: 'Fulano',
        clienteTelefone: '11999990000',
      });
    });

    it('não envia clienteTelefone quando ausente (evita undefined explícito no payload)', async () => {
      const enviar = jest.fn().mockResolvedValue({ data: { agendamento: { id: 'ag-novo' } } });
      mockedHttpsCallable.mockReturnValue(enviar);

      await criarAgendamento({
        barbeiroId: 'b1', data: '2026-08-15', horario: '14:30', servicoId: 'corte', clienteNome: 'Fulano', origem: 'manual',
      } as any);

      expect(enviar.mock.calls[0][0]).not.toHaveProperty('clienteTelefone');
    });

    it('propaga o erro sem engolir', async () => {
      const erro = Object.assign(new Error('failed-precondition'), { code: 'functions/failed-precondition' });
      mockedHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue(erro));

      await expect(criarAgendamento({ barbeiroId: 'b1', origem: 'manual' } as any)).rejects.toBe(erro);
    });
  });

  describe('origem "cliente" (padrão) — cliente reserva para si mesmo', () => {
    it('chama criarAgendamentoSeguro com os campos certos e devolve o id', async () => {
      const enviar = jest.fn().mockResolvedValue({ data: { agendamento: { id: 'ag-cliente' } } });
      mockedHttpsCallable.mockReturnValue(enviar);

      const id = await criarAgendamento({
        barbeiroId: 'b1', data: '2026-08-15', horario: '14:30', servicoId: 'corte',
      } as any);

      expect(id).toBe('ag-cliente');
      expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'criarAgendamentoSeguro');
      expect(enviar).toHaveBeenCalledWith({
        barbeiroId: 'b1', data: '2026-08-15', horario: '14:30', servicoId: 'corte',
      });
    });

    it('propaga o erro sem engolir', async () => {
      const erro = Object.assign(new Error('already-exists'), { code: 'functions/already-exists' });
      mockedHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue(erro));

      await expect(criarAgendamento({ barbeiroId: 'b1' } as any)).rejects.toBe(erro);
    });
  });
});

describe('removerAgendamento — desfaz o agendamento órfão', () => {
  it('apaga o documento pelo id', async () => {
    mockedDeleteDoc.mockResolvedValue(undefined);

    await removerAgendamento('ag1');

    expect(mockedDoc).toHaveBeenCalledWith(expect.anything(), 'agendamentos', 'ag1');
    expect(mockedDeleteDoc).toHaveBeenCalledWith({ path: 'agendamentos/ag1' });
  });

  it('propaga a falha: um agendamento sem horário reservado não pode ficar de pé calado', async () => {
    mockedDeleteDoc.mockRejectedValue(new Error('offline'));
    await expect(removerAgendamento('ag1')).rejects.toThrow('offline');
  });
});

describe('atualizarStatus — cada status tem seu próprio carimbo', () => {
  beforeEach(() => {
    mockedUpdateDoc.mockResolvedValue(undefined);
  });

  it.each([
    ['confirmado', 'confirmedAt'],
    ['cancelado', 'cancelledAt'],
    ['concluido', 'concludedAt'],
    ['avaliado', 'ratedAt'],
  ])('%s grava %s com a hora do servidor', async (status, campo) => {
    await atualizarStatus('ag1', status as any);

    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      { path: 'agendamentos/ag1' },
      { status, [campo]: { __serverTimestamp: true } },
    );
  });

  it('usa updateDoc, não setDoc — o resto do agendamento não pode ser apagado', async () => {
    // Um setDoc sem merge aqui apagaria cliente, serviço e preço do
    // documento ao confirmar o horário.
    await atualizarStatus('ag1', 'confirmado');

    const patch = mockedUpdateDoc.mock.calls[0][1];
    expect(Object.keys(patch).sort()).toEqual(['confirmedAt', 'status']);
  });

  it('leva os campos extras junto (ex.: motivo do cancelamento, nota da avaliação)', async () => {
    await atualizarStatus('ag1', 'cancelado', { canceladoPor: 'cliente', motivo: 'imprevisto' });

    expect(mockedUpdateDoc.mock.calls[0][1]).toMatchObject({
      status: 'cancelado',
      cancelledAt: { __serverTimestamp: true },
      canceladoPor: 'cliente',
      motivo: 'imprevisto',
    });
  });

  it('propaga o erro — a tela não pode dizer "cancelado" se o servidor recusou', async () => {
    mockedUpdateDoc.mockRejectedValue(new Error('permission-denied'));
    await expect(atualizarStatus('ag1', 'cancelado')).rejects.toThrow('permission-denied');
  });
});

// ─── AG-03 ──────────────────────────────────────────────────────────────────

describe('contarNaFaixaBloqueada — AG-03: quem já está marcado dentro do bloqueio', () => {
  /** Agendamento vivo (pendente) do barbeiro `b1` no dia do bloqueio. */
  const ag = (id: string, horario: string, status = 'pendente') => ({
    id,
    dados: { barbeiroId: 'b1', data: '2026-08-20', horario, status },
  });

  it('monta EXATAMENTE duas igualdades — prova que reusa o índice barbeiroId+data', async () => {
    await contarNaFaixaBloqueada('b1', '2026-08-20', '14:00', '17:00');

    // Uma cláusula a mais aqui não quebra em teste — quebra em produção, com
    // "The query requires an index", na hora em que o barbeiro tenta
    // bloquear um horário. Por isso a asserção é de igualdade exata.
    expect(restricoes()).toEqual([
      { tipo: 'where', campo: 'barbeiroId', op: '==', valor: 'b1' },
      { tipo: 'where', campo: 'data', op: '==', valor: '2026-08-20' },
    ]);
    // `status` fica FORA da consulta de propósito: entre as duas igualdades
    // ele exigiria um índice `barbeiroId + status + data` que não existe (o
    // que existe é `barbeiroId + status + createdAt`).
    expect(mockedWhere).not.toHaveBeenCalledWith('status', expect.anything(), expect.anything());
    // Sem orderBy e sem limit: truncar a contagem daria um número menor que o
    // real num aviso em que o número É a informação.
    expect(mockedOrderBy).not.toHaveBeenCalled();
    expect(mockedLimit).not.toHaveBeenCalled();
    expect(mockedCollection).toHaveBeenCalledWith(expect.anything(), 'agendamentos');
  });

  it('conta só pendente e confirmado — concluído, cancelado e avaliado ficam fora', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshotCom([
        ag('vivo-1', '14:00', 'pendente'),
        ag('vivo-2', '15:00', 'confirmado'),
        ag('ja-foi', '15:30', 'concluido'),
        ag('desmarcado', '16:00', 'cancelado'),
        ag('avaliado', '16:30', 'avaliado'),
      ]),
    );

    // Só os dois vivos: um atendimento já concluído ou cancelado não ocupa
    // mais nada na agenda e não é notícia para quem vai bloquear.
    await expect(contarNaFaixaBloqueada('b1', '2026-08-20', '14:00', '17:00')).resolves.toBe(2);
  });

  it('fora da faixa não conta, dentro conta', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshotCom([
        ag('antes', '13:30'),
        ag('dentro-1', '14:00'),
        ag('dentro-2', '16:30'),
        ag('depois', '17:30'),
      ]),
    );

    await expect(contarNaFaixaBloqueada('b1', '2026-08-20', '14:00', '17:00')).resolves.toBe(2);
  });

  it('borda: início INCLUSIVO, fim EXCLUSIVO — igual a filtrarBloqueiosHorario', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshotCom([ag('na-abertura', '14:00'), ag('no-fechamento', '17:00')]),
    );

    // `filtrarBloqueiosHorario` (agendaSlots.ts) usa `slotInicio < bFim`, ou
    // seja: quem começa exatamente em `horaFim` NÃO é bloqueado — o bloqueio
    // já acabou. E `slotInicio` igual a `bInicio` É bloqueado. A contagem
    // segue a mesma convenção para não contradizer a grade que o cliente vê.
    await expect(contarNaFaixaBloqueada('b1', '2026-08-20', '14:00', '17:00')).resolves.toBe(1);
  });

  it('borda conhecida: quem COMEÇA antes e avança sobre o bloqueio não é contado', async () => {
    // Limitação assumida e documentada na função: o documento de agendamento
    // NÃO guarda duração (`criarAgendamentoSeguro` grava `servico` como nome,
    // e `duracaoMinutos` vive no catálogo do profissional, que muda). Um
    // corte de 13:30 com 1h avança sobre um bloqueio das 14:00, mas não há
    // como saber isso a partir do documento — a contagem é um PISO, e o
    // aviso que ela alimenta é consultivo, nunca impeditivo.
    mockedGetDocs.mockResolvedValue(snapshotCom([ag('as-13-30', '13:30')]));

    await expect(contarNaFaixaBloqueada('b1', '2026-08-20', '14:00', '17:00')).resolves.toBe(0);
  });

  it('sem barbeiro, sem data ou sem faixa: devolve 0 sem tocar no Firestore', async () => {
    await expect(contarNaFaixaBloqueada('', '2026-08-20', '14:00', '17:00')).resolves.toBe(0);
    await expect(contarNaFaixaBloqueada('b1', '', '14:00', '17:00')).resolves.toBe(0);
    await expect(contarNaFaixaBloqueada('b1', '2026-08-20', '', '17:00')).resolves.toBe(0);
    await expect(contarNaFaixaBloqueada('b1', '2026-08-20', '14:00', '')).resolves.toBe(0);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('propaga o erro de leitura — quem chama precisa distinguir "zero" de "não sei"', async () => {
    mockedGetDocs.mockRejectedValue(new Error('permission-denied'));

    // Se engolisse e devolvesse 0, a tela gravaria o bloqueio em silêncio
    // achando que a faixa estava livre — que é exatamente o AG-03.
    await expect(contarNaFaixaBloqueada('b1', '2026-08-20', '14:00', '17:00')).rejects.toThrow(
      'permission-denied',
    );
  });
});


/**
 * P3 Release A — a sentinela que vai DECIDIR se a fonte dupla pode morrer.
 *
 * `listarDoEscopoFinanceiroPorPeriodo` consulta duas vezes (por `negocioId` e
 * por `barbeiroId`) porque agendamentos anteriores à criação da equipe não têm
 * `negocioId`. Todo mundo suspeita que essa segunda consulta já é inútil; nin-
 * guém sabe. A sentinela mede, em produção, o único fato que resolve: existe
 * agendamento que só a consulta do barbeiro acha?
 *
 * O contrato testado aqui é o de um instrumento de medição, e por isso é
 * estreito nos dois sentidos: tem que acender quando há divergência, e tem que
 * ficar CALADO quando não há. Uma sentinela que acende à toa não serve de
 * evidência para nada — é só ruído com carimbo de dado.
 *
 * Os testes usam `barbeiroId` distintos de propósito: a supressão de eventos
 * repetidos é por sessão do módulo e sobrevive ao `clearAllMocks`.
 */
describe('listarDoEscopoFinanceiroPorPeriodo — sentinela da fonte dupla (P3-A)', () => {
  const responderPorFonte = (
    doNegocio: Array<{ id: string; dados: Record<string, unknown> }>,
    doBarbeiro: Array<{ id: string; dados: Record<string, unknown> }>,
  ) => {
    mockedGetDocs.mockImplementation((q: { cs: Array<{ campo: string }> }) =>
      Promise.resolve(snapshotCom(q.cs.some((c) => c.campo === 'negocioId') ? doNegocio : doBarbeiro)),
    );
  };

  const agendamento = (id: string, extras: Record<string, unknown> = {}) => ({
    id,
    dados: {
      barbeiroId: 'dono',
      negocioId: 'negocio1',
      precoEmCentavos: 5000,
      // Campos pessoais REAIS do documento: nenhum pode vazar para a telemetria.
      clienteNome: 'Maria Silva',
      cliente: 'maria@exemplo.com',
      clienteTelefone: '11999998888',
      ...extras,
    },
  });

  it('NAO emite quando os dois conjuntos coincidem', async () => {
    const ag = agendamento('ag-1');
    responderPorFonte([ag], [ag]);

    await listarDoEscopoFinanceiroPorPeriodo('sent-iguais', 'negocio1', '2026-08-01', '2026-08-31');

    expect(mockedRegistrarAviso).not.toHaveBeenCalled();
  });

  it('NAO emite quando o proprio e SUBCONJUNTO do negocio', async () => {
    // O negócio tem mais que o dono — mas nada escapa dele. Continua calado.
    responderPorFonte([agendamento('ag-1'), agendamento('ag-2', { barbeiroId: 'prof-2' })], [agendamento('ag-1')]);

    await listarDoEscopoFinanceiroPorPeriodo('sent-subconjunto', 'negocio1', '2026-08-01', '2026-08-31');

    expect(mockedRegistrarAviso).not.toHaveBeenCalled();
  });

  it('emite quando o proprio tem algo que o negocio nao tem', async () => {
    responderPorFonte(
      [agendamento('ag-novo')],
      [agendamento('ag-novo'), agendamento('ag-antigo', { negocioId: undefined })],
    );

    await listarDoEscopoFinanceiroPorPeriodo('sent-diverge', 'negocio1', '2026-08-01', '2026-08-31');

    expect(mockedRegistrarAviso).toHaveBeenCalledTimes(1);
    const [, contexto] = mockedRegistrarAviso.mock.calls[0];
    expect(contexto).toMatchObject({
      area: 'financeiro',
      operacao: 'fonte-dupla-divergente',
      quantidade: 1,
    });
  });

  /**
   * `alertarFalhasOperacionais` manda email a partir de 5 `error` em 15 min.
   * Esta sentinela acende em toda barbearia com histórico anterior à equipe —
   * o caso ESPERADO, não uma falha. Emitir como `error` encheria a caixa do
   * dono de alarme que não pede ação, e alarme inflado ensina a ignorar tudo.
   */
  it('e AVISO, nunca erro — nao pode disparar o email de falhas operacionais', async () => {
    responderPorFonte([], [agendamento('so-no-proprio', { negocioId: undefined })]);

    await listarDoEscopoFinanceiroPorPeriodo('sent-nivel', 'negocio1', '2026-08-01', '2026-08-31');

    expect(mockedRegistrarAviso).toHaveBeenCalled();
    expect(mockedRegistrarErro).not.toHaveBeenCalled();
  });

  it('nao manda NENHUM dado pessoal — so quantidade e ids tecnicos', async () => {
    responderPorFonte([], [agendamento('so-no-proprio', { negocioId: undefined })]);

    await listarDoEscopoFinanceiroPorPeriodo('sent-privacidade', 'negocio1', '2026-08-01', '2026-08-31');

    const [mensagem, contexto] = mockedRegistrarAviso.mock.calls[0];
    const serializado = JSON.stringify({ mensagem, contexto });

    expect(serializado).not.toContain('Maria Silva');
    expect(serializado).not.toContain('maria@exemplo.com');
    expect(serializado).not.toContain('11999998888');
    expect(serializado).not.toContain('precoEmCentavos');

    // O que PODE sair: rótulos, ids técnicos e a contagem.
    expect(Object.keys(contexto).sort()).toEqual([
      'amostra',
      'area',
      'barbeiroId',
      'negocioId',
      'operacao',
      'quantidade',
    ]);
    // A amostra vai como objetos com a chave `agendamentoId` de propósito:
    // uma string solta num array seria redigida como token de alta entropia
    // por `sanitizarProfundo`, e chegaria inútil do outro lado.
    expect(contexto.amostra).toEqual([{ agendamentoId: 'so-no-proprio' }]);
  });

  it('conta a divergencia inteira, mas so amostra alguns ids', async () => {
    const soNoProprio = ['a', 'b', 'c', 'd', 'e'].map((id) =>
      agendamento(id, { negocioId: undefined }),
    );
    responderPorFonte([], soNoProprio);

    await listarDoEscopoFinanceiroPorPeriodo('sent-amostra', 'negocio1', '2026-08-01', '2026-08-31');

    const [, contexto] = mockedRegistrarAviso.mock.calls[0];
    expect(contexto.quantidade).toBe(5);
    expect(contexto.amostra).toHaveLength(3);
  });

  it('custa ZERO leitura extra — continua sendo duas consultas', async () => {
    responderPorFonte([], [agendamento('so-no-proprio', { negocioId: undefined })]);

    await listarDoEscopoFinanceiroPorPeriodo('sent-custo', 'negocio1', '2026-08-01', '2026-08-31');

    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });

  it('barbeiro SOLO nunca aciona a sentinela — nem existe fonte dupla', async () => {
    responderPorFonte([], [agendamento('qualquer')]);

    await listarDoEscopoFinanceiroPorPeriodo('sent-solo', null, '2026-08-01', '2026-08-31');

    expect(mockedRegistrarAviso).not.toHaveBeenCalled();
  });

  /**
   * DESVIO da especificação, deliberado e reversível (ver a nota em
   * `divergenciasJaReportadas`). Sem supressão, o Início sozinho emitiria dois
   * eventos por foco, e Relatórios e Vendas mais os seus — dezenas de
   * invocações de Callable por dia dizendo a mesma coisa. A pergunta do
   * Release A é "isto acontece?", e para ela um evento basta.
   */
  it('nao repete o MESMO evento na mesma sessao', async () => {
    responderPorFonte([], [agendamento('so-no-proprio', { negocioId: undefined })]);

    await listarDoEscopoFinanceiroPorPeriodo('sent-dedupe', 'negocio1', '2026-08-01', '2026-08-31');
    await listarDoEscopoFinanceiroPorPeriodo('sent-dedupe', 'negocio1', '2026-09-01', '2026-09-30');

    expect(mockedRegistrarAviso).toHaveBeenCalledTimes(1);
  });

  it('mas uma divergencia MAIOR volta a reportar', async () => {
    responderPorFonte([], [agendamento('x', { negocioId: undefined })]);
    await listarDoEscopoFinanceiroPorPeriodo('sent-cresce', 'negocio1', '2026-08-01', '2026-08-31');

    responderPorFonte([], [agendamento('x', { negocioId: undefined }), agendamento('y', { negocioId: undefined })]);
    await listarDoEscopoFinanceiroPorPeriodo('sent-cresce', 'negocio1', '2026-08-01', '2026-08-31');

    expect(mockedRegistrarAviso).toHaveBeenCalledTimes(2);
    expect(mockedRegistrarAviso.mock.calls[1][1].quantidade).toBe(2);
  });

  it('a sentinela nao muda o resultado devolvido', async () => {
    responderPorFonte(
      [agendamento('novo')],
      [agendamento('novo'), agendamento('antigo', { negocioId: undefined })],
    );

    const resultado = await listarDoEscopoFinanceiroPorPeriodo(
      'sent-resultado', 'negocio1', '2026-08-01', '2026-08-31',
    );

    expect(resultado.map((a) => a.id).sort()).toEqual(['antigo', 'novo']);
  });
});
