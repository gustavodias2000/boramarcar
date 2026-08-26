import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `@boramarca/core` é publicado como TypeScript, sem passo de build: o mesmo código
  // serve a este bundler e ao Metro do aplicativo. Compilar o pacote aqui evita manter
  // um `dist/` que os dois alvos teriam de consumir em sincronia.
  transpilePackages: ["@boramarca/core"],
};

export default nextConfig;
