/**
 * NotificationRepository — configuração de canais/eventos de notificação de
 * agendamento (WhatsApp, SMS, Push).
 *
 * Onda A (fundação) do sistema multicanal de avisos: define só o MODELO DE
 * DADO e a leitura/escrita da preferência. O orquestrador que decide QUANDO
 * cada canal dispara, o registro FCM multi-dispositivo e a tela de
 * configuração são ondas futuras — este repositório é a base sobre a qual
 * elas serão construídas.
 *
 * Vive em um de dois lugares, dependendo do tipo de profissional (ver
 * `resolverAlvoNotificacao` abaixo e `firestore.rules`):
 *  - `barbeiros/{barbeiroId}/configuracoes/notificacoes` — profissional
 *    autônomo (ou o dono do negócio configurando um profissional de equipe
 *    sem login próprio — mesmo padrão de `bloqueiosPrivados`, ver
 *    BloqueioRepository.ts).
 *  - `negocios/{negocioId}/configuracoes/notificacoes` — config da EQUIPE
 *    inteira; só o dono administra (mesmo padrão de `membros`/comissão em
 *    NegocioRepository.ts — hoje profissionais de equipe não têm login
 *    próprio, então não existe configuração individual por membro).
 *
 * SEM CacheService de propósito: é uma configuração editada raramente, e um
 * cache desatualizado aqui poderia fazer o app agir sobre uma preferência de
 * canal que já não é mais a real (pior que uma leitura a mais no Firestore).
 */
import { db } from '../../../firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { Barbeiro, ConfiguracaoNotificacoes } from '../../types';
import { CONFIGURACAO_NOTIFICACOES_PADRAO } from '../../types';

/** Documento fixo dentro da subcoleção `configuracoes` (autônomo ou negócio). */
const DOC_ID = 'notificacoes';

/**
 * Alvo de uma config de notificação: um profissional autônomo (doc id ==
 * uid do barbeiro) ou um negócio (equipe).
 */
export interface AlvoNotificacao {
  tipo: 'negocio' | 'autonomo';
  id: string;
}

const ref = (alvo: AlvoNotificacao) =>
  alvo.tipo === 'negocio'
    ? doc(db, 'negocios', alvo.id, 'configuracoes', DOC_ID)
    : doc(db, 'barbeiros', alvo.id, 'configuracoes', DOC_ID);

/**
 * Decide o alvo (negócio ou autônomo) a partir de um `Barbeiro` já em mãos,
 * usando o `negocioId` já denormalizado no próprio doc — sem precisar buscar
 * o negócio de novo no Firestore. Mesma bifurcação já usada em
 * `BarbeiroHome.tsx`/`EditarProfissionalScreen.tsx` (`if (negocio) ... else`).
 */
export function resolverAlvoNotificacao(barbeiro: Barbeiro): AlvoNotificacao {
  return barbeiro.negocioId
    ? { tipo: 'negocio', id: barbeiro.negocioId }
    : { tipo: 'autonomo', id: barbeiro.id };
}

/**
 * Lê a config de notificação do alvo. Compatibilidade com registros
 * anteriores a esta feature: se o doc ainda não existe, devolve os PADRÕES
 * (`CONFIGURACAO_NOTIFICACOES_PADRAO`) em vez de lançar erro — nunca deixa a
 * tela/orquestrador sem uma preferência para trabalhar.
 */
export async function getConfiguracaoNotificacoes(
  alvo: AlvoNotificacao,
): Promise<ConfiguracaoNotificacoes> {
  const snap = await getDoc(ref(alvo));
  if (!snap.exists()) return CONFIGURACAO_NOTIFICACOES_PADRAO;
  return {
    ...CONFIGURACAO_NOTIFICACOES_PADRAO,
    ...(snap.data() as Partial<ConfiguracaoNotificacoes>),
    // Os documentos anteriores a lembrete de retorno não têm este campo.
    // Mesclar cada mapa evita que uma config parcial antiga apague defaults
    // internos ao ser lida pela tela.
    canais: {
      ...CONFIGURACAO_NOTIFICACOES_PADRAO.canais,
      ...((snap.data() as Partial<ConfiguracaoNotificacoes>).canais || {}),
    },
    eventos: {
      ...CONFIGURACAO_NOTIFICACOES_PADRAO.eventos,
      ...((snap.data() as Partial<ConfiguracaoNotificacoes>).eventos || {}),
    },
    retornoCliente: {
      ...CONFIGURACAO_NOTIFICACOES_PADRAO.retornoCliente,
      ...((snap.data() as Partial<ConfiguracaoNotificacoes>).retornoCliente || {}),
    },
  };
}

/**
 * Grava a config do alvo (merge parcial — não apaga campos não enviados).
 * `updatedAt`/`updatedBy` são responsabilidade deste repositório, nunca do
 * chamador: a tela/orquestrador NÃO deve importar `firebase/firestore` só
 * para gerar o timestamp (mesmo padrão reforçado em
 * `UsuarioRepository.createProfile`, ver `consentimentoEm`).
 */
export async function salvarConfiguracaoNotificacoes(
  alvo: AlvoNotificacao,
  config: Partial<ConfiguracaoNotificacoes>,
  uid: string,
): Promise<void> {
  await setDoc(
    ref(alvo),
    { ...config, updatedAt: serverTimestamp(), updatedBy: uid },
    { merge: true },
  );
}
