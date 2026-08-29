/**
 * A marca, num lugar só.
 *
 * "Bora Marcar" é PROVISÓRIO — o §1 do Contexto Mestre registra isso desde o começo, e
 * o dono reafirmou em 26/08/2026. Quando o nome definitivo for escolhido, a troca tem
 * que ser este arquivo, não uma varredura por centenas de ocorrências.
 *
 * Por isso nada em `web/src` escreve o nome literal. Se você está prestes a digitar
 * "Bora Marcá" numa tela, importe daqui.
 *
 * Fica em `core/` e não em `packages/core` porque é configuração desta instalação, não
 * regra de domínio: o aplicativo terá a própria, e um dia isso pode vir do banco por
 * tenant (marca branca). A forma do objeto é o que sobrevive a essa mudança.
 */
export const MARCA = {
  /** Como aparece por extenso, em título e em texto corrido. */
  nome: "Bora Marcá",
  /** A grafia de duas partes da logomarca: `bora` leve, `marcá` pesado. */
  logo: { leve: "bora", forte: "marcá" },
  /** Curto, para aba do navegador e espaço apertado. */
  curto: "Bora Marcá",
  /** Uma linha, para metadados e rodapé. */
  descricao: "Agenda e gestão para negócios de serviço",
} as const;
