import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase a cada requisição.
 *
 * Sem isto, o token de acesso expira e só é renovado quando o navegador executa
 * JavaScript — o que deixa Server Components e Route Handlers vendo uma sessão morta.
 *
 * Este middleware NÃO decide autorização. Quem decide é o banco: RLS e as funções
 * transacionais. Aqui só se mantém o cookie fresco e se lê quem está autenticado.
 *
 * A proteção de rota entra quando existirem rotas separadas para autenticar e operar
 * (Etapa 3.6 e o onboarding da Etapa 5). Hoje a aplicação é uma superfície só, que
 * já trata sozinha os estados sem sessão e sem vínculo.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Sem configuração a interface roda em prévia demonstrativa e não fala com o banco.
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser` revalida o token no servidor de autenticação; `getSession` só lê o
  // cookie local. É esta chamada que dispara a renovação quando necessário.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Todas as rotas, exceto arquivos estáticos e imagens — não adianta renovar
     * sessão para servir um SVG.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
