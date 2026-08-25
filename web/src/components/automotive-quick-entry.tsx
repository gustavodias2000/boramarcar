"use client";

import { CarFront, Check, CircleAlert, ClipboardList, Loader2, Search, UserRound, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import {
  AutomotiveDataMode,
  demonstrationOrders,
  displayLicensePlate,
  initialQuickEntryDraft,
  normalizeLicensePlate,
  normalizePatioOrder,
  PatioOrder,
  QuickEntryDraft,
} from "@/lib/automotive";
import { createClient } from "@/lib/supabase/client";

type LookupState = "idle" | "loading" | "found" | "new" | "error";

interface AutomotiveQuickEntryProps {
  mode: AutomotiveDataMode;
  tenantId: string | null;
  orders: PatioOrder[];
  onClose: () => void;
  onCreated: (order: PatioOrder) => void;
}

function optionalInteger(value: string) {
  return value.trim() ? Number(value) : null;
}

export function AutomotiveQuickEntry({ mode, tenantId, orders, onClose, onCreated }: AutomotiveQuickEntryProps) {
  const [draft, setDraft] = useState<QuickEntryDraft>(initialQuickEntryDraft);
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [lookupMessage, setLookupMessage] = useState("Informe a placa para verificar se este veículo já passou por aqui.");
  const [isExistingVehicle, setIsExistingVehicle] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [postCommitMessage, setPostCommitMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCommitted, setHasCommitted] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const plateInputRef = useRef<HTMLInputElement>(null);
  const lookupSequence = useRef(0);

  const isLive = mode === "live" || mode === "empty";

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => plateInputRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isSubmitting) return;
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [isSubmitting, onClose]);

  function updateDraft<K extends keyof QuickEntryDraft>(field: K, value: QuickEntryDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function fillExistingVehicle(vehicle: Partial<QuickEntryDraft>) {
    setDraft((current) => ({
      ...current,
      ...vehicle,
      licensePlate: displayLicensePlate(current.licensePlate),
    }));
    setIsExistingVehicle(true);
    setLookupState("found");
    setLookupMessage("Veículo localizado. Os dados cadastrais foram preservados para esta nova OS.");
  }

  async function lookupPlate() {
    const normalizedPlate = normalizeLicensePlate(draft.licensePlate);
    const lookupId = ++lookupSequence.current;
    setFormError(null);
    setPostCommitMessage(null);

    if (normalizedPlate.length < 6 || normalizedPlate.length > 8) {
      setLookupState("error");
      setLookupMessage("Digite uma placa com 6 a 8 letras ou números.");
      return;
    }

    updateDraft("licensePlate", displayLicensePlate(normalizedPlate));
    setLookupState("loading");
    setLookupMessage("Consultando a placa na unidade...");

    if (!isLive) {
      const existing = demonstrationOrders.find(
        (order) => order.normalized_license_plate === normalizedPlate,
      );

      if (existing) {
        fillExistingVehicle({
          customerName: existing.customer_name,
          make: existing.make ?? "",
          model: existing.model ?? "",
          color: existing.color ?? "",
        });
      } else {
        setIsExistingVehicle(false);
        setLookupState("new");
        setLookupMessage("Placa nova nesta prévia. Cadastre o cliente e abra a primeira OS.");
      }
      return;
    }

    if (!tenantId) {
      setLookupState("error");
      setLookupMessage("Não foi possível identificar a unidade ativa desta sessão.");
      return;
    }

    const supabase = createClient();
    const { data: vehicle, error: vehicleError } = await supabase
      .from("automotive_vehicles")
      .select("id, customer_id, license_plate, make, model, color, year_model, active")
      .eq("tenant_id", tenantId)
      .eq("normalized_license_plate", normalizedPlate)
      .maybeSingle();

    if (lookupSequence.current !== lookupId) return;

    if (vehicleError) {
      setLookupState("error");
      setLookupMessage(`Não foi possível consultar a placa: ${vehicleError.message}`);
      return;
    }

    if (!vehicle) {
      setIsExistingVehicle(false);
      setLookupState("new");
      setLookupMessage("Placa nova. Cadastre o cliente e confirme a entrada.");
      return;
    }

    if (!vehicle.active) {
      setIsExistingVehicle(false);
      setLookupState("error");
      setLookupMessage("Esta placa pertence a um veículo inativo. Reative o cadastro antes de abrir uma OS.");
      return;
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("name, whatsapp, active")
      .eq("id", vehicle.customer_id)
      .maybeSingle();

    if (lookupSequence.current !== lookupId) return;

    if (customerError || !customer) {
      setLookupState("error");
      setLookupMessage("O veículo foi encontrado, mas não foi possível abrir o cadastro do cliente.");
      return;
    }

    if (!customer.active) {
      setIsExistingVehicle(false);
      setLookupState("error");
      setLookupMessage("O cliente deste veículo está inativo. Reative o cadastro antes de abrir uma OS.");
      return;
    }

    fillExistingVehicle({
      customerName: customer.name,
      customerPhone: customer.whatsapp ?? "",
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      color: vehicle.color ?? "",
      yearModel: vehicle.year_model ? String(vehicle.year_model) : "",
    });
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (hasCommitted) return;

    if (lookupState === "idle") {
      setFormError("Consulte a placa antes de abrir a OS.");
      return;
    }

    const odometer = optionalInteger(draft.odometer);
    const fuelLevel = optionalInteger(draft.fuelLevel);
    const yearModel = optionalInteger(draft.yearModel);

    if (!isExistingVehicle && !draft.customerName.trim()) {
      setFormError("Informe o nome do cliente para cadastrar um veículo novo.");
      return;
    }

    if (odometer !== null && (!Number.isInteger(odometer) || odometer < 0)) {
      setFormError("A quilometragem precisa ser um número inteiro igual ou maior que zero.");
      return;
    }

    if (fuelLevel !== null && (!Number.isInteger(fuelLevel) || fuelLevel < 0 || fuelLevel > 100)) {
      setFormError("O nível de combustível deve estar entre 0 e 100.");
      return;
    }

    if (yearModel !== null && (!Number.isInteger(yearModel) || yearModel < 1900 || yearModel > 2100)) {
      setFormError("Informe um ano-modelo entre 1900 e 2100.");
      return;
    }

    setIsSubmitting(true);

    if (!isLive) {
      const now = new Date().toISOString();
      const nextNumber = Math.max(0, ...orders.map((order) => order.number)) + 1;
      const normalizedPlate = normalizeLicensePlate(draft.licensePlate);
      const entry: PatioOrder = {
        id: `demo-entry-${Date.now()}`,
        tenant_id: "demo-tenant",
        number: nextNumber,
        status: "awaiting_service",
        created_at: now,
        received_at: now,
        customer_id: "demo-customer-entry",
        customer_name: draft.customerName.trim(),
        vehicle_id: "demo-vehicle-entry",
        license_plate: displayLicensePlate(normalizedPlate),
        normalized_license_plate: normalizedPlate,
        make: draft.make.trim() || null,
        model: draft.model.trim() || null,
        color: draft.color.trim() || null,
        professional_id: null,
        professional_name: null,
        box_id: null,
        box_code: null,
        box_name: null,
        total_amount: 0,
        paid_amount: 0,
        outstanding_amount: 0,
        payment_status: "unpaid",
      };

      onCreated(entry);
      setIsSubmitting(false);
      return;
    }

    if (!tenantId) {
      setFormError("Não foi possível identificar a unidade ativa desta sessão.");
      setIsSubmitting(false);
      return;
    }

    const supabase = createClient();
    const { data: workOrder, error: entryError } = await supabase.rpc(
      "open_automotive_walk_in_work_order",
      {
        p_tenant_id: tenantId,
        p_license_plate: draft.licensePlate,
        p_customer_name: draft.customerName.trim() || null,
        p_customer_phone: draft.customerPhone.trim() || null,
        p_make: draft.make.trim() || null,
        p_model: draft.model.trim() || null,
        p_color: draft.color.trim() || null,
        p_year_model: yearModel,
        p_odometer: odometer,
        p_fuel_level: fuelLevel,
        p_condition_notes: draft.conditionNotes.trim() || null,
        p_notes: draft.notes.trim() || null,
      },
    );

    if (entryError || !workOrder) {
      setFormError(`Não foi possível abrir a OS: ${entryError?.message ?? "resposta vazia do servidor"}.`);
      setIsSubmitting(false);
      return;
    }

    const { data: patioOrder, error: patioError } = await supabase
      .from("automotive_patio")
      .select("*")
      .eq("id", workOrder.id)
      .maybeSingle();

    if (patioError || !patioOrder) {
      setHasCommitted(true);
      setPostCommitMessage("A OS foi aberta, mas o Pátio não pôde ser atualizado. Atualize a página para vê-la.");
      setIsSubmitting(false);
      return;
    }

    onCreated(normalizePatioOrder(patioOrder as PatioOrder));
    setIsSubmitting(false);
  }

  return (
    <aside className="entry-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label="Entrada rápida de veículo">
      <div className="entry-panel-topline">
        <span>Recebimento</span>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar entrada rápida" disabled={isSubmitting}>
          <X size={18} />
        </button>
      </div>

      <form className="quick-entry-form" onSubmit={submitEntry}>
        <div className="entry-heading">
          <div className="entry-heading-icon"><CarFront size={21} /></div>
          <h2>Entrada rápida</h2>
          <p>Comece pela placa. O Bora Marcá encontra o veículo ou prepara o primeiro cadastro e a OS.</p>
        </div>

        <section className="entry-section entry-plate-section">
          <label className="entry-field entry-field-plate" htmlFor="license-plate">
            <span>Placa</span>
            <input
              id="license-plate"
              name="license-plate"
              ref={plateInputRef}
              value={draft.licensePlate}
              onChange={(event) => {
                lookupSequence.current += 1;
                updateDraft("licensePlate", event.target.value.toUpperCase());
                setLookupState("idle");
                setIsExistingVehicle(false);
                setLookupMessage("Consulte a placa antes de abrir a OS.");
              }}
              placeholder="ABC-1D23"
              autoComplete="off"
              inputMode="text"
              required
            />
          </label>
          <button className="plate-lookup-button" type="button" onClick={() => void lookupPlate()} disabled={lookupState === "loading"}>
            {lookupState === "loading" ? <Loader2 size={17} className="spin" /> : <Search size={17} />}
            Consultar
          </button>
          <div className={`plate-result plate-result-${lookupState}`} role="status">
            {lookupState === "found" ? <Check size={16} /> : <CircleAlert size={16} />}
            <span>{lookupMessage}</span>
          </div>
        </section>

        <section className="entry-section">
          <div className="entry-section-title"><UserRound size={16} /> <span>Cliente</span></div>
          <label className="entry-field" htmlFor="customer-name">
            <span>Nome completo</span>
            <input id="customer-name" value={draft.customerName} onChange={(event) => updateDraft("customerName", event.target.value)} disabled={isExistingVehicle} required={!isExistingVehicle} />
          </label>
          <label className="entry-field" htmlFor="customer-phone">
            <span>WhatsApp</span>
            <input id="customer-phone" value={draft.customerPhone} onChange={(event) => updateDraft("customerPhone", event.target.value)} disabled={isExistingVehicle} placeholder="(11) 99999-9999" inputMode="tel" />
          </label>
        </section>

        <section className="entry-section">
          <div className="entry-section-title"><CarFront size={16} /> <span>Veículo</span></div>
          <div className="entry-field-grid">
            <label className="entry-field" htmlFor="vehicle-make"><span>Marca</span><input id="vehicle-make" value={draft.make} onChange={(event) => updateDraft("make", event.target.value)} disabled={isExistingVehicle} placeholder="Fiat" /></label>
            <label className="entry-field" htmlFor="vehicle-model"><span>Modelo</span><input id="vehicle-model" value={draft.model} onChange={(event) => updateDraft("model", event.target.value)} disabled={isExistingVehicle} placeholder="Pulse" /></label>
            <label className="entry-field" htmlFor="vehicle-color"><span>Cor</span><input id="vehicle-color" value={draft.color} onChange={(event) => updateDraft("color", event.target.value)} disabled={isExistingVehicle} placeholder="Vermelho" /></label>
            <label className="entry-field" htmlFor="vehicle-year"><span>Ano</span><input id="vehicle-year" value={draft.yearModel} onChange={(event) => updateDraft("yearModel", event.target.value)} disabled={isExistingVehicle} placeholder="2025" inputMode="numeric" /></label>
          </div>
        </section>

        <section className="entry-section">
          <div className="entry-section-title"><ClipboardList size={16} /> <span>Recebimento</span></div>
          <div className="entry-field-grid">
            <label className="entry-field" htmlFor="odometer"><span>Quilometragem</span><input id="odometer" value={draft.odometer} onChange={(event) => updateDraft("odometer", event.target.value)} placeholder="Ex.: 45200" inputMode="numeric" /></label>
            <label className="entry-field" htmlFor="fuel-level"><span>Combustível %</span><input id="fuel-level" value={draft.fuelLevel} onChange={(event) => updateDraft("fuelLevel", event.target.value)} placeholder="Ex.: 50" inputMode="numeric" /></label>
          </div>
          <label className="entry-field" htmlFor="condition-notes"><span>Condição do veículo</span><textarea id="condition-notes" value={draft.conditionNotes} onChange={(event) => updateDraft("conditionNotes", event.target.value)} placeholder="Itens e avarias já identificados" rows={2} /></label>
          <label className="entry-field" htmlFor="entry-notes"><span>Observação da OS</span><textarea id="entry-notes" value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} placeholder="Orientações para a equipe" rows={2} /></label>
        </section>

        {formError && <p className="entry-error" role="alert"><CircleAlert size={16} /> {formError}</p>}
        {postCommitMessage && <p className="entry-success" role="status"><Check size={16} /> {postCommitMessage}</p>}

        <div className="entry-submit-wrap">
          <p>{isLive ? "A OS será registrada na unidade atual." : "Prévia: a OS aparecerá apenas neste Pátio."}</p>
          <button className="primary-action entry-submit" type="submit" disabled={isSubmitting || hasCommitted}>
            {isSubmitting ? <Loader2 size={18} className="spin" /> : <Check size={18} />}
            {isSubmitting ? "Abrindo OS..." : hasCommitted ? "OS aberta" : "Abrir OS no Pátio"}
          </button>
        </div>
      </form>
    </aside>
  );
}
