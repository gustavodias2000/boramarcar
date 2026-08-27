import type { Metadata } from "next";
import { Archivo } from "next/font/google";

import { MARCA } from "@/core/marca";

import "./globals.css";

/**
 * Archivo, da Omnibus-Type — fundição latino-americana. Escolhida por dois motivos
 * verificáveis, não por gosto: tem numerais tabulares de verdade, que a agenda e o
 * livro financeiro precisam para alinhar coluna, e é variável, então um arquivo cobre
 * do texto corrido ao título. `next/font` hospeda localmente e pré-carrega — com 65%
 * do público em celular na rede móvel, buscar fonte em terceiro seria custo puro.
 */
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--bm-fonte",
});

export const metadata: Metadata = {
  title: {
    default: `${MARCA.nome} — ${MARCA.descricao.toLowerCase()}`,
    template: `%s · ${MARCA.curto}`,
  },
  description:
    "Agenda, clientes, serviços, equipe e caixa para barbearia, salão, manicure, " +
    "estética automotiva e mais sete categorias. O sistema se adapta ao seu ramo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`h-full ${archivo.variable}`}>
      <body className="min-h-full flex flex-col">
        {/*
          O contrato de direção precisa sobreviver ao build para ser auditável, e
          comentário JSX não sobrevive: ele é comentário de JavaScript e some na
          compilação. Verifiquei — a primeira versão deste bloco só aparecia no source
          map. `dangerouslySetInnerHTML` num elemento oculto é o que emite comentário
          HTML de verdade no markup. Não há conteúdo de usuário aqui: é literal fixo.
        */}
        <div
          hidden
          dangerouslySetInnerHTML={{
            __html: `<!--
  THESIS: um so sistema para onze ramos, onde a categoria troca a palavra e as telas —
  nunca a estrutura. Recusa a landing de SaaS que fala "para todos os negocios" sem
  nomear nenhum, e recusa a vitrine de numeros que este produto nao tem.
  OWN-WORLD: convencao de SaaS assumida em fidelidade total, escolha do dono contra
  tres direcoes mais autorais. Indigo #4338CA como cor de marca sobre branco frio;
  cartao com sombra de deslocamento e desfoque; raio 12-22px; Archivo variavel; icones
  Lucide em traco unico. Densidade dupla: cartao na superficie publica, linha na
  operacao.
  STORY: dono de barbearia entende em dez segundos que o produto conhece o ramo dele,
  ve a pagina inteira mudar de vocabulario quando escolhe a categoria, e clica em
  Comecar agora.
  FIRST VIEWPORT: titulo em uma linha; ao lado, o seletor de categoria que reescreve os
  rotulos da propria pagina e o cartao de agenda com dado de demonstracao rotulado no
  proprio elemento. Acao primaria no topo e repetida sob o titulo.
  FORM: convencao da categoria — a saida padrao do Impeccable, tomada pelo dono. O
  sorteio de direcao (chave e79c5c24) caiu no indice 6, "Pauta"; o dono usou a porta
  permanente e escolheu a convencao. Regua: Nubank, Conta Azul, Asaas.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
  review, the verdict, and DESIGN.md
-->`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
