"use client";

/* Signed, private Supabase Storage URLs are short-lived and not suitable for static image optimization. */
/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  Camera,
  Check,
  CircleAlert,
  CreditCard,
  FilePlus2,
  ImagePlus,
  Loader2,
  PackagePlus,
  ReceiptText,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import {
  AutomotiveDataMode,
  AutomotiveMediaStage,
  AutomotivePaymentKind,
  AutomotivePaymentMethod,
  formatCurrency,
  formatDateTime,
  mediaStageCopy,
  PatioOrder,
  paymentMethodCopy,
  WorkOrderItem,
  WorkOrderItemKind,
  WorkOrderMedia,
  WorkOrderPayment,
} from "@/lib/automotive";
import { createClient } from "@/lib/supabase/client";

interface AutomotiveWorkOrderProps {
  mode: AutomotiveDataMode;
  order: PatioOrder;
  onClose: () => void;
  onTotalsChange: (totalDelta: number, paidDelta: number) => void;
}

const emptyItemForm = {
  kind: "service" as WorkOrderItemKind,
  description: "",
  quantity: "1",
  unitPrice: "",
};
const emptyPaymentForm = {
  kind: "payment" as AutomotivePaymentKind,
  method: "pix" as AutomotivePaymentMethod,
  amount: "",
  notes: "",
};

function toNumber(value: number | string) {
  return Number(value);
}

function parseBrazilianNumber(value: string) {
  return Number(value.replace(/\./g, "").replace(",", "."));
}

function seedDemoItems(order: PatioOrder): WorkOrderItem[] {
  const total = toNumber(order.total_amount);
  if (!total) return [];

  return [
    {
      id: `${order.id}-item`,
      tenant_id: order.tenant_id,
      work_order_id: order.id,
      kind: "service",
      description: "Serviço principal da OS",
      quantity: 1,
      unit_price: total,
      line_total: total,
      created_at: order.created_at,
    },
  ];
}

function seedDemoPayments(order: PatioOrder): WorkOrderPayment[] {
  const paid = toNumber(order.paid_amount);
  if (!paid) return [];

  return [
    {
      id: `${order.id}-payment`,
      tenant_id: order.tenant_id,
      work_order_id: order.id,
      kind: "payment",
      method: "pix",
      amount: paid,
      paid_at: order.received_at,
      notes: "Recebimento de demonstração",
      created_at: order.received_at,
    },
  ];
}

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName === "jpg" || fromName === "jpeg" || fromName === "png" || fromName === "webp")
    return fromName;

  return file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
}

export function AutomotiveWorkOrder({
  mode,
  order,
  onClose,
  onTotalsChange,
}: AutomotiveWorkOrderProps) {
  const isLive = mode === "live";
  const canEditItems = order.status !== "awaiting_pickup";
  const [items, setItems] = useState<WorkOrderItem[]>(() => (isLive ? [] : seedDemoItems(order)));
  const [payments, setPayments] = useState<WorkOrderPayment[]>(() =>
    isLive ? [] : seedDemoPayments(order),
  );
  const [media, setMedia] = useState<WorkOrderMedia[]>([]);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [mediaStage, setMediaStage] = useState<AutomotiveMediaStage>("execution");
  const [mediaCaption, setMediaCaption] = useState("");
  const [isLoading, setIsLoading] = useState(isLive);
  const [hasLoadedDetails, setHasLoadedDetails] = useState(!isLive);
  const [detailsRetry, setDetailsRetry] = useState(0);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [busyMediaId, setBusyMediaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const isMutating =
    isSavingItem || isSavingPayment || isUploading || Boolean(busyItemId) || Boolean(busyMediaId);
  const areActionsBlocked = isLoading || !hasLoadedDetails || isMutating;
  const isMutatingRef = useRef(false);

  useEffect(() => {
    isMutatingRef.current = isMutating;
  }, [isMutating]);

  useEffect(() => {
    if (!isLive) return;

    let cancelled = false;
    const supabase = createClient();

    async function loadDetails() {
      setIsLoading(true);
      setHasLoadedDetails(false);
      const [itemsResult, paymentsResult, mediaResult] = await Promise.all([
        supabase
          .from("automotive_work_order_items")
          .select("*")
          .eq("work_order_id", order.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("automotive_work_order_payments")
          .select("*")
          .eq("work_order_id", order.id)
          .order("paid_at", { ascending: false }),
        supabase
          .from("automotive_work_order_media")
          .select("*")
          .eq("work_order_id", order.id)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const requestError = itemsResult.error ?? paymentsResult.error ?? mediaResult.error;
      if (requestError) {
        setError(`Não foi possível carregar a OS: ${requestError.message}`);
        setIsLoading(false);
        return;
      }

      const records = (mediaResult.data ?? []) as WorkOrderMedia[];
      const mediaWithUrls = await Promise.all(
        records.map(async (record) => {
          const { data } = await supabase.storage
            .from("automotive-work-order-media")
            .createSignedUrl(record.storage_path, 1800);
          return { ...record, signed_url: data?.signedUrl };
        }),
      );

      if (cancelled) return;
      setItems((itemsResult.data ?? []) as WorkOrderItem[]);
      setPayments((paymentsResult.data ?? []) as WorkOrderPayment[]);
      setMedia(mediaWithUrls);
      setHasLoadedDetails(true);
      setIsLoading(false);
    }

    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [detailsRetry, isLive, order.id]);

  function retryDetailsLoad() {
    setError(null);
    setMessage(null);
    setDetailsRetry((current) => current + 1);
  }

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function trapFocus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (isMutatingRef.current) {
          setMessage("Aguarde a conclusão da operação atual antes de sair da OS.");
          return;
        }
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", trapFocus);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", trapFocus);
      previousFocus?.focus();
    };
  }, [onClose]);

  const itemTotal = items.reduce((sum, item) => sum + toNumber(item.line_total), 0);
  const paidTotal = payments.reduce(
    (sum, payment) => sum + (payment.kind === "refund" ? -1 : 1) * toNumber(payment.amount),
    0,
  );
  const balance = itemTotal - paidTotal;

  function requestClose() {
    if (isMutating) {
      setMessage("Aguarde a conclusão da operação atual antes de sair da OS.");
      return;
    }

    onClose();
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const quantity = parseBrazilianNumber(itemForm.quantity);
    const unitPrice = parseBrazilianNumber(itemForm.unitPrice);
    if (
      !itemForm.description.trim() ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      setError("Informe descrição, quantidade maior que zero e valor unitário válido.");
      return;
    }

    setIsSavingItem(true);
    const lineTotal = Math.round(quantity * unitPrice * 100) / 100;

    if (!isLive) {
      const item: WorkOrderItem = {
        id: `demo-item-${Date.now()}`,
        tenant_id: order.tenant_id,
        work_order_id: order.id,
        kind: itemForm.kind,
        description: itemForm.description.trim(),
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        created_at: new Date().toISOString(),
      };
      setItems((current) => [...current, item]);
      onTotalsChange(lineTotal, 0);
      setItemForm(emptyItemForm);
      setMessage("Item incluído na prévia da OS.");
      setIsSavingItem(false);
      return;
    }

    const { data, error: rpcError } = await createClient().rpc("add_automotive_work_order_item", {
      p_work_order_id: order.id,
      p_kind: itemForm.kind,
      p_description: itemForm.description.trim(),
      p_quantity: quantity,
      p_unit_price: unitPrice,
    });

    if (rpcError || !data) {
      setError(
        `Não foi possível incluir o item: ${rpcError?.message ?? "resposta vazia do servidor"}.`,
      );
      setIsSavingItem(false);
      return;
    }

    const item = data as WorkOrderItem;
    setItems((current) => [...current, item]);
    onTotalsChange(toNumber(item.line_total), 0);
    setItemForm(emptyItemForm);
    setMessage("Item incluído na OS.");
    setIsSavingItem(false);
  }

  async function removeItem(item: WorkOrderItem) {
    if (!window.confirm(`Remover “${item.description}” da OS?`)) return;
    setError(null);
    setMessage(null);
    setBusyItemId(item.id);

    if (isLive) {
      const { error: rpcError } = await createClient().rpc("remove_automotive_work_order_item", {
        p_item_id: item.id,
      });
      if (rpcError) {
        setError(`Não foi possível remover o item: ${rpcError.message}`);
        setBusyItemId(null);
        return;
      }
    }

    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    onTotalsChange(-toNumber(item.line_total), 0);
    setMessage("Item removido da OS.");
    setBusyItemId(null);
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const amount = parseBrazilianNumber(paymentForm.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe um valor de pagamento maior que zero.");
      return;
    }

    setIsSavingPayment(true);
    if (!isLive) {
      const payment: WorkOrderPayment = {
        id: `demo-payment-${Date.now()}`,
        tenant_id: order.tenant_id,
        work_order_id: order.id,
        kind: paymentForm.kind,
        method: paymentForm.method,
        amount,
        paid_at: new Date().toISOString(),
        notes: paymentForm.notes.trim() || null,
        created_at: new Date().toISOString(),
      };
      setPayments((current) => [payment, ...current]);
      onTotalsChange(0, payment.kind === "payment" ? amount : -amount);
      setPaymentForm(emptyPaymentForm);
      setMessage("Recebimento incluído na prévia da OS.");
      setIsSavingPayment(false);
      return;
    }

    const { data, error: rpcError } = await createClient().rpc(
      "record_automotive_work_order_payment",
      {
        p_work_order_id: order.id,
        p_kind: paymentForm.kind,
        p_method: paymentForm.method,
        p_amount: amount,
        p_notes: paymentForm.notes.trim() || null,
      },
    );

    if (rpcError || !data) {
      setError(
        `Não foi possível registrar o recebimento: ${rpcError?.message ?? "resposta vazia do servidor"}.`,
      );
      setIsSavingPayment(false);
      return;
    }

    const payment = data as WorkOrderPayment;
    setPayments((current) => [payment, ...current]);
    onTotalsChange(
      0,
      payment.kind === "payment" ? toNumber(payment.amount) : -toNumber(payment.amount),
    );
    setPaymentForm(emptyPaymentForm);
    setMessage(payment.kind === "payment" ? "Recebimento registrado." : "Estorno registrado.");
    setIsSavingPayment(false);
  }

  async function uploadMedia(file: File) {
    setError(null);
    setMessage(null);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Envie JPG, PNG ou WEBP de até 10 MB.");
      return;
    }

    setIsUploading(true);
    if (!isLive) {
      const mediaRecord: WorkOrderMedia = {
        id: `demo-media-${Date.now()}`,
        tenant_id: order.tenant_id,
        work_order_id: order.id,
        stage: mediaStage,
        storage_path: file.name,
        caption: mediaCaption.trim() || file.name,
        created_at: new Date().toISOString(),
        signed_url: URL.createObjectURL(file),
      };
      setMedia((current) => [mediaRecord, ...current]);
      setMediaCaption("");
      setMessage("Foto incluída somente nesta prévia.");
      setIsUploading(false);
      return;
    }

    const supabase = createClient();
    const fileId = crypto.randomUUID();
    const storagePath = `${order.tenant_id}/${order.id}/${mediaStage}/${fileId}.${extensionFor(file)}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("automotive-work-order-media")
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError || !uploadData) {
      setError(
        `Não foi possível enviar a foto: ${uploadError?.message ?? "resposta vazia do Storage"}.`,
      );
      setIsUploading(false);
      return;
    }

    const { data: registeredMedia, error: registerError } = await supabase.rpc(
      "register_automotive_work_order_media",
      {
        p_work_order_id: order.id,
        p_stage: mediaStage,
        p_storage_path: uploadData.path,
        p_caption: mediaCaption.trim() || file.name,
      },
    );

    if (registerError || !registeredMedia) {
      await supabase.storage.from("automotive-work-order-media").remove([uploadData.path]);
      setError(
        `A foto foi removida porque não pôde ser vinculada à OS: ${registerError?.message ?? "resposta vazia do servidor"}.`,
      );
      setIsUploading(false);
      return;
    }

    const { data: signedData } = await supabase.storage
      .from("automotive-work-order-media")
      .createSignedUrl(uploadData.path, 1800);
    setMedia((current) => [
      { ...(registeredMedia as WorkOrderMedia), signed_url: signedData?.signedUrl },
      ...current,
    ]);
    setMediaCaption("");
    setMessage("Foto privada vinculada à OS.");
    setIsUploading(false);
  }

  async function removeMedia(mediaRecord: WorkOrderMedia) {
    if (!window.confirm("Remover esta foto da OS?")) return;
    setError(null);
    setMessage(null);
    setBusyMediaId(mediaRecord.id);

    if (isLive) {
      const supabase = createClient();
      const { error: storageError } = await supabase.storage
        .from("automotive-work-order-media")
        .remove([mediaRecord.storage_path]);
      if (storageError) {
        setError(`Não foi possível remover o arquivo privado: ${storageError.message}`);
        setBusyMediaId(null);
        return;
      }

      const { error: rpcError } = await supabase.rpc("remove_automotive_work_order_media", {
        p_media_id: mediaRecord.id,
      });
      if (rpcError) {
        setError(
          `O arquivo foi removido, mas a OS ainda precisa excluir o registro: ${rpcError.message}`,
        );
        setBusyMediaId(null);
        return;
      }
    }

    setMedia((current) => current.filter((currentMedia) => currentMedia.id !== mediaRecord.id));
    setMessage("Foto removida da OS.");
    setBusyMediaId(null);
  }

  return (
    <section
      className="work-order-desk"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Ordem de serviço ${order.number}`}
    >
      <header className="work-order-header">
        <button
          className="desk-back"
          type="button"
          onClick={requestClose}
          disabled={isMutating}
          ref={closeButtonRef}
        >
          <ArrowLeft size={18} />
          Voltar ao Pátio
        </button>
        <div className="work-order-title">
          <span>OS {String(order.number).padStart(3, "0")}</span>
          <h1>{order.license_plate}</h1>
          <p>
            {[order.make, order.model, order.color].filter(Boolean).join(" · ") ||
              "Veículo em atendimento"}{" "}
            · {order.customer_name}
          </p>
        </div>
        <div className="work-order-balance">
          <span>{balance < 0 ? "Crédito do cliente" : "Saldo atual"}</span>
          <strong>{formatCurrency(Math.abs(balance))}</strong>
          <small>
            {balance < 0
              ? "Pagamento acima do total"
              : isLive
                ? "Dados da OS"
                : "Prévia demonstrativa"}
          </small>
        </div>
      </header>

      {(error || message) && (
        <div
          className={`desk-notice ${error ? "desk-notice-error" : "desk-notice-success"}`}
          role={error ? "alert" : "status"}
        >
          {error ? <CircleAlert size={17} /> : <Check size={17} />}
          <span>{error ?? message}</span>
          {error && isLive && !hasLoadedDetails && !isLoading && (
            <button className="desk-notice-retry" type="button" onClick={retryDetailsLoad}>
              Tentar novamente
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMessage(null);
            }}
            aria-label="Fechar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <main className="work-order-columns">
        <section className="work-order-section composition-section">
          <div className="work-order-section-heading">
            <PackagePlus size={18} />
            <div>
              <h2>Composição</h2>
              <p>Serviços e produtos desta OS.</p>
            </div>
          </div>
          <div className="financial-summary">
            <span>
              {items.length} item{items.length === 1 ? "" : "s"}
            </span>
            <strong>{formatCurrency(itemTotal)}</strong>
          </div>
          <div className="ledger-list">
            {items.map((item) => (
              <article className="ledger-row" key={item.id}>
                <div>
                  <span className="ledger-kind">
                    {item.kind === "service" ? "Serviço" : "Produto"}
                  </span>
                  <strong>{item.description}</strong>
                  <small>
                    {item.quantity} × {formatCurrency(item.unit_price)}
                  </small>
                </div>
                <div className="ledger-value">
                  <strong>{formatCurrency(item.line_total)}</strong>
                  {canEditItems && (
                    <button
                      type="button"
                      onClick={() => void removeItem(item)}
                      disabled={areActionsBlocked}
                      aria-label={`Remover ${item.description}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!items.length && <p className="ledger-empty">Nenhum item lançado nesta OS.</p>}
          </div>
          {canEditItems ? (
            <form className="desk-form" onSubmit={submitItem}>
              <fieldset className="desk-form-fields" disabled={areActionsBlocked}>
                <div className="desk-form-title">
                  <FilePlus2 size={16} />
                  Adicionar item
                </div>
                <div className="desk-field-grid desk-field-grid-three">
                  <label>
                    <span>Tipo</span>
                    <select
                      value={itemForm.kind}
                      onChange={(event) =>
                        setItemForm((current) => ({
                          ...current,
                          kind: event.target.value as WorkOrderItemKind,
                        }))
                      }
                    >
                      <option value="service">Serviço</option>
                      <option value="product">Produto</option>
                    </select>
                  </label>
                  <label className="field-wide">
                    <span>Descrição</span>
                    <input
                      value={itemForm.description}
                      onChange={(event) =>
                        setItemForm((current) => ({ ...current, description: event.target.value }))
                      }
                      placeholder="Ex.: Higienização interna"
                      required
                    />
                  </label>
                  <label>
                    <span>Quantidade</span>
                    <input
                      value={itemForm.quantity}
                      onChange={(event) =>
                        setItemForm((current) => ({ ...current, quantity: event.target.value }))
                      }
                      inputMode="decimal"
                      required
                    />
                  </label>
                  <label>
                    <span>Valor unit.</span>
                    <input
                      value={itemForm.unitPrice}
                      onChange={(event) =>
                        setItemForm((current) => ({ ...current, unitPrice: event.target.value }))
                      }
                      placeholder="0,00"
                      inputMode="decimal"
                      required
                    />
                  </label>
                </div>
                <button className="desk-submit" type="submit" disabled={isSavingItem}>
                  {isSavingItem ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <PackagePlus size={16} />
                  )}
                  {isSavingItem ? "Incluindo..." : "Incluir item"}
                </button>
              </fieldset>
            </form>
          ) : (
            <p className="desk-rule">
              Itens não podem ser alterados depois que a OS aguarda retirada.
            </p>
          )}
        </section>

        <section className="work-order-section payment-section">
          <div className="work-order-section-heading">
            <CreditCard size={18} />
            <div>
              <h2>Recebimentos</h2>
              <p>Pagamento é separado da entrega.</p>
            </div>
          </div>
          <div className="financial-summary">
            <span>{paidTotal > 0 ? "Recebido" : "Ainda sem recebimento"}</span>
            <strong>{formatCurrency(paidTotal)}</strong>
          </div>
          <div className="ledger-list">
            {payments.map((payment) => (
              <article className="ledger-row" key={payment.id}>
                <div>
                  <span
                    className={`ledger-kind ${payment.kind === "refund" ? "ledger-kind-refund" : ""}`}
                  >
                    {payment.kind === "payment" ? "Recebimento" : "Estorno"}
                  </span>
                  <strong>{paymentMethodCopy[payment.method]}</strong>
                  <small>
                    {formatDateTime(payment.paid_at)}
                    {payment.notes ? ` · ${payment.notes}` : ""}
                  </small>
                </div>
                <div
                  className={`ledger-value ${payment.kind === "refund" ? "ledger-value-refund" : ""}`}
                >
                  <strong>
                    {payment.kind === "refund" ? "−" : "+"}
                    {formatCurrency(payment.amount)}
                  </strong>
                </div>
              </article>
            ))}
            {!payments.length && (
              <p className="ledger-empty">Nenhum recebimento lançado nesta OS.</p>
            )}
          </div>
          <form className="desk-form" onSubmit={submitPayment}>
            <fieldset className="desk-form-fields" disabled={areActionsBlocked}>
              <div className="desk-form-title">
                <ReceiptText size={16} />
                Registrar movimento
              </div>
              <div className="desk-field-grid">
                <label>
                  <span>Movimento</span>
                  <select
                    value={paymentForm.kind}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        kind: event.target.value as AutomotivePaymentKind,
                      }))
                    }
                  >
                    <option value="payment">Recebimento</option>
                    <option value="refund">Estorno</option>
                  </select>
                </label>
                <label>
                  <span>Meio</span>
                  <select
                    value={paymentForm.method}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        method: event.target.value as AutomotivePaymentMethod,
                      }))
                    }
                  >
                    {Object.entries(paymentMethodCopy).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Valor</span>
                  <input
                    value={paymentForm.amount}
                    onChange={(event) =>
                      setPaymentForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    placeholder="0,00"
                    inputMode="decimal"
                    required
                  />
                </label>
                <label className="field-wide">
                  <span>Observação</span>
                  <input
                    value={paymentForm.notes}
                    onChange={(event) =>
                      setPaymentForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="Opcional"
                  />
                </label>
              </div>
              <button
                className="desk-submit desk-submit-payment"
                type="submit"
                disabled={isSavingPayment}
              >
                {isSavingPayment ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <CreditCard size={16} />
                )}
                {isSavingPayment
                  ? "Registrando..."
                  : paymentForm.kind === "payment"
                    ? "Registrar recebimento"
                    : "Registrar estorno"}
              </button>
            </fieldset>
          </form>
        </section>

        <section className="work-order-section media-section">
          <div className="work-order-section-heading">
            <Camera size={18} />
            <div>
              <h2>Evidências</h2>
              <p>Fotos privadas vinculadas à OS.</p>
            </div>
          </div>
          <div className="media-count">
            <span>
              {media.length} foto{media.length === 1 ? "" : "s"}
            </span>
            <small>JPG, PNG ou WEBP até 10 MB</small>
          </div>
          <div className="media-grid">
            {media.map((mediaRecord) => (
              <article className="media-tile" key={mediaRecord.id}>
                {mediaRecord.signed_url ? (
                  <img
                    src={mediaRecord.signed_url}
                    alt={mediaRecord.caption || `Foto de ${mediaStageCopy[mediaRecord.stage]}`}
                  />
                ) : (
                  <div className="media-missing">
                    <Camera size={21} />
                    <span>Prévia indisponível</span>
                  </div>
                )}
                <div className="media-tile-footer">
                  <span>{mediaStageCopy[mediaRecord.stage]}</span>
                  <button
                    type="button"
                    onClick={() => void removeMedia(mediaRecord)}
                    disabled={areActionsBlocked}
                    aria-label="Remover foto"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
            {!media.length && (
              <div className="media-empty">
                <ImagePlus size={24} />
                <span>Registre a condição do veículo em cada etapa.</span>
              </div>
            )}
          </div>
          <div className="media-upload">
            <div className="desk-field-grid">
              <label>
                <span>Etapa</span>
                <select
                  value={mediaStage}
                  disabled={areActionsBlocked}
                  onChange={(event) => setMediaStage(event.target.value as AutomotiveMediaStage)}
                >
                  {Object.entries(mediaStageCopy).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-wide">
                <span>Legenda</span>
                <input
                  value={mediaCaption}
                  disabled={areActionsBlocked}
                  onChange={(event) => setMediaCaption(event.target.value)}
                  placeholder="Ex.: Para-choque dianteiro"
                />
              </label>
            </div>
            <input
              ref={uploadInputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={areActionsBlocked}
              tabIndex={-1}
              onChange={(event) => {
                const [file] = Array.from(event.target.files ?? []);
                if (file) void uploadMedia(file);
                event.currentTarget.value = "";
              }}
            />
            <button
              className="media-upload-button"
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={areActionsBlocked}
            >
              {isUploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
              {isUploading ? "Enviando foto..." : "Adicionar foto privada"}
            </button>
          </div>
        </section>
      </main>

      {isLoading && (
        <div className="desk-loading">
          <Loader2 size={20} className="spin" /> Carregando composição, recebimentos e evidências...
        </div>
      )}
    </section>
  );
}
