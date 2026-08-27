"use client";

/**
 * Ligação entre o catálogo de segmentos do núcleo e a interface.
 *
 * O núcleo (`@boramarca/core`) expõe funções puras — `getSegmentConfig`, `hasFeature`
 * e as labels. Este arquivo é o binding React, e por isso vive em `web/` e não no
 * pacote compartilhado, que não importa React (ADR 0005).
 *
 * Contexto React funciona igual em React Native. Se o aplicativo precisar do mesmo
 * provider, este arquivo graduará para um pacote React compartilhado. Duplicar trinta
 * linhas uma vez é mais barato que criar um terceiro pacote agora.
 *
 * REGRA: nenhuma tela consulta `businessType` diretamente. Ela pergunta ao segmento o
 * que fazer — `labels.professional`, `hasFeature("vehicles")` — e nunca ramifica por
 * tipo de negócio.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  getSegmentConfig,
  hasFeature as coreHasFeature,
  type BusinessType,
  type FeatureKey,
  type SegmentConfig,
} from "@boramarca/core";

/**
 * Sem sessão a interface roda como prévia demonstrativa, e os dados fabricados são
 * automotivos. O padrão explicita isso em vez de deixar a tela sem segmento —
 * mas é padrão de PRÉVIA, não do produto: com sessão, o tipo vem do banco.
 */
// Era `automotive_aesthetics`, e esse era o unico ponto do codigo onde uma categoria
// era PRESUMIDA em vez de lida. Com Barbeiro como a categoria de abertura, presumir a
// automotiva fazia o primeiro quadro pintar o shell errado para todo mundo.
const SEGMENTO_DA_PREVIA: BusinessType = "barbershop";

interface SegmentValue {
  readonly config: SegmentConfig;
  /** O nome da categoria: "Barbearia", "Salão de Beleza". Para dizer "a sua barbearia". */
  readonly label: string;
  readonly labels: SegmentConfig["labels"];
  readonly hasFeature: (feature: FeatureKey) => boolean;
  /** `true` quando o tipo veio do banco; `false` quando é o padrão da prévia. */
  readonly resolved: boolean;
}

/**
 * Resolve o segmento sem depender de contexto. Serve ao provider e também ao
 * componente que o renderiza — que não pode consumir o próprio contexto.
 */
export function resolveSegment(businessType: BusinessType | null): SegmentValue {
  const tipo = businessType ?? SEGMENTO_DA_PREVIA;
  const config = getSegmentConfig(tipo);

  return {
    config,
    label: config.label,
    labels: config.labels,
    hasFeature: (feature: FeatureKey) => coreHasFeature(tipo, feature),
    resolved: businessType !== null,
  };
}

const SegmentContext = createContext<SegmentValue | null>(null);

export function SegmentProvider({
  businessType,
  children,
}: {
  businessType: BusinessType | null;
  children: ReactNode;
}) {
  const value = useMemo(() => resolveSegment(businessType), [businessType]);

  return <SegmentContext.Provider value={value}>{children}</SegmentContext.Provider>;
}

export function useSegment(): SegmentValue {
  const value = useContext(SegmentContext);

  if (!value) {
    throw new Error("useSegment precisa estar dentro de <SegmentProvider>.");
  }

  return value;
}
