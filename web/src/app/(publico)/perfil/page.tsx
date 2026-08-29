import { Building2, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MARCA } from "@/core/marca";

export const metadata: Metadata = {
  title: "Como você vai usar",
};

/**
 * A bifurcação que faltava no produto.
 *
 * Até aqui só existia um caminho — quem entrava era tratado como empresário, e o cliente
 * final não tinha porta nenhuma, embora o vínculo dele já exista no banco desde a
 * Etapa 4 (`customer_links`).
 *
 * Server Component porque a decisão depende de saber se há sessão, e essa leitura tem
 * que ser autoritativa. `getUser()`, nunca `getSession()`: o segundo só lê armazenamento
 * local e serve para exibir nome, não para decidir.
 */
export default async function Perfil() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/entrar?proximo=/perfil");
  }

  return (
    <div className="perfil">
      <h1>Como você vai usar o {MARCA.nome}?</h1>
      <p className="perfil-sub">Dá para mudar depois — a escolha não tranca nada.</p>

      <div className="perfil-opcoes">
        <Link href="/segmento" className="perfil-card">
          <span className="perfil-icone" aria-hidden>
            <Building2 size={22} />
          </span>
          <strong>Empresário</strong>
          <span className="perfil-desc">
            Quero administrar meu negócio, profissionais, serviços e agendamentos.
          </span>
        </Link>

        {/*
          O caminho do cliente existe como porta, não como produto. A estrutura de banco
          está pronta desde a Etapa 4 — `customer_links` com vínculo determinístico — e a
          superfície não. Dizer isso no cartão é melhor que oferecer e frustrar.
        */}
        <div className="perfil-card perfil-card-breve" aria-disabled="true">
          <span className="perfil-icone" aria-hidden>
            <UserRound size={22} />
          </span>
          <strong>
            Cliente <span className="perfil-tag">em breve</span>
          </strong>
          <span className="perfil-desc">
            Quero encontrar empresas, profissionais e horários para agendar.
          </span>
          <span className="perfil-nota">
            Ainda não está no ar. Por enquanto, quem agenda é a própria empresa.
          </span>
        </div>
      </div>
    </div>
  );
}
