/**
 * Pool de fotos padrão para barbeiros recém-criados que ainda não têm foto
 * própria (`fotoUrl` — Storage, Fase 3). São assets locais empacotados no
 * APK via `require()` — NÃO passam por upload nem por Firebase Storage, ver
 * decisão registrada no handoff da feature. `fotoUrl` continua reservado
 * exclusivamente para a foto real enviada pelo próprio usuário; assim que
 * ela existir, tem prioridade sobre a foto padrão (ver AvatarIlustrado).
 */
export const FOTOS_PADRAO = {
  corte: require('./barbeiros_padrao/barbearia-corte.png'),
  barba: require('./barbeiros_padrao/barbearia-barba.png'),
  degrade: require('./barbeiros_padrao/barbearia-degrade.png'),
  lavagem: require('./barbeiros_padrao/barbearia-lavagem.png'),
  toalhaQuente: require('./barbeiros_padrao/barbearia-toalha-quente.png'),
} as const;

export type FotoPadraoId = keyof typeof FOTOS_PADRAO;

/** Sorteia uma das fotos do pool — usado na criação do barbeiro. */
export function sortearFotoPadrao(): FotoPadraoId {
  const ids = Object.keys(FOTOS_PADRAO) as FotoPadraoId[];
  return ids[Math.floor(Math.random() * ids.length)];
}
