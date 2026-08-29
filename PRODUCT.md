# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Um aplicativo React Native é decisão registrada (ADR 0005) e ainda não construído. O núcleo
compartilhado em `packages/core` existe para servir os dois alvos e é agnóstico de framework
por construção — o `tsconfig` dele omite a lib DOM.

## Stack

Next.js 16 (App Router) com TypeScript, React 19 e CSS próprio. Supabase é a autoridade:
PostgreSQL com Row Level Security, Auth, Storage privado e funções transacionais. Monorepo em
workspace npm: `packages/core` (compartilhado) e `web` (site).

## Users

Donos, gerentes, recepção, caixa e profissionais de negócios de serviço no Brasil — barbearia,
salão, manicure, maquiagem, estética automotiva, massagem, tatuagem, sobrancelhas, estética,
depilação e pet shop.

A maioria é negócio pequeno: uma a cinco pessoas, frequentemente o próprio dono atendendo. O
cliente final ainda não tem superfície própria; o vínculo que a criará já existe no banco
(`customer_links`).

## Product Purpose

Bora Marcá é um SaaS multiempresa e multi-categoria para negócios de serviço. Ele organiza a
agenda, o cadastro de clientes, o catálogo de serviços, a equipe e o dinheiro — e adapta
recursos, menus e nomenclatura à categoria do negócio, sem virar um produto diferente para
cada uma.

A Estética Automotiva é um **módulo** sobre esse núcleo, não a porta de entrada do produto.

## Positioning

Duas promessas que o banco cumpre, não a interface:

1. **Ninguém é prometido duas vezes.** Um profissional ou um recurso agendável não pode ser
   reservado para dois trabalhos no mesmo horário — garantido por constraint de exclusão no
   PostgreSQL, não por validação de tela.
2. **O dado de uma empresa é inalcançável por outra.** Isolamento por `tenant_id` com RLS e
   chaves estrangeiras compostas.

## Operating Context

O uso primário é **celular, em rede móvel**. 65% dos brasileiros acessam a internet
exclusivamente pelo celular; nas classes D e E são 87% (IBGE/CETIC, TIC Domicílios 2025). O
público deste produto está concentrado exatamente aí. Desktop é o caso secundário, não o
inverso.

O dia começa com "o que acontece hoje" e é interrompido o tempo todo: telefone tocando,
cliente no balcão, encaixe pedido na hora. A tela precisa responder à próxima ação sem obrigar
a pessoa a se lembrar de onde estava.

A categoria muda o vocabulário e as telas disponíveis, nunca a estrutura: numa barbearia
"Barbeiro" e "Agendamento"; numa automotiva "Técnico", "OS", "Box" e "Pátio".

## Capabilities and Constraints

- Supabase (PostgreSQL, RLS, Auth, Storage privado) é a autoridade de autorização. A camada de
  permissões da interface só evita oferecer o que será negado.
- Escrita concentrada em funções transacionais. Dado pessoal do cliente é segregado em
  `customer_contacts` e **só se escreve por RPC**.
- Onze categorias declaradas em `packages/core/src/segments/index.ts`. Nenhuma tela pode
  ramificar por tipo de negócio — a consulta é `hasFeature` e `labels`.
- **Não existem planos nem assinaturas no banco.** Nenhuma superfície pode falar de preço,
  teste grátis ou plano até que existam.
- Notificações (WhatsApp, e-mail, push) não existem. Área do cliente não existe.
- Não há uso em produção: o banco vinculado está vazio.

## Brand Commitments

O nome **Bora Marcá** é provisório (§1 do Contexto Mestre). Ele vive num único token de marca
para que a troca seja uma linha, não uma varredura.

**Direção visual: a convenção de SaaS, executada em fidelidade total.** Escolha explícita do
dono em 26/08/2026, feita contra três alternativas mais autorais. Índigo como cor de marca,
cartões com sombra suave, raio generoso, captura de tela rotulada como demonstração. Sem
ironia e sem excentricidade contrabandeada — a convenção é o compromisso, não um ponto de
partida a subverter.

**A régua de acabamento é Nubank, Conta Azul e Asaas**: SaaS e fintech brasileiros para
público não-técnico. O que se herda deles é clareza acima de sofisticação, português direto,
celular primeiro e confiança como atributo visual — nunca a interface deles.

O produto fala português brasileiro, direto e operacional, e distingue com consistência
Agendamento, Cliente, Serviço, Profissional, e — dentro do módulo automotivo — Entrada, OS,
Pátio, Box, Pagamento e Entrega.

## Evidence on Hand

O repositório tem o Contexto Mestre, a especificação da operação automotiva, 35 migrations e
uma suíte pgTAP. **Não há nenhum cliente real, logotipo, fotografia, depoimento, métrica ou
resultado comercial.**

O que a superfície pública pode afirmar é o que o repositório prova: onze categorias
nomeadas, catálogo semente por categoria, isolamento entre empresas, dado pessoal segregado,
consentimento por finalidade, anonimização em vez de exclusão, e a impossibilidade de prometer
o mesmo profissional duas vezes.

Qualquer captura de tela exibe dado fabricado e carrega o rótulo **demonstração** no próprio
elemento — nunca em rodapé.

## Product Principles

- **Mostre a próxima ação, não o painel.** Quem abre o produto às 8h quer saber o que tem hoje.
- **A categoria muda a palavra, não a estrutura.** Uma tela por necessidade, com rótulo
  dinâmico — nunca uma cópia por segmento.
- **Falha silenciosa é aceitável; falha invisível não.** Quem não tem permissão recebe ausência,
  não erro — mas o sistema nunca finge que gravou.
- **Densidade onde se opera, respiro onde se decide.** Cartão na superfície pública; linha na
  agenda e no pátio, onde quarenta itens dentro de quarenta cartões viram parede.
- **Não prometa o que o schema impede.** Botão que não funciona é pior que botão ausente.

## Accessibility & Inclusion

Foco visível em todo controle, alvo de toque de no mínimo 44px, contraste mínimo 4.5:1 em texto
e 3:1 em borda de controle, navegação completa por teclado, `prefers-reduced-motion` respeitado,
e estados de vazio, carregamento e erro em toda tela que busca dado.

O caso primário é celular em rede móvel — layout responsivo não é adaptação, é o ponto de
partida. Validação com usuários reais continua sendo decisão em aberto.
