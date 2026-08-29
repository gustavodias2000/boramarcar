"use client";

/**
 * Abertura de empresa.
 *
 * Era o bloqueador absoluto documentado no README: sem uma linha em `businesses` e
 * outra em `business_members`, a aplicação inteira travava em "Conta sem unidade
 * ativa", e a única saída era rodar SQL à mão.
 *
 * É também aqui que o §9 do Contexto Mestre finalmente acontece: o empresário informa
 * o segmento e o sistema adapta recursos, nomenclatura, menus e serviços sugeridos.
 * Esta tela é o único lugar do produto onde a categoria é ESCOLHIDA — em todos os
 * outros ela é consultada.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, CircleAlert, Loader2, Sparkles } from "lucide-react";

import { BUSINESS_TYPES, SEGMENT_CONFIGS, type BusinessType } from "@boramarca/core";

import { useTenant } from "@/core/tenant";
import { createClient, hasSupabaseConfiguration } from "@/lib/supabase/client";

interface ServicoSugerido {
  name: string;
  duration_minutes: number;
}

export function BusinessOnboarding() {
  const router = useRouter();
  const { access, reload } = useTenant();

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("barbershop");
  const [sugestoes, setSugestoes] = useState<ServicoSugerido[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const categorias = useMemo(
    () => BUSINESS_TYPES.map((tipo) => ({ tipo, label: SEGMENT_CONFIGS[tipo].label })),
    [],
  );

  // O catálogo que a empresa vai receber, mostrado antes de confirmar. Escolher a
  // categoria deixa de ser um palpite: dá para ver o que vem junto.
  useEffect(() => {
    if (!hasSupabaseConfiguration()) return;

    let cancelado = false;

    async function carregarSugestoes(tipo: BusinessType) {
      const supabase = createClient();
      const { data } = await supabase
        .from("segment_default_services")
        .select("name, duration_minutes")
        .eq("business_type", tipo)
        .order("display_order", { ascending: true });

      if (!cancelado) setSugestoes((data ?? []) as ServicoSugerido[]);
    }

    void carregarSugestoes(businessType);

    return () => {
      cancelado = true;
    };
  }, [businessType]);

  async function abrirEmpresa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    if (name.trim().length < 2) {
      setErro("Informe o nome da empresa.");
      return;
    }

    setIsSaving(true);
    setErro(null);

    const supabase = createClient();
    const { error } = await supabase.rpc("create_business_with_owner", {
      p_name: name.trim(),
      p_business_type: businessType,
    });

    setIsSaving(false);

    if (error) {
      setErro(error.message);
      return;
    }

    // O contexto recarrega e a interface passa a falar a língua da categoria.
    reload();
    router.replace("/conta");
  }

  if (!hasSupabaseConfiguration()) {
    return (
      <section className="account-state">
        <CircleAlert size={25} />
        <h1>Prévia demonstrativa</h1>
        <p>
          Configure <code>.env.local</code> com as chaves públicas do Supabase para abrir uma
          empresa de verdade.
        </p>
      </section>
    );
  }

  if (access === "unauthenticated") {
    return (
      <section className="account-state">
        <CircleAlert size={25} />
        <h1>Entre para começar</h1>
        <p>Faça login em Conta e acesso antes de abrir sua empresa.</p>
      </section>
    );
  }

  return (
    <section className="account-workspace">
      <header className="account-heading">
        <div>
          <h1>Abrir sua empresa</h1>
          <p>
            A categoria define os recursos, a nomenclatura e os serviços que já vêm cadastrados. Ela
            pode ser ajustada depois, mas muda a cara do sistema desde o primeiro acesso.
          </p>
        </div>
      </header>

      <form className="account-form" onSubmit={abrirEmpresa}>
        <label>
          <span>Nome da empresa</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Barbearia do Centro"
            maxLength={160}
            required
          />
        </label>

        <label>
          <span>Qual é o seu tipo de negócio?</span>
          <select
            value={businessType}
            onChange={(event) => setBusinessType(event.target.value as BusinessType)}
          >
            {categorias.map(({ tipo, label }) => (
              <option key={tipo} value={tipo}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {sugestoes.length > 0 && (
          <div className="onboarding-preview">
            <p>
              <Sparkles size={15} /> {sugestoes.length} serviços já entram cadastrados, com a
              duração típica. Os preços ficam zerados — só você sabe quanto cobrar.
            </p>
            <ul>
              {sugestoes.map((servico) => (
                <li key={servico.name}>
                  {servico.name} <small>{servico.duration_minutes} min</small>
                </li>
              ))}
            </ul>
          </div>
        )}

        {erro && (
          <p className="account-error" role="alert">
            <CircleAlert size={15} /> {erro}
          </p>
        )}

        <button type="submit" className="primary-button" disabled={isSaving}>
          {isSaving ? <Loader2 size={16} className="spin" /> : <Building2 size={16} />}
          <span>{isSaving ? "Abrindo…" : "Abrir empresa"}</span>
        </button>
      </form>
    </section>
  );
}
