/**
 * RelatorioEmailRepository — preferências de frequência e destinatário dos
 * relatórios financeiros. Compartilha o documento privado `notificacoes` com
 * as configurações de aviso, pois ele já tem as mesmas permissões: só o dono
 * do negócio (ou o profissional autônomo) consegue lê-lo e alterá-lo.
 */
import { db } from '../../../firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { Barbeiro, ConfiguracaoRelatorioEmail } from '../../types';
import { CONFIGURACAO_RELATORIO_EMAIL_PADRAO } from '../../types';
import {
  resolverAlvoNotificacao,
  type AlvoNotificacao,
} from './NotificationRepository';

export type AlvoRelatorioEmail = AlvoNotificacao;

const ref = (alvo: AlvoRelatorioEmail) =>
  alvo.tipo === 'negocio'
    ? doc(db, 'negocios', alvo.id, 'configuracoes', 'notificacoes')
    : doc(db, 'barbeiros', alvo.id, 'configuracoes', 'notificacoes');

/** A mesma resolução de escopo usada para notificações: equipe ou autônomo. */
export function resolverAlvoRelatorioEmail(barbeiro: Barbeiro): AlvoRelatorioEmail {
  return resolverAlvoNotificacao(barbeiro);
}

/**
 * Lê preferências já salvas e mescla com defaults retrocompatíveis. Em
 * especial, a ausência total do campo significa "continuar semanal".
 */
export async function getConfiguracaoRelatorioEmail(
  alvo: AlvoRelatorioEmail,
): Promise<ConfiguracaoRelatorioEmail> {
  const snap = await getDoc(ref(alvo));
  if (!snap.exists()) return CONFIGURACAO_RELATORIO_EMAIL_PADRAO;

  const dados = snap.data() as { relatorioEmail?: Partial<ConfiguracaoRelatorioEmail> };
  return {
    ...CONFIGURACAO_RELATORIO_EMAIL_PADRAO,
    ...(dados.relatorioEmail || {}),
  };
}

/** Grava somente o mapa de relatório, sem substituir avisos já configurados. */
export async function salvarConfiguracaoRelatorioEmail(
  alvo: AlvoRelatorioEmail,
  config: ConfiguracaoRelatorioEmail,
  uid: string,
): Promise<void> {
  await setDoc(
    ref(alvo),
    { relatorioEmail: config, updatedAt: serverTimestamp(), updatedBy: uid },
    { merge: true },
  );
}
