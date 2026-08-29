/**
 * NotificationRepository — preferências de aviso da empresa.
 *
 * PORTADO DO FIRESTORE PARA O SUPABASE, com as assinaturas intactas.
 *
 * O ALVO DEIXOU DE TER DUAS FORMAS. No Barbershop a configuração vivia em
 * `negocios/{id}/configuracoes/notificacoes` OU em `barbeiros/{id}/configuracoes/...`,
 * conforme o barbeiro pertencesse a uma equipe ou trabalhasse sozinho —
 * `resolverAlvoNotificacao` existia para escolher entre os dois.
 *
 * Aqui não há autônomo sem empresa: quem trabalha sozinho abre uma empresa de uma pessoa
 * só. A preferência é sempre da empresa, uma linha em `business_notification_settings`,
 * e a razão do Barbershop para consolidar continua valendo — uma equipe recebe UM
 * relatório, administrado pelo dono, não um por barbeiro.
 *
 * `resolverAlvoNotificacao` continua exportada e devolve sempre o tenant, para as telas
 * que a chamam não mudarem.
 *
 * A MESCLA DE PADRÕES SUMIU, e some com razão. O Firestore obrigava a mesclar defaults na
 * leitura, porque o documento podia não existir ou vir parcial. Aqui toda empresa nasce
 * com a linha — por backfill nas existentes, por gatilho nas novas — e cada coluna tem
 * `not null default`. Não há estado parcial a remendar.
 *
 * A TABELA EXISTE E O ENVIO NÃO. Não há outbox nem worker; nada lê estas colunas ainda.
 * Guardar a preferência de quem já a configurou é o que evita perdê-la quando o envio
 * chegar.
 */
import { supabase } from "../../../supabaseConfig";
import type { Barbeiro, ConfiguracaoNotificacoes } from "../../types";
import { CONFIGURACAO_NOTIFICACOES_PADRAO } from "../../types";

export interface AlvoNotificacao {
  tipo: "negocio" | "autonomo";
  id: string;
}

/**
 * O alvo é sempre a empresa. `tipo` continua no retorno por compatibilidade e é sempre
 * `negocio` — não há mais autônomo sem empresa neste modelo.
 */
export function resolverAlvoNotificacao(barbeiro: Barbeiro): AlvoNotificacao {
  return { tipo: "negocio", id: barbeiro.negocioId ?? barbeiro.id };
}

interface LinhaPreferencia {
  canal_push: boolean;
  canal_whatsapp: boolean;
  canal_sms: boolean;
  evento_novo_agendamento: boolean;
  evento_confirmacao: boolean;
  evento_cancelamento: boolean;
  evento_lembrete: boolean;
  retorno_ativo: boolean;
  retorno_dias: number;
  retorno_canal: string;
}

const COLUNAS_AVISO =
  "canal_push, canal_whatsapp, canal_sms, evento_novo_agendamento, evento_confirmacao, " +
  "evento_cancelamento, evento_lembrete, retorno_ativo, retorno_dias, retorno_canal";

export async function getConfiguracaoNotificacoes(
  alvo: AlvoNotificacao,
): Promise<ConfiguracaoNotificacoes> {
  const { data } = await supabase
    .from("business_notification_settings")
    .select(COLUNAS_AVISO)
    .eq("tenant_id", alvo.id)
    .maybeSingle();

  // Sem linha significa sem permissão de ler, não configuração ausente — toda empresa
  // nasce com a dela. Devolver o padrão é a leitura segura: nunca liga um canal que a
  // empresa não escolheu.
  if (!data) return CONFIGURACAO_NOTIFICACOES_PADRAO;

  const linha = data as unknown as LinhaPreferencia;

  return {
    canais: {
      whatsapp: linha.canal_whatsapp,
      sms: linha.canal_sms,
      push: linha.canal_push,
    },
    eventos: {
      novoAgendamento: linha.evento_novo_agendamento,
      confirmacao: linha.evento_confirmacao,
      cancelamento: linha.evento_cancelamento,
      lembrete: linha.evento_lembrete,
    },
    retornoCliente: {
      ativo: linha.retorno_ativo,
      diasSemComparecer: linha.retorno_dias,
      canal: linha.retorno_canal,
    },
  } as ConfiguracaoNotificacoes;
}

/**
 * Grava a preferência. Continua sendo mescla parcial: o que não veio não é tocado.
 *
 * `uid` permanece no parâmetro por compatibilidade e é ignorado — quem alterou é lido de
 * `auth.uid()` pelo banco. Aceitar da tela permitiria atribuir a mudança a outra pessoa.
 */
export async function salvarConfiguracaoNotificacoes(
  alvo: AlvoNotificacao,
  config: Partial<ConfiguracaoNotificacoes>,
  _uid: string,
): Promise<void> {
  const mudanca: Record<string, unknown> = {};

  if (config.canais?.push !== undefined) mudanca.canal_push = config.canais.push;
  if (config.canais?.whatsapp !== undefined) mudanca.canal_whatsapp = config.canais.whatsapp;
  if (config.canais?.sms !== undefined) mudanca.canal_sms = config.canais.sms;

  if (config.eventos?.novoAgendamento !== undefined) {
    mudanca.evento_novo_agendamento = config.eventos.novoAgendamento;
  }
  if (config.eventos?.confirmacao !== undefined) {
    mudanca.evento_confirmacao = config.eventos.confirmacao;
  }
  if (config.eventos?.cancelamento !== undefined) {
    mudanca.evento_cancelamento = config.eventos.cancelamento;
  }
  if (config.eventos?.lembrete !== undefined) {
    mudanca.evento_lembrete = config.eventos.lembrete;
  }

  if (config.retornoCliente?.ativo !== undefined) {
    mudanca.retorno_ativo = config.retornoCliente.ativo;
  }
  if (config.retornoCliente?.diasSemComparecer !== undefined) {
    mudanca.retorno_dias = config.retornoCliente.diasSemComparecer;
  }
  if (config.retornoCliente?.canal !== undefined) {
    mudanca.retorno_canal = config.retornoCliente.canal;
  }

  if (Object.keys(mudanca).length === 0) return;

  const { error } = await supabase
    .from("business_notification_settings")
    .update(mudanca)
    .eq("tenant_id", alvo.id);

  if (error) throw error;
}
