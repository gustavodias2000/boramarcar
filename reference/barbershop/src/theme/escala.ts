/**
 * escala — vocabulário visual único do app (Fase 1, BRIEFING-FASE-1.md).
 *
 * Antes desta fase: 24 valores distintos de `fontSize` (10 a 64) e 16 de
 * `borderRadius` (2 a 999), sem nenhuma lógica — ruído, não hierarquia.
 * Daqui pra frente, toda tela usa só os valores abaixo. Nenhum número solto
 * de fonte/raio/espaçamento fora daqui.
 */

// ─── Tipografia ──────────────────────────────────────────────────────────────
// 7 níveis. `corpo` (16) é o mínimo em mobile — abaixo disso o iOS aplica
// zoom automático ao focar um campo de texto.
export const tipografia = {
  display: { fontSize: 32, fontWeight: '700' as const },
  titulo: { fontSize: 24, fontWeight: '700' as const },
  subtitulo: { fontSize: 20, fontWeight: '600' as const },
  corpoForte: { fontSize: 16, fontWeight: '600' as const },
  corpo: { fontSize: 16, fontWeight: '400' as const },
  apoio: { fontSize: 14, fontWeight: '400' as const },
  micro: { fontSize: 12, fontWeight: '500' as const },
};

export type TokenTipografia = keyof typeof tipografia;

// ─── Raio ────────────────────────────────────────────────────────────────────
export const raio = {
  chip: 6,
  input: 10,
  card: 14,
  modal: 20,
  circulo: 999,
};

export type TokenRaio = keyof typeof raio;

// ─── Espaçamento ─────────────────────────────────────────────────────────────
// Escala de 4pt. Qualquer margin/padding/gap novo usa um destes valores.
export const espacamento = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export type TokenEspacamento = keyof typeof espacamento;
