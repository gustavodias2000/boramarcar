/**
 * VinculoClienteRepository — o vínculo do cliente com uma empresa.
 *
 * PORTADO DO FIRESTORE E DAS CLOUD FUNCTIONS PARA O SUPABASE.
 *
 * As duas Cloud Functions viraram funções transacionais no PostgreSQL:
 *
 *   `criarVinculoCliente` → `redeem_business_invitation(codigo, nome)`
 *   `garantirConvite`     → `ensure_invitation_code(tenant, profissional)`
 *
 * O ganho não é de tecnologia, é de garantia. A Cloud Function fazia leitura e escrita
 * em chamadas separadas: dois resgates simultâneos do mesmo código podiam criar dois
 * cadastros de cliente para a mesma pessoa. A função no banco roda numa transação, e
 * `unique (tenant_id, user_id)` em `customer_links` fecha a porta — resgatar duas vezes
 * devolve o MESMO vínculo, que era a promessa do Barbershop e agora é constraint.
 *
 * `origem` continua no parâmetro por compatibilidade. Hoje todo resgate por código é
 * registrado como `invite`; distinguir QR de link e de código digitado exigiria um
 * parâmetro novo na RPC, e nenhuma tela usa essa distinção para decidir nada.
 */
import { supabase } from "../../../supabaseConfig";
import type { OrigemVinculo, TipoVinculo, VinculoCliente } from "../../types";

interface ResgateConvite {
  tipo: TipoVinculo;
  alvoId: string;
  barbeiroOrigemId: string;
  nome: string;
  jaVinculado: boolean;
}

/**
 * Os vínculos do cliente logado.
 *
 * O `clienteUid` continua no parâmetro, e a política já garante que só os próprios
 * vínculos voltam — `customer_links_select_member_or_self`. Filtrar por ele é redundante
 * e honesto: deixa claro na leitura do código o que a política impõe.
 */
export async function listarVinculosDoCliente(
  clienteUid: string,
): Promise<VinculoCliente[]> {
  const { data, error } = await supabase
    .from("customer_links")
    .select(
      "id, tenant_id, customer_id, user_id, origin, invited_by_professional_id, " +
        "active, created_at, updated_at, businesses(name)",
    )
    .eq("user_id", clienteUid)
    .eq("active", true);

  if (error) throw error;

  return (data ?? []).map((bruta) => {
    const linha = bruta as unknown as {
      id: string;
      tenant_id: string;
      user_id: string;
      origin: string;
      invited_by_professional_id: string | null;
      active: boolean;
      created_at: string;
      updated_at: string;
    };

    return {
      id: linha.id,
      clienteUid: linha.user_id,
      // Aqui o vínculo é SEMPRE com a empresa. No Barbershop havia a distinção
      // negócio × profissional autônomo porque o barbeiro sozinho não tinha negócio;
      // neste modelo até quem trabalha sozinho abre uma empresa, então a distinção
      // deixou de existir — e o `tipo` fica fixo para as telas não mudarem.
      tipo: "negocio" as TipoVinculo,
      alvoId: linha.tenant_id,
      barbeiroOrigemId: linha.invited_by_professional_id ?? "",
      origem: (linha.origin === "invite" ? "convite" : "link") as OrigemVinculo,
      ativo: linha.active,
      createdAt: linha.created_at,
      updatedAt: linha.updated_at,
    } as VinculoCliente;
  });
}

/**
 * Resgata um convite por código.
 *
 * Códigos continuam sendo tratados sem distinção de caixa, e a normalização fica aqui
 * para não se repetir em cada tela — mesma decisão de antes. A função no banco também
 * normaliza; as duas concordarem é barato, e depender de uma só seria frágil.
 */
export async function resgatarConvitePorCodigo(
  codigo: string,
  _origem: OrigemVinculo,
): Promise<ResgateConvite> {
  const { data, error } = await supabase.rpc("redeem_business_invitation", {
    p_code: codigo.trim().toUpperCase(),
    p_display_name: null,
  });

  if (error) throw error;

  const vinculo = data as {
    tenant_id: string;
    invited_by_professional_id: string | null;
    created_at: string;
    updated_at: string;
  };

  const { data: empresa } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", vinculo.tenant_id)
    .maybeSingle();

  return {
    tipo: "negocio",
    alvoId: vinculo.tenant_id,
    barbeiroOrigemId: vinculo.invited_by_professional_id ?? "",
    nome: (empresa as { name: string } | null)?.name ?? "",
    // A RPC é idempotente e devolve o vínculo existente sem dizer se acabou de criá-lo.
    // Um vínculo cujo `created_at` difere do `updated_at` já existia antes desta
    // chamada — é a leitura possível, e é suficiente para a mensagem da tela.
    jaVinculado: vinculo.created_at !== vinculo.updated_at,
  };
}

/**
 * Resgate pelo deep link legado `barbershop://agendar/{barbeiroId}`.
 *
 * NÃO EXISTE MAIS, e falhar alto é melhor que fingir. O modelo antigo permitia vincular
 * apontando direto para o barbeiro, sem código; aqui o vínculo passa por um convite, que
 * é o que registra QUEM convidou e permite revogar depois.
 *
 * A função continua exportada porque `DeepLinkService` a importa. Quando o app novo tiver
 * o próprio esquema de link, ele aponta para um código e cai no caminho de cima.
 */
export async function resgatarConvitePorBarbeiroLegado(
  _profissionalId: string,
): Promise<ResgateConvite> {
  throw new Error(
    "Este link é de uma versão anterior do aplicativo. Peça um código de convite novo.",
  );
}

/**
 * O convite do profissional logado — o que a tela de QR Code mostra.
 *
 * Idempotente: chamar de novo devolve o mesmo código. Dois códigos ativos para o mesmo
 * profissional invalidariam o cartão que ele já imprimiu.
 */
export async function obterOuCriarConviteProprio(): Promise<{
  codigo: string;
  tipo: TipoVinculo;
  alvoId: string;
}> {
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao.user) throw new Error("É preciso estar autenticado.");

  // O profissional correspondente a quem está logado, na empresa ativa. A ponte
  // `auth.uid() → business_members → professionals` é a mesma que a função de papel
  // `is_current_user_professional` percorre no banco.
  const { data: vinculo, error: erroVinculo } = await supabase
    .from("business_members")
    .select("id, tenant_id, professionals(id)")
    .eq("user_id", sessao.user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (erroVinculo) throw erroVinculo;
  if (!vinculo) throw new Error("Você ainda não faz parte de nenhuma empresa.");

  const linha = vinculo as unknown as {
    tenant_id: string;
    professionals: { id: string }[] | { id: string } | null;
  };

  const profissional = Array.isArray(linha.professionals)
    ? linha.professionals[0]
    : linha.professionals;

  const { data, error } = await supabase.rpc("ensure_invitation_code", {
    p_tenant_id: linha.tenant_id,
    p_professional_id: profissional?.id ?? null,
  });

  if (error) throw error;

  return {
    codigo: (data as { code: string }).code,
    tipo: "negocio",
    alvoId: linha.tenant_id,
  };
}
