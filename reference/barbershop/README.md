# Barbershop — referência funcional

Isto **não é código do produto**. Não compila, não é instalado, não entra em nenhum
workspace do npm e nada em `apps/`, `web/` ou `packages/` importa daqui.

É o aplicativo React Native + Firebase que veio antes do Bora Marcá, guardado porque ele
é a especificação mais precisa que existe do que o módulo Barbeiro precisa fazer. Quando
uma funcionalidade for construída, a pergunta "como isso se comportava de verdade?" tem
resposta aqui — em código que rodou em produção, não em documento de requisito.

## O que tem

| Pasta | O que é |
|---|---|
| `src/screens/` | 48 telas. É o inventário do produto: cada arquivo é uma funcionalidade. |
| `src/data/repositories/` | 14 repositórios. As regras de negócio, com os nomes do domínio. |
| `src/services/` | WhatsApp, ocupação da agenda, exclusão de conta, deep link, cache. |
| `src/navigation/` | As abas do barbeiro e as do cliente — o mapa do que existe em cada perfil. |
| `__tests__/` | 420 testes. Onde o comportamento esperado está escrito de forma executável. |
| `docs/` | Auditoria de design, relatório de esboços e o plano de cinco fases. |
| `e2e/` | Detox. A dependência saiu do produto; isto fica como registro. |

## Como usar

Para dimensionar trabalho, o tamanho da tela é um proxy honesto — `ComissoesScreen.tsx`
tem 440 linhas, `DespesasScreen.tsx` 417, `ListaEsperaScreen.tsx` 373. Para entender uma
regra, o repositório correspondente é mais direto que a tela, porque é onde a decisão
mora sem o ruído de layout.

## O que NÃO trazer daqui

- **Firebase.** O backend é Supabase/PostgreSQL. Existe um verificador,
  `apps/mobile/scripts/check-boundaries.mjs`, que quebra o build se um identificador do
  Firebase reaparecer na superfície ativa.
- **A suposição de que o barbeiro é a unidade.** Aqui o profissional era o dono de tudo;
  no Bora Marcá a unidade é a **empresa**, e quem trabalha sozinho abre uma empresa de uma
  pessoa só. Isso muda o alvo de banimento, de convite, de preferência de aviso e de
  relatório.
- **Cópias desnormalizadas.** O Firestore não faz junção, então nome, e-mail, telefone e
  preço eram copiados para dentro de cada documento — e envelheciam sozinhos. No
  PostgreSQL isso vem por junção, sempre atual.
- **A lista de banidos na vitrine pública**, que a auditoria do próprio Barbershop
  apontou. `customer_bans` nasceu fechada.

O original intacto continua em `D:\Claude\BarberShop`.

O README que o próprio Barbershop trazia — pré-requisitos, emuladores, build de APK —
está preservado ao lado, em `README-original.md`. Aquelas instruções descrevem o projeto
Firebase e não valem para o Bora Marcá.
