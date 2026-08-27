/**
 * Rotas do produto, e a validação do destino pós-login.
 *
 * Vive no núcleo por dois motivos. É lógica pura de string — não toca DOM, não toca
 * Next — e o aplicativo vai precisar exatamente da mesma resolução de rota inicial por
 * categoria. Mas o motivo forte é outro: `destinoSeguro` precisa ter **uma**
 * implementação. Duas divergem, e a que divergir é a que será explorada.
 */

import { getSegmentConfig, hasFeature } from "../segments/index";
import type { BusinessType, FeatureKey } from "../segments/index";

/** Onde o produto leva quem acabou de entrar e ainda não escolheu nada. */
export const ROTA_PADRAO = "/inicio";

/**
 * O endereço da empresa na URL. `businesses.slug`, formato garantido por CHECK no
 * banco (`20260826000400_business_slug.sql`).
 */
const SLUG = "[a-z0-9][a-z0-9-]{1,38}[a-z0-9]";

/**
 * Rotas internas para as quais é legítimo mandar alguém depois do login.
 *
 * Lista fechada, não "qualquer caminho que comece com barra". Um destino aberto é o
 * vetor clássico de phishing: o link parece do produto, a vítima entra de verdade, e
 * sai em outro lugar já autenticada.
 */
const DESTINOS = new RegExp(`^/(?:e/${SLUG}(?:/.*)?|inicio|conta|comecar|e)$`);

/**
 * Valida para onde o `?proximo=` pode levar.
 *
 * Chamado na LEITURA, nunca só na escrita: quem escreve o parâmetro é o produto, mas
 * quem manda o link pronto é o atacante. Validar na escrita não protege ninguém.
 *
 * Qualquer recusa é silenciosa e cai em `/inicio`. Não ecoe o valor recusado na tela —
 * seria refletir entrada do atacante de volta.
 */
export function destinoSeguro(bruto: string | null | undefined): string {
  if (!bruto) return ROTA_PADRAO;
  if (bruto.length > 512) return ROTA_PADRAO;
  if (temCaractereProibido(bruto)) return ROTA_PADRAO;

  let candidato: string;
  try {
    // UMA vez. Decodificar em laco reabriria o duplo-encode que o passo acima recusa.
    candidato = decodeURIComponent(bruto);
  } catch {
    return ROTA_PADRAO;
  }

  if (temCaractereProibido(candidato)) return ROTA_PADRAO;

  // Nada de `new URL()` aqui, e isso e deliberado: o nucleo compila sem a lib DOM
  // porque tem que servir ao aplicativo tambem, e a implementacao de URL no React
  // Native e incompleta. Validacao de caminho e comparacao de string; nao precisa de
  // parser, e um parser que se comporta diferente entre alvos seria pior que nenhum.

  // `//evil.tld` e protocolo-relativo; `/\evil.tld` vira o mesmo no parser da WHATWG,
  // que converte barra invertida em barra dentro de esquema especial. Recusamos a
  // barra invertida em qualquer posicao — ela nao tem uso legitimo num caminho nosso.
  if (!candidato.startsWith("/")) return ROTA_PADRAO;
  if (candidato.includes("\\")) return ROTA_PADRAO;
  if (candidato[1] === "/") return ROTA_PADRAO;
  if (candidato.includes("://")) return ROTA_PADRAO;

  // O fragmento e descartado: nao chega ao servidor e so serve para injecao no cliente.
  const semFragmento = candidato.split("#", 1)[0] ?? "";
  const corte = semFragmento.indexOf("?");
  const caminho = corte === -1 ? semFragmento : semFragmento.slice(0, corte);
  const query = corte === -1 ? "" : semFragmento.slice(corte);

  // Travessia. `/e/loja/../../evil` normalizaria para fora da area permitida.
  if (caminho.split("/").includes("..")) return ROTA_PADRAO;

  if (!DESTINOS.test(caminho)) return ROTA_PADRAO;

  return caminho + query;
}

function temCaractereProibido(valor: string): boolean {
  // Controle, DEL e qualquer espaco em branco — inclusive tab e quebra de linha, que
  // alguns parsers ignoram e outros nao. O hifen e legitimo: todo slug tem um.
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001F\u007F]|\s/.test(valor);
}

// ---------------------------------------------------------------------------
// Rotas da empresa
// ---------------------------------------------------------------------------

/** A ordem em que a navegação aparece. A primeira visível é a rota inicial. */
const NAVEGACAO: readonly { readonly caminho: string; readonly feature: FeatureKey }[] = [
  { caminho: "patio", feature: "workOrders" },
  { caminho: "agenda", feature: "appointments" },
  { caminho: "clientes", feature: "customers" },
  { caminho: "servicos", feature: "services" },
  { caminho: "equipe", feature: "professionals" },
  { caminho: "veiculos", feature: "vehicles" },
  { caminho: "boxes", feature: "boxes" },
  { caminho: "relatorios", feature: "finance" },
];

/**
 * A tela inicial da categoria. Numa automotiva é o Pátio; numa barbearia, a agenda.
 *
 * Estava enterrada dentro do componente do módulo automotivo, o que obrigava a raiz do
 * produto a redirecionar para `/patio` sem saber de que categoria era a empresa.
 */
export function rotaInicialDoSegmento(businessType: BusinessType): string {
  const primeira = NAVEGACAO.find((item) => hasFeature(businessType, item.feature));
  return primeira ? primeira.caminho : "conta";
}

/** `/e/barbearia-do-ze/agenda` */
export function rotaDaEmpresa(slug: string, caminho?: string): string {
  return caminho ? `/e/${slug}/${caminho}` : `/e/${slug}`;
}

/** Para onde levar quem entrou, dada a empresa ativa. */
export function rotaInicialDaEmpresa(slug: string, businessType: BusinessType): string {
  return rotaDaEmpresa(slug, rotaInicialDoSegmento(businessType));
}

/**
 * Uma rota é alcançável nesta categoria? É a guarda que impede uma barbearia de abrir
 * `/patio` digitando o endereço.
 *
 * Rota desconhecida devolve `false`: a versão anterior desta lógica tratava
 * "não encontrei o item de menu" como permitido, e a primeira rota sem item de menu
 * teria entrado sem guarda nenhuma.
 */
export function rotaPermitida(businessType: BusinessType, caminho: string): boolean {
  if (caminho === "" || caminho === "conta" || caminho === "privacidade") return true;
  const item = NAVEGACAO.find((entrada) => entrada.caminho === caminho);
  return item ? hasFeature(businessType, item.feature) : false;
}

/** Os itens de menu desta categoria, na ordem, já com o rótulo resolvido. */
export function navegacaoDoSegmento(businessType: BusinessType) {
  const config = getSegmentConfig(businessType);
  return NAVEGACAO.filter((item) => hasFeature(businessType, item.feature)).map((item) => ({
    caminho: item.caminho,
    feature: item.feature,
    rotulo: rotuloDaRota(item.caminho, config.labels),
  }));
}

function rotuloDaRota(caminho: string, labels: ReturnType<typeof getSegmentConfig>["labels"]) {
  switch (caminho) {
    case "patio":
      return "Pátio";
    case "agenda":
      return "Agenda";
    case "clientes":
      return labels.customerPlural;
    case "servicos":
      return "Serviços";
    case "equipe":
      return labels.professionalPlural;
    case "veiculos":
      return labels.vehiclePlural ?? "Veículos";
    case "boxes":
      return "Boxes";
    case "relatorios":
      return "Relatórios";
    default:
      return caminho;
  }
}
