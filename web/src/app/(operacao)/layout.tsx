import type { ReactNode } from "react";

import { SegmentFromTenant } from "@/core/segment/from-tenant";
import { TenantProvider } from "@/core/tenant";

/**
 * Layout da operação.
 *
 * Sessão, unidade ativa, papel e tipo de negócio são carregados AQUI, uma vez, acima
 * das rotas. Antes viviam dentro do componente do Pátio, o que impedia navegar por
 * rota sem refazer tudo a cada troca de tela.
 *
 * E desde 26/08/2026 o SEGMENTO também. Ele era montado dentro de
 * `automotive-patio.tsx`, o que deixava `/comecar` — a única tela onde a categoria é
 * escolhida — fora do provider, sem conseguir ler rótulo nenhum. O núcleo estava
 * aninhado dentro do módulo; aqui ele volta para cima dele.
 */
export default function OperacaoLayout({ children }: { children: ReactNode }) {
  return (
    <TenantProvider>
      <SegmentFromTenant>{children}</SegmentFromTenant>
    </TenantProvider>
  );
}
