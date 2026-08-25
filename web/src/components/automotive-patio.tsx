"use client";

import {
  Bell,
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  CreditCard,
  Gauge,
  LayoutDashboard,
  LogOut,
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
import { useEffect, useMemo, useState } from "react";

import { AutomotiveQuickEntry } from "@/components/automotive-quick-entry";
import {
  AutomotiveDataMode,
  demonstrationOrders,
  formatCurrency,
  formatTime,
  normalizePatioOrder,
  PatioOrder,
  PatioStatus,
  patioStatusCopy,
  PATIO_STATUSES,
} from "@/lib/automotive";
import { createClient, hasSupabaseConfiguration } from "@/lib/supabase/client";

const navigation = [
  { label: "Pátio", icon: LayoutDashboard, active: true },
  { label: "Agenda", icon: CalendarDays },
  { label: "OS", icon: ClipboardList },
  { label: "Clientes", icon: UsersRound },
  { label: "Veículos", icon: CarFront },
];

function formatToday() {
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
}

export function AutomotivePatio() {
  const [orders, setOrders] = useState<PatioOrder[]>(demonstrationOrders);
  const [selectedId, setSelectedId] = useState(demonstrationOrders[1].id);
  const [mode, setMode] = useState<AutomotiveDataMode>("demonstration");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [todayLabel] = useState(formatToday);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? orders[0] ?? null,
    [orders, selectedId],
  );

  useEffect(() => {
    async function loadLivePatio() {
      if (!hasSupabaseConfiguration()) {
        setMode("unconfigured");
        setTenantId(null);
        return;
      }

      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        setMode("demonstration");
        setTenantId(null);
        return;
      }

      setIsLoading(true);
      const { data: membership, error: membershipError } = await supabase
        .from("business_members")
        .select("tenant_id")
        .eq("user_id", sessionData.session.user.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (membershipError || !membership) {
        setNotice("Não foi possível identificar a unidade ativa desta sessão.");
        setMode("demonstration");
        setTenantId(null);
        setIsLoading(false);
        return;
      }

      setTenantId(membership.tenant_id);
      const { data, error } = await supabase
        .from("automotive_patio")
        .select("*")
        .eq("tenant_id", membership.tenant_id)
        .order("received_at", { ascending: true });

      if (error) {
        setNotice(`Não foi possível carregar o Pátio: ${error.message}`);
        setMode("demonstration");
      } else {
        const liveOrders = (data ?? []).map((order) => normalizePatioOrder(order as PatioOrder));
        setOrders(liveOrders);
        setSelectedId(liveOrders[0]?.id ?? "");
        setMode(liveOrders.length ? "live" : "empty");
      }

      setIsLoading(false);
    }

    void loadLivePatio();
  }, []);

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
      setNotice(`OS #${order.number} movida para ${patioStatusCopy[config.next].label.toLowerCase()}.`);
      return;
    }

    if (mode !== "live") return;

    setIsLoading(true);
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
    setIsLoading(false);
  }

  return (
    <main className="app-shell">
      <aside className={`navigation ${isMenuOpen ? "navigation-open" : ""}`} aria-label="Navegação principal">
        <div className="brand-mark" aria-label="Bora Marcá">
          <span>bora</span>
          <strong>marcá</strong>
        </div>

        <nav>
          {navigation.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              className={`nav-item ${active ? "nav-item-active" : ""}`}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => !active && setNotice(`${label} será o próximo fluxo conectado à operação Automotive.`)}
            >
              <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="navigation-bottom">
          <button className="nav-item" type="button" onClick={() => setNotice("Os ajustes da unidade serão disponibilizados nesta área.")}>
            <Settings size={18} />
            <span>Ajustes</span>
          </button>
          <button className="profile-button" type="button" onClick={() => setNotice("O perfil do gestor será configurado com autenticação e permissões.")}>
            <span className="profile-avatar">GM</span>
            <span>
              <strong>Gustavo</strong>
              <small>Gestor</small>
            </span>
            <LogOut size={16} aria-label="Sair" />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" onClick={() => setIsMenuOpen((open) => !open)}>
            <Menu size={20} />
            <span className="sr-only">Abrir navegação</span>
          </button>
          <div className="workspace-location">
            <span>Unidade Centro</span>
            <ChevronRight size={14} />
            <strong>Estética Automotiva</strong>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" aria-label="Buscar" onClick={() => setNotice("A busca por placa, cliente e OS será adicionada ao Pátio.")}>
              <Search size={19} />
            </button>
            <button className="icon-button" type="button" aria-label="Notificações" onClick={() => setNotice("As notificações operacionais aparecerão aqui.")}>
              <Bell size={19} />
              <span className="notification-dot" />
            </button>
            <button className="new-entry-button" type="button" onClick={() => { setIsEntryOpen(true); setNotice(null); }}>
              <Plus size={18} />
              Nova entrada
            </button>
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

          <section className="patio-heading">
            <div>
              <h1>Pátio agora</h1>
              <p>Visão operacional de veículos em atendimento hoje.</p>
            </div>
            <div className="heading-meta">
              <span className={`mode-badge mode-${mode}`}>
                <span />
                {mode === "live" ? "Dados ao vivo" : mode === "empty" ? "Pátio vazio" : "Prévia demonstrativa"}
              </span>
              <span className="date-label" suppressHydrationWarning>{todayLabel}</span>
            </div>
          </section>

          <section className="control-strip" aria-label="Resumo operacional">
            <div>
              <span className="strip-label">Boxes em uso</span>
              <strong>{new Set(orders.filter((order) => order.box_id).map((order) => order.box_id)).size} / 4</strong>
            </div>
            <div>
              <span className="strip-label">Em serviço</span>
              <strong>{orders.filter((order) => order.status === "in_service").length}</strong>
            </div>
            <div>
              <span className="strip-label">Prontos para retirar</span>
              <strong>{orders.filter((order) => order.status === "awaiting_pickup").length}</strong>
            </div>
            <button type="button" className="strip-filter" onClick={() => setNotice("O filtro de período será conectado à agenda nesta área.")}>
              <CalendarDays size={17} />
              Hoje
              <ChevronRight size={15} />
            </button>
          </section>

          {isLoading && <div className="loading-line" aria-label="Atualizando dados" />}

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
                        onClick={() => setSelectedId(order.id)}
                      >
                        <span className="strip-order">OS {String(order.number).padStart(3, "0")}</span>
                        <span className="strip-plate">{order.license_plate}</span>
                        <span className="strip-car">{[order.make, order.model].filter(Boolean).join(" ") || "Veículo"}</span>
                        <span className="strip-divider" />
                        <span className="strip-person">{order.professional_name ?? "Sem técnico"}</span>
                        <span className="strip-box">{order.box_code ?? "Sem box"}</span>
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
        </div>
      </section>

      {isEntryOpen ? (
        <AutomotiveQuickEntry
          mode={mode}
          tenantId={tenantId}
          orders={orders}
          onClose={() => setIsEntryOpen(false)}
          onCreated={(entry) => {
            setOrders((current) => [entry, ...current]);
            setSelectedId(entry.id);
            setMode((current) => current === "empty" ? "live" : current);
            setIsEntryOpen(false);
            setNotice(`OS #${entry.number} aberta e posicionada em aguardando serviço.`);
          }}
        />
      ) : (
      <aside className={`order-detail ${selectedOrder ? "order-detail-open" : ""}`} aria-label="Detalhes da ordem de serviço">
        {selectedOrder ? (
          <>
            <div className="detail-topline">
              <span>Ordem de serviço</span>
              <button className="icon-button detail-close" type="button" onClick={() => setSelectedId("")}>
                <X size={18} />
                <span className="sr-only">Fechar detalhes</span>
              </button>
            </div>
            <div className="detail-identity">
              <div>
                <span className="detail-order-number">OS {String(selectedOrder.number).padStart(3, "0")}</span>
                <h2>{selectedOrder.license_plate}</h2>
                <p>{[selectedOrder.make, selectedOrder.model, selectedOrder.color].filter(Boolean).join(" · ")}</p>
              </div>
              <span className={`status-chip chip-${patioStatusCopy[selectedOrder.status].tone}`}>
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
                <span>Técnico</span>
                <strong>{selectedOrder.professional_name ?? "A definir"}</strong>
              </div>
              <div>
                <span>Box</span>
                <strong>{selectedOrder.box_name ?? "Pátio externo"}</strong>
              </div>
            </div>

            <div className="detail-sections">
              <section className="detail-section">
                <div className="section-title">
                  <span>Cliente</span>
                  <button type="button" onClick={() => setNotice("O perfil do cliente será aberto na próxima tela.")}>Ver perfil <ChevronRight size={14} /></button>
                </div>
                <strong>{selectedOrder.customer_name}</strong>
                <p>Recebimento e histórico do veículo ficam reunidos nesta OS.</p>
              </section>

              <section className="detail-section value-section">
                <div className="section-title">
                  <span>Fechamento</span>
                  <button type="button" onClick={() => setNotice("As opções financeiras completas ficam na OS.")} aria-label="Mais opções de fechamento"><MoreHorizontal size={18} /></button>
                </div>
                <div className="value-row"><span>Serviços e produtos</span><strong>{formatCurrency(selectedOrder.total_amount)}</strong></div>
                <div className="value-row"><span>Já recebido</span><strong>{formatCurrency(selectedOrder.paid_amount)}</strong></div>
                <div className="value-row value-row-total"><span>Saldo</span><strong>{formatCurrency(selectedOrder.outstanding_amount)}</strong></div>
              </section>

              <section className="detail-section quick-actions">
                <button type="button" onClick={() => setNotice("Itens serão incluídos pela tela completa da OS.")}><PackagePlus size={17} />Adicionar item</button>
                <button type="button" onClick={() => setNotice("O registro de pagamentos será o próximo fluxo financeiro.")}><CreditCard size={17} />Registrar pagamento</button>
                <button type="button" onClick={() => setNotice("As fotos serão enviadas para o Storage privado da OS.")}><Sparkles size={17} />Fotos da OS</button>
              </section>
            </div>

            <div className="detail-footer">
              <button type="button" className="secondary-action" onClick={() => setNotice("A tela completa da OS será aberta neste fluxo.")}>
                <Gauge size={18} />
                Ver OS completa
              </button>
              <button type="button" className="primary-action" onClick={() => void advanceOrder(selectedOrder)} disabled={isLoading}>
                {selectedOrder.status === "awaiting_pickup" ? <Check size={18} /> : <Wrench size={18} />}
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
      )}
    </main>
  );
}
