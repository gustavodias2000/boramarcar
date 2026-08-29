# Design system — Bora Marcá

<!-- Registrado em 26/08/2026 a partir do que foi construído, não do que foi planejado. -->

Este documento descreve o sistema do **produto**, que serve as onze categorias. O tema do
módulo de Estética Automotiva — a "Prancheta de boxes" — vive em
[docs/design-modulo-automotivo.md](docs/design-modulo-automotivo.md) e continua válido lá
dentro.

Ele foi escrito **depois** da construção, a partir do código, e não antes dela. Um
rulebook escrito primeiro vira algo que se defende contra a realidade.

## Direção

**A convenção de SaaS, assumida em fidelidade total.** Escolha explícita do dono em
26/08/2026, feita contra três direções mais autorais. Não é ponto de partida a subverter:
é o compromisso. Sem ironia, sem excentricidade contrabandeada.

A régua de acabamento é **Nubank, Conta Azul e Asaas** — SaaS e fintech brasileiros para
público não-técnico. O que se herda deles é clareza acima de sofisticação, português
direto, celular primeiro e confiança como atributo visual. Nunca a interface deles.

**Celular primeiro, literalmente.** 65% do público-alvo acessa a internet exclusivamente
pelo celular; nas classes D e E são 87%. O que está fora de `@media` no CSS é o layout de
telefone; as telas maiores é que são a exceção declarada.

## Duas densidades, uma linguagem

A regra que evita o erro mais provável deste produto:

| Superfície | Densidade | Por quê |
| --- | --- | --- |
| Pública (landing, entrar) | **Cartão**, respiro, sombra | Quem decide precisa de hierarquia e ar |
| Operação (agenda, pátio, listas) | **Linha**, régua de 1px, densidade | Quarenta itens dentro de quarenta cartões viram parede |

Mesma paleta, mesma tipografia, mesmos componentes. Muda a densidade, não a linguagem.

## Fundação

Tokens em `:root` de `web/src/app/globals.css`, prefixados `--bm-`.

| Papel | Token | Valor |
| --- | --- | --- |
| Marca | `--bm-indigo` | `#4338ca` |
| Marca pressionada | `--bm-indigo-escuro` | `#362eaa` |
| Marca de fundo | `--bm-indigo-claro` | `#eef2ff` |
| Fundo | `--bm-fundo` | `#ffffff` |
| Fundo de seção | `--bm-fundo-suave` | `#f8fafc` |
| Texto | `--bm-tinta` | `#14203a` |
| Texto secundário | `--bm-tinta-media` | `#46536b` |
| Separador | `--bm-borda` | `#e2e8f0` |
| Borda de controle | `--bm-borda-forte` | `#7c8899` |
| Positivo | `--bm-verde` | `#05684a` |
| Recusa | `--bm-vermelho` | `#b3261e` |

**`--bm-borda` e `--bm-borda-forte` não são intercambiáveis.** A primeira é separação
visual; a segunda é borda de controle interativo, e existe separada porque o WCAG 1.4.11
exige 3:1 em componente de interface — um cinza que serve de régua não serve de borda de
campo.

**Tipografia:** Archivo variável, via `next/font/google`, hospedada localmente. Escolhida
por ter numerais tabulares de verdade — a agenda e o livro financeiro alinham coluna de
horário e de valor — e por ser de fundição latino-americana (Omnibus-Type). Título usa
`letter-spacing: -0.03em` a `-0.04em` e `text-wrap: balance`.

**Raio:** quatro valores. `--bm-r-sm` 8px (chip, campo pequeno), `--bm-r` 12px (campo,
botão de bloco), `--bm-r-lg` 16px (painel interno), `--bm-r-xl` 22px (cartão de seção).
Botão de ação usa `999px`.

**Elevação:** duas sombras, ambas com **deslocamento e desfoque**. Halo colorido de
deslocamento zero é enfeite e não entra.

```
--bm-sombra:      0 1px 2px rgb(20 32 58 / .06), 0 4px 12px rgb(20 32 58 / .07)
--bm-sombra-alta: 0 2px 4px rgb(20 32 58 / .06), 0 12px 28px rgb(20 32 58 / .1)
```

## O que varia por categoria — e o que nunca varia

**Varia:** os rótulos (`SegmentConfig.labels`), as telas habilitadas (`hasFeature`), a
rota inicial (`rotaInicialDoSegmento`), o catálogo semente e o texto do estado vazio.

**Nunca varia:** a topologia da tela, a escala tipográfica, o raio, a elevação, a rampa de
neutros, a gramática de teclado, a anatomia dos componentes, e a marca.

**A regra que torna isso verificável:** se uma categoria precisar de arquivo CSS próprio,
ela não precisa de tema — precisa de uma tela de módulo. Categoria ganha token, não CSS.

## Acessibilidade — especificação, não intenção

- **Foco:** anel de 2px em `--bm-indigo` com `outline-offset: 2px`, aplicado em toda
  âncora e todo botão da superfície pública. Nunca `outline: none` sem substituto.
- **Alvo de toque:** mínimo 46px de altura em botão e campo; 36px em chip de seleção
  múltipla, onde o alvo real inclui o espaçamento.
- **Contraste:** texto secundário `#46536b` sobre branco ≈ 7:1. Borda de controle
  `#7c8899` ≈ 3.4:1. Branco sobre índigo ≈ 9:1.
- **Movimento:** transições de 120–140ms com `ease-out`, e `prefers-reduced-motion`
  desliga todas.
- **Leitor de tela:** `aria-live="polite"` na região que o seletor de categoria reescreve;
  `role="radiogroup"` com `aria-checked` nas opções; `.sr-only` para rótulo invisível.

## Honestidade como regra de design

Herdada do projeto anterior e agora estrutural:

- **Dado fabricado carrega o rótulo "demonstração" no próprio elemento**, nunca em rodapé
  de página.
- **Ação que não existe não vira botão desabilitado com aviso** — sai da tela. Item de
  menu sem rota não é item de menu.
- **A superfície pública não afirma o que o repositório não prova.** Não há cliente,
  faturamento, depoimento, nota nem preço — e por isso nenhum aparece. A landing tem uma
  seção inteira dizendo o que ainda não existe.

## O que este documento ainda não cobre

O shell autenticado **não foi redesenhado**. Ele continua sendo `automotive-patio.tsx`,
com 880 linhas que são simultaneamente moldura, navegação, roteador de tela e o Pátio. Os
tokens `--bm-*` ainda não chegaram lá.

Enquanto isso não acontecer, o produto tem duas linguagens visuais convivendo: a pública,
descrita aqui, e a operacional, descrita no documento do módulo automotivo. É estado de
transição declarado, não incoerência despercebida.
