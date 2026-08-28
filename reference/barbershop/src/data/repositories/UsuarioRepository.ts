/**
 * UsuarioRepository — único ponto de acesso ao perfil de quem usa o sistema.
 *
 * PORTADO DO FIRESTORE PARA O SUPABASE. As assinaturas públicas são as mesmas de antes,
 * de propósito: as telas que chamam `getProfile`, `createProfile` e `updateProfile` não
 * sabem — e não devem saber — onde o dado mora. Foi essa camada que tornou a troca de
 * banco um trabalho de 14 arquivos em vez de 48.
 *
 * O QUE MUDOU POR BAIXO
 *
 * `usuarios/{uid}` virou a linha de `public.profiles` com `id = auth.uid()`. O `email`
 * NÃO é mais gravado aqui: ele vive em `auth.users` e duplicá-lo seria manter duas
 * verdades sobre o mesmo dado. `getProfile` o traz junto, lendo da sessão.
 *
 * O CARIMBO DE CONSENTIMENTO SAIU DAQUI. No Firestore este repositório gravava
 * `consentimentoEm` com `serverTimestamp()`, para a tela não escolher o próprio horário.
 * A regra continua valendo e ficou mais forte: agora é gatilho no banco, e as colunas de
 * data nem sequer são concedidas a `authenticated`. Nem esta camada consegue mentir a
 * data.
 */
import { supabase } from "../../../supabaseConfig";
import type { Usuario } from "../../types";

/** A linha como o PostgreSQL a devolve. O domínio do aplicativo fala outra língua. */
interface LinhaPerfil {
  id: string;
  display_name: string | null;
  phone: string | null;
  specialty: string | null;
  account_type: "customer" | "owner" | null;
  lgpd_consent: boolean | null;
  lgpd_consent_at: string | null;
  push_consent: boolean | null;
  push_consent_at: string | null;
  created_at: string;
  updated_at: string;
}

const COLUNAS =
  "id, display_name, phone, specialty, account_type, lgpd_consent, lgpd_consent_at, " +
  "push_consent, push_consent_at, created_at, updated_at";

function paraDominio(linha: LinhaPerfil, email: string): Usuario {
  return {
    uid: linha.id,
    nome: linha.display_name ?? "",
    email,
    telefone: linha.phone ?? "",
    especialidade: linha.specialty ?? undefined,
    tipo: linha.account_type === "owner" ? "barbeiro" : "cliente",
    consentimentoLGPD: linha.lgpd_consent ?? undefined,
    consentimentoEm: linha.lgpd_consent_at ?? undefined,
    consentimentoNotificacoesPush: linha.push_consent ?? undefined,
    consentimentoNotificacoesPushEm: linha.push_consent_at ?? undefined,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  } as Usuario;
}

/**
 * Busca o perfil. Devolve `null` se não existir — mesma semântica de antes.
 *
 * O `uid` continua sendo parâmetro por compatibilidade com as telas, mas a RLS só
 * devolve o próprio perfil de qualquer forma. Pedir o de outra pessoa não dá erro:
 * devolve vazio, que é a resposta honesta.
 */
export async function getProfile(uid?: string | null): Promise<Usuario | null> {
  if (!uid) return null;

  const [{ data: linha }, { data: sessao }] = await Promise.all([
    supabase.from("profiles").select(COLUNAS).eq("id", uid).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!linha) return null;
  return paraDominio(linha as unknown as LinhaPerfil, sessao.user?.email ?? "");
}

/**
 * Cria o perfil no cadastro.
 *
 * `consentimentoEm` continua fora do tipo do parâmetro, como no Barbershop — a tela não
 * consegue nem tentar passar um valor próprio. E agora o banco também não aceitaria.
 */
export async function createProfile(
  uid: string,
  data: Omit<Usuario, "uid" | "createdAt" | "consentimentoEm">,
): Promise<void> {
  const { error } = await supabase.from("profiles").insert({
    id: uid,
    display_name: data.nome?.trim() || null,
    phone: data.telefone?.trim() || null,
    specialty: data.especialidade?.trim() || null,
    account_type: data.tipo === "cliente" ? "customer" : "owner",
    // Só grava quando é `true`. `false` e ausente são coisas diferentes: uma é recusa,
    // a outra é "nunca foi perguntado", e a auditoria precisa distinguir.
    lgpd_consent: data.consentimentoLGPD === true ? true : null,
  });

  if (error) throw error;
}

/**
 * Atualiza campos do perfil.
 *
 * Só manda o que veio. `undefined` significa "não mexa neste campo" — mandar tudo faria
 * uma tela que edita o nome apagar o telefone.
 */
export async function updateProfile(
  uid: string,
  data: Partial<Omit<Usuario, "uid" | "tipo" | "consentimentoNotificacoesPushEm">>,
): Promise<void> {
  const mudanca: Record<string, unknown> = {};

  if (data.nome !== undefined) mudanca.display_name = data.nome.trim() || null;
  if (data.telefone !== undefined) mudanca.phone = data.telefone.trim() || null;
  if (data.especialidade !== undefined) mudanca.specialty = data.especialidade.trim() || null;
  if (data.consentimentoLGPD !== undefined) mudanca.lgpd_consent = data.consentimentoLGPD;
  if (data.consentimentoNotificacoesPush !== undefined) {
    mudanca.push_consent = data.consentimentoNotificacoesPush;
  }

  if (Object.keys(mudanca).length === 0) return;

  const { error } = await supabase.from("profiles").update(mudanca).eq("id", uid);
  if (error) throw error;
}

/** Qual caminho a pessoa escolheu: usar como cliente ou administrar um negócio. */
export async function definirTipoDeConta(
  uid: string,
  tipo: "customer" | "owner",
): Promise<void> {
  const { error } = await supabase.from("profiles").update({ account_type: tipo }).eq("id", uid);
  if (error) throw error;
}

/**
 * Token de push.
 *
 * DESLIGADO, e a franqueza importa mais que o silêncio: `@react-native-firebase/messaging`
 * saiu junto com o Firebase, e o Supabase não traz substituto pronto — push exige um
 * serviço de envio próprio, que ainda não existe.
 *
 * A função continua existindo com a mesma assinatura porque as telas a chamam, e ela
 * sempre foi tolerante a falha ("o app funciona sem push"). Quando o envio chegar, o
 * corpo muda aqui e nenhuma tela precisa saber.
 */
export async function saveFcmToken(
  uid?: string | null,
  token?: string | null,
): Promise<void> {
  if (!uid || !token) return;
  console.warn("Notificação push ainda não está ligada nesta versão; token ignorado.");
}

/**
 * Exclusão do perfil (LGPD).
 *
 * Apaga a linha de `profiles`. A conta em `auth.users` é outra coisa e exige privilégio
 * administrativo — não pode partir do aplicativo, e o fluxo completo de exclusão de
 * conta ainda precisa de um caminho de servidor.
 */
export async function deleteProfile(uid: string): Promise<void> {
  const { error } = await supabase.from("profiles").delete().eq("id", uid);
  if (error) throw error;
}
