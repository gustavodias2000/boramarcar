"use client";

import { CircleAlert, Loader2, Save, ScrollText, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  BUSINESS_ROLE_LABELS,
  RETENTION_MONTHS_RANGE,
  can,
  listAuditLog,
  rolesWith,
  setDataRetention,
  type AuditEntry,
  type BusinessRole,
} from "@boramarca/core";

interface CorePrivacyProps {
  tenantId: string;
  unitName: string;
  role: BusinessRole;
  onBusinessDeleted: () => void;
}

// A trilha guarda o verbo cru; a tela traduz. Ação desconhecida cai no próprio código,
// que é melhor do que esconder um evento que ninguém previu.
const ACTION_LABELS: Record<string, string> = {
  anonymize: "Anonimizou",
  deactivate: "Desligou",
};

const ENTITY_LABELS: Record<string, string> = {
  customer: "cliente",
  professional: "profissional",
};

function describe(entry: AuditEntry) {
  const action = ACTION_LABELS[entry.action] ?? entry.action;
  const entity = ENTITY_LABELS[entry.entity] ?? entry.entity;
  const reason = typeof entry.metadata?.reason === "string" ? entry.metadata.reason : null;
  return reason ? `${action} ${entity} — ${reason}` : `${action} ${entity}`;
}

export function CorePrivacy({ tenantId, unitName, role, onBusinessDeleted }: CorePrivacyProps) {
  const supabase = createClient();

  const [retention, setRetention] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const canManage = can(role, "manageBusiness");
  const canAudit = can(role, "viewAuditLog");
  const canDelete = can(role, "deleteBusiness");

  // A carga mora dentro do efeito porque é só dele: fora daqui, viraria dependência e
  // o próprio `setIsLoading` inicial passaria a disparar renderização em cascata. O
  // `cancelled` cobre a troca de unidade antes da resposta chegar.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [business, audit] = await Promise.all([
        supabase
          .from("businesses")
          .select("data_retention_months")
          .eq("id", tenantId)
          .maybeSingle(),
        canAudit
          ? listAuditLog(supabase, tenantId, 20)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (cancelled) return;

      if (business.data?.data_retention_months != null) {
        setRetention(String(business.data.data_retention_months));
      }

      setEntries((audit.data ?? []) as AuditEntry[]);
      setIsLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase, tenantId, canAudit]);

  async function submitRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    const parsed = retention.trim() === "" ? null : Number(retention);

    if (
      parsed !== null &&
      (!Number.isInteger(parsed) ||
        parsed < RETENTION_MONTHS_RANGE.min ||
        parsed > RETENTION_MONTHS_RANGE.max)
    ) {
      setErrorMessage(
        `Informe um prazo entre ${RETENTION_MONTHS_RANGE.min} e ${RETENTION_MONTHS_RANGE.max} meses, ou deixe em branco.`,
      );
      setIsSaving(false);
      return;
    }

    const { error } = await setDataRetention(supabase, tenantId, parsed);
    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage(
      parsed === null
        ? "Prazo removido. Sem prazo declarado, nada é descartado automaticamente."
        : `Prazo de ${parsed} meses registrado.`,
    );
  }

  async function submitDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsDeleting(true);

    const { error } = await supabase.rpc("delete_business", {
      p_tenant_id: tenantId,
      p_confirmation_name: confirmation,
    });

    setIsDeleting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    onBusinessDeleted();
  }

  return (
    <section className="account-permissions" aria-label="Privacidade e dados">
      <div className="account-section-heading">
        <ShieldCheck size={16} />
        <div>
          <h2>Privacidade e dados</h2>
          <p>
            Documento, telefone, e-mail e aniversário do cliente ficam separados do cadastro
            operacional e só são visíveis a{" "}
            {rolesWith("viewCustomerContacts")
              .map((item) => BUSINESS_ROLE_LABELS[item])
              .join(", ")}
            . Quem atende o veículo vê o nome, que é o que a operação exige.
          </p>
        </div>
      </div>

      {errorMessage && (
        <p className="account-feedback account-feedback-error" role="alert">
          <CircleAlert size={14} />
          <span>{errorMessage}</span>
        </p>
      )}
      {message && (
        <p className="account-feedback" role="status">
          <ShieldCheck size={14} />
          <span>{message}</span>
        </p>
      )}

      <form className="privacy-retention" onSubmit={submitRetention}>
        <label className="privacy-field" htmlFor="privacy-retention">
          <span>Prazo de retenção (meses)</span>
          <input
            id="privacy-retention"
            type="number"
            inputMode="numeric"
            min={RETENTION_MONTHS_RANGE.min}
            max={RETENTION_MONTHS_RANGE.max}
            value={retention}
            onChange={(event) => setRetention(event.target.value)}
            disabled={!canManage || isLoading}
            placeholder="Não definido"
          />
        </label>
        <p className="account-form-note">
          Declara por quanto tempo o histórico é mantido. O descarte automático depende de execução
          agendada, que ainda não está no ar — hoje o prazo vale como política registrada, não como
          rotina.
        </p>
        {canManage && (
          <button className="account-primary-action" type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}Salvar prazo
          </button>
        )}
      </form>

      {canAudit && (
        <div className="privacy-audit">
          <div className="account-section-heading">
            <ScrollText size={16} />
            <div>
              <h2>Trilha de auditoria</h2>
              <p>
                Anonimização e desligamento ficam registrados com autor e horário. Nenhum membro
                escreve nesta trilha diretamente.
              </p>
            </div>
          </div>

          {isLoading ? (
            <p className="account-form-note">
              <Loader2 className="spin" size={14} /> Carregando…
            </p>
          ) : entries.length === 0 ? (
            <p className="account-form-note">Nada registrado ainda.</p>
          ) : (
            <ul className="privacy-audit-list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <strong>{describe(entry)}</strong>
                  <span>{new Date(entry.occurred_at).toLocaleString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canDelete && (
        <form className="privacy-danger" onSubmit={submitDeletion}>
          <div className="account-section-heading">
            <Trash2 size={16} />
            <div>
              <h2>Encerrar a empresa</h2>
              <p>
                Apaga agenda, ordens de serviço, clientes, financeiro e trilha. Não há desfazer, e o
                histórico fiscal vai junto. Para atender a um pedido individual de esquecimento,
                anonimize o cliente em vez de encerrar a empresa.
              </p>
            </div>
          </div>

          <label className="privacy-field" htmlFor="privacy-confirmation">
            <span>Digite “{unitName}” para confirmar</span>
            <input
              id="privacy-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              placeholder={unitName}
            />
          </label>

          <button
            className="privacy-danger-action"
            type="submit"
            disabled={
              isDeleting || confirmation.trim().toLowerCase() !== unitName.trim().toLowerCase()
            }
          >
            {isDeleting ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}Encerrar
            definitivamente
          </button>
        </form>
      )}
    </section>
  );
}
