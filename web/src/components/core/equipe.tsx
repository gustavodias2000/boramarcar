"use client";

import { CircleAlert, Loader2, Plus, Power, Scissors } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { useSegment } from "@/core/segment";
import { useTenant } from "@/core/tenant";
import { createClient } from "@/lib/supabase/client";
import { can, type BusinessRole } from "@boramarca/core";

/**
 * Equipe — portada da `EquipeScreen` do Barbershop, com a `ComissoesScreen` junto.
 *
 * A descoberta que faz esta tela funcionar: `professionals.business_member_id` é
 * NULÁVEL. Dá para cadastrar "João" como barbeiro sem João ter conta — que é
 * exatamente como uma barbearia trabalha. Convite com login é outro assunto, não
 * existe ainda, e a tela diz isso em vez de fingir.
 *
 * DISPONIBILIDADE PADRÃO NO CADASTRO. Sem regra de horário, o profissional novo nasce
 * inagendável: a agenda recusa tudo. É o mesmo bloqueador que `create_business_with_owner`
 * já resolve para o dono, e repeti-lo aqui é o que evita o "cadastrei e não aparece".
 *
 * DESLIGAR É RPC, não DELETE. `deactivate_professional` recusa quem tem atendimento
 * futuro — desligar alguém com agenda marcada deixaria clientes esperando por quem não
 * vem — e grava a trilha.
 */

interface Profissional {
  id: string;
  name: string;
  active: boolean;
  commission_kind: "percent" | "fixed" | null;
  commission_percent: number | null;
  commission_amount: number | null;
}

export function CoreEquipe() {
  const { tenantId, mode, membershipRole } = useTenant();
  const segment = useSegment();
  const supabase = createClient();

  const [equipe, setEquipe] = useState<Profissional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const aoVivo = mode === "live";
  const podeAdministrar = can(membershipRole as BusinessRole | null, "manageCatalog");

  async function recarregar(unidade: string) {
    const { data, error } = await supabase
      .from("professionals")
      .select("id, name, active, commission_kind, commission_percent, commission_amount")
      .eq("tenant_id", unidade)
      .order("name");

    if (error) {
      setErro("Não foi possível carregar a equipe.");
      return;
    }
    setEquipe((data ?? []) as Profissional[]);
  }

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      if (!aoVivo || !tenantId) {
        setCarregando(false);
        return;
      }
      await recarregar(tenantId);
      if (!cancelado) setCarregando(false);
    }

    void carregar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, aoVivo]);

  async function adicionar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);

    const nomeLimpo = nome.trim();
    if (nomeLimpo.length < 2 || !tenantId) {
      setErro("Informe o nome.");
      return;
    }

    setSalvando(true);

    const { data: criado, error } = await supabase
      .from("professionals")
      .insert({ tenant_id: tenantId, name: nomeLimpo })
      .select("id")
      .single();

    if (error || !criado) {
      setErro("Não foi possível cadastrar. Só proprietário e gerência administram a equipe.");
      setSalvando(false);
      return;
    }

    // Segunda a sábado, 9h às 18h — o mesmo padrão que o dono recebe ao abrir a empresa.
    // Sem isto o profissional existe e a agenda não o oferece.
    for (let dia = 1; dia <= 6; dia += 1) {
      await supabase.rpc("set_professional_schedule_rule", {
        p_tenant_id: tenantId,
        p_professional_id: criado.id,
        p_weekday: dia,
        p_starts_at: "09:00",
        p_ends_at: "18:00",
      });
    }

    await recarregar(tenantId);
    setNome("");
    setFormAberto(false);
    setSalvando(false);
    setAviso(
      `${nomeLimpo} entrou com horário de segunda a sábado, das 9h às 18h. Ajuste na agenda se for diferente.`,
    );
  }

  async function desligar(profissional: Profissional) {
    setErro(null);
    setAviso(null);
    setOcupadoId(profissional.id);

    const { error } = await supabase.rpc("deactivate_professional", {
      p_professional_id: profissional.id,
    });

    setOcupadoId(null);

    if (error) {
      // A mensagem do banco aqui é útil e escrita para humano: ela diz quantos
      // atendimentos futuros impedem o desligamento.
      setErro(error.message);
      return;
    }

    if (tenantId) await recarregar(tenantId);
  }

  async function salvarComissao(profissional: Profissional, texto: string) {
    const bruto = texto.replace(",", ".").trim();
    if (bruto === "") return;

    const valor = Number(bruto);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      setErro("A comissão é uma porcentagem entre 0 e 100.");
      return;
    }

    setErro(null);
    setOcupadoId(profissional.id);

    const { error } = await supabase
      .from("professionals")
      .update({
        commission_kind: valor === 0 ? null : "percent",
        commission_percent: valor === 0 ? null : valor,
        commission_amount: null,
      })
      .eq("id", profissional.id);

    setOcupadoId(null);

    if (error) {
      setErro("Não foi possível salvar a comissão.");
      return;
    }
    if (tenantId) await recarregar(tenantId);
  }

  return (
    <section className="lista">
      <header className="lista-topo">
        <div>
          <h1>{segment.labels.professionalPlural}</h1>
          <p>Quem atende, o horário padrão e quanto cada um recebe por atendimento.</p>
        </div>
        {podeAdministrar && (
          <button className="lista-acao" type="button" onClick={() => setFormAberto((v) => !v)}>
            <Plus size={16} />
            Novo {segment.labels.professional.toLowerCase()}
          </button>
        )}
      </header>

      {erro && (
        <p className="lista-erro" role="alert">
          <CircleAlert size={15} />
          <span>{erro}</span>
        </p>
      )}
      {aviso && (
        <p className="lista-aviso" role="status">
          <CircleAlert size={15} />
          <span>{aviso}</span>
        </p>
      )}

      {formAberto && (
        <form className="lista-form" onSubmit={adicionar}>
          <label className="lista-campo">
            <span>Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={`Nome do ${segment.labels.professional.toLowerCase()}`}
              autoFocus
            />
            <small>
              Não precisa ter conta no sistema. Dar acesso de login a alguém da equipe ainda não
              está disponível.
            </small>
          </label>
          <div className="lista-form-acoes">
            <button type="button" className="lista-cancelar" onClick={() => setFormAberto(false)}>
              Cancelar
            </button>
            <button type="submit" className="lista-salvar" disabled={salvando}>
              {salvando ? <Loader2 className="spin" size={15} /> : null}
              Cadastrar
            </button>
          </div>
        </form>
      )}

      {carregando ? (
        <p className="lista-estado">
          <Loader2 className="spin" size={16} /> Carregando…
        </p>
      ) : !aoVivo ? (
        <p className="lista-estado">Entre com a sua conta para ver a equipe da sua empresa.</p>
      ) : (
        <ul className="lista-itens">
          {equipe.map((profissional) => (
            <li key={profissional.id} className={profissional.active ? undefined : "lista-inativo"}>
              <span className="lista-avatar" aria-hidden>
                <Scissors size={16} />
              </span>
              <span className="lista-nome">
                {profissional.name}
                {!profissional.active && <em>desligado</em>}
              </span>

              {podeAdministrar && profissional.active && (
                <>
                  <span className="lista-preco">
                    <input
                      defaultValue={profissional.commission_percent ?? ""}
                      onBlur={(e) => void salvarComissao(profissional, e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                      aria-label={`Comissão de ${profissional.name}, em porcentagem`}
                    />
                    <span className="lista-sufixo">% comissão</span>
                  </span>
                  <button
                    type="button"
                    className="lista-desligar"
                    onClick={() => void desligar(profissional)}
                    disabled={ocupadoId === profissional.id}
                    aria-label={`Desligar ${profissional.name}`}
                  >
                    {ocupadoId === profissional.id ? (
                      <Loader2 className="spin" size={14} />
                    ) : (
                      <Power size={14} />
                    )}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
