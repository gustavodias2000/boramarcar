"use client";

/**
 * Relatórios do núcleo.
 *
 * A tela de relatórios que existia consultava sete tabelas — todas automotivas: OS,
 * itens, pagamentos, entregas, veículos. Numa manicure ela apareceria vazia, porque a
 * feature `finance` está ligada para todas as categorias mas os dados não existem.
 *
 * Esta lê o que TODA categoria tem: agendamentos, serviços, profissionais, clientes e
 * avaliações.
 *
 * FATURAMENTO
 *
 * Até o financeiro do núcleo existir, esta tela dizia em voz alta que não mostrava
 * dinheiro — porque pagamento só existia na OS automotiva, e inventar um número a
 * partir do preço de tabela seria pior que não mostrar.
 *
 * Agora `finance_entries` é o livro único: recebimento de agendamento, de OS e
 * lançamento avulso caem no mesmo lugar. O bloco financeiro aparece só para quem tem
 * permissão de operar caixa — a RLS já devolve vazio para os demais, e esconder o
 * bloco evita mostrar "R$ 0,00" a quem simplesmente não pode ver.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, CircleAlert, Loader2, Star, UsersRound } from "lucide-react";

import { can } from "@boramarca/core";

import { useSegment } from "@/core/segment";
import { useTenant } from "@/core/tenant";
import { createClient, hasSupabaseConfiguration } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/automotive";

interface AppointmentRow {
  id: string;
  status: string;
  start_at: string;
  service_id: string;
  professional_id: string | null;
  customer_id: string;
}

interface Nomeado {
  id: string;
  name: string;
}

const PERIODOS = [
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
  { dias: 365, label: "12 meses" },
] as const;

function contarPor<T extends string>(linhas: { chave: T | null }[]): Map<T, number> {
  const mapa = new Map<T, number>();
  for (const { chave } of linhas) {
    if (chave === null) continue;
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return mapa;
}

function topN<T extends string>(mapa: Map<T, number>, nomes: Map<string, string>, n: number) {
  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, total]) => ({ id, total, nome: nomes.get(id) ?? "Sem registro" }));
}

export function CoreReports({ onOpenAgenda }: { onOpenAgenda: () => void }) {
  const { tenantId, mode, membershipRole } = useTenant();
  const segment = useSegment();

  const [dias, setDias] = useState<number>(30);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [services, setServices] = useState<Nomeado[]>([]);
  const [professionals, setProfessionals] = useState<Nomeado[]>([]);
  const [customers, setCustomers] = useState<Nomeado[]>([]);
  const [notaMedia, setNotaMedia] = useState<number | null>(null);
  const [financeiro, setFinanceiro] = useState<{ recebido: number; despesas: number } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const conectado = mode === "live" && Boolean(tenantId);

  useEffect(() => {
    if (!hasSupabaseConfiguration() || !tenantId) return;

    let cancelado = false;

    async function carregar(unidade: string, janela: number) {
      setCarregando(true);
      const supabase = createClient();
      const desde = new Date(Date.now() - janela * 86_400_000).toISOString();

      // O recorte de período vai na consulta, não no cliente: o defeito C-17 era
      // justamente baixar o histórico inteiro e filtrar depois.
      const [ags, servs, profs, clis, notas, caixa] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, status, start_at, service_id, professional_id, customer_id")
          .eq("tenant_id", unidade)
          .gte("start_at", desde),
        supabase.from("services").select("id, name").eq("tenant_id", unidade),
        supabase.from("professionals").select("id, name").eq("tenant_id", unidade),
        supabase.from("customers").select("id, name").eq("tenant_id", unidade),
        supabase.from("appointment_ratings").select("rating").eq("tenant_id", unidade),
        supabase
          .from("finance_entries")
          .select("kind, amount")
          .eq("tenant_id", unidade)
          .gte("occurred_on", desde.slice(0, 10)),
      ]);

      if (cancelado) return;

      // O erro do financeiro é ignorado de propósito: quem não é operador financeiro
      // simplesmente não recebe as linhas, e isso não é falha da tela.
      const falha = ags.error ?? servs.error ?? profs.error ?? clis.error ?? notas.error;
      if (falha) {
        setErro(falha.message);
        setCarregando(false);
        return;
      }

      setErro(null);
      setAppointments((ags.data ?? []) as AppointmentRow[]);
      setServices((servs.data ?? []) as Nomeado[]);
      setProfessionals((profs.data ?? []) as Nomeado[]);
      setCustomers((clis.data ?? []) as Nomeado[]);

      const listaNotas = (notas.data ?? []) as { rating: number }[];
      setNotaMedia(
        listaNotas.length
          ? listaNotas.reduce((soma, item) => soma + item.rating, 0) / listaNotas.length
          : null,
      );
      const linhas = (caixa.data ?? []) as { kind: string; amount: number | string }[];
      setFinanceiro(
        linhas.length === 0
          ? null
          : linhas.reduce(
              (acumulado, linha) => {
                const valor = Number(linha.amount);
                if (linha.kind === "income") acumulado.recebido += valor;
                if (linha.kind === "refund") acumulado.recebido -= valor;
                if (linha.kind === "expense") acumulado.despesas += valor;
                return acumulado;
              },
              { recebido: 0, despesas: 0 },
            ),
      );

      setCarregando(false);
    }

    void carregar(tenantId, dias);

    return () => {
      cancelado = true;
    };
  }, [tenantId, dias]);

  const resumo = useMemo(() => {
    const concluidos = appointments.filter((a) => a.status === "completed");
    const cancelados = appointments.filter((a) => a.status === "cancelled");

    const nomesServico = new Map(services.map((s) => [s.id, s.name]));
    const nomesProfissional = new Map(professionals.map((p) => [p.id, p.name]));
    const nomesCliente = new Map(customers.map((c) => [c.id, c.name]));

    return {
      total: appointments.length,
      concluidos: concluidos.length,
      cancelados: cancelados.length,
      // Taxa de comparecimento só faz sentido sobre o que já foi resolvido.
      comparecimento:
        concluidos.length + cancelados.length > 0
          ? Math.round((concluidos.length / (concluidos.length + cancelados.length)) * 100)
          : null,
      servicos: topN(contarPor(concluidos.map((a) => ({ chave: a.service_id }))), nomesServico, 5),
      profissionais: topN(
        contarPor(concluidos.map((a) => ({ chave: a.professional_id }))),
        nomesProfissional,
        5,
      ),
      clientes: topN(contarPor(concluidos.map((a) => ({ chave: a.customer_id }))), nomesCliente, 5),
    };
  }, [appointments, services, professionals, customers]);

  return (
    <section className="insights-workspace">
      <header className="account-heading">
        <div>
          <h1>Relatórios</h1>
          <p>
            Movimento da agenda nos últimos {dias} dias — {segment.config.label}.
          </p>
        </div>
        <div className="report-periods">
          {PERIODOS.map((periodo) => (
            <button
              key={periodo.dias}
              type="button"
              className={dias === periodo.dias ? "period-active" : ""}
              onClick={() => setDias(periodo.dias)}
            >
              {periodo.label}
            </button>
          ))}
        </div>
      </header>

      {!conectado && (
        <p className="account-error" role="status">
          <CircleAlert size={15} /> Sem sessão e unidade ativas, os relatórios ficam vazios.
        </p>
      )}

      {erro && (
        <p className="account-error" role="alert">
          <CircleAlert size={15} /> {erro}
        </p>
      )}

      {carregando && (
        <p className="report-loading">
          <Loader2 size={15} className="spin" /> Calculando…
        </p>
      )}

      <div className="report-tiles">
        <div>
          <span>{segment.labels.appointmentPlural} no período</span>
          <strong>{resumo.total}</strong>
        </div>
        <div>
          <span>Concluídos</span>
          <strong>{resumo.concluidos}</strong>
        </div>
        <div>
          <span>Cancelados</span>
          <strong>{resumo.cancelados}</strong>
        </div>
        <div>
          <span>Comparecimento</span>
          <strong>{resumo.comparecimento === null ? "—" : `${resumo.comparecimento}%`}</strong>
        </div>
        <div>
          <span>Nota média</span>
          <strong>
            {notaMedia === null ? "—" : notaMedia.toFixed(1)}
            {notaMedia !== null && <Star size={14} />}
          </strong>
        </div>
      </div>

      {can(membershipRole, "recordPayments") && (
        <div className="report-tiles">
          <div>
            <span>Recebido no período</span>
            <strong>{formatCurrency(financeiro?.recebido ?? 0)}</strong>
          </div>
          <div>
            <span>Despesas e comissões</span>
            <strong>{formatCurrency(financeiro?.despesas ?? 0)}</strong>
          </div>
          <div>
            <span>Resultado</span>
            <strong>
              {formatCurrency((financeiro?.recebido ?? 0) - (financeiro?.despesas ?? 0))}
            </strong>
          </div>
          <div>
            <span>Ticket médio</span>
            <strong>
              {resumo.concluidos > 0 && financeiro
                ? formatCurrency(financeiro.recebido / resumo.concluidos)
                : "—"}
            </strong>
          </div>
        </div>
      )}

      <div className="report-columns">
        <section>
          <h2>
            <BarChart3 size={16} /> Serviços mais realizados
          </h2>
          <ul className="report-rank">
            {resumo.servicos.length === 0 && (
              <li className="report-empty">Sem dados no período.</li>
            )}
            {resumo.servicos.map((item) => (
              <li key={item.id}>
                <span>{item.nome}</span>
                <strong>{item.total}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>
            <UsersRound size={16} /> {segment.labels.professionalPlural} mais requisitados
          </h2>
          <ul className="report-rank">
            {resumo.profissionais.length === 0 && (
              <li className="report-empty">Sem dados no período.</li>
            )}
            {resumo.profissionais.map((item) => (
              <li key={item.id}>
                <span>{item.nome}</span>
                <strong>{item.total}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>
            <UsersRound size={16} /> {segment.labels.customerPlural} que mais voltam
          </h2>
          <ul className="report-rank">
            {resumo.clientes.length === 0 && (
              <li className="report-empty">Sem dados no período.</li>
            )}
            {resumo.clientes.map((item) => (
              <li key={item.id}>
                <span>{item.nome}</span>
                <strong>{item.total}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {!can(membershipRole, "recordPayments") && (
        <p className="report-note">
          Os números financeiros ficam visíveis a quem opera o caixa. O movimento da agenda acima é
          aberto a toda a equipe.
        </p>
      )}

      <button type="button" className="agenda-plain-action" onClick={onOpenAgenda}>
        <ArrowLeft size={16} /> Voltar para a agenda
      </button>
    </section>
  );
}
