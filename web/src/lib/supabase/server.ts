import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para Server Components, Route Handlers e Server Actions.
 *
 * A metade servidor do `@supabase/ssr` estava instalada e nunca era usada: a
 * aplicação inteira falava com o banco pelo navegador. Isso funciona — a autoridade é
 * RLS, não o servidor — mas trava tudo que **não pode** morar no cliente:
 *
 *   - convite de membros por e-mail (Etapa 5), que precisa de service_role;
 *   - notificações (Etapa 9), que precisam de execução server-side e credenciais;
 *   - área do cliente (Etapa 10), que precisa de um caminho sem `business_members`;
 *   - resolução de plano (Etapa 11), que no cliente é falsificável.
 *
 * Introduzido agora, com a reestruturação, porque depois custaria reescrever a
 * aquisição de sessão dos seis componentes existentes.
 *
 * IMPORTANTE: usa a chave publicável, não a `service_role`. Rodar no servidor não
 * dispensa RLS — dispensa só a limitação do navegador. Operação que exija privilégio
 * administrativo ganha um caminho próprio, explícito e auditável, quando existir.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase não configurado para o servidor.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode escrever cookie. O middleware já renova a
          // sessão a cada requisição, então ignorar aqui é seguro — é o padrão
          // recomendado pelo próprio @supabase/ssr.
        }
      },
    },
  });
}
