/**
 * agendaSlots é a lógica que decide quais horários um cliente (ou o
 * barbeiro, no agendamento manual) pode escolher — é o núcleo anti-conflito
 * da agenda. Testado isoladamente (sem Firestore) porque é 100% puro.
 */
import {
  timeToMinutes,
  minutesToTime,
  gerarSlotsBloco,
  gerarSlots,
  getDatesDisponiveis,
  filtrarBloqueiosHorario,
  isTimeInPast,
  contarSubSlotsDoDia,
  agruparPorPeriodo,
} from '../../src/utils/agendaSlots';
import type { ConfiguracaoAgenda, BloqueioHorario } from '../../src/types';

const CONFIG_PADRAO: ConfiguracaoAgenda = {
  horaInicio: '09:00',
  horaFim: '12:00',
  almocoInicio: '',
  almocoFim: '',
  antecedenciaMinutos: 30,
  antecedenciaMaximaDias: 30,
  diasAtendimento: [1, 2, 3, 4, 5, 6],
};

describe('timeToMinutes / minutesToTime', () => {
  it('converte HH:mm para minutos e volta', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('00:00')).toBe(0);
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(0)).toBe('00:00');
  });
});

describe('gerarSlotsBloco', () => {
  it('gera slots consecutivos respeitando a duração', () => {
    const slots = gerarSlotsBloco('09:00', '10:00', 30, 0);
    expect(slots).toEqual(['09:00', '09:30']);
  });

  it('aplica o buffer de descanso pós-atendimento', () => {
    const slots = gerarSlotsBloco('09:00', '10:30', 30, 15);
    // 09:00 -> +30min serviço +15min buffer = próximo em 09:45
    expect(slots).toEqual(['09:00', '09:45']);
  });

  it('pula a pausa (almoço) quando o slot se sobrepõe a ela', () => {
    const slots = gerarSlotsBloco('11:00', '14:00', 60, 0, timeToMinutes('12:00'), timeToMinutes('13:00'));
    expect(slots).toEqual(['11:00', '13:00']);
  });

  it('não gera slot que ultrapasse o horário de fim', () => {
    const slots = gerarSlotsBloco('09:00', '10:00', 45, 0);
    expect(slots).toEqual(['09:00']);
  });
});

describe('gerarSlots', () => {
  it('gera slots do bloco principal', () => {
    expect(gerarSlots(CONFIG_PADRAO, 60)).toEqual(['09:00', '10:00', '11:00']);
  });

  it('respeita o intervalo de almoço quando configurado', () => {
    const config = { ...CONFIG_PADRAO, horaFim: '14:00', almocoInicio: '12:00', almocoFim: '13:00' };
    const slots = gerarSlots(config, 60);
    expect(slots).not.toContain('12:00');
    expect(slots).toEqual(['09:00', '10:00', '11:00', '13:00']);
  });

  it('inclui o turno extra quando ativo, sem misturar com o bloco principal', () => {
    const config: ConfiguracaoAgenda = {
      ...CONFIG_PADRAO,
      turnoExtraAtivo: true,
      turnoExtraInicio: '19:00',
      turnoExtraFim: '21:00',
    };
    const slots = gerarSlots(config, 60);
    expect(slots).toEqual(['09:00', '10:00', '11:00', '19:00', '20:00']);
  });

  it('não gera nada se o turno extra estiver desativado', () => {
    const config: ConfiguracaoAgenda = {
      ...CONFIG_PADRAO,
      turnoExtraAtivo: false,
      turnoExtraInicio: '19:00',
      turnoExtraFim: '21:00',
    };
    expect(gerarSlots(config, 60)).toEqual(['09:00', '10:00', '11:00']);
  });
});

describe('contarSubSlotsDoDia', () => {
  it('conta os sub-slots de 30min do dia (usado pelo calendário colorido)', () => {
    // 09:00-12:00 = 3h = 6 sub-slots de 30min
    expect(contarSubSlotsDoDia(CONFIG_PADRAO)).toBe(6);
  });

  it('retorna 0 quando não há janela de atendimento válida', () => {
    const config = { ...CONFIG_PADRAO, horaInicio: '09:00', horaFim: '09:00' };
    expect(contarSubSlotsDoDia(config)).toBe(0);
  });
});

describe('getDatesDisponiveis', () => {
  it('só inclui dias presentes em diasAtendimento', () => {
    const config: ConfiguracaoAgenda = { ...CONFIG_PADRAO, diasAtendimento: [1, 3], antecedenciaMaximaDias: 14 };
    const dates = getDatesDisponiveis(config);
    dates.forEach(({ date }) => {
      const diaSemana = new Date(`${date}T12:00:00`).getDay();
      expect([1, 3]).toContain(diaSemana);
    });
  });

  it('exclui datas bloqueadas (folga)', () => {
    const config: ConfiguracaoAgenda = { ...CONFIG_PADRAO, diasAtendimento: [0, 1, 2, 3, 4, 5, 6], antecedenciaMaximaDias: 5 };
    const semBloqueio = getDatesDisponiveis(config);
    const [primeiraData] = semBloqueio;
    const comBloqueio = getDatesDisponiveis(config, [primeiraData.date]);
    expect(comBloqueio.find((d) => d.date === primeiraData.date)).toBeUndefined();
  });

  it('respeita o limite de antecedência máxima', () => {
    const config: ConfiguracaoAgenda = { ...CONFIG_PADRAO, diasAtendimento: [0, 1, 2, 3, 4, 5, 6], antecedenciaMaximaDias: 3 };
    const dates = getDatesDisponiveis(config);
    expect(dates.length).toBeLessThanOrEqual(4); // hoje + 3 dias
  });
});

describe('filtrarBloqueiosHorario — bloqueio de horário específico (evento pessoal)', () => {
  const bloqueios: BloqueioHorario[] = [
    { id: '1', data: '2026-08-10', horaInicio: '14:00', horaFim: '15:00' },
  ];

  it('remove slots que se sobrepõem ao bloqueio', () => {
    const slots = ['13:00', '13:30', '14:00', '14:30', '15:00'];
    const resultado = filtrarBloqueiosHorario(slots, 30, '2026-08-10', bloqueios);
    expect(resultado).toEqual(['13:00', '13:30', '15:00']);
  });

  it('não afeta slots de outro dia', () => {
    const slots = ['14:00', '14:30'];
    const resultado = filtrarBloqueiosHorario(slots, 30, '2026-08-11', bloqueios);
    expect(resultado).toEqual(slots);
  });

  it('considera a duração do serviço, não só o horário de início', () => {
    // Serviço de 90min às 13:00 termina 14:30 — invade o bloqueio das 14h-15h
    const slots = ['13:00'];
    const resultado = filtrarBloqueiosHorario(slots, 90, '2026-08-10', bloqueios);
    expect(resultado).toEqual([]);
  });

  it('retorna a lista original quando não há bloqueios no dia', () => {
    const slots = ['09:00', '10:00'];
    expect(filtrarBloqueiosHorario(slots, 30, '2026-08-10', [])).toEqual(slots);
  });
});

describe('isTimeInPast', () => {
  it('nunca considera passado um dia diferente de hoje', () => {
    expect(isTimeInPast('00:00', '2020-01-01', '2026-07-23', 30)).toBe(false);
  });

  // Regressão: antecedenciaMinutos = 0 ("sem restrição", ver src/types.ts)
  // é falsy em JS — `antecedenciaMinutos || 30` trocava silenciosamente o
  // 0 explícito pelo buffer de 30min, escondendo do cliente horários que o
  // servidor (criarAgendamentoSeguro) aceitaria de boa. Fixamos o relógio
  // pra não depender de que horário real os testes rodam (evita flakiness
  // perto da virada de hora/dia).
  describe('antecedenciaMinutos = 0 explícito não pode virar o fallback de 30min', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-07T10:00:00'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('com antecedenciaMinutos = 0, um horário poucos minutos à frente NÃO é considerado passado', () => {
      // 10:05, 5min depois de "agora" (10:00) — dentro dos 30min que o bug
      // antigo bloquearia, mas fora de qualquer restrição real (0 = sem restrição).
      expect(isTimeInPast('10:05', 'hoje', 'hoje', 0)).toBe(false);
    });

    it('com antecedenciaMinutos ausente (undefined/legado), preserva o buffer antigo de 30min', () => {
      const antecedenciaAusente = undefined as unknown as number;
      // 10:05 ainda cai dentro do buffer de 30min (10:00 + 30min = 10:30) —
      // comportamento legado preservado quando o campo não veio configurado.
      expect(isTimeInPast('10:05', 'hoje', 'hoje', antecedenciaAusente)).toBe(true);
    });
  });
});

describe('agruparPorPeriodo', () => {
  it('separa horários em manhã (<12:00), tarde (12:00–17:59) e noite (>=18:00)', () => {
    const slots = ['08:00', '09:30', '11:59', '12:00', '14:00', '17:59', '18:00', '20:30'];
    expect(agruparPorPeriodo(slots)).toEqual({
      manha: ['08:00', '09:30', '11:59'],
      tarde: ['12:00', '14:00', '17:59'],
      noite: ['18:00', '20:30'],
    });
  });

  it('preserva a ordem cronológica de entrada dentro de cada grupo', () => {
    const slots = ['09:00', '08:00', '10:00'];
    expect(agruparPorPeriodo(slots).manha).toEqual(['09:00', '08:00', '10:00']);
  });

  it('grupo vazio quando não há horário no período', () => {
    expect(agruparPorPeriodo(['09:00'])).toEqual({
      manha: ['09:00'],
      tarde: [],
      noite: [],
    });
  });

  it('lista vazia retorna os três grupos vazios', () => {
    expect(agruparPorPeriodo([])).toEqual({ manha: [], tarde: [], noite: [] });
  });
});
