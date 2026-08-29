/**
 * RelatorioEmailRepository — frequência e destinatário do resumo financeiro.
 *
 * PORTADO DO FIRESTORE PARA O SUPABASE, com as assinaturas intactas.
 *
 * CONTINUA COMPARTILHANDO A LINHA COM AS NOTIFICAÇÕES, e a razão do Barbershop para isso
 * era boa: uma equipe recebe UM relatório consolidado, administrado pelo dono, não um por
 * barbeiro. Lá o motivo prático era que o documento já tinha a permissão certa; aqui é
 * `business_notification_settings`, com política de leitura para qualquer membro e de
 * escrita só para a administração.
 *
 * A MESCLA DE PADRÕES NA LEITURA SUMIU. No Firestore o campo podia não existir — e a
 * ausência significava "continuar semanal", uma retrocompatibilidade que precisava ser
 * remendada a cada leitura. Aqui as colunas são `not null default`, com os mesmos
 * valores: semanal sim, mensal não.
 *
 * O DESTINATÁRIO NULO CONTINUA SIGNIFICANDO "o e-mail do dono". Preencher a coluna com o
 * e-mail dele no cadastro criaria uma segunda cópia que envelheceria sozinha quando a
 * pessoa trocasse de endereço.
 */
import { supabase } from "../../../supabaseConfig";
import type { Barbeiro, ConfiguracaoRelatorioEmail } from "../../types";
import { CONFIGURACAO_RELATORIO_EMAIL_PADRAO } from "../../types";
import { resolverAlvoNotificacao, type AlvoNotificacao } from "./NotificationRepository";

export type AlvoRelatorioEmail = AlvoNotificacao;

/** A mesma resolução de escopo das notificações — e agora é sempre a empresa. */
export function resolverAlvoRelatorioEmail(barbeiro: Barbeiro): AlvoRelatorioEmail {
  return resolverAlvoNotificacao(barbeiro);
}

export async function getConfiguracaoRelatorioEmail(
  alvo: AlvoRelatorioEmail,
): Promise<ConfiguracaoRelatorioEmail> {
  const { data } = await supabase
    .from("business_notification_settings")
    .select("relatorio_semanal, relatorio_mensal, relatorio_email")
    .eq("tenant_id", alvo.id)
    .maybeSingle();

  if (!data) return CONFIGURACAO_RELATORIO_EMAIL_PADRAO;

  const linha = data as unknown as {
    relatorio_semanal: boolean;
    relatorio_mensal: boolean;
    relatorio_email: string | null;
  };

  return {
    semanal: linha.relatorio_semanal,
    mensal: linha.relatorio_mensal,
    ...(linha.relatorio_email ? { emailDestino: linha.relatorio_email } : {}),
  };
}

/**
 * Grava só o que é do relatório, sem tocar nas preferências de aviso — que dividem a
 * mesma linha. Era `merge: true` no Firestore; aqui é um `update` de colunas nomeadas,
 * que dá a mesma garantia de forma mais explícita.
 */
export async function salvarConfiguracaoRelatorioEmail(
  alvo: AlvoRelatorioEmail,
  config: ConfiguracaoRelatorioEmail,
  _uid: string,
): Promise<void> {
  const { error } = await supabase
    .from("business_notification_settings")
    .update({
      relatorio_semanal: config.semanal,
      relatorio_mensal: config.mensal,
      relatorio_email: config.emailDestino?.trim() || null,
    })
    .eq("tenant_id", alvo.id);

  if (error) throw error;
}
