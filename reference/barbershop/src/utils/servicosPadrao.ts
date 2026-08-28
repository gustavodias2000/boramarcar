/**
 * Catálogo de serviços sugeridos para barbearia — usado no wizard de
 * configuração pós-cadastro (SetupBarbeiroScreen) e como ponto de partida
 * em ConfigServicosScreen quando o barbeiro ainda não cadastrou nada.
 *
 * Inspirado no padrão de "serviços sugeridos por segmento" visto no
 * onboarding de concorrentes (Gendo) — elimina a tela em branco do
 * primeiro cadastro de serviço.
 */
import type { ServicoBarbeiro } from '../types';

/** IDs dos serviços pré-selecionados por padrão no wizard (os mais comuns). */
export const SERVICOS_SUGERIDOS_PADRAO_IDS = ['corte', 'barba', 'corte_barba'];

export const SERVICOS_SUGERIDOS: ServicoBarbeiro[] = [
  { id: 'corte', nome: 'Corte', duracaoMinutos: 30, precoEmCentavos: 3000 },
  { id: 'barba', nome: 'Barba', duracaoMinutos: 30, precoEmCentavos: 2000 },
  { id: 'corte_barba', nome: 'Corte & Barba', duracaoMinutos: 60, precoEmCentavos: 4500 },
  { id: 'sobrancelha', nome: 'Sobrancelha', duracaoMinutos: 15, precoEmCentavos: 1500 },
  { id: 'corte_infantil', nome: 'Corte Infantil', duracaoMinutos: 30, precoEmCentavos: 2500 },
  { id: 'luzes', nome: 'Luzes / Coloração', duracaoMinutos: 90, precoEmCentavos: 8000 },
  { id: 'pezinho', nome: 'Pézinho (acabamento)', duracaoMinutos: 15, precoEmCentavos: 1500 },
];

/** Lista inicial pré-marcada para o wizard: os 3 serviços mais comuns. */
export function getServicosPreSelecionados(): ServicoBarbeiro[] {
  return SERVICOS_SUGERIDOS.filter((s) => SERVICOS_SUGERIDOS_PADRAO_IDS.includes(s.id));
}
