/**
 * BanimentoRepository — os clientes que a empresa recusa.
 *
 * PORTADO DO FIRESTORE PARA O SUPABASE, com as assinaturas intactas.
 *
 * O BANIMENTO É DA EMPRESA, NÃO DO PROFISSIONAL. No Barbershop vivia em
 * `barbeiros/{id}/banidos/{uid}` porque não havia empresa — o barbeiro era a unidade. Aqui
 * há, e a recusa é dela: um cliente banido pelo dono não pode contornar marcando com
 * outro profissional da mesma casa. O `barbeiroId` continua no parâmetro de todas as
 * funções para as telas não mudarem, e é ignorado; o alvo é a empresa ativa.
 *
 * O QUE ERA TELA VIROU BANCO. No Barbershop a recusa dependia de a `AgendamentoScreen`
 * chamar `estaBanido` antes de gravar — tela se contorna, e o agendamento passava. Aqui o
 * gatilho `reject_banned_customer` recusa o INSERT em `appointments`, venha de onde vier.
 * `estaBanido` deixou de ser a defesa e passou a ser só a mensagem melhor.
 *
 * O CLIENTE NÃO ENXERGA MAIS O PRÓPRIO BANIMENTO, e isso é deliberado. As regras do
 * Firestore liberavam o `get` do próprio documento; a política aqui é só de agendador.
 * Dois motivos: o motivo do banimento é texto livre escrito pela empresa sobre uma pessoa
 * — o campo mais provável de conter algo que ninguém quer ver vazado —, e avisar "você
 * está banido daqui" é uma decisão da empresa, não do sistema. Para o cliente,
 * `estaBanido` devolve falso e a recusa vem do banco com a mensagem da empresa. É
 * exatamente o caminho de fallback que o Barbershop já documentava.
 *
 * A LISTA NÃO CARREGA MAIS O E-MAIL. Era cópia congelada no documento do banimento;
 * e-mail de cliente mora em `customer_contacts`, sob política própria. A tela mostra o
 * nome, que vem por junção e é o que ela usa para identificar a pessoa.
 */
import { lerEmpresaAtiva, supabase } from "../../../supabaseConfig";
import type { ClienteBanido } from "../../types";

/**
 * Os clientes banidos da empresa ativa.
 *
 * `barbeiroId` é ignorado: o banimento é da empresa. Manter o parâmetro evita mudar
 * `ClientesBanidosScreen`, que passa o uid do profissional logado.
 */
export async function listarBanidos(_barbeiroId: string): Promise<ClienteBanido[]> {
  const tenantId = await lerEmpresaAtiva();
  if (!tenantId) return [];

  const { data, error } = await supabase
    .from("customer_bans")
    .select("customer_id, banned_at, customers(name)")
    .eq("tenant_id", tenantId)
    .order("banned_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((bruta) => {
    const linha = bruta as unknown as {
      customer_id: string;
      banned_at: string;
      customers: { name: string } | null;
    };

    return {
      uid: linha.customer_id,
      nome: linha.customers?.name ?? "",
      // Dado pessoal, em `customer_contacts` sob política própria. A tela identifica
      // a pessoa pelo nome.
      email: "",
      bannedAt: linha.banned_at,
    } as ClienteBanido;
  });
}

/**
 * Se o cliente está banido da empresa.
 *
 * Continua devolvendo `false` quando não dá para saber, que era a promessa do Barbershop
 * — "se as regras negarem por qualquer motivo, retorna false em vez de quebrar a tela de
 * agendamento". Agora isso vale para o cliente final por desenho, não por acidente: ele
 * não lê `customer_bans`, e a recusa vem do gatilho no banco.
 */
export async function estaBanido(
  _barbeiroId?: string | null,
  clienteUid?: string | null,
): Promise<boolean> {
  if (!clienteUid) return false;

  const tenantId = await lerEmpresaAtiva();
  if (!tenantId) return false;

  const { count, error } = await supabase
    .from("customer_bans")
    .select("customer_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("customer_id", clienteUid);

  if (error) {
    console.warn("Não foi possível checar banimento:", error.message);
    return false;
  }

  return (count ?? 0) > 0;
}

/**
 * Bane um cliente. Idempotente, como antes: banir de novo atualiza a data em vez de
 * duplicar.
 *
 * `nome` e `email` do parâmetro são ignorados — o cadastro do cliente já os tem, e
 * copiá-los para dentro do banimento criaria uma segunda versão que envelheceria
 * sozinha. Só administrador bane, e a decisão vai para a trilha de auditoria com quem e
 * quando, o que o documento do Firestore não registrava.
 */
export async function banirCliente(
  _barbeiroId: string,
  cliente: ClienteBanido,
): Promise<void> {
  const { error } = await supabase.rpc("ban_customer", {
    p_customer_id: cliente.uid,
    p_reason: null,
  });

  if (error) throw error;
}

/** Remove o banimento. Também só administrador, e também vai para a trilha. */
export async function desbanirCliente(
  _barbeiroId: string,
  clienteUid: string,
): Promise<void> {
  const { error } = await supabase.rpc("unban_customer", {
    p_customer_id: clienteUid,
  });

  if (error) throw error;
}

/**
 * Migração do formato antigo — NÃO TEM O QUE MIGRAR AQUI.
 *
 * No Barbershop ela copiava o array `clientesBanidos` do documento público do barbeiro
 * para a subcoleção privada, corrigindo um vazamento: a lista de banidos ficava na
 * vitrine, legível por qualquer usuário logado.
 *
 * Este banco nasceu com `customer_bans` fechada; o formato antigo nunca existiu nele.
 * A função continua exportada porque `BarbeiroHome` a chama ao abrir, e some junto com
 * essa chamada quando a tela for revista.
 */
export async function migrarBanidosLegado(_barbeiroId: string): Promise<void> {
  return;
}
