import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function hasSupabaseConfiguration() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/**
 * Instância única por aba.
 *
 * Antes desta mudança `createClient()` era chamado 25 vezes espalhadas pelos
 * componentes, criando um cliente e um GoTrue novos a cada chamada — desperdício, e
 * origem do aviso "Multiple GoTrueClient instances detected". Cada instância mantém
 * seu próprio temporizador de refresh de token e seu próprio listener.
 *
 * A memoização é por módulo, então o cliente vive enquanto a aba viver.
 */
let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase não configurado para a interface.");
  }

  browserClient = createBrowserClient(url, key);
  return browserClient;
}
