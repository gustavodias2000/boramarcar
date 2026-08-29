"use client";

import {
  BadgeCheck,
  Building2,
  CircleAlert,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { CorePrivacy } from "@/components/core-privacy";
import { MARCA } from "@/core/marca";
import { createClient } from "@/lib/supabase/client";
import { rolesWith, type BusinessRole } from "@boramarca/core";
type AccountState =
  | "checking"
  | "loading"
  | "unconfigured"
  | "unauthenticated"
  | "ready"
  | "no-membership"
  | "choose-business"
  | "error";

type AccountData = {
  userId: string;
  email: string;
  displayName: string | null;
  tenantName: string;
  timezone: string | null;
  role: BusinessRole;
  memberCounts: Record<BusinessRole, number>;
};

const roleCopy: Record<BusinessRole, { label: string; description: string }> = {
  owner: {
    label: "Proprietário",
    description: "Administra a unidade, os membros e toda a operação.",
  },
  manager: {
    label: "Gestor",
    description: "Administra a operação, sem alterar a composição da unidade.",
  },
  receptionist: {
    label: "Recepção",
    description: "Organiza clientes, agenda, entradas e veículos.",
  },
  professional: {
    label: "Profissional",
    description: "Consulta a operação e ajusta a própria disponibilidade.",
  },
  cashier: { label: "Caixa", description: "Consulta a operação e registra o financeiro da OS." },
};

// Os papéis de cada linha vêm de `rolesWith`, no núcleo compartilhado, que por sua vez
// espelha as funções de papel do banco. Antes esta matriz era escrita à mão em JSX: a
// tela podia divergir da autorização real sem ninguém notar.
const permissionRows: { title: string; caption: string; roles: readonly BusinessRole[] }[] = [
  {
    title: "Pátio e ordens de serviço",
    caption: "Todos os membros ativos consultam; o fluxo operacional é liberado por papel.",
    roles: rolesWith("viewOperation"),
  },
  {
    title: "Clientes, veículos e agenda",
    caption: "Criar e ajustar agendamentos, clientes e veículos.",
    roles: rolesWith("manageSchedule"),
  },
  {
    title: "Disponibilidade recorrente",
    caption:
      "A recepção e a gestão ajustam a equipe; profissionais ajustam somente o próprio horário.",
    roles: [...rolesWith("manageSchedule"), "professional"],
  },
  {
    title: "Cadastros da unidade",
    caption: "Serviços, profissionais e dados da empresa.",
    roles: rolesWith("manageCatalog"),
  },
  {
    title: "Membros e papéis",
    caption: "Administrar papéis e associação de membros já existentes.",
    roles: rolesWith("manageMembers"),
  },
  {
    title: "Financeiro da OS",
    caption: "Lançar itens e recebimentos da ordem de serviço.",
    roles: rolesWith("recordPayments"),
  },
];

function emptyMemberCounts(): Record<BusinessRole, number> {
  return { owner: 0, manager: 0, receptionist: 0, professional: 0, cashier: 0 };
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "BM"
  ).toUpperCase();
}

function profileFallback(email: string) {
  return email.split("@")[0]?.replace(/[._-]+/g, " ") || `Conta ${MARCA.nome}`;
}

interface AutomotiveProfileProps {
  configured: boolean;
  accessState: AccountState;
  accessError: string | null;
  tenantId: string | null;
  unitName: string | null;
  unitTimezone: string | null;
  membershipRole: BusinessRole | null;
  onOpenPatio: () => void;
  onSessionChanged: () => void;
}

export function AutomotiveProfile({
  configured,
  accessState,
  accessError,
  tenantId,
  unitName,
  unitTimezone,
  membershipRole,
  onOpenPatio,
  onSessionChanged,
}: AutomotiveProfileProps) {
  const [state, setState] = useState<AccountState>(configured ? "loading" : "unconfigured");
  const [account, setAccount] = useState<AccountData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!configured) {
      setState("unconfigured");
      return;
    }

    setState("loading");
    setErrorMessage(null);
    setMessage(null);
    const supabase = createClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      setState("error");
      setErrorMessage("Não foi possível verificar a sessão: " + sessionError.message);
      return;
    }

    const session = sessionData.session;
    if (!session) {
      setAccount(null);
      setState("unauthenticated");
      return;
    }

    if (accessState === "checking") {
      return;
    }

    if (accessState === "no-membership" || accessState === "choose-business") {
      setAccount(null);
      setState("no-membership");
      return;
    }

    if (accessState === "error") {
      setState("error");
      setErrorMessage(accessError ?? "Não foi possível carregar a unidade desta sessão.");
      return;
    }

    if (accessState !== "ready" || !tenantId || !unitName || !membershipRole) {
      setAccount(null);
      setState("error");
      setErrorMessage("A sessão não possui uma unidade operacional pronta para consulta.");
      return;
    }

    const [profileResult, membersResult] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", session.user.id).maybeSingle(),
      supabase.from("business_members").select("role").eq("tenant_id", tenantId).eq("active", true),
    ]);

    if (profileResult.error || membersResult.error) {
      setState("error");
      setErrorMessage(
        "Não foi possível carregar o perfil da unidade: " +
          (profileResult.error ?? membersResult.error)?.message,
      );
      return;
    }

    const memberCounts = emptyMemberCounts();
    for (const member of (membersResult.data ?? []) as { role: BusinessRole }[]) {
      if (member.role in memberCounts) memberCounts[member.role] += 1;
    }

    const nextAccount: AccountData = {
      userId: session.user.id,
      email: session.user.email ?? "E-mail não informado",
      displayName: profileResult.data?.display_name ?? null,
      tenantName: unitName,
      timezone: unitTimezone,
      role: membershipRole,
      memberCounts,
    };

    setAccount(nextAccount);
    setDisplayName(nextAccount.displayName ?? profileFallback(nextAccount.email));
    setState("ready");
  }, [accessError, accessState, configured, membershipRole, tenantId, unitName, unitTimezone]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadAccount();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadAccount]);

  const memberTotal = useMemo(
    () =>
      Object.values(account?.memberCounts ?? emptyMemberCounts()).reduce(
        (total, count) => total + count,
        0,
      ),
    [account],
  );

  async function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage("Não foi possível entrar: " + error.message);
      return;
    }

    setMessage("Sessão iniciada. Atualizando os dados da unidade...");
    onSessionChanged();
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || isSubmitting) return;

    const nextName = displayName.trim();
    if (!nextName) {
      setErrorMessage("Informe o nome que deve aparecer para a equipe.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(null);
    const { data, error } = await createClient()
      .from("profiles")
      .update({ display_name: nextName })
      .eq("id", account.userId)
      .select("display_name");
    setIsSubmitting(false);

    if (error) {
      setErrorMessage("Não foi possível salvar o perfil: " + error.message);
      return;
    }

    if (!data?.length) {
      setErrorMessage(
        "Seu perfil não foi encontrado. Peça ao proprietário para revisar o acesso desta conta.",
      );
      return;
    }

    setAccount((current) => (current ? { ...current, displayName: nextName } : current));
    setMessage("Nome do perfil salvo.");
  }

  async function signOut() {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    const { error } = await createClient().auth.signOut();
    setIsSubmitting(false);

    if (error) {
      setErrorMessage("Não foi possível encerrar a sessão: " + error.message);
      return;
    }

    onSessionChanged();
  }

  if (state === "loading") {
    return (
      <section className="account-state" aria-live="polite">
        <Loader2 className="spin" size={24} />
        <h1>Verificando acesso</h1>
        <p>Estamos conferindo a sessão e a unidade ativa.</p>
      </section>
    );
  }

  if (state === "unconfigured") {
    return (
      <section className="account-state">
        <KeyRound size={25} />
        <h1>Conecte o acesso da unidade</h1>
        <p>
          Inclua a URL e a chave pública do Supabase em <code>.env.local</code> para entrar com uma
          conta real. A prévia segue disponível sem gravar dados.
        </p>
        <button type="button" className="account-secondary-action" onClick={onOpenPatio}>
          Voltar ao Pátio demonstrativo
        </button>
      </section>
    );
  }

  if (state === "unauthenticated") {
    return (
      <section className="account-auth-layout">
        <div className="account-auth-intro">
          <ShieldCheck size={28} />
          <h1>Acesse a operação certa</h1>
          <p>
            Entre com sua conta para consultar somente a unidade e as ações permitidas ao seu papel.
          </p>
          <div className="account-auth-rule">
            <BadgeCheck size={17} />
            <span>
              O {MARCA.nome} não cria permissões no navegador: o Supabase valida cada operação.
            </span>
          </div>
        </div>
        <form className="account-auth-form" onSubmit={submitSignIn}>
          <div>
            <h2>Entrar</h2>
            <p>Use o e-mail e a senha cadastrados pelo responsável da unidade.</p>
          </div>
          {errorMessage && (
            <p className="account-feedback account-feedback-error" role="alert">
              <CircleAlert size={16} />
              {errorMessage}
            </p>
          )}
          <label>
            E-mail
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="account-primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}Entrar na
            unidade
          </button>
          <p className="account-form-note">
            Ainda não tem acesso? O proprietário da unidade precisa cadastrar seu usuário e atribuir
            um papel.
          </p>
        </form>
      </section>
    );
  }

  if (state === "no-membership") {
    return (
      <section className="account-state">
        <UserRound size={25} />
        <h1>Conta sem unidade ativa</h1>
        <p>
          Você entrou, mas esta conta ainda não pertence a uma unidade ativa. Peça ao proprietário
          para atribuir um papel antes de operar o Pátio.
        </p>
        <button
          type="button"
          className="account-secondary-action"
          onClick={() => void signOut()}
          disabled={isSubmitting}
        >
          <LogOut size={16} />
          Sair desta conta
        </button>
      </section>
    );
  }

  if (state === "error" || !account) {
    return (
      <section className="account-state">
        <CircleAlert size={25} />
        <h1>Acesso não carregado</h1>
        <p>{errorMessage ?? "Não foi possível consultar os dados da conta."}</p>
        <button
          type="button"
          className="account-secondary-action"
          onClick={() => {
            if (accessState === "error") onSessionChanged();
            else void loadAccount();
          }}
        >
          <RefreshCw size={16} />
          Tentar novamente
        </button>
      </section>
    );
  }

  const visibleName = account.displayName ?? profileFallback(account.email);
  const currentRole = roleCopy[account.role];

  return (
    <section className="account-workspace">
      <header className="account-heading">
        <div>
          <h1>Conta e acesso</h1>
          <p>Seu perfil e as regras que protegem a operação da unidade.</p>
        </div>
        <button type="button" className="account-secondary-action" onClick={onOpenPatio}>
          Voltar ao Pátio
        </button>
      </header>
      {(message || errorMessage) && (
        <div
          className={"account-feedback " + (errorMessage ? "account-feedback-error" : "")}
          role={errorMessage ? "alert" : "status"}
        >
          {errorMessage ? <CircleAlert size={16} /> : <BadgeCheck size={16} />}
          <span>{errorMessage ?? message}</span>
        </div>
      )}
      <section className="account-identity" aria-label="Perfil da conta">
        <div className="account-avatar">{initials(visibleName)}</div>
        <div className="account-identity-copy">
          <span>Conta conectada</span>
          <h2>{visibleName}</h2>
          <p>{account.email}</p>
        </div>
        <div className="account-role">
          <ShieldCheck size={17} />
          <div>
            <strong>{currentRole.label}</strong>
            <span>{currentRole.description}</span>
          </div>
        </div>
      </section>
      <div className="account-columns">
        <form className="account-profile-form" onSubmit={submitProfile}>
          <div className="account-section-heading">
            <UserRound size={18} />
            <div>
              <h2>Seu perfil</h2>
              <p>Este nome aparece como referência dentro da unidade.</p>
            </div>
          </div>
          <label>
            Nome de exibição
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={160}
              disabled={isSubmitting}
            />
          </label>
          <label>
            E-mail de acesso
            <input value={account.email} disabled aria-describedby="account-email-help" />
          </label>
          <p id="account-email-help" className="account-form-note">
            O e-mail e a senha são tratados pelo Supabase Auth e não são alterados aqui.
          </p>
          <button className="account-primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="spin" size={16} /> : <Save size={16} />}Salvar
            perfil
          </button>
          <button
            className="account-signout"
            type="button"
            onClick={() => void signOut()}
            disabled={isSubmitting}
          >
            <LogOut size={16} />
            Encerrar sessão
          </button>
        </form>
        <section className="account-unit" aria-label="Unidade ativa">
          <div className="account-section-heading">
            <Building2 size={18} />
            <div>
              <h2>Unidade ativa</h2>
              <p>O escopo de dados desta sessão.</p>
            </div>
          </div>
          <dl className="account-unit-lines">
            <div>
              <dt>Unidade</dt>
              <dd>{account.tenantName}</dd>
            </div>
            <div>
              <dt>Fuso da operação</dt>
              <dd>{account.timezone ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Membros ativos</dt>
              <dd>{memberTotal}</dd>
            </div>
          </dl>
          <div className="account-role-counts" aria-label="Membros ativos por papel">
            {(Object.keys(roleCopy) as BusinessRole[]).map((role) => (
              <div key={role}>
                <span>{roleCopy[role].label}</span>
                <strong>{account.memberCounts[role]}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="account-permissions" aria-label="Permissões da unidade">
        <div className="account-section-heading">
          <ShieldCheck size={18} />
          <div>
            <h2>Permissões da unidade</h2>
            <p>O que a política do banco libera para cada papel ativo.</p>
          </div>
        </div>
        <div className="account-permission-list">
          {permissionRows.map((permission) => {
            const allowed = permission.roles.includes(account.role);
            return (
              <div className="account-permission-row" key={permission.title}>
                <div>
                  <strong>{permission.title}</strong>
                  <p>{permission.caption}</p>
                </div>
                <span
                  className={allowed ? "account-permission-allowed" : "account-permission-denied"}
                >
                  {allowed ? "Permitido para você" : "Sem permissão"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      {tenantId && (
        <CorePrivacy
          tenantId={tenantId}
          unitName={account.tenantName}
          role={account.role}
          onBusinessDeleted={onSessionChanged}
        />
      )}
    </section>
  );
}
