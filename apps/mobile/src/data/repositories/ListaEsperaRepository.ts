/**
 * ListaEsperaRepository — a fila de quem ficou sem horário.
 *
 * PORTADO DO FIRESTORE PARA O SUPABASE, com as assinaturas intactas.
 *
 * QUEM ENTRA NA FILA É O CLIENTE, e é isso que torna esta tabela diferente das outras
 * portadas até aqui. `appointment_waitlist` nasceu com políticas de equipe — membro lê,
 * agendador escreve — e o cliente final não é nem uma coisa nem outra. `entrarNaFila`
 * seria negada em toda chamada.
 *
 * A migration `20260827000400` abriu a porta pelo caminho estreito: `join_waitlist` e
 * `leave_waitlist`, com a autorização escrita dentro, e uma política de leitura para o
 * cliente ver só a própria espera. O `customer_id` vem do vínculo ativo, nunca do
 * parâmetro — é o que impede colocar outra pessoa na fila.
 *
 * A CHECAGEM-ANTES-DE-INSERIR VIROU ÍNDICE. `jaEstaNaFila` e `entrarNaFila` eram duas
 * chamadas separadas: dois toques no botão, ou dois aparelhos, e a pessoa entrava duas
 * vezes. Agora há um índice único parcial e a RPC é idempotente. `jaEstaNaFila` continua
 * existindo, e continua valendo a pena — não para proteger a escrita, mas para a tela
 * poder dizer "você já está na lista" em vez de fingir que acabou de entrar.
 *
 * O TELEFONE VEM DE OUTRA TABELA. É dado pessoal, mora em `customer_contacts` sob
 * política de agendador, e a tela precisa dele — é com ele que o botão "Notificar" abre
 * o WhatsApp. Vem numa segunda consulta, e quem não for agendador simplesmente recebe a
 * fila sem telefone, em vez de receber erro.
 *
 * `clienteEmail` vem vazio, como em `RecorrenciaRepository`: é dado pessoal e a tela
 * funciona sem ele.
 */
import { supabase } from "../../../supabaseConfig";
import type { DataISO, EntradaListaEspera } from "../../types";

/** O domínio fala aguardando/notificado/agendado/expirado; o banco fala inglês. */
const PARA_BANCO: Record<EntradaListaEspera["status"], string> = {
  aguardando: "waiting",
  notificado: "notified",
  agendado: "scheduled",
  expirado: "expired",
};

const PARA_DOMINIO: Record<string, EntradaListaEspera["status"]> = {
  waiting: "aguardando",
  notified: "notificado",
  scheduled: "agendado",
  expired: "expirado",
};

const COLUNAS =
  "id, tenant_id, customer_id, service_id, professional_id, desired_date, status, " +
  "created_at, customers(name), services(name)";

interface LinhaFila {
  id: string;
  tenant_id: string;
  customer_id: string;
  service_id: string | null;
  professional_id: string | null;
  desired_date: string;
  status: string;
  created_at: string;
  customers: { name: string } | null;
  services: { name: string } | null;
}

function paraDominio(
  linha: LinhaFila,
  telefonePorCliente: Map<string, string>,
): EntradaListaEspera {
  const telefone = telefonePorCliente.get(linha.customer_id);

  return {
    id: linha.id,
    barbeiroId: linha.professional_id ?? "",
    clienteUid: linha.customer_id,
    clienteNome: linha.customers?.name ?? "",
    // Dado pessoal — a fila não precisa dele para funcionar.
    clienteEmail: "",
    ...(telefone ? { clienteTelefone: telefone } : {}),
    data: linha.desired_date as DataISO,
    ...(linha.service_id ? { servicoId: linha.service_id } : {}),
    ...(linha.services?.name ? { servicoNome: linha.services.name } : {}),
    status: PARA_DOMINIO[linha.status] ?? "aguardando",
    createdAt: linha.created_at,
  } as EntradaListaEspera;
}

/**
 * O telefone de cada cliente da fila, numa consulta só.
 *
 * Uma por linha seria N+1 numa lista que a tela recarrega a cada foco. E o `whatsapp`
 * vem antes do `phone` porque é para o WhatsApp que o botão da tela leva — quem cadastra
 * os dois costuma ter números diferentes.
 *
 * Falha em silêncio de propósito: sem permissão de ler contato, a fila aparece sem
 * telefone e o botão de notificar avisa que falta o número. Perder a fila inteira porque
 * o telefone não veio seria pior.
 */
async function telefonesDosClientes(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;

  const { data } = await supabase
    .from("customer_contacts")
    .select("customer_id, whatsapp, phone")
    .in("customer_id", ids);

  for (const bruta of data ?? []) {
    const contato = bruta as unknown as {
      customer_id: string;
      whatsapp: string | null;
      phone: string | null;
    };
    const numero = contato.whatsapp ?? contato.phone;
    if (numero) mapa.set(contato.customer_id, numero);
  }

  return mapa;
}

/**
 * Entra na fila para uma data com o profissional.
 *
 * `clienteNome`, `clienteEmail` e `clienteTelefone` continuam no parâmetro e são
 * ignorados: no Firestore eram cópias que a tela precisava mandar porque não havia
 * junção. Aqui o cadastro do cliente já existe — foi criado no resgate do convite — e
 * copiar o nome de novo criaria uma segunda versão que envelheceria sozinha.
 */
export async function entrarNaFila(
  entrada: Omit<EntradaListaEspera, "id" | "createdAt" | "status">,
): Promise<string> {
  const { data, error } = await supabase.rpc("join_waitlist", {
    p_professional_id: entrada.barbeiroId,
    p_desired_date: entrada.data,
    p_service_id: entrada.servicoId ?? null,
    p_notes: null,
  });

  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * A fila do profissional, mais antigos primeiro — quem esperou mais vem antes.
 *
 * Só `aguardando`, como no Barbershop: notificar tira a pessoa da lista de pendências do
 * barbeiro, porque a bola passou a estar com ela. O estado `notificado` continua no
 * banco, com a hora do aviso, e é o que permitirá um dia devolver à fila quem foi
 * avisado e não respondeu.
 */
export async function listarFilaDoBarbeiro(
  profissionalId: string,
  data?: string,
): Promise<EntradaListaEspera[]> {
  let consulta = supabase
    .from("appointment_waitlist")
    .select(COLUNAS)
    .eq("professional_id", profissionalId)
    .eq("status", "waiting");

  if (data) consulta = consulta.eq("desired_date", data);

  const { data: linhas, error } = await consulta.order("created_at", { ascending: true });

  if (error) throw error;

  const fila = (linhas ?? []) as unknown as LinhaFila[];
  const telefones = await telefonesDosClientes(fila.map((linha) => linha.customer_id));

  return fila.map((linha) => paraDominio(linha, telefones));
}

/**
 * Conta quem está na fila sem baixar as entradas.
 *
 * A razão do Barbershop continua valendo: o Início só exibe o número num aviso, e
 * baixar nome, telefone e serviço de cada pessoa a cada foco da tela para renderizar um
 * inteiro é desperdício. `head: true` faz o PostgREST devolver só o `Content-Range`.
 *
 * O recorte é o mesmo da listagem — mesmo filtro, escrito no mesmo lugar do arquivo —
 * porque um número que não bate com a lista que ele resume é pior que número nenhum.
 */
export async function contarFilaDoBarbeiro(
  profissionalId?: string | null,
  data?: string,
): Promise<number> {
  if (!profissionalId) return 0;

  let consulta = supabase
    .from("appointment_waitlist")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", profissionalId)
    .eq("status", "waiting");

  if (data) consulta = consulta.eq("desired_date", data);

  const { count, error } = await consulta;

  if (error) throw error;
  return count ?? 0;
}

/**
 * Se o cliente já está na fila daquela data com aquele profissional.
 *
 * O `clienteUid` continua no parâmetro e não é usado no filtro: a política
 * `appointment_waitlist_select_self` já devolve só as esperas de quem pergunta, e o
 * cliente final não enxerga a fila dos outros para poder filtrar por ela. Filtrar por um
 * id que ele não controla daria a impressão de que a checagem é dele.
 *
 * Deixou de ser proteção contra escrita duplicada — o índice único é quem faz isso — e
 * passou a ser só o que a tela precisa para dizer "você já está na lista".
 */
export async function jaEstaNaFila(
  profissionalId: string,
  _clienteUid: string,
  data: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("appointment_waitlist")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", profissionalId)
    .eq("desired_date", data)
    .eq("status", "waiting");

  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Muda o estado de uma entrada.
 *
 * Cada destino tem seu caminho, e a diferença não é burocracia:
 *
 *   `notificado` → `mark_waitlist_notified`, que carimba QUANDO o aviso saiu. Sem esse
 *                  carimbo não dá para saber há quanto tempo a pessoa foi avisada e não
 *                  respondeu, que é o dado que decide se a vaga volta para a fila.
 *   `expirado`   → `leave_waitlist`, que aceita tanto o cliente que desistiu quanto o
 *                  agendador que limpou a fila, e carimba a resolução.
 *   `agendado`   → não existe por aqui. `appointment_waitlist_scheduled_has_appointment`
 *                  exige o agendamento junto, e criá-lo é `schedule_from_waitlist`, que
 *                  passa pelas validações normais da agenda. Marcar "agendado" sem
 *                  agendamento seria uma fila que diz ter resolvido o que não resolveu.
 */
export async function atualizarStatusFila(
  entradaId: string,
  status: EntradaListaEspera["status"],
): Promise<void> {
  if (status === "notificado") {
    const { error } = await supabase.rpc("mark_waitlist_notified", {
      p_waitlist_id: entradaId,
    });
    if (error) throw error;
    return;
  }

  if (status === "expirado") {
    const { error } = await supabase.rpc("leave_waitlist", { p_waitlist_id: entradaId });
    if (error) throw error;
    return;
  }

  if (status === "agendado") {
    throw new Error(
      "Para agendar a partir da fila, use o agendamento — a espera é resolvida junto.",
    );
  }

  // Voltar para `aguardando`: desfazer um aviso enviado por engano. Passa pela política
  // de agendador, que é quem pode.
  const { error } = await supabase
    .from("appointment_waitlist")
    .update({ status: PARA_BANCO[status], notified_at: null })
    .eq("id", entradaId);

  if (error) throw error;
}
