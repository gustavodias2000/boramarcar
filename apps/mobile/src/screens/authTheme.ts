/**
 * Paleta e copy compartilhadas pelas 3 telas do fluxo de entrada
 * (Welcome → Login → Register).
 *
 * Extraído de LoginScreen.tsx (que já definia a paleta fixa e escura do
 * login, independente do tema claro/escuro do resto do app) para que as
 * três telas fiquem visualmente consistentes sem duplicar os valores.
 */

// ─── Paleta fixa — fluxo de entrada sempre escuro ────────────────────────────
export const C = {
  bg:           '#0F1923',
  stripe:       'rgba(245,158,11,0.04)',
  card:         '#1A2735',
  cardBorder:   '#2A3F54',
  amber:        '#F59E0B',
  amberGlow:    'rgba(245,158,11,0.20)',
  amberDim:     'rgba(245,158,11,0.10)',
  amberShadow:  'rgba(245,158,11,0.45)',
  input:        '#1F3144',
  inputBorder:  '#2A3F54',
  text:         '#F8FAFC',
  textSec:      '#94A3B8',
  textMuted:    '#5C7A96',
  error:        '#EF4444',
  errorBg:      'rgba(239,68,68,0.10)',
  circle1:      'rgba(245,158,11,0.07)',
  circle2:      'rgba(245,158,11,0.04)',
  circle3:      'rgba(96,165,250,0.05)',
} as const;

// ─── Copy do manifesto — usado na tela de Boas-vindas ────────────────────────
// Migrado do hero que existia em LoginScreen.tsx; o texto não muda, só o
// lugar onde é exibido (agora é a WelcomeScreen quem mostra o hero).
export const HERO_MANIFESTO = 'Seu corte.\nNo seu tempo.';
export const HERO_SUBTITULO = 'Agende com seu barbeiro em poucos toques.';
