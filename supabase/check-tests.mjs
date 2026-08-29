/**
 * Verificador estático da suíte pgTAP. Zero dependência, como o `check-agnostic.mjs`.
 *
 * POR QUE ELE EXISTE
 *
 * O primeiro CI encontrou oito falhas. Três delas eram armadilhas que não precisam de
 * banco para serem vistas — bastava alguém olhar — e as três me custaram um ciclo de
 * push inteiro cada. Um ciclo de CI leva minutos; este arquivo leva milissegundos.
 *
 * Ele NÃO substitui `supabase test db`. Não sabe se uma política está correta nem se uma
 * asserção prova o que diz. Pega só o que é decidível lendo o texto:
 *
 *   1. FIXTURE COM SESSÃO ATIVA. `tests.build_tenant` chama `tests.create_user`, que
 *      grava em `auth.users`. Ele é SECURITY INVOKER de propósito — dar privilégio
 *      próprio a ele abriria criação de usuário para quem executa. Então precisa da
 *      sessão original, e chamá-lo depois de um `act_as` mata o arquivo com
 *      "permission denied for table users". Foi o que derrubou `98_core_finance`.
 *
 *   2. CHAMADA DIRETA A FUNÇÃO REVOGADA. Uma função sem `grant execute ... to
 *      authenticated` não é alcançável pelo teste, que atua como `authenticated`.
 *      Chamá-la dá 42501 em vez do resultado esperado. Foi o que encontrei em
 *      `91_superficie_fechada` revisando o que nunca tinha executado.
 *
 *   3. `is_empty` DEPOIS DE `act_as_anon`. `anon` não tem grant nenhum desde a Etapa 1,
 *      então a consulta morre por privilégio antes de a RLS filtrar. Esperar lista vazia
 *      é esperar o mecanismo fraco. Derrubou três arquivos de uma vez.
 *
 * Cada regra aqui nasceu de um defeito real. Se uma delas nunca mais disparar, ótimo —
 * o custo dela é este arquivo.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const TESTES = join(AQUI, "tests");
const MIGRATIONS = join(AQUI, "migrations");

const achados = [];

function reportar(arquivo, linha, regra, mensagem) {
  achados.push({ arquivo, linha, regra, mensagem });
}

// ---------------------------------------------------------------------------
// Quais funções `authenticated` alcança
// ---------------------------------------------------------------------------
// Percorre as migrations em ordem de nome — que é a ordem de aplicação — e guarda o
// ÚLTIMO estado de privilégio de cada função. Revogar e depois conceder é comum, e só o
// estado final importa.

function funcoesAlcancaveis() {
  const estado = new Map();

  for (const nome of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    const texto = readFileSync(join(MIGRATIONS, nome), "utf8");

    // POR INSTRUÇÃO, não por linha. No SQL deste projeto `grant` e `revoke` quebram em
    // duas linhas com frequência — o nome da função numa, o `to authenticated` na
    // seguinte. Lendo linha a linha, a concessão passava despercebida e a função
    // aparecia como fechada: era a segunda leva de falso positivo deste verificador.
    //
    // Comentário some antes do corte, senão um `;` dentro de comentário parte a
    // instrução no lugar errado.
    const semComentario = texto
      .split("\n")
      .map((linha) => linha.replace(/--.*$/, ""))
      .join(" ");

    for (const bruta of semComentario.split(";")) {
      const instrucao = bruta.replace(/\s+/g, " ").trim().toLowerCase();
      if (!instrucao) continue;

      // A varredura em massa é aplicada NA POSIÇÃO dela. Em `harden_privileges` ela vem
      // ANTES das concessões individuais, e tratá-la por último apagava exatamente os
      // grants que ela deveria preceder — foi a primeira leva de falso positivo, com
      // `create_staff_appointment` entre eles.
      if (/revoke all on all functions in schema public/.test(instrucao)) {
        for (const chave of estado.keys()) estado.set(chave, false);
        continue;
      }

      if (!instrucao.includes("authenticated")) continue;

      const revoke = /revoke (?:all|execute).* on function public\.([a-z0-9_]+)/.exec(instrucao);
      if (revoke) estado.set(revoke[1], false);

      const grant = /grant execute on function public\.([a-z0-9_]+)/.exec(instrucao);
      if (grant) estado.set(grant[1], true);
    }

  }

  const fechadas = new Set();
  for (const [nome, aberta] of estado) if (!aberta) fechadas.add(nome);
  return fechadas;
}

// ---------------------------------------------------------------------------
// As três regras
// ---------------------------------------------------------------------------

const FECHADAS = funcoesAlcancaveis();

for (const nome of readdirSync(TESTES).filter((n) => n.endsWith(".sql")).sort()) {
  const linhas = readFileSync(join(TESTES, nome), "utf8").split("\n");

  let sessaoAtiva = false;
  let anonAtivo = false;

  linhas.forEach((linha, indice) => {
    const numero = indice + 1;
    const limpa = linha.trim();
    if (limpa.startsWith("--")) return;

    // Estado da sessão
    if (limpa.includes("tests.clear_auth")) {
      sessaoAtiva = false;
      anonAtivo = false;
    } else if (limpa.includes("tests.act_as_anon")) {
      sessaoAtiva = true;
      anonAtivo = true;
    } else if (limpa.includes("tests.act_as")) {
      sessaoAtiva = true;
      anonAtivo = false;
    }

    // 1. Fixture com sessão ativa
    if (sessaoAtiva && /tests\.(build_tenant|create_user)\s*\(/.test(limpa)) {
      reportar(
        nome,
        numero,
        "fixture-com-sessao",
        "chama a fixture com sessão ativa — `create_user` grava em auth.users e é " +
          "SECURITY INVOKER. Ponha `select tests.clear_auth();` antes.",
      );
    }

    // 2. Chamada direta a função revogada
    for (const chamada of limpa.matchAll(/public\.([a-z0-9_]+)\s*\(/g)) {
      const funcao = chamada[1];
      if (!FECHADAS.has(funcao)) continue;
      // `has_function_privilege` inspeciona sem executar — é o jeito certo de afirmar
      // que algo NÃO é alcançável, e não deve ser sinalizado.
      //
      // A janela de cinco linhas existe porque a asserção quebra em várias: a chamada
      // numa linha, o nome da função três abaixo. Olhar só a própria linha acusava
      // `00_privilege_snapshot` de fazer exatamente o que ele existe para fazer.
      const contexto = linhas.slice(Math.max(0, indice - 5), indice + 1).join(" ");
      if (contexto.includes("has_function_privilege")) continue;
      reportar(
        nome,
        numero,
        "funcao-inalcancavel",
        `chama public.${funcao}(), que não tem EXECUTE para \`authenticated\` — daria ` +
          "42501. Verifique pelo comportamento, ou por `has_function_privilege`.",
      );
    }

    // 3. Lista vazia esperada de `anon`
    if (anonAtivo && /^select\s+(is_empty|isnt_empty)\s*\(/.test(limpa)) {
      reportar(
        nome,
        numero,
        "anon-espera-vazio",
        "espera lista vazia de `anon`, que não tem grant nenhum: a consulta morre com " +
          "42501 antes da RLS. Use `throws_ok(..., '42501')`.",
      );
    }
  });
}

// ---------------------------------------------------------------------------

if (achados.length === 0) {
  console.log("suite pgTAP: nenhuma armadilha conhecida");
  process.exit(0);
}

console.error(`suite pgTAP: ${achados.length} achado(s)\n`);
for (const { arquivo, linha, regra, mensagem } of achados) {
  console.error(`  tests/${arquivo}:${linha}  [${regra}]`);
  console.error(`    ${mensagem}\n`);
}
process.exit(1);
