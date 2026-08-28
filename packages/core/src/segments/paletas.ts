/**
 * A cor de cada segmento.
 *
 * A DIVISÃO É O PONTO: o FUNDO é do Bora Marcá, o ACENTO é do segmento.
 *
 * O azul-profundo, os cinzas do texto e as cores semânticas (erro, sucesso, aviso) são
 * do produto e não mudam de categoria para categoria — é o que faz o aplicativo parecer
 * o mesmo aplicativo. O acento é o que muda: a cor do botão principal, do item
 * selecionado, do rótulo de campo, do chip de status.
 *
 * A barbearia mantém o âmbar `#F59E0B` sobre `#0C141C` EXATAMENTE como estava. Aquela
 * escolha foi de marca — poste listrado, navalha, couro, tom quente — e está registrada
 * como decisão vinculante. Nada aqui a toca.
 *
 * O que muda é que manicure deixa de herdar o âmbar da barbearia por acidente. Cada
 * categoria ganha o próprio tom, escolhido pelo ofício: violeta de esmalte para
 * manicure, aço para tatuagem, água para massoterapia, menta para banho e tosa.
 *
 * POR QUE ISTO MORA NO NÚCLEO. São quatro strings hexadecimais por segmento — dado puro,
 * sem framework. O site e o aplicativo precisam concordar sobre a cor de uma manicure, e
 * dois arquivos com a mesma tabela divergem no primeiro ajuste. Como imagem não é dado
 * puro (`require` no React Native, URL na web), ela fica na camada de cada interface e
 * só a CHAVE do conjunto vem daqui.
 *
 * `onAccent` é a cor do texto EM CIMA do acento, e por isso é escolhida junto: todos os
 * acentos abaixo são claros e saturados, então o texto é o próprio fundo escuro. Trocar
 * um acento por um tom escuro exige trocar este campo no mesmo movimento, ou o botão
 * fica ilegível.
 */

import type { BusinessType } from "./index";

export interface SegmentPalette {
  /** Ação principal, item selecionado, foco. */
  readonly accent: string;
  /** Fundo do acento sobre o escuro: chip de ícone, linha selecionada. */
  readonly accentSoft: string;
  /** Variante clara para rótulo pequeno e texto de apoio sobre o fundo escuro. */
  readonly accentLight: string;
  /** Texto e ícone sobre o acento. */
  readonly onAccent: string;
}

/** O fundo escuro do produto. Todos os acentos abaixo são legíveis sobre ele. */
const GROUND = "#0C141C";

export const SEGMENT_PALETTES: Readonly<Record<BusinessType, SegmentPalette>> = {
  // Âmbar sobre azul-profundo. Decisão de marca do Barbershop — não trocar sem pedido.
  barbershop: {
    accent: "#F59E0B",
    accentSoft: "#3A2A0F",
    accentLight: "#FCD34D",
    onAccent: GROUND,
  },
  // Azul de água e cromo: lavagem, polimento, vitrificação.
  automotive_aesthetics: {
    accent: "#38BDF8",
    accentSoft: "#0F2A3A",
    accentLight: "#7DD3FC",
    onAccent: GROUND,
  },
  // Rosa de salão, o tom que o ramo já usa em fachada e vitrine.
  beauty_salon: {
    accent: "#F472B6",
    accentSoft: "#3A1428",
    accentLight: "#F9A8D4",
    onAccent: GROUND,
  },
  // Violeta de esmalte. É a cor que mais aparece em estúdio de unha.
  manicure: {
    accent: "#A78BFA",
    accentSoft: "#241C3F",
    accentLight: "#C4B5FD",
    onAccent: GROUND,
  },
  // Fúcsia de batom, mais saturado que o rosa do salão para não se confundir com ele.
  makeup: {
    accent: "#E879F9",
    accentSoft: "#361540",
    accentLight: "#F0ABFC",
    onAccent: GROUND,
  },
  // Água parada: o vocabulário visual de spa é frio e dessaturado.
  massage: {
    accent: "#5EEAD4",
    accentSoft: "#0E332E",
    accentLight: "#99F6E4",
    onAccent: GROUND,
  },
  // Aço e osso. Tatuagem é preto e branco antes de ser qualquer cor, e um vermelho aqui
  // brigaria com a cor de erro — botão principal não pode parecer alerta.
  tattoo: {
    accent: "#D4D4D8",
    accentSoft: "#26262A",
    accentLight: "#E4E4E7",
    onAccent: GROUND,
  },
  // Bronze de hena: mais marrom e mais fosco que o âmbar da barbearia, de propósito.
  eyebrows: {
    accent: "#BE9C6B",
    accentSoft: "#2E2518",
    accentLight: "#DCC29A",
    onAccent: GROUND,
  },
  // Pêssego de cabine: quente, mas claro e suave, não o âmbar forte da barbearia.
  aesthetics: {
    accent: "#FDBA74",
    accentSoft: "#3A2617",
    accentLight: "#FED7AA",
    onAccent: GROUND,
  },
  // Rosa pálido, o tom clínico-suave que o ramo usa.
  depilation: {
    accent: "#FDA4AF",
    accentSoft: "#3A1D22",
    accentLight: "#FECDD3",
    onAccent: GROUND,
  },
  // Menta: banho e tosa é o único da lista que não é sobre a pessoa, e a cor separa.
  petshop: {
    accent: "#86EFAC",
    accentSoft: "#12331F",
    accentLight: "#BBF7D0",
    onAccent: GROUND,
  },
};

export function getSegmentPalette(businessType: BusinessType): SegmentPalette {
  return SEGMENT_PALETTES[businessType];
}
