import type { Metadata } from "next";
import { Suspense } from "react";

import { FormularioDeEntrada } from "@/components/landing/formulario-de-entrada";

export const metadata: Metadata = {
  title: "Entrar",
};

/**
 * A entrada do produto, finalmente com rota própria.
 *
 * Antes o login era um `<form>` dentro de `automotive-profile.tsx`, alcançável só por
 * `/conta` — que por sua vez era renderizada pelo componente do Pátio. Para entrar no
 * produto, a pessoa atravessava a tela de uma categoria que talvez não fosse a dela.
 */
export default function Entrar() {
  return (
    <div className="ent">
      <div className="ent-caixa">
        <h1>Entrar</h1>
        <p className="ent-sub">Acesse a sua empresa.</p>

        <Suspense fallback={<div className="ent-espera" aria-hidden />}>
          <FormularioDeEntrada />
        </Suspense>
      </div>
    </div>
  );
}
