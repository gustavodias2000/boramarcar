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
  ROTAS_RESERVADAS,
  ROTA_PADRAO,
  enderecoReservado,
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
  ["segmento com caractere invalido", "/Loja_Maiuscula"],
  ["barra final vazia", "/loja//agenda"],
  ["travessia", "/loja/../../evil"],
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
  assert.equal(destinoSeguro("/barbearia-do-ze"), "/barbearia-do-ze");
});

test("aceita rota dentro da empresa", () => {
  assert.equal(
    destinoSeguro("/barbearia-do-ze/agenda"),
    "/barbearia-do-ze/agenda",
  );
});

test("preserva a query — e o dia que a pessoa estava olhando", () => {
  assert.equal(
    destinoSeguro("/salao-da-ana/agenda?dia=2026-08-26"),
    "/salao-da-ana/agenda?dia=2026-08-26",
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

test("a empresa vive na raiz, sem prefixo", () => {
  assert.equal(
    rotaDaEmpresa("barbearia-do-ze", "agenda"),
    "/barbearia-do-ze/agenda",
  );
});

test("aceita o valor ja codificado uma vez", () => {
  assert.equal(destinoSeguro("%2Finicio"), "/inicio");
});

// ---------------------------------------------------------------------------
// Rotas por categoria
// ---------------------------------------------------------------------------

test("toda categoria abre no Inicio, e nao numa tela de modulo", () => {
  assert.equal(
    rotaInicialDoSegmento("automotive_aesthetics"),
    "inicio-empresa",
  );
});

test("inclusive a barbearia", () => {
  assert.equal(rotaInicialDoSegmento("barbershop"), "inicio-empresa");
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
  const caminhos = navegacaoDoSegmento("barbershop").map(
    (item) => item.caminho,
  );
  assert.deepEqual(
    caminhos.filter((c) => ["patio", "boxes", "veiculos"].includes(c)),
    [],
  );
});

test("rotaDaEmpresa monta o endereco", () => {
  assert.equal(
    rotaDaEmpresa("barbearia-do-ze", "agenda"),
    "/barbearia-do-ze/agenda",
  );
  assert.equal(rotaDaEmpresa("barbearia-do-ze"), "/barbearia-do-ze");
});

test("rotaInicialDaEmpresa junta as duas coisas", () => {
  assert.equal(
    rotaInicialDaEmpresa("estetica-x", "automotive_aesthetics"),
    "/estetica-x/inicio-empresa",
  );
  assert.equal(
    rotaInicialDaEmpresa("barbearia-do-ze", "barbershop"),
    "/barbearia-do-ze/inicio-empresa",
  );
});

// O que sai daqui tem que ser sempre aceitavel na volta.
test("toda rota que o produto gera passa por destinoSeguro", () => {
  for (const tipo of [
    "barbershop",
    "automotive_aesthetics",
    "petshop",
  ] as const) {
    const rota = rotaInicialDaEmpresa("empresa-teste", tipo);
    assert.equal(destinoSeguro(rota), rota, tipo);
  }
});

// ---------------------------------------------------------------------------
// Palavras reservadas — o preco de por a empresa na raiz
// ---------------------------------------------------------------------------

test("toda rota de produto que existe hoje esta reservada", () => {
  for (const rota of [
    "entrar",
    "cadastro",
    "comecar",
    "inicio",
    "conta",
    "privacidade",
  ]) {
    assert.equal(enderecoReservado(rota), true, rota);
  }
});

test("as rotas de produto que provavelmente virao tambem estao", () => {
  for (const rota of [
    "precos",
    "planos",
    "ajuda",
    "suporte",
    "termos",
    "api",
    "admin",
  ]) {
    assert.equal(enderecoReservado(rota), true, rota);
  }
});

test("reservar nao e sensivel a caixa nem a espaco", () => {
  assert.equal(enderecoReservado("  ENTRAR "), true);
});

test("nome de empresa de verdade nao e reservado", () => {
  for (const nome of [
    "barbearia-do-ze",
    "salao-da-ana",
    "estetica-x",
    "pet-feliz",
  ]) {
    assert.equal(enderecoReservado(nome), false, nome);
  }
});

// Este numero existe para doer quando alguem acrescentar rota de produto e esquecer de
// reservar o nome. A lista do SQL (`set_business_slug`, `create_business_with_owner`)
// precisa casar com esta.
test("a lista tem o tamanho que o SQL espelha", () => {
  assert.equal(ROTAS_RESERVADAS.length, 55);
});
