# O núcleo vive num pacote compartilhado entre site e app

## Contexto

Até 25/08/2026 o único alvo era a web (Next.js em `web/`). O plano de execução, na Etapa 3.1,
recomendava mover `src/config/segments.ts` para dentro de `web/src/` e adiava um pacote
compartilhado como "complexidade especulativa", a ser promovido quando surgisse um segundo alvo.

O segundo alvo foi confirmado: **haverá aplicativo, e não só para o cliente final — também para
a equipe.** Técnico no pátio fotografando pelo celular, profissional consultando a própria
agenda. É o mesmo desenho do Barbershop, que roda os dois perfis num único binário React Native.

Com isso, boa parte do núcleo passa a ser consumida pelos dois lados: catálogo de segmentos,
labels, permissões, tipos de domínio e o acesso a dados.

## Decisão

O repositório vira um **workspace npm** com um pacote de núcleo compartilhado, e não uma pasta
`src/` dentro do app web.

```
packages/core/     framework-agnostic — zero React, zero React Native
web/               Next.js, consome o núcleo
app/               React Native (futuro), consome o mesmo núcleo
```

O pacote de núcleo é **agnóstico de framework de interface**. Não importa React, não importa
React Native, não importa nada de DOM. É TypeScript e o cliente Supabase.

Essa restrição é o que permite que o mesmo código sirva a Next.js e a React Native. O arquivo
`segments.ts` já nasceu declarando essa intenção no cabeçalho: *"intentionally
framework-agnostic. UI, routing and server code should query this catalog"*. A decisão apenas
torna a intenção estrutural.

### A costura que faz funcionar

A camada de dados do núcleo **recebe** um `SupabaseClient` em vez de criar um. Web e app
constroem o cliente de formas diferentes — `createBrowserClient`/`createServerClient` de um
lado, `createClient` com AsyncStorage do outro — mas as consultas e as chamadas de RPC são as
mesmas.

Sem essa inversão, a camada de dados ficaria presa a um dos dois.

## Motivo

O custo de mover é o mesmo agora e depois; o custo de mover **duas vezes** não é. Mover para
`web/src/` hoje e para `packages/` quando o app começar significa refazer imports em todo o
frontend duas vezes.

E o compartilhamento aqui não é marginal. Com o app atendendo também a equipe, a extração do
domínio do Barbershop mostrou que praticamente as 49 telas do núcleo valem para os dois lados —
o que muda é a camada de apresentação, não a regra.

## Consequências

- A Etapa 3.1 do plano inverte: em vez de mover para `web/src/`, cria o workspace.
- A fronteira passa a ter **dois níveis**: pacote (compartilhado × específico de plataforma) e
  pasta (núcleo × módulo de categoria) dentro de cada um.
- A Etapa 3.7 — extrair as consultas de dentro dos componentes — ganha peso: aquelas consultas
  vão para o núcleo e passam a servir os dois alvos, em vez de serem reescritas no app.
- Regra de lint nova: nada em `packages/core` pode importar React, React Native ou DOM.
- `npm workspaces`, sem ferramenta nova. O projeto já usa npm; Turborepo ou Nx seriam peso sem
  contrapartida neste tamanho.
- O banco não muda em nada. As 21 migrations, RLS e RPCs servem qualquer cliente.

## Em aberto

- **Stack do app.** React Native puro (como o Barbershop) ou Expo. Não bloqueia: o núcleo é
  agnóstico e serve aos dois. Decidir quando o app começar.
- **Nome do pacote.** `@boramarca/core` enquanto o nome do produto for provisório. Renomear
  pacote é barato.
- **Componentes compartilhados.** React Native Web permitiria compartilhar também a camada
  visual. É uma decisão de UI, posterior, e não afeta o núcleo.
