"use client";

import {
  Bell,
  BarChart3,
  Boxes,
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  CreditCard,
  Gauge,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  PackagePlus,
  Plus,
  Search,
  Settings,
  Sparkles,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AutomotiveQuickEntry } from "@/components/automotive-quick-entry";
import { AutomotiveAgenda } from "@/components/automotive-agenda";
import { AutomotiveBoxes } from "@/components/automotive-boxes";
import { CoreReports } from "@/components/core-reports";
import { AutomotiveInsights } from "@/components/automotive-insights";
import { AutomotiveProfile } from "@/components/automotive-profile";
import { AutomotiveWorkOrder } from "@/components/automotive-work-order";
import {
  AutomotiveDataMode,
  formatCurrency,
  formatTime,
  PatioOrder,
  PatioStatus,
  patioStatusCopy,
  PATIO_STATUSES,
} from "@/lib/automotive";
import { listPatioOrders } from "@boramarca/core";
import { demonstrationOrders } from "@/demo/automotive";
import { createClient, hasSupabaseConfiguration } from "@/lib/supabase/client";
import { type FeatureKey } from "@boramarca/core";
import { MARCA } from "@/core/marca";
import { useSegment } from "@/core/segment";
import { useTenant } from "@/core/tenant";

// Cada item declara a feature que o habilita. Numa barbearia, Pátio, OS e Veículos
// somem sozinhos — sem `if (businessType === ...)` em lugar nenhum.
const navigation: {
  label: string;
  icon: typeof LayoutDashboard;
  view?: OperationView;
  href?: string;
  feature: FeatureKey;
}[] = [
  { label: "Pátio", icon: LayoutDashboard, view: "patio", href: "/patio", feature: "workOrders" },
  { label: "Agenda", icon: CalendarDays, view: "agenda", href: "/agenda", feature: "appointments" },
  { label: "OS", icon: ClipboardList, feature: "workOrders" },
  { label: "Clientes", icon: UsersRound, feature: "customers" },
  { label: "Boxes", icon: Boxes, view: "boxes", href: "/boxes", feature: "boxes" },
  { label: "Veículos", icon: CarFront, view: "vehicles", href: "/veiculos", feature: "vehicles" },
  {
    label: "Relatórios",
    icon: BarChart3,
    view: "reports",
    href: "/relatorios",
    feature: "finance",
  },
];

function formatToday() {
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
}

export type OperationView = "patio" | "agenda" | "boxes" | "vehicles" | "reports" | "profile";

export function AutomotivePatio({ view }: { view: OperationView }) {
  const router = useRouter();
  const {
    mode: tenantMode,
    access: accessState,
    accessError,
    tenantId,
    unitName,
    unitTimezone,
    membershipRole,
    blocked: operationsBlocked,
    isLoading,
    reload: reloadTenant,
  } = useTenant();

  const [orders, setOrders] = useState<PatioOrder[]>(demonstrationOrders);
  const [selectedId, setSelectedId] = useState(demonstrationOrders[1].id);
  // O Pátio acrescenta "empty" ao modo do tenant: é estado desta tela, não da sessão.
  const [patioEmpty, setPatioEmpty] = useState(false);
  const mode: AutomotiveDataMode = tenantMode === "live" && patioEmpty ? "empty" : tenantMode;
  /** Indicador da ação de avançar etapa. A carga inicial usa o do contexto. */
  const [isAdvancing, setIsAdvancing] = useState(false);
  /** Boxes ativos da unidade. Antes o denominador do contador era o literal 4 (C-22). */
  const [activeBoxes, setActiveBoxes] = useState<{ id: string; code: string; name: string }[]>([]);
  const [professionals, setProfessionals] = useState<{ id: string; name: string }[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [isWorkOrderOpen, setIsWorkOrderOpen] = useState(false);
  // Achado C-15: abaixo de 980px o painel da OS é uma gaveta, e a classe que a abre
  // dependia só de existir uma OS selecionada — que já nasce preenchida. A gaveta
  // cobria o Pátio no primeiro carregamento, antes de qualquer toque. Acima de 980px
  // o painel é uma coluna do grid e a classe não muda nada, então distinguir
  // "há seleção" de "o usuário abriu" corrige o celular sem afetar o desktop.
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const activeView = view;
  const [notice, setNotice] = useState<string | null>(null);
  const [todayLabel] = useState(formatToday);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? orders[0] ?? null,
    [orders, selectedId],
  );
  // Antes era `resolveSegment(businessType)` a mao, porque este componente FORNECIA o
  // provider e nao podia consumi-lo. Com o provider no layout, ele passa a consumir
  // como qualquer outra tela.
  const segment = useSegment();
  const visibleNavigation = useMemo(
    () => navigation.filter((item) => segment.hasFeature(item.feature)),
    [segment],
  );

  // A prova da arquitetura multi-categoria: numa barbearia, Pátio, OS e Veículos não
  // existem — e a rota também não. Sem esta guarda, um barbeiro que digitasse /patio
  // veria a operação automotiva inteira.
  //
  // "Conta" é sempre permitida: é onde se resolve não ter acesso a nada.
  const currentItem = navigation.find((item) => item.view === view);
  const viewAllowed = view === "profile" || !currentItem || segment.hasFeature(currentItem.feature);
  const homeHref = visibleNavigation[0]?.href ?? "/conta";

  useEffect(() => {
    // Autenticado e sem vínculo: o caminho não é uma tela de erro, é abrir a empresa.
    if (accessState === "no-membership") {
      router.replace("/comecar");
      return;
    }

    // Só redireciona depois de o segmento vir do banco. Antes disso a interface está
    // na prévia demonstrativa, que é automotiva por padrão.
    if (!segment.resolved || viewAllowed) return;
    router.replace(homeHref);
  }, [accessState, segment.resolved, viewAllowed, homeHref, router]);
  const operationsLocked = operationsBlocked || accessState === "checking";

  // Busca a lista do Pátio quando a unidade ativa muda — inclusive de nula para
  // definida, que é o caso do login. O ouvinte de sessão vive no TenantProvider.
  useEffect(() => {
    if (!hasSupabaseConfiguration() || !tenantId) return;

    let cancelado = false;

    async function buscarPatio(unidade: string) {
      const supabase = createClient();
      const [{ data, error }, boxesResult, professionalsResult] = await Promise.all([
        listPatioOrders(supabase, unidade),
        supabase
          .from("automotive_boxes")
          .select("id, code, name")
          .eq("tenant_id", unidade)
          .eq("active", true)
          .order("display_order", { ascending: true }),
        supabase
          .from("professionals")
          .select("id, name")
          .eq("tenant_id", unidade)
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);
      if (cancelado) return;

      setActiveBoxes((boxesResult.data ?? []) as { id: string; code: string; name: string }[]);
      setProfessionals((professionalsResult.data ?? []) as { id: string; name: string }[]);

      if (error) {
        setNotice(`Não foi possível carregar o Pátio: ${error.message}`);
        setOrders([]);
        setSelectedId("");
        setPatioEmpty(true);
        return;
      }

      setOrders(data);
      setSelectedId(data[0]?.id ?? "");
      setPatioEmpty(data.length === 0);
    }

    void buscarPatio(tenantId);

    return () => {
      cancelado = true;
    };
  }, [tenantId]);

  /**
   * Atribuir responsável e box eram as duas funções que existiam no banco desde a
   * primeira migration automotiva e nunca tinham consumidor. Sem a primeira, toda OS
   * de entrada rápida ficava sem técnico — e a política de mídia e a transição por
   * técnico dependem desse campo.
   */
  async function reassign(tipo: "professional" | "box", valor: string | null, order: PatioOrder) {
    if (mode !== "live") {
      setNotice("A atribuição é gravada somente nesta prévia.");
      return;
    }

    setIsAssigning(true);
    const supabase = createClient();
    const { error } =
      tipo === "professional"
        ? await supabase.rpc("assign_automotive_work_order_professional", {
            p_work_order_id: order.id,
            p_professional_id: valor,
          })
        : valor
          ? await supabase.rpc("assign_automotive_work_order_box", {
              p_work_order_id: order.id,
              p_box_id: valor,
            })
          : await supabase.rpc("release_automotive_work_order_box", {
              p_work_order_id: order.id,
            });
    setIsAssigning(false);

    if (error) {
      setNotice(error.message);
      return;
    }

    // A view do Pátio traz nome do técnico e código do box: rebuscar é mais simples e
    // mais correto que remontar a linha no cliente.
    if (tenantId) {
      const { data } = await listPatioOrders(supabase, tenantId);
      if (data) setOrders(data);
    }
  }

  async function advanceOrder(order: PatioOrder) {
    const config = patioStatusCopy[order.status];
    if (mode === "demonstration") {
      if (order.status === "awaiting_pickup") {
        setOrders((current) => current.filter((currentOrder) => currentOrder.id !== order.id));
        setSelectedId(orders.find((currentOrder) => currentOrder.id !== order.id)?.id ?? "");
        setNotice(`OS #${order.number} marcada como entregue na prévia.`);
        return;
      }

      if (!config.next) return;
      setOrders((current) =>
        current.map((currentOrder) =>
          currentOrder.id === order.id
            ? { ...currentOrder, status: config.next as PatioStatus }
            : currentOrder,
        ),
      );
      setNotice(
        `OS #${order.number} movida para ${patioStatusCopy[config.next].label.toLowerCase()}.`,
      );
      return;
    }

    if (mode !== "live") return;

    setIsAdvancing(true);
    const supabase = createClient();
    const result =
      order.status === "awaiting_pickup"
        ? await supabase.rpc("deliver_automotive_work_order", {
            p_work_order_id: order.id,
          })
        : await supabase.rpc("transition_automotive_work_order", {
            p_work_order_id: order.id,
            p_next_status: config.next,
          });

    if (result.error) {
      setNotice(`Ação não concluída: ${result.error.message}`);
    } else if (order.status === "awaiting_pickup") {
      setOrders((current) => current.filter((currentOrder) => currentOrder.id !== order.id));
      setSelectedId("");
    } else if (config.next) {
      setOrders((current) =>
        current.map((currentOrder) =>
          currentOrder.id === order.id
            ? { ...currentOrder, status: config.next as PatioStatus }
            : currentOrder,
        ),
      );
    }
    setIsAdvancing(false);
  }

  function updateSelectedOrderTotals(totalDelta: number, paidDelta: number) {
    if (!selectedOrder) return;

    setOrders((current) =>
      current.map((currentOrder) => {
        if (currentOrder.id !== selectedOrder.id) return currentOrder;

        const total = Number(currentOrder.total_amount) + totalDelta;
        const paid = Number(currentOrder.paid_amount) + paidDelta;
        return {
          ...currentOrder,
          total_amount: total,
          paid_amount: paid,
          outstanding_amount: total - paid,
          // Acompanha a view `automotive_patio`: sem nada lançado a OS fica "a cobrar",
          // nunca quitada. Era o defeito C-14, replicado aqui na atualização otimista.
          payment_status:
            total <= 0 ? "unbilled" : paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid",
        };
      }),
    );
  }

  return (
    <>
      <main
        className={`app-shell ${activeView === "agenda" ? "agenda-shell" : activeView === "profile" ? "profile-shell" : activeView === "vehicles" || activeView === "reports" ? "insights-shell" : ""}`}
      >
        <aside
          className={`navigation ${isMenuOpen ? "navigation-open" : ""}`}
          aria-label="Navegação principal"
        >
          <div className="brand-mark" aria-label={MARCA.nome}>
            <span>{MARCA.logo.leve}</span>
            <strong>{MARCA.logo.forte}</strong>
          </div>

          <nav>
            {visibleNavigation.map(({ label, icon: Icon, view: itemView, href }) => {
              const active = itemView === activeView;
              const conteudo = (
                <>
                  <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
                  <span>{label}</span>
                </>
              );

              // Item com rota vira link de verdade: URL própria, botão voltar e
              // abertura em nova aba passam a funcionar. Os que ainda não têm tela
              // continuam sendo botão, e dizem honestamente que o fluxo não existe.
              if (!href) {
                return (
                  <button
                    key={label}
                    className="nav-item"
                    type="button"
                    onClick={() =>
                      setNotice(`${label} será o próximo fluxo conectado à operação Automotive.`)
                    }
                  >
                    {conteudo}
                  </button>
                );
              }

              if (operationsLocked) {
                return (
                  <button key={label} className="nav-item" type="button" disabled>
                    {conteudo}
                  </button>
                );
              }

              return (
                <Link
                  key={label}
                  href={href}
                  className={`nav-item ${active ? "nav-item-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    setIsMenuOpen(false);
                    setNotice(null);
                  }}
                >
                  {conteudo}
                </Link>
              );
            })}
          </nav>

          <div className="navigation-bottom">
            <button
              className={`nav-item ${activeView === "profile" ? "nav-item-active" : ""}`}
              type="button"
              onClick={() => {
                router.push("/conta");
                setIsMenuOpen(false);
                setNotice(null);
              }}
            >
              <Settings size={18} />
              <span>Ajustes</span>
            </button>
            <button
              className="profile-button"
              type="button"
              onClick={() => {
                router.push("/conta");
                setIsMenuOpen(false);
                setNotice(null);
              }}
            >
              <span className="profile-avatar">AC</span>
              <span>
                <strong>Conta e acesso</strong>
                <small>Perfil da unidade</small>
              </span>
              <Settings size={16} aria-label="Abrir conta e acesso" />
            </button>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              <Menu size={20} />
              <span className="sr-only">Abrir navegação</span>
            </button>
            <div className="workspace-location">
              <span>
                {unitName ??
                  (accessState === "no-membership"
                    ? "Sem unidade ativa"
                    : accessState === "error"
                      ? "Acesso indisponível"
                      : mode === "demonstration"
                        ? "Prévia demonstrativa"
                        : "Unidade")}
              </span>
              <ChevronRight size={14} />
              <strong>
                {activeView === "agenda"
                  ? "Agenda"
                  : activeView === "profile"
                    ? "Conta e acesso"
                    : activeView === "vehicles"
                      ? "Histórico de veículos"
                      : activeView === "reports"
                        ? "Relatórios"
                        : segment.config.label}
              </strong>
            </div>
            <div className="topbar-actions">
              <button
                className="icon-button"
                type="button"
                aria-label="Buscar"
                onClick={() =>
                  setNotice("A busca por placa, cliente e OS será adicionada ao Pátio.")
                }
              >
                <Search size={19} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Notificações"
                onClick={() => setNotice("As notificações operacionais aparecerão aqui.")}
              >
                <Bell size={19} />
                <span className="notification-dot" />
              </button>
              {/*
                A acao primaria da moldura era renderizada em TODA categoria, com guarda
                so de `operationsLocked`. Numa barbearia, o botao mais destacado da tela
                abria um formulario que pede A PLACA DO CARRO do cliente. Nao era texto
                errado: era fluxo de outro ramo oferecido como acao principal.
              */}
              {segment.hasFeature("workOrders") && (
                <button
                  className="new-entry-button"
                  type="button"
                  onClick={() => {
                    setIsEntryOpen(true);
                    setNotice(null);
                  }}
                  disabled={operationsLocked}
                >
                  <Plus size={18} />
                  Nova entrada
                </button>
              )}
            </div>
          </header>

          <div className="workspace-scroll">
            {notice && (
              <div className="notice" role="status">
                <CircleAlert size={17} />
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso">
                  <X size={16} />
                </button>
              </div>
            )}

            {activeView === "profile" || operationsBlocked ? (
              <AutomotiveProfile
                configured={hasSupabaseConfiguration()}
                accessState={accessState}
                accessError={accessError}
                tenantId={tenantId}
                unitName={unitName}
                unitTimezone={unitTimezone}
                membershipRole={membershipRole}
                onOpenPatio={() => router.push("/patio")}
                onSessionChanged={reloadTenant}
              />
            ) : activeView === "boxes" ? (
              <AutomotiveBoxes />
            ) : activeView === "agenda" ? (
              <AutomotiveAgenda
                mode={mode}
                tenantId={tenantId}
                onOpenPatio={() => router.push("/patio")}
              />
            ) : activeView === "reports" ? (
              /*
                Antes esta linha era `reports && !hasFeature("workOrders")`, com a
                automotiva caindo no `AutomotiveInsights`. Formalmente era `hasFeature`;
                materialmente era `if (businessType === "automotive_aesthetics")`, porque
                `workOrders` e true num segmento so.
                O efeito: a estetica automotiva NUNCA via `CoreReports` — ou seja, nunca
                via `finance_entries`, o livro unico do nucleo. O modulo foi excluido do
                financeiro do produto por uma ternaria de tela.
                Agora os relatorios do nucleo valem para todos, e a leitura automotiva
                (historico de veiculo, ciclo de patio) e um ACRESCIMO abaixo dela, nao um
                substituto.
              */
              <>
                <CoreReports onOpenAgenda={() => router.push("/agenda")} />
                {segment.hasFeature("workOrders") && (
                  <AutomotiveInsights
                    view="reports"
                    mode={mode}
                    tenantId={tenantId}
                    membershipRole={membershipRole}
                    onOpenPatio={() => router.push("/patio")}
                  />
                )}
              </>
            ) : activeView === "vehicles" ? (
              <AutomotiveInsights
                view={activeView}
                mode={mode}
                tenantId={tenantId}
                membershipRole={membershipRole}
                onOpenPatio={() => router.push("/patio")}
              />
            ) : (
              <>
                <section className="patio-heading">
                  <div>
                    <h1>Pátio agora</h1>
                    <p>Visão operacional de veículos em atendimento hoje.</p>
                  </div>
                  <div className="heading-meta">
                    <span className={`mode-badge mode-${mode}`}>
                      <span />
                      {mode === "live"
                        ? "Dados ao vivo"
                        : mode === "empty"
                          ? "Pátio vazio"
                          : "Prévia demonstrativa"}
                    </span>
                    <span className="date-label" suppressHydrationWarning>
                      {todayLabel}
                    </span>
                  </div>
                </section>

                <section className="control-strip" aria-label="Resumo operacional">
                  <div>
                    <span className="strip-label">Boxes em uso</span>
                    <strong>
                      {
                        new Set(orders.filter((order) => order.box_id).map((order) => order.box_id))
                          .size
                      }{" "}
                      / {activeBoxes.length || "—"}
                    </strong>
                  </div>
                  <div>
                    <span className="strip-label">Em serviço</span>
                    <strong>
                      {orders.filter((order) => order.status === "in_service").length}
                    </strong>
                  </div>
                  <div>
                    <span className="strip-label">Prontos para retirar</span>
                    <strong>
                      {orders.filter((order) => order.status === "awaiting_pickup").length}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="strip-filter"
                    onClick={() =>
                      setNotice("O filtro de período será conectado à agenda nesta área.")
                    }
                  >
                    <CalendarDays size={17} />
                    Hoje
                    <ChevronRight size={15} />
                  </button>
                </section>

                {(isLoading || isAdvancing) && (
                  <div className="loading-line" aria-label="Atualizando dados" />
                )}

                <section className="patio-grid" aria-label="Ordens de serviço por etapa">
                  {PATIO_STATUSES.map((status) => {
                    const config = patioStatusCopy[status];
                    const statusOrders = orders.filter((order) => order.status === status);

                    return (
                      <section className={`patio-lane lane-${config.tone}`} key={status}>
                        <div className="lane-header">
                          <div>
                            <span className="lane-signal" />
                            <h2>{config.label}</h2>
                          </div>
                          <span>{statusOrders.length}</span>
                        </div>

                        <div className="lane-content">
                          {statusOrders.map((order) => (
                            <button
                              key={order.id}
                              type="button"
                              className={`work-order-strip ${selectedOrder?.id === order.id ? "work-order-selected" : ""}`}
                              onClick={() => {
                                setSelectedId(order.id);
                                setIsDetailOpen(true);
                              }}
                            >
                              <span className="strip-order">
                                OS {String(order.number).padStart(3, "0")}
                              </span>
                              <span className="strip-plate">{order.license_plate}</span>
                              <span className="strip-car">
                                {[order.make, order.model].filter(Boolean).join(" ") || "Veículo"}
                              </span>
                              <span className="strip-divider" />
                              <span className="strip-person">
                                {order.professional_name ??
                                  `Sem ${segment.labels.professional.toLowerCase()}`}
                              </span>
                              {segment.hasFeature("boxes") ? (
                                <span className="strip-box">{order.box_code ?? "Sem box"}</span>
                              ) : null}
                            </button>
                          ))}
                          {!statusOrders.length && (
                            <div className="lane-empty">
                              <span />
                              Nenhum veículo nesta etapa
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </section>
              </>
            )}
          </div>
        </section>

        {isWorkOrderOpen && selectedOrder ? (
          <AutomotiveWorkOrder
            key={selectedOrder.id}
            mode={mode}
            order={selectedOrder}
            onClose={() => setIsWorkOrderOpen(false)}
            onTotalsChange={updateSelectedOrderTotals}
          />
        ) : isEntryOpen ? (
          <AutomotiveQuickEntry
            mode={mode}
            tenantId={tenantId}
            orders={orders}
            onClose={() => setIsEntryOpen(false)}
            onCreated={(entry) => {
              setOrders((current) => [entry, ...current]);
              setSelectedId(entry.id);
              setPatioEmpty(false);
              setIsEntryOpen(false);
              setNotice(`OS #${entry.number} aberta e posicionada em aguardando serviço.`);
            }}
          />
        ) : activeView === "patio" ? (
          <aside
            className={`order-detail ${selectedOrder && isDetailOpen ? "order-detail-open" : ""}`}
            aria-label="Detalhes da ordem de serviço"
          >
            {selectedOrder ? (
              <>
                <div className="detail-topline">
                  <span>Ordem de serviço</span>
                  <button
                    className="icon-button detail-close"
                    type="button"
                    onClick={() => {
                      setSelectedId("");
                      setIsDetailOpen(false);
                    }}
                  >
                    <X size={18} />
                    <span className="sr-only">Fechar detalhes</span>
                  </button>
                </div>
                <div className="detail-identity">
                  <div>
                    <span className="detail-order-number">
                      OS {String(selectedOrder.number).padStart(3, "0")}
                    </span>
                    <h2>{selectedOrder.license_plate}</h2>
                    <p>
                      {[selectedOrder.make, selectedOrder.model, selectedOrder.color]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`status-chip chip-${patioStatusCopy[selectedOrder.status].tone}`}
                  >
                    {patioStatusCopy[selectedOrder.status].label}
                  </span>
                </div>

                <div className="detail-timeline">
                  <span className="timeline-rail" />
                  <div>
                    <span>Entrada</span>
                    <strong>{formatTime(selectedOrder.received_at)}</strong>
                  </div>
                  <div>
                    <span>{segment.labels.professional}</span>
                    <select
                      className="inline-assign"
                      value={selectedOrder.professional_id ?? ""}
                      disabled={isAssigning || operationsLocked}
                      aria-label={`Responsável pela OS ${selectedOrder.number}`}
                      onChange={(event) =>
                        void reassign("professional", event.target.value || null, selectedOrder)
                      }
                    >
                      <option value="">A definir</option>
                      {professionals.map((professional) => (
                        <option key={professional.id} value={professional.id}>
                          {professional.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {segment.hasFeature("boxes") ? (
                    <div>
                      <span>Box</span>
                      <select
                        className="inline-assign"
                        value={selectedOrder.box_id ?? ""}
                        disabled={isAssigning || operationsLocked}
                        aria-label={`Box da OS ${selectedOrder.number}`}
                        onChange={(event) =>
                          void reassign("box", event.target.value || null, selectedOrder)
                        }
                      >
                        <option value="">Pátio externo</option>
                        {activeBoxes.map((box) => (
                          <option key={box.id} value={box.id}>
                            {box.code} — {box.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>

                <div className="detail-sections">
                  <section className="detail-section">
                    <div className="section-title">
                      <span>Cliente</span>
                      <button
                        type="button"
                        onClick={() =>
                          setNotice("O perfil do cliente será aberto na próxima tela.")
                        }
                      >
                        Ver perfil <ChevronRight size={14} />
                      </button>
                    </div>
                    <strong>{selectedOrder.customer_name}</strong>
                    <p>Recebimento e histórico do veículo ficam reunidos nesta OS.</p>
                  </section>

                  <section className="detail-section value-section">
                    <div className="section-title">
                      <span>Fechamento</span>
                      <button
                        type="button"
                        onClick={() => setNotice("As opções financeiras completas ficam na OS.")}
                        aria-label="Mais opções de fechamento"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                    <div className="value-row">
                      <span>Serviços e produtos</span>
                      <strong>{formatCurrency(selectedOrder.total_amount)}</strong>
                    </div>
                    <div className="value-row">
                      <span>Já recebido</span>
                      <strong>{formatCurrency(selectedOrder.paid_amount)}</strong>
                    </div>
                    <div className="value-row value-row-total">
                      <span>Saldo</span>
                      <strong>{formatCurrency(selectedOrder.outstanding_amount)}</strong>
                    </div>
                  </section>

                  <section className="detail-section quick-actions">
                    <button
                      type="button"
                      onClick={() => setIsWorkOrderOpen(true)}
                      disabled={operationsLocked}
                    >
                      <PackagePlus size={17} />
                      Adicionar item
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsWorkOrderOpen(true)}
                      disabled={operationsLocked}
                    >
                      <CreditCard size={17} />
                      Registrar pagamento
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsWorkOrderOpen(true)}
                      disabled={operationsLocked}
                    >
                      <Sparkles size={17} />
                      Fotos da OS
                    </button>
                  </section>
                </div>

                <div className="detail-footer">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => setIsWorkOrderOpen(true)}
                    disabled={operationsLocked}
                  >
                    <Gauge size={18} />
                    Ver OS completa
                  </button>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => void advanceOrder(selectedOrder)}
                    disabled={isAdvancing || operationsLocked}
                  >
                    {selectedOrder.status === "awaiting_pickup" ? (
                      <Check size={18} />
                    ) : (
                      <Wrench size={18} />
                    )}
                    {patioStatusCopy[selectedOrder.status].action}
                  </button>
                </div>
              </>
            ) : (
              <div className="detail-empty">
                <ClipboardList size={28} />
                <h2>Selecione uma OS</h2>
                <p>Os detalhes operacionais aparecem aqui sem tirar o Pátio de vista.</p>
              </div>
            )}
          </aside>
        ) : null}
      </main>
    </>
  );
}
