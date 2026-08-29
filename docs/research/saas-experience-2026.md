# Pesquisa — Experiência SaaS 2026 para o Bora Marcá

**Data:** 26/08/2026
**Escopo:** landing pública (modo *Persuade*) e shell autenticado multiempresa (modo *Operate*).
**Motivo:** `PRODUCT.md` e `DESIGN.md` estão escopados a uma categoria só (`automotive_aesthetics`).
A direção vigente chama-se "Prancheta de boxes" e o próprio `DESIGN.md` se intitula
*"Design system — Bora Marcá **Automotive**"*. Isso é a raiz do problema visual: não são as rotas,
são as fontes de verdade.

> **Regra deste documento:** cada link vem com o que foi aprendido dele e o que virou decisão.
> Nenhum número comercial, cliente, preço ou depoimento foi inventado. Onde falta dado real,
> está escrito que falta.

---

## 1. Fontes consultadas

### 1.1 Acessibilidade — normativo (fonte primária)

| Fonte | O que resolve bem | O que trouxemos |
| --- | --- | --- |
| [W3C · WCAG 2.2 — Target Size (Minimum) 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Define o piso legal de alvo de toque com número, nível e exceções, sem achismo. | **24×24px CSS é o mínimo AA.** As cinco exceções (spacing, equivalent, inline, user agent, essential) estão documentadas — a exceção *spacing* (círculo de 24px sem sobreposição) é a que permite densidade em tabela sem violar a norma. Adotamos 24px como piso absoluto e **48px como alvo de projeto** no toque. |
| [W3C · WCAG 2.2 — Focus Appearance 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) | Diz exatamente o quanto o foco precisa aparecer: área ≥ perímetro de 2px e mudança de contraste ≥ 3:1 entre focado e não-focado. É AAA, mas é o único critério que dá número. | Adotamos o número AAA. Descobrimos por cálculo que **um anel de cor única não passa**: o anel escuro `#1B2430` sobre o sólido da marca `#2B4ACB` dá **2,19:1**. Daí o anel de duas partes (halo claro + anel escuro), especificado na seção 4.7. |

### 1.2 Realidade de dispositivo no Brasil — o dado que mais mudou o projeto

| Fonte | O que resolve bem | O que trouxemos |
| --- | --- | --- |
| [CETIC.br / NIC.br · TIC Domicílios 2025 (via MobileTime)](https://www.mobiletime.com.br/noticias/09/12/2025/tic-domicilios-2025/) | Mede *como* o brasileiro acessa, não só *se* acessa. | **65% da população acessa a internet exclusivamente pelo celular** (era 60% em 2024). Nas **classes D/E, 87% acessam só por celular.** 157 milhões de usuários (85% da população); 163 milhões contando quem usa apps sem se declarar usuário. |
| [IBGE · PNAD Contínua TIC 2025 — Agência de Notícias](https://agenciadenoticias.ibge.gov.br/agencia-noticias/2012-agencia-de-noticias/noticias/47410-internet-chega-a-95-de-domicilios-do-pais-em-2025) | Cobertura domiciliar oficial. | Internet em **95,0% dos domicílios** (76,0 milhões). Rede móvel funcional em 92,9% dos domicílios. *(A página bloqueia leitura automatizada — HTTP 403; os números foram confirmados por [CNN Brasil](https://www.cnnbrasil.com.br/tecnologia/internet-chega-a-95-de-domicilios-do-brasil-em-2025-diz-ibge/) e [Telesíntese](https://telesintese.com.br/internet-alcanca-95-dos-domicilios-no-brasil/).)* |

**Por que isso é decisivo.** O público do Bora Marcá é dono de barbearia de bairro, manicure
autônoma, petshop, tatuador — perfil concentrado justamente nas classes onde o acesso é
majoritariamente móvel e exclusivo. O shell atual é uma grade de três colunas (`228px |
1fr | 366px`) pensada para 1220px+, com o celular tratado como degradação. **Isso está
invertido em relação ao público real.** Não é preferência estética: é o dado.

### 1.3 Aplicações complexas e densidade (fonte primária de pesquisa)

| Fonte | O que resolve bem | O que trouxemos |
| --- | --- | --- |
| [NN/g · 8 Design Guidelines for Complex Applications](https://www.nngroup.com/articles/complex-application-design/) | Traduz "app complexo" em oito regras verificáveis, não em adjetivos. | Três viraram critério de aceite: **(3) caminhos flexíveis** — nada de fluxo linear sem saída; **(6) reduzir desordem sem reduzir capacidade**; **(7) facilitar a transição entre informação primária e secundária** — que é exatamente o painel de OS abrindo sem trocar de página, e a única coisa que a direção atual já acerta. |
| [NN/g · Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Dá o critério de corte entre primeiro e segundo nível, e um limite duro. | **Nunca passar de dois níveis de revelação.** O que é frequente fica visível; o raro vai para o segundo nível com rótulo que preserva o "cheiro" da informação. Aplicado ao painel lateral e ao menu por categoria. |

### 1.4 Multiempresa e organização ativa

| Fonte | O que resolve bem | O que trouxemos |
| --- | --- | --- |
| [WorkOS · Model your B2B SaaS with organizations](https://workos.com/blog/model-your-b2b-saas-with-organizations) | Nomeia os três estados de pertencimento e o que fazer em cada um. | **"Um usuário pode ser membro de zero, uma ou muitas organizações."** Daí o roteamento de login em três ramos (seção 5.2). Também confirma que "Organization Switcher" é padrão esperado, e que trocar de organização é operação de sessão — não um novo login. |
| [Auth0 · Multiple Organization Architecture](https://auth0.com/docs/get-started/architecture-scenarios/multiple-organization-architecture) | Separa "usuários isolados por organização" de "usuários compartilhados entre organizações". | O Bora Marcá é o segundo caso: o mesmo dono pode ter duas unidades, e um profissional pode atender em duas empresas. *Observação honesta: a página não detalha a mecânica de seleção no login nem o desenho da UI — usamos o WorkOS para isso.* |

**Achado crítico do código.** `web/src/core/tenant/index.tsx` faz a consulta de vínculo com
`.order("created_at").limit(1).maybeSingle()` — ou seja, **pega a primeira empresa e ignora
as demais**. O produto se anuncia multiempresa e hoje não permite trocar de empresa. Não é
um detalhe visual; é uma promessa não cumprida.

### 1.5 Arquitetura de tokens e tema por segmento

| Fonte | O que resolve bem | O que trouxemos |
| --- | --- | --- |
| [Radix Colors · Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) | Escala de 12 passos com **papel definido por passo**, não por "claro/escuro". | Adotamos os papéis: **1–2** fundo, **3–5** fundo de componente (normal/hover/pressed), **6–8** bordas (6 não-interativa, 7 interativa, **8 anel de foco**), **9** sólido puro, **10** hover do sólido, **11–12** texto. Isso resolve o tema por categoria: **muda-se o passo 9 e o 11; o resto da escala é neutro e não muda.** |
| [Panda CSS · Building a Multi-Brand Design System](https://panda-css.com/blog/building-a-multi-brand-design-system-with-panda-css) e [Always Twisted · Multi-brand theming with Style Dictionary](https://www.alwaystwisted.com/articles/a-design-tokens-workflow-part-9) | Explicam a hierarquia de três camadas e quando ela é justificada. | **primitivo → semântico → componente.** Regra adotada: só se cria token de componente quando o multi-marca realmente exige. As 11 categorias mexem **apenas na camada semântica** (`--seg-*`), nunca nos primitivos. É isso que permite 11 categorias sem duplicar tela. |

### 1.6 Concorrência brasileira real (produto real, verificado na fonte)

| Fonte | O que resolve bem | O que trouxemos |
| --- | --- | --- |
| [Trinks — home pública](https://www.trinks.com/) | Marketplace de consumidor: *"Encontre e agende serviços de beleza e bem-estar."* | **A home do maior player brasileiro do setor vende para o consumidor final, não para o dono do negócio.** O SaaS B2B foi empurrado para subdomínio. |
| [Trinks — landing B2B (`negocios.trinks.com`)](https://negocios.trinks.com/) | A landing B2B de verdade: headline *"quem quer subir de nível conta com a Trinks"*, CTA único **"TESTE GRÁTIS"** (5 dias), preço ausente da landing. | O achado mais útil de toda a pesquisa: **a página trata cada segmento em bloco próprio** — Salões, Barbearias, Clínicas de Estética, Studios, Redes e Franquias — cada um com recurso específico (salão ganha comissão; barbearia ganha clube de assinatura; clínica ganha ficha de anamnese). Prova de mercado de que **a categoria precisa aparecer na landing**, e que o dono não se reconhece num pitch genérico. |

> **Nota de honestidade:** a Trinks exibe números próprios ("+13 anos", "+44 mil", "+460 mi").
> São dela e estão citados aqui apenas como leitura de concorrência.
> **O Bora Marcá não tem cliente, métrica, preço nem depoimento — e nada disso pode ser
> fabricado na landing.** Ver seção 6.

### 1.7 Descartado deliberadamente

A primeira busca ("SaaS B2B landing page best practices 2026") devolveu quase só conteúdo
de SEO — `genesysgrowth`, `saashero`, `flowtrix`, `pages.report` — com números de conversão
sem metodologia ("IA aumenta conversão em ~40%", "páginas de alta performance convertem
15–20%"). **Nada disso foi usado.** Não há fonte, amostra ou método por trás.
Registrado aqui só para deixar claro que foi visto e recusado.

---

## 2. Conclusões da pesquisa

1. **O problema não é a paleta, é o escopo das fontes.** Enquanto `PRODUCT.md` disser
   *"the initial surface is an operational dashboard for automotive_aesthetics"* e `DESIGN.md`
   se chamar *"Bora Marcá Automotive"*, qualquer redesenho volta ao pátio.
2. **A landing precisa vender para o dono e mostrar a categoria dele.** É o padrão que o
   concorrente líder já validou, e é o único jeito de 11 categorias não virarem um pitch vago.
3. **Celular não é breakpoint secundário; é o cenário majoritário.** 65% de acesso exclusivo
   por celular, 87% nas classes D/E.
4. **Multiempresa exige trocador de empresa e roteamento de login em três ramos.** Hoje o
   código pega `limit(1)` e nunca mais oferece escolha.
5. **A camada semântica de tokens é o que carrega as 11 categorias.** Muda `--seg-*`;
   estrutura, ritmo, tipografia e componentes não mudam.
6. **Cor nunca pode ser o único portador da categoria nem do estado** — acompanha sempre
   rótulo e ícone (WCAG 1.4.1).

---

## 3. Diagnóstico do código atual (evidência medida)

Medido em `web/src/app/globals.css` (4.293 linhas) e `web/src/components/` (7.111 linhas).

| Medida | Valor | Leitura |
| --- | --- | --- |
| Tokens declarados em `:root` | **13** | A intenção de sistema existe. |
| Cores hex únicas no CSS | **366** | O sistema não é obedecido. |
| Ocorrências de hex vs. `var(--…)` | **515 vs. 120** | ~19% das decisões de cor passam pelo token. |
| Tamanhos de fonte distintos | **26** (inclui 11.5px, 12.5px, 13.5px) | Não há escala tipográfica. |
| Raios distintos | **10** (3,4,6,7,8,9,10,11,12,999) | Praticamente todo inteiro entre 3 e 12. |
| `prefers-color-scheme` | **0** | Nenhum tema escuro. |
| `focus-visible` | **5 regras** para ~250 classes | Foco visível é exceção, não regra. |
| Breakpoints | 8 valores (1220, 1040, 1020, 980, 760, 680…) | Sem sistema; cada componente inventou o seu. |

**Estrutural, e pior que a folha de estilo:**

- `web/src/app/page.tsx` é `redirect("/patio")`. **Não existe landing.**
- Todas as sete rotas renderizam `<AutomotivePatio view="…" />`. O shell inteiro — `app-shell`,
  `navigation`, `brand-mark`, `topbar` — vive dentro de um componente de 880 linhas chamado
  *automotive*. **O núcleo mora dentro do módulo.**
- `@import "tailwindcss"` está na linha 1 do `globals.css` e o Tailwind é dependência real,
  mas o código é CSS escrito à mão. Paga-se o custo sem usar o benefício.
- Os rótulos da navegação ("Pátio", "OS", "Veículos", "Boxes") são literais no array `navigation`.
  São corretamente ocultados por `hasFeature`, mas **não são traduzidos por categoria**.
- No topo, o título da página cai em `segment.config.label` — uma barbearia leria "Barbearia"
  como nome da tela.

### O que está BOM e deve sobreviver

Isto não é um projeto malfeito. Várias decisões estão acima da média e seria erro jogá-las fora:

1. **`packages/core/src/segments/index.ts` é a peça mais bem resolvida do repositório.**
   Catálogo declarativo de 11 categorias, `FEATURE_KEYS`, `hasFeature`, labels por segmento,
   e a regra explícita *"nenhuma tela consulta `businessType` diretamente"*. O `tsconfig` do
   pacote não inclui a lib DOM — o agnosticismo é **verificado pelo compilador**. Isso é a
   fundação certa; a direção nova se pendura nela.
2. **Feature-gating de navegação já funciona de verdade.** `visibleNavigation` filtra por
   feature e há guarda de rota (`viewAllowed`) para quem digitar `/patio` numa barbearia.
3. **A separação `TenantProvider` / `SegmentProvider` acima das rotas** — e o comentário que
   explica por que saiu de dentro do componente do Pátio — está correta.
4. **O princípio "livro de movimentação, não cartões decorativos"** do `DESIGN.md`. É a melhor
   frase dos dois documentos e a direção nova a **generaliza para o produto inteiro** em vez
   de descartá-la.
5. **Honestidade de estado.** Os três modos (`unconfigured` / `demonstration` / `live`), o aviso
   de prévia demonstrativa e os botões que dizem que o fluxo ainda não existe, em vez de fingir
   gravação. Isso é raro e deve virar regra do sistema.
6. **A intenção multi-categoria já está escrita nos comentários do código** ("numa barbearia,
   Pátio, OS e Veículos somem sozinhos — sem `if (businessType === ...)` em lugar nenhum").
   O problema é que a **camada visual** nunca recebeu esse recado.

---

## 4. Decisões adotadas para o Bora Marcá

> **EMENDA — 26/08/2026. A direção desta seção NÃO foi a adotada.**
>
> O sorteio abaixo e a direção "Pauta" foram uma **proposta**. O Impeccable prevê que a
> escolha final passe por uma rodada de entrevista e uma página de decisão no navegador —
> nenhuma das duas alcançável de dentro de um subagente, e por isso as alternativas foram
> levadas ao dono.
>
> **O dono escolheu a saída convencional de SaaS**: índigo, cartões com sombra suave, raio
> generoso, captura de tela rotulada como demonstração na landing. Essa é a direção
> comprometida, e ela vale contra tudo o que esta seção propõe.
>
> O que sobrevive de "Pauta", porque não é estética e sim medida: a escala de contraste
> conferida por cálculo (§4.2), os 8 degraus de tipografia contra os 26 atuais, `--pauta: 48px`
> como alvo de toque, o anel de foco em duas partes, e a regra de densidade — cartão na
> landing, linha na operação, porque 40 linhas de pátio dentro de 40 cartões viram parede.
>
> As seções 1, 2, 3, 5, 6, 7 e 9 não são afetadas: são pesquisa, medição e restrição.


> **Método.** A escolha da direção passou pelo sorteio de direção do Impeccable
> (`concept-seed --scope direction --mode persuade`, chave `e79c5c24`, índice sorteado **6**),
> que existe justamente para impedir que a direção caia no default da categoria.
> A lista própria de sete mundos candidatos, ordenada por ressonância, foi:
> 1 letreiro pintado à mão · 2 quadro de chaves/etiquetas · 3 painel de senhas ·
> 4 comanda de papel · 5 mapa de linhas de transporte · **6 caderno pautado / livro-caixa** ·
> 7 azulejo. O sorteio caiu no **6**.

### 4.1 Direção: **Pauta** (caderno pautado / livro-caixa de balcão)

**Princípio:** *a linha pautada é a unidade do produto.* Um agendamento, uma comanda, um
lançamento e um cliente são todos **uma linha num livro de balcão** — e o livro é o mesmo em
qualquer ramo; só muda a caligrafia da margem.

Por que resiste: a pauta **é** uma tabela. O ritmo da régua vira escala de espaçamento; a
linha de margem vira o acento da categoria; a numeração de linha vira número de OS/comanda;
as colunas débito/crédito viram o livro financeiro que o `DESIGN.md` já pedia. A direção não
é decorativa — ela é a forma dos dados.

**Riscos declarados, e a regra que os desarma:**

- *Risco de virar "app de caderninho".* **Proibido:** textura de papel, espiral, fonte
  manuscrita, sombra de folha, bege/creme. A referência é **impressão de formulário e talão
  brasileiro** — régua de precisão —, não papelaria fofa.
- *Risco do fundo creme.* Explicitamente recusado. O fundo é **branco frio azulado**
  (`#F7F8FA`), a cor do papel contábil sob luz de loja, não de pergaminho.
- *Risco de leitura literal do nome.* "Bora Marcá" → agenda de papel é a leitura óbvia do
  nome. Ela ocupou **um** dos sete candidatos e ganhou por sorteio, não por conforto; por isso
  a renderização precisa trabalhar mais, e é o que as duas regras acima cobram.

**Material saturado do mundo (o que substitui o creme):** as **vias de carbono** do talão
brasileiro — via branca, rosa, verde, amarela, azul — e as tintas de balcão: **esferográfica
azul-violeta**, **vermelho de margem/correção**, **roxo de carbono**. É daqui que sai a paleta.

**Estratégia de cor:** *Restrained* no app (neutros + um acento de categoria) e *Committed*
na landing (a cor da via ocupa campos inteiros). Mesmos tokens, amplitudes diferentes.

**Claro ou escuro:** a cena física decide. Balcão de loja brasileira, luz de janela ou LED
forte, celular a um braço de distância, às vezes no portão do pátio sob sol. **Claro por
padrão.** Escuro é tema obrigatório de segunda ordem (tatuagem e turno da noite existem) —
não é default, e hoje não existe nenhum.

### 4.2 Paleta — todos os valores conferidos por cálculo

Neutros (frios, papel contábil):

| Token | Valor | Papel (Radix) |
| --- | --- | --- |
| `--n-0` | `#FFFFFF` | campo de entrada, "via branca" |
| `--n-1` | `#F7F8FA` | fundo do app |
| `--n-2` | `#EFF1F4` | superfície sutil / zebra da pauta |
| `--n-3` | `#E4E7EC` | fundo de componente hover |
| `--n-4` | `#D3D8E0` | régua não-interativa (decorativa) |
| `--n-5` | `#B9C0CB` | régua forte (decorativa) |
| `--n-6` | `#818B9A` | **borda de componente interativo — 3,24:1 ✓** |
| `--n-7` | `#5B6675` | texto secundário — 5,49:1 ✓ |
| `--n-9` | `#1B2430` | tinta / texto primário — 14,73:1 ✓ |
| `--n-10` | `#10161F` | títulos — 17,09:1 ✓ |

> `--n-4` e `--n-5` **não atingem 3:1** (1,35 e 1,72). São réguas decorativas.
> Toda borda que delimita controle usa `--n-6` ou mais escuro. Essa distinção é obrigatória
> (WCAG 1.4.11) e é exatamente o tipo de erro que o CSS atual comete sem perceber.

Marca e semânticos (contraste sobre `--n-1`; e branco sobre o sólido):

| Token | Valor | Sobre `--n-1` | Branco sobre ele |
| --- | --- | --- | --- |
| `--brand-9` (esferográfica) | `#2B4ACB` | 6,71:1 ✓ | 7,13:1 ✓ |
| `--danger-9` (margem/correção) | `#C0362C` | 5,19:1 ✓ | 5,52:1 ✓ |
| `--success-9` (via verde) | `#17795E` | 5,02:1 ✓ | 5,34:1 ✓ |
| `--warning-11` (tinta sobre via amarela) | `#7A4E00` | 6,77:1 ✓ | — |
| `--info-9` (carbono violeta) | `#6E4AAE` | 6,07:1 ✓ | 6,45:1 ✓ |

> Amarelo nunca recebe texto branco. A via amarela é **preenchimento** com tinta
> `--warning-11` por cima.

### 4.3 As 11 categorias — um acento cada, todos verificados

`--seg-ink` (texto e ícone, sobre `--n-1`) e `--seg-solid` (preenchimento, com branco por cima):

| Categoria | `--seg-ink` | sobre `--n-1` | branco sobre |
| --- | --- | --- | --- |
| barbershop | `#1F5F8B` | 6,44 ✓ | 6,84 ✓ |
| automotive_aesthetics | `#0E6E52` | 5,86 ✓ | 6,23 ✓ |
| beauty_salon | `#A32F5B` | 6,34 ✓ | 6,74 ✓ |
| manicure | `#8E3A78` | 6,53 ✓ | 6,94 ✓ |
| makeup | `#B03A3A` | 5,63 ✓ | 5,98 ✓ |
| massage | `#3F6B4A` | 5,79 ✓ | 6,15 ✓ |
| tattoo | `#3B3B47` | 10,39 ✓ | 11,04 ✓ |
| eyebrows | `#7A4A22` | 6,98 ✓ | 7,42 ✓ |
| aesthetics | `#6A4595` | 6,82 ✓ | 7,25 ✓ |
| depilation | `#1A6675` | 6,17 ✓ | 6,56 ✓ |
| petshop | `#A0550F` | 5,20 ✓ | 5,52 ✓ |

`automotive_aesthetics` mantém o verde herdado (`#0a6a4e` → `#0E6E52`) — continuidade
deliberada para quem já usa.

**Tema escuro** (superfície `#171E29`), versões claras — todas ≥ 7,5:1:
barbershop `#7FB6DE` · automotive `#5FC8A5` · beauty_salon `#EE93B4` · manicure `#DF9AD0` ·
makeup `#F09A9A` · massage `#93C9A2` · tattoo `#B8BECB` · eyebrows `#D4A87C` ·
aesthetics `#BFA3EE` · depilation `#7FC3D2` · petshop `#E5A768`.
Texto primário `#E8ECF2` (14,12:1), secundário `#A6B0BF` (7,64:1).

### 4.4 Tipografia

- **UI e texto:** **Archivo** (variável, com eixo de largura). Escolhida por três motivos
  concretos: numerais tabulares reais (horário, valor, placa, número de OS precisam alinhar);
  altura-x alta, que segura 15px em Android barato; e é da **Omnibus-Type, fundição
  latino-americana** — o mundo cultural é de verdade, não decorativo. A largura estreita
  (`Archivo Narrow`/eixo condensado) serve colunas densas e o display da landing: é a própria
  lógica do formulário impresso, cabeçalho largo e coluna estreita.
- **Códigos:** **Fragment Mono**, só para placa, número de OS, protocolo — o que no talão
  seria matricial. Nunca para texto corrido.
- **Deliberadamente não usadas:** Inter como display, IBM Plex, Space Grotesk/Mono, DM Sans,
  Plus Jakarta, Outfit — são os defaults de treino e não trazem nada do mundo do produto.
- **Orçamento de performance (obrigatório, por causa do 65% móvel):** no máximo **2 famílias
  variáveis**, subset `latin` + `latin-ext`, `font-display: swap`, `preload` só na face de UI,
  e pilha de sistema métrica-compatível como fallback. Fonte não pode atrasar o primeiro
  texto no balcão.

Escala — **8 degraus, e só eles** (contra os 26 de hoje):

| Token | px | Uso |
| --- | --- | --- |
| `--text-2xs` | 11 | legenda de campo, caixa alta, tracking +0.06em. Nunca texto corrido |
| `--text-xs` | 13 | célula densa, metadado |
| `--text-sm` | 14 | apoio |
| `--text-base` | 15 | corpo e UI padrão |
| `--text-md` | 18 | título de seção |
| `--text-lg` | 24 | título de página |
| `--text-xl` | 32 | subtítulo da landing, numeral grande |
| `--text-display` | `clamp(2.5rem, 6vw, 4rem)` | display da landing |

### 4.5 Espaçamento — a régua da pauta

A direção resolve o espaçamento em vez de inventá-lo. Base **4px**;
escala `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.

- **`--pauta: 48px`** — altura da linha pautada, e altura de linha de tabela, e altura mínima
  de alvo de toque. **Um número serve aos três**, e 48px passa folgado nos 24px do WCAG 2.2.
- `--pauta-half: 24px` — meia-linha, para linhas de metadado.
- Regra de ritmo: mais espaço **acima** de um título do que abaixo dele.

Breakpoints — **4, e só eles** (contra os 8 atuais): `480` (celular grande) ·
`768` (tablet retrato) · `1024` (tablet paisagem / notebook) · `1360` (mesa larga).

### 4.6 Raio e elevação

Raio — 4 valores: `--radius-none: 0` (linhas e regiões pautadas — o formulário impresso é
quadrado) · `--radius-sm: 4px` (campo, botão, célula) · `--radius-md: 8px` (painel, gaveta) ·
`--radius-full: 999px` (pílula de estado, avatar, "carimbo").

Elevação — **a separação padrão é a régua de 1px, não a sombra.** Sombra só para o que
realmente flutua:

- `--elev-0`: nenhuma. Padrão. Separação por `border-bottom: 1px solid var(--n-4)`.
- `--elev-1`: `0 1px 2px rgb(16 22 31 / .06), 0 0 0 1px rgb(16 22 31 / .06)` — cabeçalho fixo.
- `--elev-2`: `0 8px 24px -8px rgb(16 22 31 / .18)` — popover, trocador de empresa, ⌘K.
- `--elev-3`: `0 24px 48px -16px rgb(16 22 31 / .28)` — modal, sheet de celular.

Isso implementa literalmente o "sem cartão decorativo" que o dono pediu.

### 4.7 Foco visível — a especificação, não a promessa

O cálculo mostrou que **anel de cor única não serve**: `#1B2430` sobre o sólido da marca
`#2B4ACB` dá 2,19:1, abaixo dos 3:1 exigidos. Portanto, anel de duas partes:

```
:focus-visible {
  outline: 2px solid var(--focus-ring);   /* #1B2430 no claro, #E8ECF2 no escuro */
  outline-offset: 2px;
  box-shadow: 0 0 0 2px var(--focus-halo); /* #FFFFFF no claro, #10161F no escuro */
}
```

O halo garante os 3:1 contra qualquer fundo, inclusive sólidos coloridos
(branco sobre `--brand-9` = 7,13:1 ✓). Vale para **todo** elemento focável — não para 5 seletores.
Somam-se: `scroll-margin-top: calc(var(--pauta) * 2)` em linhas focáveis, para o cabeçalho
fixo nunca cobrir o foco (WCAG 2.2 · 2.4.11 *Focus Not Obscured*).

---

## 5. Arquitetura de informação

### 5.1 Landing (*Persuade*) — vende para o dono, e mostra o ramo dele

1. **Cabeçalho da pauta** — marca, "Entrar", CTA primário único.
2. **Primeiro viewport** — a régua com a proposta na linha de base e, ao lado, **um dia real
   de operação renderizado como livro pautado** (dados sintéticos, rotulados como demonstração).
   A tese, não um cabeçalho.
3. **"Qual é o seu ramo?"** — as 11 categorias como **controle de verdade**: escolher rewrite
   os rótulos da própria página (Técnico ↔ Barbeiro ↔ Tatuador; Veículo ↔ Pet ↔ —) e troca
   `--seg-*`. É a prova que nenhum concorrente copia por screenshot, e é literalmente o
   `SEGMENT_CONFIGS` do repositório virando argumento de venda. Confirmado pela leitura da
   `negocios.trinks.com`: o dono não se reconhece em pitch genérico.
4. **O mecanismo** — a recusa de agenda dupla, demonstrada. Um recurso não pode ser prometido
   duas vezes; mostra-se acontecendo, não se afirma.
5. **O livro** — dinheiro como livro de movimentação que aponta para as próprias OS.
6. **Como começa** — três passos **verdadeiros**, conforme `business-onboarding.tsx`:
   criar conta → escolher a categoria → catálogo de serviços já cadastrado com duração típica
   e preço zerado.
7. **Segurança e LGPD** — real e verificável no repositório (RLS, `tenant_id`, Storage privado,
   retenção). Não é enfeite: é diferencial checável.
8. **Preço** — **espaço reservado, marcado como pendente.** Ver seção 6.
9. Rodapé.

### 5.2 Shell autenticado (*Operate*)

**Roteamento de login, três ramos** (WorkOS):

| Vínculos | Destino |
| --- | --- |
| 0 | `/comecar` — abrir empresa (a tela já existe e funciona) |
| 1 | direto para a primeira rota permitida pela categoria |
| 2+ | seletor de empresa; depois, última empresa usada, com o trocador sempre no cabeçalho |

Isso substitui o `.limit(1)` atual, que hoje escolhe pelo usuário e nunca mais pergunta.

**Estrutura (o núcleo é dono da tela; o módulo é dono do conteúdo):**

- **Cabeçalho do livro** — trocador de **empresa ativa** (nome + categoria + acento),
  unidade, data, busca/⌘K, usuário. O acento da categoria vive aqui e na margem, e em
  nenhum outro lugar.
- **Navegação lateral** — filtrada por `hasFeature`, **rótulos vindos do segmento**, não literais.
- **Área pautada** — a lista/tabela/agenda. Uma linha = um registro.
- **Painel de detalhe** — abre sem trocar de página (NN/g #7), gaveta abaixo de 1024px.
- **Celular** — barra inferior de no máximo 5 destinos e detalhe em *sheet*. **Este é o layout
  primário do projeto**, não o degradado: 65% de acesso exclusivo por celular.

**Limite duro:** no máximo dois níveis de revelação (NN/g). Nada de gaveta dentro de gaveta.

### 5.3 O que muda por categoria, e o que nunca muda

| Muda | Nunca muda |
| --- | --- |
| Rótulos (`SegmentConfig.labels`) | Topologia e layout da tela |
| Acento (`--seg-ink` / `--seg-solid`) | Pauta, espaçamento, breakpoints |
| Ícone da categoria | Escala tipográfica, raio, elevação |
| Itens de menu existentes (`hasFeature`) | Rampa neutra e semânticos (perigo/sucesso/atenção/info) |
| Catálogo de serviços sugerido | Gramática de interação, teclado, foco |
| Texto do estado vazio | Conjunto de componentes |

**Regra:** *uma tela que serve mais de uma categoria é componente do núcleo.* O tema pertence
à categoria; a estrutura pertence ao núcleo.

**Extensão necessária em `SegmentConfig`** (hoje o catálogo tem rótulos, mas não tem acento,
ícone, nem os substantivos da operação — e é por isso que "Pátio", "OS", "Boxes" ainda são
literais no array de navegação):

```ts
accent: { ink: string; solid: string; inkDark: string };
icon: IconName;
labels: {
  // já existem: customer, professional, appointment (+ plurais), vehicle
  job / jobPlural;        // OS ↔ Comanda ↔ Ficha
  space / spacePlural;    // Box ↔ Cadeira ↔ Sala ↔ Baia
  intake;                 // Entrada ↔ Check-in ↔ Recepção
  handover;               // Entrega ↔ Retirada ↔ Finalização
  board;                  // Pátio ↔ Fila ↔ Salão
}
```

O glossário do `CONTEXT.md` fica **preservado**: dentro do Automotivo, `job` continua
renderizando "OS", `board` continua "Pátio", `intake` continua "Entrada". O que muda é que a
palavra passa a ser **consultada**, não escrita na tela.

---

## 6. Restrições honestas — o que não pode ser inventado

Não existe cliente real. Portanto, **na landing são proibidos**: logotipos de clientes,
depoimentos, números de uso, avaliações, estudos de caso, prêmios e comparativos.

**Lista de substituição para o dono** (espaços marcados, entregues vazios e rotulados):

1. **Preço e planos** — não definidos. A landing reserva a seção e a marca como pendente.
2. **Duração do teste gratuito** — não definida.
3. **Logotipo / marca gráfica** — hoje só existe o texto "bora **marcá**".
4. **Fotografia real de operação** — não há. Enquanto não houver, a landing usa a própria
   interface como prova, o que é mais forte e é verdade.
5. **Depoimentos** — só depois que existirem clientes reais.

Os dados de demonstração da interface **podem e devem** ser autorados em fidelidade total —
são material de design —, desde que rotulados como demonstração, exatamente como o produto
já faz hoje com o modo "prévia demonstrativa".

---

## 7. Estados obrigatórios nesta direção

| Estado | Como aparece em **Pauta** |
| --- | --- |
| **Carregando** | As réguas desenham primeiro; o conteúdo preenche. O esqueleto é a linha vazia **na altura final de 48px** — zero deslocamento de layout. Não há *shimmer* de bolha. |
| **Vazio (novo)** | A folha pautada visível, uma frase dizendo o que se escreve ali, e a ação primária. Texto vindo do segmento: "Nenhum agendamento hoje" ≠ "Nenhum veículo no pátio". |
| **Vazio (por filtro)** | Distinto do anterior: diz qual filtro está ativo e oferece limpá-lo. Nunca a mesma tela. |
| **Erro** | Margem da linha afetada em `--danger-9`, mais ícone e **texto explicando o que fazer**. Cor jamais sozinha (WCAG 1.4.1). |
| **Sem permissão** | Não é erro. Diz qual papel é necessário e para quem pedir. |
| **Sem vínculo** | Já resolvido bem hoje: leva para `/comecar` em vez de mostrar tela de erro. Preservar. |
| **Prévia / sem configuração** | Preservar a honestidade atual: identificar como demonstração e não simular gravação. |
| **Foco** | Anel de duas partes da seção 4.7, em 100% dos focáveis, com `scroll-margin-top`. |
| **Movimento** | `prefers-reduced-motion: reduce` desliga transições e mantém a mudança de estado. Já existe uma regra no CSS atual — deve virar regra do sistema. |

---

## 8. Alternativas consideradas e recusadas

O sorteio distribuiu seis mundos de catálogo como desafiantes. Os três mais fortes, com o
veredicto honesto em dois eixos (identificação do público · clareza do produto):

- **Neubrutalista de grade disciplinada** — *o desafiante mais forte.* Bordas pretas e cor
  sólida chapada são acessíveis por construção (alto contraste, limite de alvo inequívoco) e
  parecem letreiro de comércio de bairro. **Perde por densidade:** num pátio de 40 linhas, a
  borda pesada e a sombra deslocada viram ruído e comem altura vertical. Mantivemos a lição:
  alvos generosos e limites inequívocos.
- **Ponte de VU-meters** — fundir com capacidade funciona bem demais: cada profissional é um
  canal, a fileira mostra a carga da sala, e "passar do zero é o único vermelho" **é** a regra
  de não prometer o mesmo recurso duas vezes. **Perde em identificação:** uma manicure não
  mora num estúdio de gravação. Guardado como referência para o componente de agenda.
- **Ikeda / datamatics** — disciplina de numeral tabular e coluna densa é exatamente certa.
  **Fusão parcial:** preto-e-branco puro sem cinza proíbe as cores semânticas e as 11 categorias.
  Ficamos com a lição tipográfica.

Recusados por não sustentarem a verdade do produto: catálogo Factory Records (substituir
palavra por código é o oposto do que um produto com 11 vocabulários precisa), capa com
cordão (nenhuma referência no trabalho real) e amanhecer multiplano (paralaxe decorativa
custa desempenho e clareza, e o dono proibiu efeito sem propósito).

**Saída padrão, sempre disponível:** o SaaS convencional jogado sem ironia — grade neutra,
azul/índigo, cartões, screenshot em perspectiva. É a porta do dono, não a nossa. Se ele a
escolher, ela vira compromisso de marca em `PRODUCT.md` e é executada com fidelidade total.

---

## 9. Consequências para os documentos-fonte

A pesquisa só vira produto se as fontes de verdade deixarem de ser automotivas:

1. **`PRODUCT.md`** — trocar *"the initial surface is an operational dashboard for
   `automotive_aesthetics`"* pela verdade multi-categoria; registrar o cenário móvel; registrar
   que não há cliente, preço nem depoimento.
2. **`DESIGN.md`** — deixar de se chamar *"Bora Marcá Automotive"*. Passa a documentar o
   núcleo (**Pauta**), e a "Prancheta de boxes" vira o que sempre deveria ter sido: o
   **tema do módulo Automotivo**, um capítulo, não o sistema.
3. **`web/src/app/page.tsx`** — deixar de ser `redirect("/patio")` e virar a landing.
4. **Shell** — extrair `app-shell`/`navigation`/`topbar` de `automotive-patio.tsx` para o núcleo.
5. **`core/tenant`** — trocar `.limit(1)` pelo modelo de zero/uma/várias empresas.
6. **`SegmentConfig`** — acrescentar acento, ícone e os substantivos da operação.
7. **Decidir sobre o Tailwind** — hoje é importado e pago sem ser usado. Ou adota-se
   (`@theme` do v4 gera os tokens), ou remove-se a dependência.

> Este documento é pesquisa e direção. Nenhuma decisão aqui virou código; a implementação
> depende de aprovação do dono, e o §8 mantém a porta aberta para ele recusar a direção.
