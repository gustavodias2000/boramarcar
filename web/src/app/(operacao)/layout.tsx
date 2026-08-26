import type { ReactNode } from "react";

import { TenantProvider } from "@/core/tenant";

/**
 * Layout da operação.
 *
 * Sessão, unidade ativa, papel e tipo de negócio são carregados AQUI, uma vez, acima
 * das rotas. Antes viviam dentro do componente do Pátio, o que impedia navegar por
 * rota sem refazer tudo a cada troca de tela.
 */
export default function OperacaoLayout({ children }: { children: ReactNode }) {
  return <TenantProvider>{children}</TenantProvider>;
}
