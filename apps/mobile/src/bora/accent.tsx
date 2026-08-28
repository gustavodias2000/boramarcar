import type { BusinessType, SegmentPalette } from "@boramarca/core";
import React, { createContext, useContext, useMemo, type ReactNode } from "react";

import { accentFor, DEFAULT_SEGMENT } from "./theme";

/**
 * O acento da categoria ativa, disponível para qualquer tela.
 *
 * POR QUE CONTEXTO E NÃO PROP. O acento aparece em toda peça compartilhada — botão
 * principal, rótulo de campo, linha selecionada, chip de status, ícone de estado vazio.
 * Passar por prop obrigaria cada tela a repassar uma cor que ela não decide, e a primeira
 * que esquecesse ficaria âmbar dentro de uma manicure, silenciosamente.
 *
 * POR QUE NÃO ENTRA NO `StyleSheet`. `StyleSheet.create` é estático e resolvido na carga
 * do módulo, antes de existir empresa ativa. Estrutura — espaçamento, raio, altura, cor
 * neutra — continua lá, e só a cor de acento é aplicada na hora de desenhar. Isso
 * mantém uma folha de estilo só, em vez de uma por categoria.
 *
 * `SegmentPreview` existe para a tela de abertura de empresa: quem toca em "Manicure"
 * precisa ver o violeta antes de confirmar, não depois.
 */
const AccentContext = createContext<SegmentPalette>(accentFor(DEFAULT_SEGMENT));

export function AccentProvider({
  segment,
  children,
}: {
  readonly segment: BusinessType | null | undefined;
  readonly children: ReactNode;
}) {
  const palette = useMemo(() => accentFor(segment), [segment]);
  return <AccentContext.Provider value={palette}>{children}</AccentContext.Provider>;
}

/** Prévia local: pinta uma parte da tela com o acento de outra categoria. */
export function SegmentPreview({
  segment,
  children,
}: {
  readonly segment: BusinessType;
  readonly children: ReactNode;
}) {
  return <AccentProvider segment={segment}>{children}</AccentProvider>;
}

export function useAccent(): SegmentPalette {
  return useContext(AccentContext);
}
