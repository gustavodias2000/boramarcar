import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BUSINESS_TYPES } from "./index";
import { SEGMENT_PALETTES, getSegmentPalette } from "./paletas";

/** Luminância relativa da WCAG. */
function luminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const GROUND = "#0C141C";

describe("paleta por segmento", () => {
  it("toda categoria tem a propria — nenhuma herda a cor de outra por omissao", () => {
    for (const businessType of BUSINESS_TYPES) {
      const palette = getSegmentPalette(businessType);
      assert.ok(palette, `${businessType} ficou sem paleta`);
      assert.match(palette.accent, /^#[0-9A-F]{6}$/i);
    }
  });

  it("a barbearia mantem o ambar do Barbershop, que e decisao de marca", () => {
    assert.equal(SEGMENT_PALETTES.barbershop.accent, "#F59E0B");
    assert.equal(SEGMENT_PALETTES.barbershop.onAccent, GROUND);
  });

  it("nenhuma categoria repete o acento de outra", () => {
    const accents = BUSINESS_TYPES.map((type) => SEGMENT_PALETTES[type].accent.toUpperCase());
    assert.equal(
      new Set(accents).size,
      accents.length,
      "duas categorias com o mesmo acento sao indistinguiveis na tela de escolha",
    );
  });

  it("o acento e legivel sobre o fundo escuro do produto", () => {
    // 3:1 e o piso da WCAG para componente de interface e texto grande — que e o que o
    // acento carrega: botao, chip e rotulo. Texto corrido nunca usa o acento.
    for (const businessType of BUSINESS_TYPES) {
      const { accent } = SEGMENT_PALETTES[businessType];
      const ratio = contrast(accent, GROUND);
      assert.ok(ratio >= 3, `${businessType}: acento ${accent} da ${ratio.toFixed(2)}:1 sobre o fundo`);
    }
  });

  it("o texto sobre o acento e legivel — senao o botao principal some", () => {
    for (const businessType of BUSINESS_TYPES) {
      const { accent, onAccent } = SEGMENT_PALETTES[businessType];
      const ratio = contrast(onAccent, accent);
      assert.ok(
        ratio >= 4.5,
        `${businessType}: ${onAccent} sobre ${accent} da ${ratio.toFixed(2)}:1`,
      );
    }
  });

  it("o fundo suave do acento continua sendo fundo — escuro o bastante para o texto branco", () => {
    for (const businessType of BUSINESS_TYPES) {
      const { accentSoft } = SEGMENT_PALETTES[businessType];
      const ratio = contrast("#F8FAFC", accentSoft);
      assert.ok(
        ratio >= 4.5,
        `${businessType}: texto claro sobre ${accentSoft} da ${ratio.toFixed(2)}:1`,
      );
    }
  });
});
