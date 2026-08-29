"use client";

import type { ReactNode } from "react";

import { SegmentProvider } from "@/core/segment";
import { useTenant } from "@/core/tenant";

/**
 * A ponte que tira o `SegmentProvider` de dentro do módulo automotivo.
 *
 * Ele era montado em `automotive-patio.tsx`, no meio do componente do Pátio. Duas
 * consequências, e as duas já tinham se materializado:
 *
 *   1. `/comecar` — a ÚNICA tela do produto onde a categoria é escolhida — ficava fora
 *      do provider e não conseguia ler rótulo nenhum;
 *   2. o próprio Pátio precisava chamar `resolveSegment(businessType)` à mão, porque um
 *      componente não consome o contexto que ele mesmo fornece. Esse `resolveSegment`
 *      duplicado era o sintoma que denunciava a causa.
 *
 * Existe como componente separado porque o layout é onde o provider precisa estar, e o
 * `businessType` só existe dentro do `TenantProvider` — que é cliente. Um layout de
 * servidor não pode ler contexto de cliente, então a ponte é esta.
 */
export function SegmentFromTenant({ children }: { children: ReactNode }) {
  const { businessType } = useTenant();
  return <SegmentProvider businessType={businessType}>{children}</SegmentProvider>;
}
