/**
 * Utilitários de status de agendamento.
 * Fonte única da verdade para labels e cores de status —
 * elimina a duplicação em ClienteHome, BarbeiroHome e HistoricoScreen.
 */
import type { StatusAgendamento } from '../types';

interface StatusInfo {
  label: string;
  color: string;
}

export const STATUS_MAP: Record<StatusAgendamento, StatusInfo> = {
  pendente:   { label: 'Pendente',   color: '#e07b00' }, // contraste 3.1:1 (UI component)
  confirmado: { label: 'Confirmado', color: '#27ae60' },
  concluido:  { label: 'Concluído',  color: '#8e44ad' },
  cancelado:  { label: 'Cancelado',  color: '#c0392b' }, // um pouco mais escuro que #e74c3c
  avaliado:   { label: 'Avaliado',   color: '#2471a3' }, // um pouco mais escuro que #2980b9
};

const fallback: StatusInfo = STATUS_MAP.pendente;

/** Retorna a cor de fundo do badge para um dado status. */
export const getStatusColor = (status?: string): string =>
  (STATUS_MAP[status as StatusAgendamento] ?? fallback).color;

/** Retorna o texto de exibição do status em português. */
export const getStatusText = (status?: string): string =>
  (STATUS_MAP[status as StatusAgendamento] ?? fallback).label;
