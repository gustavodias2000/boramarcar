/**
 * O cliente Supabase do aplicativo. Substitui o `firebaseConfig.ts`.
 *
 * A FORMA É DELIBERADAMENTE A MESMA. O antigo exportava `auth`, `db`, `functions` e
 * `storage`; este exporta `supabase`, `auth` e `storage`. Vinte arquivos importavam de
 * `firebaseConfig` — mantendo nomes parecidos, a maioria muda só a linha do import, e
 * não a lógica em volta.
 *
 * Não há equivalente de `db` separado: no Supabase a mesma instância serve consulta,
 * autenticação e arquivo. `functions` também não vem — as Cloud Functions viraram
 * funções transacionais no PostgreSQL, chamadas por `supabase.rpc()`.
 *
 * TRÊS COISAS QUE O REACT NATIVE EXIGE E O NAVEGADOR NÃO:
 *
 * 1. `react-native-url-polyfill/auto`. O `URL` do Hermes é incompleto, e o cliente
 *    Supabase o usa para montar endereço. Sem o polyfill a falha aparece tarde, numa
 *    requisição qualquer, com mensagem que não aponta para a causa. É o mesmo buraco
 *    que me obrigou a tirar `new URL()` do `packages/core`.
 *
 * 2. `storage: AsyncStorage`. Não existe `localStorage`. Sem isto a sessão morre a cada
 *    fechamento do aplicativo — exatamente o que o Barbershop resolvia com
 *    `getReactNativePersistence(AsyncStorage)`.
 *
 * 3. `detectSessionInUrl: false`. Ele existe para o fluxo OAuth de navegador, que lê o
 *    token do endereço de retorno. Num aplicativo não há endereço para ler, e deixá-lo
 *    ligado gera trabalho inútil a cada inicialização.
 *
 * A RENOVAÇÃO DE TOKEN PRECISA SEGUIR O CICLO DE VIDA DO APLICATIVO. O temporizador de
 * renovação não roda com o aplicativo em segundo plano; sem ligá-lo ao `AppState`, quem
 * volta depois de uma hora encontra sessão expirada e é deslogado sem motivo aparente.
 */

import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

/**
 * A chave publicável é pública por desenho — ela vai dentro do binário do aplicativo, e
 * qualquer um consegue extraí-la. Quem protege o dado é a Row Level Security no banco,
 * não o segredo desta chave. A `service_role` NUNCA pode aparecer aqui.
 */
const SUPABASE_URL = "https://jbqliawhernqtphmduxh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Espelha o `auth` que o `firebaseConfig` exportava. */
export const auth = supabase.auth;

/** Espelha o `storage`. As fotos de OS e de perfil vivem em bucket privado. */
export const storage = supabase.storage;

/**
 * Renovação atrelada ao ciclo de vida. Em primeiro plano o cliente renova sozinho; em
 * segundo plano o temporizador para, e continuar tentando seria consumo de bateria sem
 * retorno.
 */
AppState.addEventListener("change", (estado) => {
  if (estado === "active") {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});

/**
 * A empresa ativa da sessão.
 *
 * ISTO NÃO EXISTIA NO BARBERSHOP, e é a diferença estrutural entre os dois produtos. Lá
 * o usuário era dono de uma barbearia e pronto; aqui ele pode participar de várias
 * empresas, e toda consulta precisa saber de qual.
 *
 * Guardado em `AsyncStorage` e VALIDADO contra os vínculos a cada carga — um `tenant_id`
 * guardado e depois revogado não pode continuar servindo. A autoridade é o banco: a RLS
 * recusa de qualquer forma, mas a tela não deve nem tentar.
 */
const CHAVE_EMPRESA = "@boramarca:empresa_ativa";

export async function lerEmpresaAtiva(): Promise<string | null> {
  return AsyncStorage.getItem(CHAVE_EMPRESA);
}

export async function gravarEmpresaAtiva(tenantId: string): Promise<void> {
  await AsyncStorage.setItem(CHAVE_EMPRESA, tenantId);
}

export async function limparEmpresaAtiva(): Promise<void> {
  await AsyncStorage.removeItem(CHAVE_EMPRESA);
}
