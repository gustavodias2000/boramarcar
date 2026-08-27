"use client";

import { ArrowRight, CalendarDays, CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useSegment } from "@/core/segment";
import { useTenant } from "@/core/tenant";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@boramarca/core";

/**
 * Início — portada da `InicioScreen` do Barbershop.
 *
 * O que ela herda de lá é a postura, não o layout: "Tudo em dia por aqui" quando não há
 * nada, os atendimentos de hoje em primeiro lugar, e atalhos para o que se usa todo dia.
 * É a tela que o dono abre às 8h querendo saber o que tem hoje — não um painel de
 * indicadores.
 *
 * As PENDÊNCIAS no topo vêm do bloqueador real que a auditoria encontrou: uma empresa
 * recém-aberta tem serviços a R$ 0,00 e nenhum cliente, e nesse estado ela não consegue
 * marcar nada. Em vez de deixar a pessoa descobrir isso ao tentar agendar, a tela diz o
 * que falta — e cada item some sozinho quando resolvido.
 */

interface Agendamento {
  id: string;
  start_at: string;
  status: string;
  customers: { name: string } | null;
  services: { name: string } | null;
  professionals: { name: string } | null;
}

export function CoreInicio() {
  const { tenantId, mode, unitName } = useTenant();
  const segment = useSegment();
  const supabase = createClient();

  const [hoje, setHoje] = useState<Agendamento[]>([]);
  const [semPreco, setSemPreco] = useState(0);
  const [semCliente, setSemCliente] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const aoVivo = mode === "live";

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      if (!aoVivo || !tenantId) {
        setCarregando(false);
        return;
      }

      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(inicio);
      fim.setDate(fim.getDate() + 1);

      const [agenda, servicos, clientes] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, start_at, status, customers(name), services(name), professionals(name)")
          .eq("tenant_id", tenantId)
          .gte("start_at", inicio.toISOString())
          .lt("start_at", fim.toISOString())
          .order("start_at"),
        supabase
          .from("services")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .eq("base_price", 0),
        supabase.from("customers").select("id").eq("tenant_id", tenantId).limit(1),
      ]);

      if (cancelado) return;

      setHoje((agenda.data ?? []) as unknown as Agendamento[]);
      setSemPreco(servicos.data?.length ?? 0);
      setSemCliente((clientes.data?.length ?? 0) === 0);
      setCarregando(false);
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, [supabase, tenantId, aoVivo]);

  const ativos = hoje.filter((item) => item.status !== "cancelled");

  return (
    <section className="inicio">
      <header className="inicio-topo">
        <h1>{unitName ?? "Sua empresa"}</h1>
        <p>O que acontece hoje.</p>
      </header>

      {aoVivo && (semPreco > 0 || semCliente) && (
        <div className="inicio-pendencias">
          <p className="inicio-pendencias-titulo">
            <TriangleAlert size={15} aria-hidden />
            Falta pouco para começar a atender
          </p>
          <ul>
            {semPreco > 0 && (
              <li>
                <Link href="/servicos">
                  Defina o preço de {semPreco === 1 ? "1 serviço" : `${semPreco} serviços`}
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </li>
            )}
            {semCliente && (
              <li>
                <Link href="/clientes">
                  Cadastre o primeiro {segment.labels.customer.toLowerCase()} — sem um deles não dá
                  para marcar
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="inicio-bloco">
        <div className="inicio-bloco-topo">
          <h2>Hoje</h2>
          <Link href="/agenda" className="inicio-link">
            Ver agenda
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        {carregando ? (
          <p className="lista-estado">
            <Loader2 className="spin" size={16} /> Carregando…
          </p>
        ) : !aoVivo ? (
          <p className="lista-estado">Entre com a sua conta para ver os atendimentos de hoje.</p>
        ) : ativos.length === 0 ? (
          <p className="inicio-vazio">
            <CircleCheck size={18} aria-hidden />
            Tudo em dia por aqui. Nenhum atendimento marcado para hoje.
          </p>
        ) : (
          <ul className="lista-itens">
            {ativos.map((item) => (
              <li key={item.id}>
                <span className="inicio-hora">{formatTime(item.start_at)}</span>
                <span className="lista-nome">{item.customers?.name ?? "—"}</span>
                <span className="lista-meta">
                  {item.services?.name ?? "—"}
                  {item.professionals?.name && <span>{item.professionals.name}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="inicio-atalhos">
        <Link href="/agenda">
          <CalendarDays size={17} aria-hidden />
          Agenda
        </Link>
        <Link href="/clientes">{segment.labels.customerPlural}</Link>
        <Link href="/servicos">Serviços</Link>
        <Link href="/equipe">{segment.labels.professionalPlural}</Link>
        <Link href="/relatorios">Relatórios</Link>
      </div>
    </section>
  );
}
