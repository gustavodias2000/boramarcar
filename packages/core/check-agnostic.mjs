// Verifica que o núcleo continua agnóstico de framework (ADR 0005).
//
// Node puro, sem dependência: o ESLint vive em `web/` e trazê-lo para cá só por esta
// regra custaria mais do que resolve.
//
// Esta é a SEGUNDA camada. A primeira é o compilador: `tsconfig.json` deste pacote
// omite a lib "DOM", então `window`, `document`, `localStorage` e `fetch` do navegador
// já não compilam. O que falta é impedir o import de framework de interface, que o
// TypeScript aceitaria sem reclamar.
//
// Uso: node packages/core/check-agnostic.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "src");

const PROIBIDOS = [
  { padrao: /^react$|^react\//, motivo: "React pertence a web/" },
  { padrao: /^react-dom/, motivo: "React DOM pertence a web/" },
  { padrao: /^react-native/, motivo: "React Native pertence a app/" },
  { padrao: /^next$|^next\//, motivo: "Next.js pertence a web/" },
  { padrao: /^expo$|^expo-/, motivo: "Expo pertence a app/" },
];

// Cobre `import ... from "x"`, `export ... from "x"` e `import("x")`.
const ESPECIFICADOR = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return caminho.endsWith(".ts") || caminho.endsWith(".tsx") ? [caminho] : [];
  });
}

const violacoes = [];

for (const caminho of arquivos(raiz)) {
  const fonte = readFileSync(caminho, "utf8");
  for (const [, especificador] of fonte.matchAll(ESPECIFICADOR)) {
    const proibido = PROIBIDOS.find((item) => item.padrao.test(especificador));
    if (proibido) {
      violacoes.push({
        arquivo: relative(process.cwd(), caminho),
        especificador,
        motivo: proibido.motivo,
      });
    }
  }
}

if (violacoes.length > 0) {
  console.error("\nO núcleo compartilhado importou framework de interface:\n");
  for (const v of violacoes) {
    console.error(`  ${v.arquivo}\n    importa "${v.especificador}" — ${v.motivo}\n`);
  }
  console.error("O núcleo serve ao site E ao aplicativo. Ver docs/adr/0005.\n");
  process.exit(1);
}

console.log("nucleo agnostico: nenhum import de framework de interface");
