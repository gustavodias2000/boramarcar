/**
 * `node --test src/routing/routing.test.ts` — sem runner, sem dependência.
 *
 * Este arquivo existe porque a revisão de segurança classificou `destinoSeguro` como
 * uma das duas peças que, erradas, não falham em teste nenhum. Um redirecionamento
 * aberto não quebra a tela: o link parece do produto, a pessoa entra de verdade, e sai
 * autenticada em outro lugar.
 *
 * Enquanto escrevia a implementação eu digitei a classe `[<controle>-<controle>]` com
 * bytes crus, que na prática vira "espaço ou hífen" — e teria recusado todo slug, que
 * tem hífen. O caso `barbearia-do-ze` abaixo é esse defeito virando asserção.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ROTA_PADRAO,
  destinoSeguro,
  navegacaoDoSegmento,
  rotaDaEmpresa,
  rotaInicialDaEmpresa,
  rotaInicialDoSegmento,
  rotaPermitida,
} from "./index";

// ---------------------------------------------------------------------------
// destinoSeguro — os que precisam ser recusados
// ---------------------------------------------------------------------------

const HOSTIS = [
  ["protocolo-relativo", "//evil.tld"],
  ["barra invertida", "/\\evil.tld"],
  ["barra invertida dupla", "/\\/evil.tld"],
  ["barras invertidas", "\\/\\/evil.tld"],
  ["absoluto https", "https://evil.tld"],
  ["esquema com uma barra", "http:/evil.tld"],
  ["javascript", "javascript:alert(1)"],
  ["encode simples", "%2f%2fevil.tld"],
  ["encode duplo", "%252f%252fevil.tld"],
  ["tab embutido", "/%09/evil.tld"],
  ["espaco no meio", "/ /evil.tld"],
  ["quatro barras", "////evil.tld"],
  ["ponto e arroba", "/.evil.tld\\@x"],
  ["encode malformado", "/%"],
  ["rota fora da lista", "/qualquer-coisa"],
  ["rota de outro produto", "/admin"],
  ["travessia", "/e/loja/../../evil"],
  ["vazio", ""],
  ["nulo", null],
];

for (const [nome, entrada] of HOSTIS) {
  test(`destinoSeguro recusa: ${nome}`, () => {
    assert.equal(destinoSeguro(entrada as string | null), ROTA_PADRAO);
  });
}

test("destinoSeguro recusa entrada absurdamente longa", () => {
  assert.equal(destinoSeguro("/inicio" + "a".repeat(600)), ROTA_PADRAO);
});

// ---------------------------------------------------------------------------
// destinoSeguro — os que precisam passar
// ---------------------------------------------------------------------------

test("aceita a rota padrao", () => {
  assert.equal(destinoSeguro("/inicio"), "/inicio");
});

test("aceita a empresa — e o hifen do slug nao pode ser recusado", () => {
  assert.equal(destinoSeguro("/e/barbearia-do-ze"), "/e/barbearia-do-ze");
});

test("aceita rota dentro da empresa", () => {
  assert.equal(destinoSeguro("/e/barbearia-do-ze/agenda"), "/e/barbearia-do-ze/agenda");
});

test("preserva a query — e o dia que a pessoa estava olhando", () => {
  assert.equal(
    destinoSeguro("/e/salao-da-ana/agenda?dia=2026-08-26"),
    "/e/salao-da-ana/agenda?dia=2026-08-26",
  );
});

test("descarta o fragmento, que so serve para injecao no cliente", () => {
  assert.equal(destinoSeguro("/inicio#qualquer"), "/inicio");
});

// O ataque aqui e tentar virar `http://user@evil.tld` pelo arroba. Ele mora inteiro no
// fragmento, que e descartado — e o que sobra e um caminho interno com um parametro,
// inofensivo. Preservar a query e proposital: e assim que `?dia=` sobrevive ao login.
test("o arroba no fragmento morre com o fragmento, e a query sobrevive", () => {
  assert.equal(destinoSeguro("/inicio?x=1#@evil.tld"), "/inicio?x=1");
});

test("aceita o seletor de empresa", () => {
  assert.equal(destinoSeguro("/e"), "/e");
});

test("aceita o valor ja codificado uma vez", () => {
  assert.equal(destinoSeguro("%2Finicio"), "/inicio");
});

// ---------------------------------------------------------------------------
// Rotas por categoria
// ---------------------------------------------------------------------------

test("a automotiva abre no patio", () => {
  assert.equal(rotaInicialDoSegmento("automotive_aesthetics"), "patio");
});

test("a barbearia abre na agenda, nao no patio", () => {
  assert.equal(rotaInicialDoSegmento("barbershop"), "agenda");
});

test("nenhuma categoria de servico abre no patio, exceto a automotiva", () => {
  for (const tipo of [
    "barbershop",
    "beauty_salon",
    "manicure",
    "makeup",
    "massage",
    "tattoo",
    "petshop",
  ] as const) {
    assert.notEqual(rotaInicialDoSegmento(tipo), "patio", tipo);
  }
});

test("a barbearia nao alcanca patio, boxes nem veiculos", () => {
  for (const rota of ["patio", "boxes", "veiculos"]) {
    assert.equal(rotaPermitida("barbershop", rota), false, rota);
  }
});

test("control — a automotiva alcanca as tres", () => {
  for (const rota of ["patio", "boxes", "veiculos"]) {
    assert.equal(rotaPermitida("automotive_aesthetics", rota), true, rota);
  }
});

test("rota desconhecida e recusada, nao presumida permitida", () => {
  assert.equal(rotaPermitida("barbershop", "financeiro-secreto"), false);
});

test("conta e privacidade valem para toda categoria", () => {
  assert.equal(rotaPermitida("petshop", "conta"), true);
  assert.equal(rotaPermitida("petshop", "privacidade"), true);
});

test("a navegacao usa o rotulo da categoria, nao um literal", () => {
  const barbearia = navegacaoDoSegmento("barbershop");
  const equipe = barbearia.find((item) => item.caminho === "equipe");
  assert.equal(equipe?.rotulo, "Barbeiros");

  const salao = navegacaoDoSegmento("beauty_salon");
  const equipeSalao = salao.find((item) => item.caminho === "equipe");
  assert.notEqual(equipeSalao?.rotulo, "Barbeiros");
});

test("a barbearia nao recebe item de menu automotivo", () => {
  const caminhos = navegacaoDoSegmento("barbershop").map((item) => item.caminho);
  assert.deepEqual(
    caminhos.filter((c) => ["patio", "boxes", "veiculos"].includes(c)),
    [],
  );
});

test("rotaDaEmpresa monta o endereco", () => {
  assert.equal(rotaDaEmpresa("barbearia-do-ze", "agenda"), "/e/barbearia-do-ze/agenda");
  assert.equal(rotaDaEmpresa("barbearia-do-ze"), "/e/barbearia-do-ze");
});

test("rotaInicialDaEmpresa junta as duas coisas", () => {
  assert.equal(rotaInicialDaEmpresa("estetica-x", "automotive_aesthetics"), "/e/estetica-x/patio");
  assert.equal(rotaInicialDaEmpresa("barbearia-do-ze", "barbershop"), "/e/barbearia-do-ze/agenda");
});

// O que sai daqui tem que ser sempre aceitavel na volta.
test("toda rota que o produto gera passa por destinoSeguro", () => {
  for (const tipo of ["barbershop", "automotive_aesthetics", "petshop"] as const) {
    const rota = rotaInicialDaEmpresa("empresa-teste", tipo);
    assert.equal(destinoSeguro(rota), rota, tipo);
  }
});
