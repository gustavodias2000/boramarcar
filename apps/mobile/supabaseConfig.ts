import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Config from "react-native-config";
import { AppState } from "react-native";

/**
 * A URL e a chave publicável são configuração de build, não segredos. A autoridade
 * continua no PostgreSQL com RLS; uma chave administrativa nunca pertence ao aplicativo.
 */
const url = Config.SUPABASE_URL?.trim() ?? "";
const publishableKey = Config.SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase = createClient(
  url || "https://configuration-required.invalid",
  publishableKey || "configuration-required",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

AppState.addEventListener("change", (state) => {
  if (state === "active") {
    void supabase.auth.startAutoRefresh();
    return;
  }

  void supabase.auth.stopAutoRefresh();
});

const ACTIVE_BUSINESS_KEY = "@boramarca/active-business";

export function readActiveBusiness(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_BUSINESS_KEY);
}

export function saveActiveBusiness(tenantId: string): Promise<void> {
  return AsyncStorage.setItem(ACTIVE_BUSINESS_KEY, tenantId);
}

export function clearActiveBusiness(): Promise<void> {
  return AsyncStorage.removeItem(ACTIVE_BUSINESS_KEY);
}
