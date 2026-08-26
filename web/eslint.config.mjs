import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A Etapa 3.9 reformatou os arquivos com o Prettier: a maior linha caiu de
      // 5.642 para 207 caracteres, e os avisos de 234 para 8. Com a dívida paga, a
      // regra vira erro — é ela que impede o retorno.
      //
      // Texto longo é ignorado de propósito: o que a regra protege é densidade de
      // CÓDIGO, não mensagem de interface, que não se quebra sem piorar a leitura.
      "max-len": [
        "error",
        {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
