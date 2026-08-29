/**
 * agendaSlots — geração de horários disponíveis compartilhada entre o
 * agendamento do cliente (AgendamentoScreen) e o agendamento manual feito
 * pelo próprio barbeiro (AgendamentoManualScreen), além do cálculo de
 * disponibilidade usado no calendário colorido (CalendarioMensal).
 *
 * Extraído de AgendamentoScreen.tsx para evitar duas implementações
 * divergentes da mesma regra de negócio (item "Agendamento manual" do
 * comparativo com o Masters).
 */
import { toLocalDateString } from './dateUtils';
import type { ConfiguracaoAgenda, BloqueioHorario, DataISO } from '../types';

export function timeToMinutes(time: string): number {
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + (mm || 0);
}

export function minutesToTime(minutes: number): string {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Gera os slots de um bloco de horário simples (início/fim), respeitando a
 * duração do serviço, o buffer pós-atendimento e um intervalo de pausa
 * opcional (usado para o almoço no bloco principal).
 */
export function gerarSlotsBloco(
  inicio: string,
  fim: string,
  duracaoMinutos: number,
  buffer: number,
  pausaInicio: number | null = null,
  pausaFim: number | null = null,
): string[] {
  const slots: string[] = [];
  let current = timeToMinutes(inicio);
  const end = timeToMinutes(fim);

  while (current + duracaoMinutos <= end) {
    if (pausaInicio !== null && pausaFim !== null) {
      const slotFim = current + duracaoMinutos;
      if (current < pausaFim && slotFim > pausaInicio) {
        current = pausaFim;
        continue;
      }
    }
    slots.push(minutesToTime(current));
    current += duracaoMinutos + buffer;
  }
  return slots;
}

/**
 * Gera os slots disponíveis com base na configuração do barbeiro e duração do
 * serviço: bloco principal (respeitando o intervalo de almoço) e, se
 * configurado, um segundo bloco — "turno extra" (ex.: período noturno).
 */
export function gerarSlots(config: ConfiguracaoAgenda, duracaoMinutos: number): string[] {
  const buffer = config.intervaloAposAtendimentoMinutos || 0;

  const almocoInicio = config.almocoInicio ? timeToMinutes(config.almocoInicio) : null;
  const almocoFim = config.almocoFim ? timeToMinutes(config.almocoFim) : null;

  const slots = gerarSlotsBloco(
    config.horaInicio,
    config.horaFim,
    duracaoMinutos,
    buffer,
    almocoInicio,
    almocoFim,
  );

  if (config.turnoExtraAtivo && config.turnoExtraInicio && config.turnoExtraFim) {
    slots.push(
      ...gerarSlotsBloco(config.turnoExtraInicio, config.turnoExtraFim, duracaoMinutos, buffer),
    );
  }

  return slots;
}

/**
 * Retorna os próximos N dias que estão dentro do período permitido
 * (antecedenciaMaximaDias) e nos dias de atendimento configurados,
 * excluindo datas marcadas como folga pelo barbeiro.
 */
export function getDatesDisponiveis(
  config: ConfiguracaoAgenda,
  datasBloqueadas: string[] = [],
): Array<{ date: string; display: string }> {
  const result: Array<{ date: string; display: string }> = [];
  const hoje = new Date();
  const maxDias = config.antecedenciaMaximaDias || 30;
  const bloqueadas = new Set(datasBloqueadas);

  for (let i = 0; i <= maxDias; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const diaSemana = d.getDay();
    if (!config.diasAtendimento.includes(diaSemana)) continue;

    const dateStr = toLocalDateString(d);
    if (bloqueadas.has(dateStr)) continue;

    const display = d.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
    result.push({ date: dateStr, display });
  }
  return result;
}

/**
 * Remove da lista de slots qualquer horário cujo intervalo (considerando a
 * duração do serviço) se sobreponha a um bloqueio de "evento pessoal" do
 * barbeiro naquele dia (ex.: consulta médica das 14h às 15h).
 */
export function filtrarBloqueiosHorario(
  slots: string[],
  duracaoMinutos: number,
  data: DataISO,
  bloqueios: BloqueioHorario[] = [],
): string[] {
  const bloqueiosDoDia = bloqueios.filter((b) => b.data === data);
  if (bloqueiosDoDia.length === 0) return slots;

  return slots.filter((slot) => {
    const slotInicio = timeToMinutes(slot);
    const slotFim = slotInicio + duracaoMinutos;
    return !bloqueiosDoDia.some((b) => {
      const bInicio = timeToMinutes(b.horaInicio);
      const bFim = timeToMinutes(b.horaFim);
      return slotInicio < bFim && slotFim > bInicio;
    });
  });
}

/**
 * Verifica se um horário já passou, considerando a antecedência mínima do
 * barbeiro. Usado tanto na tela do cliente quanto no agendamento manual.
 */
export function isTimeInPast(
  horario: string,
  selectedDate: string,
  todayStr: string,
  antecedenciaMinutos: number,
): boolean {
  if (selectedDate !== todayStr) return false;
  const [hh, mm] = horario.split(':').map(Number);
  const now = new Date();
  const slotMs = (hh * 60 + mm) * 60 * 1000;
  // `??` (não `||`): 0 é um valor explícito e válido ("sem restrição" —
  // ver src/types.ts), não pode cair no fallback de 30min como se fosse
  // undefined/null (config legada sem o campo).
  const buffer = antecedenciaMinutos ?? 30;
  const nowMs = (now.getHours() * 60 + now.getMinutes() + buffer) * 60 * 1000;
  return slotMs <= nowMs;
}

/**
 * Do total de slots possíveis num dia (config + duração média de 30min),
 * calcula quantos "sub-slots" de 30 min existem — usado para estimar se um
 * dia está lotado no calendário colorido, sem precisar simular todos os
 * serviços possíveis.
 */
export function contarSubSlotsDoDia(config: ConfiguracaoAgenda): number {
  const slots30 = gerarSlots(config, 30);
  return slots30.length;
}

export interface SlotsPorPeriodo {
  manha: string[];
  tarde: string[];
  noite: string[];
}

/**
 * Agrupa uma lista de horários (já filtrada e ordenada) em Manhã (antes de
 * 12:00), Tarde (12:00–17:59) e Noite (18:00 em diante) — Fase 2 do plano de
 * design (grade de horários por período em vez de uma lista solta). Preserva
 * a ordem cronológica dentro de cada grupo, já que `slots` chega ordenado.
 */
export function agruparPorPeriodo(slots: string[]): SlotsPorPeriodo {
  const resultado: SlotsPorPeriodo = { manha: [], tarde: [], noite: [] };
  for (const slot of slots) {
    const minutos = timeToMinutes(slot);
    if (minutos < 12 * 60) resultado.manha.push(slot);
    else if (minutos < 18 * 60) resultado.tarde.push(slot);
    else resultado.noite.push(slot);
  }
  return resultado;
}
