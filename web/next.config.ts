import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança.
 *
 * A revisão apontou que não havia nenhum. Nenhum é vulnerabilidade hoje — a aplicação
 * não carrega recurso de terceiro e a autoridade é RLS —, mas dois viram problema no
 * primeiro dia em que isso mudar.
 *
 * `Referrer-Policy` é o que mais importa, e é consequência direta de pôr o tenant na
 * URL: no dia em que entrar um pixel de medição ou uma fonte externa, o caminho completo
 * com o endereço da empresa sairia no `Referer` para terceiro. Os navegadores modernos
 * já usam `strict-origin-when-cross-origin` por padrão — declarar é o que garante, em vez
 * de esperar.
 *
 * `camera=(self)` fica liberado porque o técnico fotografa o veículo no pátio pelo
 * próprio produto; microfone e localização o produto não usa e não deve poder usar por
 * engano.
 *
 * NÃO HÁ `Content-Security-Policy` AQUI, e a ausência é deliberada. O Next injeta script
 * inline para hidratação e streaming, então um CSP sem `'unsafe-inline'` quebra a
 * aplicação, e um CSP COM `'unsafe-inline'` dá sensação de proteção sem proteger contra
 * o que o CSP existe para impedir. A forma correta é nonce por requisição, gerado no
 * `proxy.ts` — trabalho próprio, e que precisa ser verificado num navegador de verdade
 * antes de ir ao ar. Fica registrado como pendência em vez de enviado sem prova.
 */
const cabecalhos = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // `@boramarca/core` é publicado como TypeScript, sem passo de build: o mesmo código
  // serve a este bundler e ao Metro do aplicativo. Compilar o pacote aqui evita manter
  // um `dist/` que os dois alvos teriam de consumir em sincronia.
  transpilePackages: ["@boramarca/core"],

  async headers() {
    return [{ source: "/:path*", headers: cabecalhos }];
  },
};

export default nextConfig;
