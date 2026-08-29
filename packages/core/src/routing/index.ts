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
 * A empresa vive na RAIZ: `boramarca.com/barbearia-do-ze/agenda`.
 *
 * É o padrão que as pessoas já conhecem de Instagram, Calendly e Linktree, e o endereço
 * vai ser compartilhado por WhatsApp — cada segmento a mais é atrito real.
 *
 * O preço disso é concreto e está logo abaixo: o nome da empresa divide espaço de nomes
 * com toda rota do produto. Criar `/precos` amanhã quebra a empresa que já se chame
 * assim, e por isso `ROTAS_RESERVADAS` nasce generosa em vez de mínima. Reservar
 * palavra que talvez nunca se use custa nada; deixar de reservar custa migração de
 * dados e link quebrado.
 */
const DESTINOS = new RegExp(`^/(?:${SLUG})(?:/${SLUG})*$`);

/**
 * Nao ha rota `/e` para o seletor de empresa. Com a empresa na raiz ele deixou de
 * precisar de endereco proprio: `/inicio` redireciona quando ha uma empresa so, e mostra
 * a escolha quando ha mais de uma. Uma rota a menos, e uma palavra reservada a menos que
 * poderia ser o nome de alguem.
 */

/**
 * Nenhuma empresa pode se chamar assim.
 *
 * DUPLICADA DE PROPÓSITO em `set_business_slug` e `create_business_with_owner`, no SQL:
 * o banco não importa TypeScript, e a recusa tem que acontecer lá, onde é autoridade.
 * Esta cópia serve à interface, para explicar antes de o usuário enviar. **Ao mexer numa,
 * mexa na outra** — o teste `routing.test.ts` afirma o conteúdo desta lista para que a
 * divergência apareça.
 */
export const ROTAS_RESERVADAS: readonly string[] = [
  // o que já existe
  "e",
  "entrar",
  "sair",
  "cadastro",
  "comecar",
  "inicio",
  "inicio-empresa",
  "equipe",
  "clientes",
  "servicos",
  "agenda",
  "patio",
  "relatorios",
  "veiculos",
  "boxes",
  "conta",
  "privacidade",
  // o que provavelmente vai existir
  "precos",
  "planos",
  "assinatura",
  "cobranca",
  "faturas",
  "ajuda",
  "suporte",
  "contato",
  "sobre",
  "termos",
  "blog",
  "novidades",
  "status",
  "docs",
  "painel",
  "config",
  "configuracoes",
  "notificacoes",
  "buscar",
  "explorar",
  "convite",
  "onboarding",
  // técnico e reservado por convenção da web
  "api",
  "admin",
  "app",
  "auth",
  "login",
  "logout",
  "static",
  "assets",
  "public",
  "_next",
  "favicon",
  "robots",
  "sitemap",
  "well-known",
  "novo",
  "nova",
];

/** A interface pergunta antes de enviar; o banco recusa de qualquer forma. */
export function enderecoReservado(slug: string): boolean {
  return ROTAS_RESERVADAS.includes(slug.trim().toLowerCase());
}

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

  // Travessia. `/loja/../../evil` normalizaria para fora da area permitida.
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
const NAVEGACAO: readonly {
  readonly caminho: string;
  readonly feature: FeatureKey;
}[] = [
  // Início vem primeiro para toda categoria: e a tela que o dono abre as 8h querendo
  // saber o que tem hoje. O Patio continua sendo a casa da automotiva logo abaixo.
  { caminho: "inicio-empresa", feature: "appointments" },
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
  const primeira = NAVEGACAO.find((item) =>
    hasFeature(businessType, item.feature),
  );
  return primeira ? primeira.caminho : "conta";
}

/** `/barbearia-do-ze/agenda` */
export function rotaDaEmpresa(slug: string, caminho?: string): string {
  return caminho ? `/${slug}/${caminho}` : `/${slug}`;
}

/** Para onde levar quem entrou, dada a empresa ativa. */
export function rotaInicialDaEmpresa(
  slug: string,
  businessType: BusinessType,
): string {
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
export function rotaPermitida(
  businessType: BusinessType,
  caminho: string,
): boolean {
  if (caminho === "" || caminho === "conta" || caminho === "privacidade")
    return true;
  const item = NAVEGACAO.find((entrada) => entrada.caminho === caminho);
  return item ? hasFeature(businessType, item.feature) : false;
}

/** Os itens de menu desta categoria, na ordem, já com o rótulo resolvido. */
export function navegacaoDoSegmento(businessType: BusinessType) {
  const config = getSegmentConfig(businessType);
  return NAVEGACAO.filter((item) => hasFeature(businessType, item.feature)).map(
    (item) => ({
      caminho: item.caminho,
      feature: item.feature,
      rotulo: rotuloDaRota(item.caminho, config.labels),
    }),
  );
}

function rotuloDaRota(
  caminho: string,
  labels: ReturnType<typeof getSegmentConfig>["labels"],
) {
  switch (caminho) {
    case "inicio-empresa":
      return "Início";
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
