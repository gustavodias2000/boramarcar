import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase a cada requisição.
 *
 * Sem isto, o token de acesso expira e só é renovado quando o navegador executa
 * JavaScript — o que deixa Server Components e Route Handlers vendo uma sessão morta.
 *
 * Renomeado de `middleware.ts` em 26/08/2026: o Next 16 descontinuou aquela convenção
 * em favor de `proxy.ts`. Mesma função, nome novo.
 *
 * O QUE ESTE ARQUIVO NÃO PODE FAZER — lista fechada, e ela é a fronteira de segurança:
 *
 *   1. Decidir se a pessoa é membro daquela empresa. O cookie não carrega vínculo, e
 *      mesmo que carregasse seria estado velho: o token vive até uma hora.
 *   2. Decidir papel. Papel muda dentro da vida do token.
 *   3. Ser a razão pela qual uma consulta é segura. A razão é RLS. Quem chama a API
 *      REST direto com o token nunca passa por aqui.
 *   4. Consultar o banco. A doc do Next é explícita: o proxy roda em toda rota,
 *      inclusive nas que o navegador busca por antecipação ao passar o mouse num link.
 *
 * O teste do desenho: se este arquivo for apagado amanhã, nenhum dado pode vazar — só
 * a experiência piora. Se a resposta for outra, o desenho está errado.
 *
 * Ele também nunca decodifica o JWT para ler claim de autorização. Decodificar sem
 * verificar assinatura é pior que não decodificar: cria aparência de leitura
 * autoritativa sobre um valor que o cliente controla inteiramente.
 */
export async function proxy(request: NextRequest) {
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
