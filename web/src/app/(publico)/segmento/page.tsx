import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CATALOGO } from "@boramarca/core";

export const metadata: Metadata = {
  title: "Escolha seu segmento",
};

/**
 * O seletor de segmento.
 *
 * A lista vem de `CATALOGO`, no núcleo compartilhado — nenhum nome de categoria é
 * escrito nesta tela. Acrescentar uma categoria é acrescentar um objeto lá; abrir uma
 * que está "em breve" é trocar um `false` por `true` e apontar o `businessType`.
 *
 * Nenhuma categoria indisponível vira link. Cartão que parece clicável e não leva a
 * lugar nenhum é pior que cartão declaradamente fechado.
 */
export default async function Segmento() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/entrar?proximo=/segmento");
  }

  return (
    <div className="seg">
      <h1>Escolha seu segmento</h1>
      <p className="seg-sub">
        O sistema se adapta ao seu ramo: muda os nomes, as telas e o catálogo inicial de serviços.
      </p>

      <ul className="seg-grade">
        {CATALOGO.map((categoria) => {
          const conteudo = (
            <>
              <span className="seg-nome">
                {categoria.nome}
                {categoria.disponivel ? (
                  <span className="seg-tag seg-tag-on">
                    <Check size={12} aria-hidden />
                    Disponível
                  </span>
                ) : (
                  <span className="seg-tag">Em breve</span>
                )}
              </span>
              <span className="seg-desc">{categoria.descricao}</span>
            </>
          );

          return (
            <li key={categoria.id}>
              {categoria.disponivel ? (
                <Link href={`/comecar?segmento=${categoria.id}`} className="seg-card seg-card-on">
                  {conteudo}
                </Link>
              ) : (
                <div className="seg-card" aria-disabled="true">
                  {conteudo}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="seg-rodape">
        Já tem empresa aberta? <Link href="/inicio">Ir para o seu negócio</Link>.
      </p>
    </div>
  );
}
