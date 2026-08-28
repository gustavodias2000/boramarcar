"use client";

/**
 * Sessão e unidade ativa.
 *
 * Antes, tudo isto vivia dentro de `AutomotivePatio`: sessão, vínculo, unidade, papel
 * e tipo de negócio eram estado local de um componente de 819 linhas que também era o
 * shell e o roteador. Nenhuma outra tela podia ler essas informações sem receber por
 * prop, e navegar entre telas não podia virar rota — trocar de rota remontaria tudo.
 *
 * Com o estado num contexto acima das rotas, o layout carrega uma vez e cada rota
 * consome o que precisa. É o que permite a Etapa 3.6 existir.
 *
 * O que NÃO está aqui: dados de tela. A lista do Pátio, a agenda e os relatórios são
 * carregados por quem os mostra, a partir do `tenantId` daqui.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { BusinessRole, BusinessType } from "@boramarca/core";

import { createClient, hasSupabaseConfiguration } from "@/lib/supabase/client";

/** Sem configuração e sem sessão a interface roda como prévia demonstrativa. */
export type TenantMode = "unconfigured" | "demonstration" | "live";

export type TenantAccess =
  | "checking"
  | "unconfigured"
  | "unauthenticated"
  | "ready"
  | "no-membership"
  | "choose-business"
  | "error";

interface TenantValue {
  readonly mode: TenantMode;
  readonly access: TenantAccess;
  readonly accessError: string | null;
  readonly tenantId: string | null;
  readonly unitName: string | null;
  readonly unitTimezone: string | null;
  readonly membershipRole: BusinessRole | null;
  readonly businessType: BusinessType | null;
  readonly isLoading: boolean;
  /** `true` quando não há vínculo ativo ou a leitura falhou: a operação fica travada. */
  readonly blocked: boolean;
  readonly reload: () => void;
}

const TenantContext = createContext<TenantValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const configured = hasSupabaseConfiguration();

  const [mode, setMode] = useState<TenantMode>(configured ? "demonstration" : "unconfigured");
  const [access, setAccess] = useState<TenantAccess>(configured ? "checking" : "unconfigured");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [unitName, setUnitName] = useState<string | null>(null);
  const [unitTimezone, setUnitTimezone] = useState<string | null>(null);
  const [membershipRole, setMembershipRole] = useState<BusinessRole | null>(null);
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function clearTenant() {
    setTenantId(null);
    setUnitName(null);
    setUnitTimezone(null);
    setMembershipRole(null);
    setBusinessType(null);
  }

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      setMode("demonstration");
      clearTenant();
      setAccessError(null);
      setAccess("unauthenticated");
      return;
    }

    setIsLoading(true);
    setAccess("checking");
    setAccessError(null);

    const { data: memberships, error: membershipError } = await supabase
      .from("business_members")
      .select("tenant_id, role")
      .eq("user_id", sessionData.session.user.id)
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (membershipError) {
      setMode("demonstration");
      clearTenant();
      setAccessError(membershipError.message);
      setAccess("error");
      setIsLoading(false);
      return;
    }

    if (!memberships || memberships.length === 0) {
      setMode("demonstration");
      clearTenant();
      setAccess("no-membership");
      setIsLoading(false);
      return;
    }

    const requestedTenantId =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("empresa");
    const membership = requestedTenantId
      ? memberships.find((candidate) => candidate.tenant_id === requestedTenantId)
      : memberships.length === 1
        ? memberships[0]
        : null;

    if (!membership) {
      setMode("demonstration");
      clearTenant();
      setAccessError("Escolha uma empresa antes de abrir a operação.");
      setAccess("choose-business");
      setIsLoading(false);
      return;
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("name, timezone, business_type")
      .eq("id", membership.tenant_id)
      .maybeSingle();

    if (businessError || !business) {
      setMode("demonstration");
      clearTenant();
      setAccessError(businessError?.message ?? "Unidade não encontrada para a associação ativa.");
      setAccess("error");
      setIsLoading(false);
      return;
    }

    setTenantId(membership.tenant_id);
    setMembershipRole(membership.role as BusinessRole);
    setUnitName(business.name);
    setUnitTimezone(business.timezone ?? null);
    setBusinessType((business.business_type as BusinessType | null) ?? null);
    setMode("live");
    setAccess("ready");
    setIsLoading(false);
  }, []);

  // Uma assinatura só resolve carga inicial e mudança de sessão: o Supabase emite
  // `INITIAL_SESSION` ao assinar, e depois SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED.
  // É também a forma que o React pede — o efeito assina um sistema externo e chama
  // setState no callback, em vez de disparar trabalho no corpo do efeito.
  useEffect(() => {
    if (!configured) return;

    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED"
      ) {
        void load();
      }
    });

    return () => data.subscription.unsubscribe();
  }, [configured, load]);

  const value = useMemo<TenantValue>(
    () => ({
      mode,
      access,
      accessError,
      tenantId,
      unitName,
      unitTimezone,
      membershipRole,
      businessType,
      isLoading,
      blocked: access === "no-membership" || access === "choose-business" || access === "error",
      reload: () => {
        void load();
      },
    }),
    [
      mode,
      access,
      accessError,
      tenantId,
      unitName,
      unitTimezone,
      membershipRole,
      businessType,
      isLoading,
      load,
    ],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantValue {
  const value = useContext(TenantContext);

  if (!value) {
    throw new Error("useTenant precisa estar dentro de <TenantProvider>.");
  }

  return value;
}
