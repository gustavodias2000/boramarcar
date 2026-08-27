import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listUserBusinesses, rotaInicialDoSegmento, type BusinessType } from "@boramarca/core";

/**
 * Para onde vai quem acabou de entrar.
 *
 * Mora num Server Component, e isso é decisão de desenho, não conveniência:
 *
 *   - NÃO no proxy, porque decidir exige CONTAR vínculos, e isso é consulta ao banco.
 *     A doc do Next 16 é explícita que o proxy roda em toda rota, inclusive nas que o
 *     navegador busca por antecipação ao passar o mouse num link.
 *   - NÃO no cliente, porque é decisão única tomada com dado autoritativo, que não pode
 *     pintar nada antes de decidir. A versão cliente necessariamente renderiza algo
 *     enquanto decide — que era literalmente o defeito anterior, um `redirect("/patio")`
 *     disparado antes de saber de que categoria era a empresa.
 *
 * Usa `getUser()`, nunca `getSession()`: `getSession` só lê o armazenamento local e não
 * valida nada. Serve para exibir nome; não serve para decidir.
 */
export default async function Inicio() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/entrar?proximo=/inicio");
  }

  const { data: empresas, error } = await listUserBusinesses(supabase, user.id);

  if (error) {
    throw new Error("Não foi possível carregar as suas empresas.");
  }

  if (!empresas || empresas.length === 0) {
    redirect("/comecar");
  }

  // Mais de uma empresa: o seletor. Ele chega junto com as rotas `/e/[empresa]`; até lá,
  // a primeira ativa é o destino — o que já é melhor que o `.limit(1)` anterior, porque
  // agora as outras estão carregadas e visíveis para quem for construir a tela.
  const empresa = empresas[0]!;

  // TODO(rotas): quando `/e/[empresa]` existir, isto vira
  // `rotaInicialDaEmpresa(empresa.slug, empresa.businessType)`. É uma linha, e o slug
  // já está no banco esperando por ela.
  redirect(`/${rotaInicialDoSegmento(empresa.businessType as BusinessType)}`);
}
