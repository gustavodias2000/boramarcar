/**
 * Fluxos de prejuízo cobertos aqui (blocos 1 e 2 da auditoria externa):
 *
 *  1. AGENDAMENTO DUPLICADO — dois clientes escolhendo o mesmo horário ao
 *     mesmo tempo. O prejuízo é real: duas pessoas chegam na barbearia para
 *     o mesmo slot e uma volta para casa. `reservarSlots` só pode gravar se
 *     TODOS os blocos estiverem livres, dentro de uma única transação.
 *
 *  2. AGENDA TRAVADA PARA SEMPRE — um serviço de 1h ocupa dois blocos de
 *     30 min, mas o cancelamento antigo apagava só o primeiro. O segundo
 *     bloco ficava ocupado sem dono, e nenhum cliente conseguia agendar
 *     naquele horário nunca mais. `liberarSlotsDoAgendamento` tem que
 *     apagar todos.
 *
 *  3. FALHA DE LIBERAÇÃO INVISÍVEL (ARQ-05) — a correção 2 acima só apaga os
 *     slots quando o Firestore deixa. Quando ele recusa, as duas funções
 *     engolem o erro de propósito (o cancelamento em si já aconteceu), e até
 *     agora isso saía num `console.warn` que, em React Native de produção,
 *     não chega a lugar nenhum. Resultado: o job `reconciliarSlotsOrfaos`
 *     limpava slots órfãos sem ninguém nunca ver a CAUSA. Agora cada falha
 *     vira um evento de telemetria — sem mudar o contrato de "nunca lança".
 */
import {
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { registrarAviso } from '../../src/services/ObservabilityService';
import {
  slotId,
  reservarSlots,
  liberarSlot,
  liberarSlotsDoAgendamento,
  algumSlotOcupado,
  getHorariosOcupados,
  getOcupacoesPorPeriodo,
  HorarioIndisponivelError,
} from '../../src/services/OcupacaoService';

// Telemetria mockada: aqui interessa QUE evento o serviço monta (nível,
// area/operacao e — principalmente — quais campos entram no contexto), não o
// transporte até a Cloud Function, que tem suíte própria
// (__tests__/services/ObservabilityService.test.ts).
jest.mock('../../src/services/ObservabilityService', () => ({
  registrarAviso: jest.fn(() => Promise.resolve()),
  registrarErro: jest.fn(() => Promise.resolve()),
}));

const mockedRegistrarAviso = registrarAviso as jest.Mock;
const mockedDoc = doc as jest.Mock;
const mockedGetDoc = getDoc as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedWhere = where as jest.Mock;
const mockedRunTransaction = runTransaction as jest.Mock;
const mockedServerTimestamp = serverTimestamp as jest.Mock;

/**
 * Firestore de mentira, só com o que a transação precisa: um Map de
 * `path -> dados`. `doc()` devolve o próprio caminho como referência, então
 * dá para inspecionar exatamente quais documentos foram tocados.
 */
function criarFirestoreFalso(inicial: Record<string, any> = {}) {
  const store = new Map<string, any>(Object.entries(inicial));

  mockedDoc.mockImplementation((_db: unknown, colecao: string, id: string) => ({
    path: `${colecao}/${id}`,
    id,
  }));

  const snapshot = (path: string) => ({
    exists: () => store.has(path),
    data: () => store.get(path),
    ref: { path },
  });

  // Executa o callback com uma transação que lê e grava no Map.
  mockedRunTransaction.mockImplementation(async (_db: unknown, callback: any) => {
    const pendentes: Array<() => void> = [];
    const tx = {
      get: jest.fn(async (ref: { path: string }) => snapshot(ref.path)),
      set: jest.fn((ref: { path: string }, dados: any) => {
        pendentes.push(() => store.set(ref.path, dados));
      }),
      delete: jest.fn((ref: { path: string }) => {
        pendentes.push(() => store.delete(ref.path));
      }),
    };
    // Se o callback lançar, `pendentes` nunca é aplicado — é assim que o
    // Firestore se comporta: ou o commit inteiro passa, ou nada é gravado.
    await callback(tx);
    pendentes.forEach((aplicar) => aplicar());
    return undefined;
  });

  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedServerTimestamp.mockReturnValue({ __serverTimestamp: true });
  // `clearAllMocks` limpa as chamadas mas NÃO a implementação: sem isto, um
  // teste que force `mockRejectedValue` na telemetria contaminaria os
  // seguintes.
  mockedRegistrarAviso.mockResolvedValue(undefined);
});

/**
 * Agendamento COMPLETO, do jeito que as telas passam para
 * `liberarSlotsDoAgendamento` — com nome, email e telefone do cliente e nome
 * do barbeiro. É esse objeto inteiro que o serviço recebe, e é exatamente por
 * isso que ele não pode ser repassado para a telemetria.
 */
const AGENDAMENTO_COM_DADOS_PESSOAIS = {
  id: 'ag1',
  barbeiroId: 'barbeiro1',
  barbeiroNome: 'João Barbeiro',
  barbeiroTelefone: '5511999999999',
  negocioId: 'negocio-1',
  cliente: 'ze.da.esquina@example.com',
  clienteUid: 'cliente-uid',
  clienteNome: 'Zé da Esquina',
  clienteTelefone: '+5511977776666',
  data: '2026-07-20',
  horario: '09:00',
  servico: 'Corte Masculino',
};

describe('slotId', () => {
  it('gera um id determinístico e sem ":" (caractere problemático em path)', () => {
    expect(slotId('barbeiro1', '2026-07-20', '09:00')).toBe('barbeiro1_2026-07-20_09-00');
    expect(slotId('barbeiro1', '2026-07-20', '09:00')).toBe(
      slotId('barbeiro1', '2026-07-20', '09:00'),
    );
  });
});

describe('reservarSlots — proteção contra agendamento duplicado', () => {
  it('grava TODOS os blocos do serviço quando a agenda está livre', async () => {
    const store = criarFirestoreFalso();

    await reservarSlots('barbeiro1', '2026-07-20', ['09:00', '09:30'], 'ag1');

    expect(store.has('ocupacoes/barbeiro1_2026-07-20_09-00')).toBe(true);
    expect(store.has('ocupacoes/barbeiro1_2026-07-20_09-30')).toBe(true);
    expect(store.get('ocupacoes/barbeiro1_2026-07-20_09-30')).toMatchObject({
      barbeiroId: 'barbeiro1',
      data: '2026-07-20',
      horario: '09:30',
      agendamentoId: 'ag1',
    });
  });

  it('recusa a reserva inteira se QUALQUER bloco já for de outro agendamento', async () => {
    // Cenário do prejuízo: o cliente A já pegou 09:30 (segundo bloco do
    // serviço de 1h do cliente B). B não pode ficar com 09:00 sozinho.
    const store = criarFirestoreFalso({
      'ocupacoes/barbeiro1_2026-07-20_09-30': {
        barbeiroId: 'barbeiro1',
        data: '2026-07-20',
        horario: '09:30',
        agendamentoId: 'ag-do-outro',
      },
    });

    await expect(
      reservarSlots('barbeiro1', '2026-07-20', ['09:00', '09:30'], 'ag2'),
    ).rejects.toBeInstanceOf(HorarioIndisponivelError);

    // NADA foi gravado — nem o bloco que estava livre.
    expect(store.has('ocupacoes/barbeiro1_2026-07-20_09-00')).toBe(false);
    expect(store.size).toBe(1);
  });

  it('diz exatamente qual horário caiu, para a tela avisar o cliente', async () => {
    criarFirestoreFalso({
      'ocupacoes/barbeiro1_2026-07-20_10-30': { agendamentoId: 'ag-do-outro' },
    });

    await expect(
      reservarSlots('barbeiro1', '2026-07-20', ['10:00', '10:30', '11:00'], 'ag3'),
    ).rejects.toMatchObject({ horarios: ['10:30'] });
  });

  it('é idempotente: reservar de novo o MESMO agendamento não falha', async () => {
    // Acontece de verdade quando a rede cai depois da gravação e o app tenta
    // outra vez. Bloquear aqui deixaria o agendamento órfão.
    const store = criarFirestoreFalso({
      'ocupacoes/barbeiro1_2026-07-20_09-00': { agendamentoId: 'ag1' },
    });

    await expect(
      reservarSlots('barbeiro1', '2026-07-20', ['09:00', '09:30'], 'ag1'),
    ).resolves.toBeUndefined();

    expect(store.has('ocupacoes/barbeiro1_2026-07-20_09-30')).toBe(true);
  });

  it('lê todos os blocos ANTES de gravar qualquer um (exigência do Firestore)', async () => {
    criarFirestoreFalso();
    const ordem: string[] = [];
    mockedRunTransaction.mockImplementation(async (_db: unknown, callback: any) => {
      await callback({
        get: jest.fn(async (ref: { path: string }) => {
          ordem.push(`get:${ref.path}`);
          return { exists: () => false, data: () => undefined };
        }),
        set: jest.fn((ref: { path: string }) => ordem.push(`set:${ref.path}`)),
        delete: jest.fn(),
      });
    });

    await reservarSlots('barbeiro1', '2026-07-20', ['09:00', '09:30', '10:00'], 'ag1');

    const primeiroSet = ordem.findIndex((o) => o.startsWith('set:'));
    const ultimoGet = ordem.map((o) => o.startsWith('get:')).lastIndexOf(true);
    expect(ultimoGet).toBeLessThan(primeiroSet);
  });

  it('não abre transação quando não há horário nenhum', async () => {
    criarFirestoreFalso();
    await reservarSlots('barbeiro1', '2026-07-20', [], 'ag1');
    expect(mockedRunTransaction).not.toHaveBeenCalled();
  });

  it('deduplica horários repetidos antes de gravar', async () => {
    const store = criarFirestoreFalso();
    await reservarSlots('barbeiro1', '2026-07-20', ['09:00', '09:00'], 'ag1');
    expect(store.size).toBe(1);
  });
});

describe('liberarSlotsDoAgendamento — cancelamento que destrava a agenda', () => {
  it('apaga TODOS os blocos do agendamento, não só o primeiro', async () => {
    const apagados = [
      { ref: { path: 'ocupacoes/barbeiro1_2026-07-20_09-00' } },
      { ref: { path: 'ocupacoes/barbeiro1_2026-07-20_09-30' } },
    ];
    mockedGetDocs.mockResolvedValue({ empty: false, docs: apagados });
    mockedDeleteDoc.mockResolvedValue(undefined);

    await liberarSlotsDoAgendamento({
      id: 'ag1',
      barbeiroId: 'barbeiro1',
      data: '2026-07-20',
      horario: '09:00',
    });

    expect(mockedWhere).toHaveBeenCalledWith('agendamentoId', '==', 'ag1');
    expect(mockedDeleteDoc).toHaveBeenCalledTimes(2);
    expect(mockedDeleteDoc).toHaveBeenCalledWith(apagados[0].ref);
    expect(mockedDeleteDoc).toHaveBeenCalledWith(apagados[1].ref);
  });

  it('cai no bloco inicial quando o agendamento é antigo (slots sem agendamentoId)', async () => {
    mockedGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockedDeleteDoc.mockResolvedValue(undefined);

    await liberarSlotsDoAgendamento({
      id: 'ag-antigo',
      barbeiroId: 'barbeiro1',
      data: '2026-07-20',
      horario: '09:00',
    });

    expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockedDoc).toHaveBeenCalledWith(
      expect.anything(),
      'ocupacoes',
      'barbeiro1_2026-07-20_09-00',
    );
  });

  it('não derruba o cancelamento se o Firestore recusar a limpeza', async () => {
    // O agendamento já foi cancelado no banco; falhar aqui só deixaria o
    // usuário achando que o cancelamento não funcionou.
    mockedGetDocs.mockRejectedValue(new Error('permission-denied'));

    await expect(
      liberarSlotsDoAgendamento({ id: 'ag1', barbeiroId: 'b1', data: '2026-07-20', horario: '09:00' }),
    ).resolves.toBeUndefined();

    // A falha deixou de ser silenciosa: o `console.warn` de antes (que em RN
    // de produção não chega a lugar nenhum) virou um evento consultável.
    expect(mockedRegistrarAviso).toHaveBeenCalled();
  });

  it('usa só o bloco inicial quando o agendamento nem tem id', async () => {
    mockedDeleteDoc.mockResolvedValue(undefined);
    await liberarSlotsDoAgendamento({
      barbeiroId: 'barbeiro1',
      data: '2026-07-20',
      horario: '09:00',
    });
    expect(mockedGetDocs).not.toHaveBeenCalled();
    expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
  });
});

describe('liberarSlot', () => {
  it('ignora chamadas sem dados suficientes em vez de apagar o documento errado', async () => {
    await liberarSlot(null, '2026-07-20', '09:00');
    await liberarSlot('barbeiro1', null, '09:00');
    await liberarSlot('barbeiro1', '2026-07-20', null);
    expect(mockedDeleteDoc).not.toHaveBeenCalled();
  });

  it('engole o erro do Firestore (o cancelamento em si já foi feito)', async () => {
    mockedDeleteDoc.mockRejectedValue(new Error('offline'));
    await expect(liberarSlot('b1', '2026-07-20', '09:00')).resolves.toBeUndefined();
  });
});

// ─── ARQ-05: telemetria da liberação de slots ───────────────────────────────
//
// Por que 'warning' e não 'error': o cancelamento que motivou a liberação já
// foi persistido e o resíduo é um slot órfão que `reconciliarSlotsOrfaos`
// limpa sozinho. E o volume é independente do que o usuário vê — um delete
// bloqueado gera um evento por bloco liberado enquanto todo cancelamento
// continua "dando certo" na tela; como 'error' isso encheria sozinho o
// gatilho de `alertarFalhasOperacionais` (5 error/fatal em 15 min → email)
// para um problema que já tem remédio automático rodando.
describe('OcupacaoService — telemetria das falhas de liberação (ARQ-05)', () => {
  it('liberarSlotsDoAgendamento: deleteDoc rejeitando registra AVISO e continua sem lançar', async () => {
    mockedGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        { ref: { path: 'ocupacoes/barbeiro1_2026-07-20_09-00' } },
        { ref: { path: 'ocupacoes/barbeiro1_2026-07-20_09-30' } },
      ],
    });
    mockedDeleteDoc.mockRejectedValue(new Error('permission-denied'));

    // Contrato ATUAL, que esta tarefa não muda: nunca lança.
    await expect(
      liberarSlotsDoAgendamento(AGENDAMENTO_COM_DADOS_PESSOAIS),
    ).resolves.toBeUndefined();

    expect(mockedRegistrarAviso).toHaveBeenCalledTimes(1);
    const [erro, contexto] = mockedRegistrarAviso.mock.calls[0];
    expect(erro).toBeInstanceOf(Error);
    expect(contexto).toMatchObject({
      area: 'ocupacao',
      operacao: 'liberar-slots-do-agendamento',
      agendamentoId: 'ag1',
      barbeiroId: 'barbeiro1',
      data: '2026-07-20',
      horario: '09:00',
    });
  });

  it('liberarSlot: deleteDoc rejeitando registra AVISO com area/operacao próprias', async () => {
    mockedDeleteDoc.mockRejectedValue(new Error('offline'));

    await expect(liberarSlot('barbeiro1', '2026-07-20', '09:00')).resolves.toBeUndefined();

    expect(mockedRegistrarAviso).toHaveBeenCalledTimes(1);
    expect(mockedRegistrarAviso.mock.calls[0][1]).toEqual({
      area: 'ocupacao',
      operacao: 'liberar-slot',
      barbeiroId: 'barbeiro1',
      data: '2026-07-20',
      horario: '09:00',
    });
  });

  // ─── A restrição mais fácil de violar sem perceber ───────────────────────
  //
  // `liberarSlotsDoAgendamento(ag)` recebe o agendamento INTEIRO. Um
  // `registrarAviso(erro, { ...ag })` — ou um `agendamento: ag` — pareceria
  // inofensivo na revisão e mandaria nome, email e telefone do cliente para
  // `eventosOperacionais`. A asserção é feita no contexto ANTES da
  // sanitização (o mock intercepta a chamada), de propósito: prova que o
  // ponto de chamada não entrega dado pessoal, em vez de confiar em
  // `sanitizacao.ts` como rede de segurança.
  it('NUNCA manda dado pessoal: o contexto não tem nome, email nem telefone', async () => {
    mockedGetDocs.mockRejectedValue(new Error('permission-denied'));

    await liberarSlotsDoAgendamento(AGENDAMENTO_COM_DADOS_PESSOAIS);

    const contexto = mockedRegistrarAviso.mock.calls[0][1];

    // 1) Lista fechada de campos — qualquer campo novo tem que ser decidido
    //    aqui, não descoberto em produção.
    expect(Object.keys(contexto).sort()).toEqual([
      'agendamentoId',
      'area',
      'barbeiroId',
      'data',
      'horario',
      'operacao',
    ]);

    // 2) Nenhuma chave de dado pessoal, em nenhum nível.
    ['clienteNome', 'clienteTelefone', 'cliente', 'clienteUid', 'barbeiroNome', 'barbeiroTelefone', 'servico']
      .forEach((chave) => expect(contexto).not.toHaveProperty(chave));

    // 3) E nenhum VALOR pessoal, mesmo que aninhado num campo de nome
    //    inofensivo — é o que uma serialização pega e a checagem de chave não.
    const serializado = JSON.stringify(contexto);
    expect(serializado).not.toContain('Zé da Esquina');
    expect(serializado).not.toContain('ze.da.esquina@example.com');
    expect(serializado).not.toContain('5511977776666');
    expect(serializado).not.toContain('João Barbeiro');
    expect(serializado).not.toContain('5511999999999');
  });

  it('telemetria caindo não derruba a liberação (o fluxo do usuário vem primeiro)', async () => {
    // Cenário real: `registrarAviso` só rejeita se alguém quebrar o
    // try/catch interno dela. Mesmo assim, o `.catch(() => {})` do ponto de
    // chamada é obrigatório — telemetria nunca pode virar causa de falha.
    mockedGetDocs.mockRejectedValue(new Error('permission-denied'));
    mockedRegistrarAviso.mockRejectedValue(new Error('telemetria fora do ar'));

    await expect(
      liberarSlotsDoAgendamento(AGENDAMENTO_COM_DADOS_PESSOAIS),
    ).resolves.toBeUndefined();

    mockedDeleteDoc.mockRejectedValue(new Error('offline'));
    await expect(liberarSlot('barbeiro1', '2026-07-20', '09:00')).resolves.toBeUndefined();
  });

  it('não registra nada quando a liberação funciona', async () => {
    mockedGetDocs.mockResolvedValue({
      empty: false,
      docs: [{ ref: { path: 'ocupacoes/barbeiro1_2026-07-20_09-00' } }],
    });
    mockedDeleteDoc.mockResolvedValue(undefined);

    await liberarSlotsDoAgendamento(AGENDAMENTO_COM_DADOS_PESSOAIS);

    expect(mockedRegistrarAviso).not.toHaveBeenCalled();
  });
});

describe('getHorariosOcupados', () => {
  it('devolve os horários da data consultada', async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [{ data: () => ({ horario: '09:00' }) }, { data: () => ({ horario: '10:30' }) }],
    });

    const horarios = await getHorariosOcupados('barbeiro1', '2026-07-20');

    expect(horarios).toEqual(['09:00', '10:30']);
    expect(mockedWhere).toHaveBeenCalledWith('barbeiroId', '==', 'barbeiro1');
    expect(mockedWhere).toHaveBeenCalledWith('data', '==', '2026-07-20');
  });

  it('não consulta o Firestore sem barbeiro ou sem data', async () => {
    expect(await getHorariosOcupados(null, '2026-07-20')).toEqual([]);
    expect(await getHorariosOcupados('barbeiro1', null)).toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });
});

describe('getOcupacoesPorPeriodo', () => {
  it('agrupa os horários por data para o calendário colorido', async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [
        { data: () => ({ data: '2026-07-20', horario: '09:00' }) },
        { data: () => ({ data: '2026-07-20', horario: '09:30' }) },
        { data: () => ({ data: '2026-07-21', horario: '14:00' }) },
      ],
    });

    const mapa = await getOcupacoesPorPeriodo('barbeiro1', '2026-07-20', '2026-07-26');

    expect(mapa).toEqual({
      '2026-07-20': ['09:00', '09:30'],
      '2026-07-21': ['14:00'],
    });
    expect(mockedWhere).toHaveBeenCalledWith('data', '>=', '2026-07-20');
    expect(mockedWhere).toHaveBeenCalledWith('data', '<=', '2026-07-26');
  });
});

describe('algumSlotOcupado', () => {
  it('devolve só os horários que já existem', async () => {
    mockedDoc.mockImplementation((_db: unknown, c: string, id: string) => ({ path: `${c}/${id}` }));
    mockedGetDoc
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true })
      .mockResolvedValueOnce({ exists: () => false });

    const ocupados = await algumSlotOcupado('barbeiro1', '2026-07-20', [
      '09:00',
      '09:30',
      '10:00',
    ]);

    expect(ocupados).toEqual(['09:30']);
  });
});

describe('HorarioIndisponivelError', () => {
  it('tem mensagem genérica quando não sabe qual bloco caiu', () => {
    expect(new HorarioIndisponivelError([]).message).toBe('Horário indisponível');
    expect(new HorarioIndisponivelError(['09:00']).message).toContain('09:00');
  });
});
