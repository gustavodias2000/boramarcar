import { getSegmentPalette, type BusinessType, type SegmentPalette } from "@boramarca/core";
import { StyleSheet } from "react-native";

/**
 * A linguagem visual vem do Barbershop, agora desacoplada do seu backend e
 * vocabulário. O app começa escuro porque é usado no balcão e em trânsito.
 *
 * O QUE É DO PRODUTO E O QUE É DA CATEGORIA. Tudo abaixo — o azul-profundo, os cinzas do
 * texto, as cores de erro e sucesso — é do Bora Marcá e não muda de categoria para
 * categoria. É o que faz uma manicure e uma barbearia parecerem o mesmo aplicativo.
 *
 * O ACENTO NÃO ESTÁ AQUI. Ele vem de `@boramarca/core`, uma paleta por segmento, e chega
 * às telas por `useAccent()`. Os campos `amber*` continuam existindo porque a barbearia
 * é o padrão e porque estilo estático do React Native não pode depender de contexto —
 * quem carrega acento sobrescreve a cor na hora de desenhar.
 */
export const colors = {
  background: "#0C141C",
  surface: "#172431",
  surfaceRaised: "#232E39",
  field: "#1F3144",
  border: "#2A3F54",
  borderStrong: "#49627A",
  text: "#F8FAFC",
  textSecondary: "#B5C1CF",
  muted: "#7D93A8",
  amber: "#F59E0B",
  amberSoft: "#3A2A0F",
  amberLight: "#FCD34D",
  onAmber: "#0C141C",
  success: "#34D399",
  danger: "#FB7185",
  info: "#60A5FA",
  white: "#FFFFFF",
} as const;

/**
 * A categoria assumida antes de existir uma empresa ativa.
 *
 * As telas de entrada — boas-vindas, papel, login — acontecem antes de o aplicativo
 * saber de que ramo é quem está entrando. Elas usam o âmbar, que é a cor com que o
 * produto se apresenta hoje. Não é fallback por descuido: é a identidade do Bora Marcá
 * enquanto ele não sabe com quem está falando.
 */
export const DEFAULT_SEGMENT: BusinessType = "barbershop";

export function accentFor(segment: BusinessType | null | undefined): SegmentPalette {
  return getSegmentPalette(segment ?? DEFAULT_SEGMENT);
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, hero: 48 } as const;
export const radius = { chip: 8, input: 12, card: 16, modal: 24, round: 999 } as const;
export const type = {
  display: { fontSize: 36, lineHeight: 40, fontWeight: "800" as const, letterSpacing: -1.1 },
  title: { fontSize: 26, lineHeight: 31, fontWeight: "800" as const, letterSpacing: -0.55 },
  subtitle: { fontSize: 20, lineHeight: 25, fontWeight: "700" as const, letterSpacing: -0.25 },
  body: { fontSize: 16, lineHeight: 23 },
  label: { fontSize: 14, lineHeight: 19, fontWeight: "700" as const },
  micro: { fontSize: 12, lineHeight: 16, fontWeight: "700" as const },
} as const;

export const elevation = StyleSheet.create({
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 7,
  },
  primary: {
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 7,
  },
});

export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function asStartAt(date: string, time: string): string {
  return `${date}T${time}:00-03:00`;
}

export function shortDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
    .format(new Date(`${value}T12:00:00`))
    .replace(".", "");
}

export function timeOf(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
