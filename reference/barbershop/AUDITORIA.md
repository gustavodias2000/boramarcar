# ATENÇÃO: auditoria histórica (20/07/2026)

Este documento antecede correções já presentes no código, incluindo regras do Firestore, reserva atômica de horários, exclusão de conta e transparência sobre pagamento presencial. Não trate seus itens como falhas abertas sem nova verificação. O retrato vigente e as pendências confirmadas estão em [docs/RELATORIOS.md](docs/RELATORIOS.md).

# Auditoria Técnica Completa — Barbershop App

**Projeto:** BarbershopApp (React Native 0.80)
**Data da auditoria:** 20/07/2026
**Repositório:** github.com/gustavodias2000/Barbershop
**Metodologia:** Revisão manual de 100% do código-fonte (telas, componentes, serviços, hooks, contexto, configuração Android e Firebase), análise estática e verificação de padrões (Clean Code, SOLID, OWASP Mobile, WCAG 2.2, LGPD).

---

## Sumário executivo

O Barbershop é um app de agendamento para barbearias, com dois perfis (cliente e barbeiro), construído em React Native com Firebase (Auth + Firestore) como backend. É um projeto **funcional e com boa base**: a separação de telas é clara, há tratamento de erros de autenticação, validação de formulários, tema claro/escuro e até uma tela de analytics. Para um projeto de ~1 ano, está acima da média do que se vê em apps de barbearia.

Dito isso, a auditoria encontrou **problemas graves que impedem o app de ir para produção com segurança**. Os três mais críticos:

1. **Não existe arquivo de regras do Firestore versionado (`firestore.rules`).** Se o banco estiver em "modo de teste" (padrão do Firebase), **qualquer pessoa na internet pode ler, alterar e apagar todos os dados** — agendamentos, telefones, emails, avaliações. Este é um risco de segurança e de LGPD de nível crítico.

2. **O painel do barbeiro lê TODOS os agendamentos de TODOS os barbeiros** (`BarbeiroHome.js` não filtra por `barbeiroId`). Um barbeiro vê o nome, email, telefone e histórico dos clientes de todos os concorrentes cadastrados. Vazamento de dados pessoais + violação de LGPD.

3. **O barbeiro que se cadastra nunca aparece na lista de barbeiros do cliente.** O cadastro grava em `usuarios`, mas a tela do cliente lê da coleção `barbeiros`, que nunca é populada. Ou seja, o fluxo principal do app está quebrado de ponta a ponta.

Além disso: chaves de API embutidas no cliente, ausência total de acessibilidade, dark mode quebrado em 4 das 6 telas, ~180 KB de código morto, e o build de release assinado com a chave de debug (não publicável na Play Store).

**Nota geral: 4.6 / 10** — boa fundação, mas não pronto para produção. Com o roadmap de prioridade alta (estimado em ~2 semanas de trabalho), sobe facilmente para 7+.

---

## ETAPA 1 — Entendimento do projeto

### Como foi construído

Aplicativo **React Native 0.80 puro** (sem Expo), com navegação via `@react-navigation/native-stack`. O backend é 100% **Firebase**: `firebase` (Web SDK) para Auth e Firestore, e `@react-native-firebase/messaging` para push notifications.

**Estrutura de pastas:**

```
/
├── App.js                    # Navegação (stack) + ThemeProvider
├── App.tsx                   # ÓRFÃO — não é usado (index.js aponta para App.js)
├── firebase.js               # Inicialização Firebase (raiz)
├── index.js                  # Entry point
├── src/
│   ├── screens/              # 7 telas
│   ├── components/           # 4 componentes (Modal, Rating, Analytics, ThemeSelector)
│   ├── services/             # 7 serviços (WhatsApp, Payment, Cache, Offline, Calendar, Notification, Config)
│   ├── hooks/                # useOptimizedFetch (NÃO USADO)
│   ├── context/              # ThemeContext
│   └── utils/                # dateUtils
├── android/ ios/             # Projetos nativos
└── __tests__/ e2e/           # Testes (Jest + Detox)
```

### Modelo de dados (Firestore)

Quatro coleções: `usuarios/{uid}` (perfil + role), `agendamentos`, `barbeiros`, `avaliacoes`.

### Tecnologias

React 19.1 · React Native 0.80 · Firebase 11.9 · React Navigation 7 · AsyncStorage · Jest + Testing Library + Detox.

### Pontos fortes

- Separação de telas por responsabilidade clara e legível.
- Tratamento de erros de autenticação traduzido por código (`auth/user-not-found`, etc.) — raro de ver e muito bom para UX.
- Validação de formulários no cliente (email, telefone, senha, confirmação).
- Sistema de tema claro/escuro com persistência via AsyncStorage.
- Reautenticação antes de trocar senha (boa prática de segurança do Auth).
- Roteamento por role via Firestore (conceito correto), com máscara de telefone e normalização para E.164.
- Presença de testes unitários e E2E (a maioria dos projetos não tem nenhum).

### Pontos fracos (visão geral)

- Ausência de regras de segurança do Firestore versionadas.
- Camada de dados inexistente — telas falam direto com o Firestore.
- Dark mode aplicado em apenas 2 de 6 telas principais.
- Zero acessibilidade.
- Código morto significativo (3 serviços + 1 hook nunca usados).
- Modelo de dados frágil (preço como string, data/hora como strings separadas).

---

## ETAPA 2 — Qualidade do código (Clean Code / SOLID / DRY)

### 2.1 — Violação de DRY: `getStatusColor` / `getStatusText` triplicados 🔴

As funções de status estão **copiadas literalmente em 3 arquivos**: `ClienteHome.js`, `HistoricoScreen.js` e `BarbeiroHome.js`.

**Por que é um problema:** se você adicionar um novo status (ex.: "pago"), precisa lembrar de alterar 3 lugares. `ClienteHome` e `BarbeiroHome` inclusive já divergem de `HistoricoScreen` (que tem `avaliado` e outra cor). Isso é bug latente.

**Como resolver** — mover para `src/utils/statusUtils.js`:

```js
export const STATUS = {
  pendente:   { label: 'Pendente',   color: '#f39c12' },
  confirmado: { label: 'Confirmado', color: '#27ae60' },
  concluido:  { label: 'Concluído',  color: '#8e44ad' },
  cancelado:  { label: 'Cancelado',  color: '#e74c3c' },
  avaliado:   { label: 'Avaliado',   color: '#2980b9' },
};
export const getStatus = (s) => STATUS[s] || STATUS.pendente;
```

### 2.2 — `fetchUserProfile` duplicado em 4 telas 🟠

Bloco idêntico (`getDoc(doc(db, 'usuarios', uid))`) em `ClienteHome`, `BarbeiroHome`, `AgendamentoScreen` e `PerfilScreen`. Deveria ser um hook `useUserProfile()` ou um `UserRepository`.

### 2.3 — Preço como string parseada em todo lugar (`preco?.replace(',', '.')`) 🟠

Aparece em `PaymentModal`, `PaymentScreen`, `AnalyticsDashboard`. Lógica de parsing de moeda espalhada e frágil. Deveria ser um número em centavos no banco (ver Etapa 9).

### 2.4 — Código morto (~180 KB) 🟠

Verificado por busca de referências:

- `src/hooks/useOptimizedFetch.js` — **nunca importado** por nenhuma tela.
- `src/services/CacheService.js` — usado **apenas** pelo hook acima (que é morto).
- `src/services/OfflineService.js` (138 linhas) — **nunca importado**.
- `App.tsx` — órfão; o entry (`index.js`) usa `App.js`.

**Impacto:** aumenta bundle, confunde manutenção, e dá falsa impressão de que há cache/offline funcionando (não há).

### 2.5 — Efeito colateral no import (`NotificationService`) 🔴

```js
class NotificationService {
  constructor() { this.configure(); }   // pede permissão de push NO IMPORT
}
export default new NotificationService();
```

**Por que é um problema:** o `import` do módulo já dispara `requestPermission()` — o app pede permissão de notificação **antes de o usuário sequer logar**, o que a Apple reprova em review e prejudica a taxa de opt-in. Viola o princípio de que import não deve ter efeito colateral.

**Como resolver:** expor `NotificationService.init()` e chamá-lo explicitamente após o login, com uma tela de contexto ("Ative as notificações para receber confirmações").

### 2.6 — Mistura JS/TS sem tipagem 🟠

Há `tsconfig.json`, `App.tsx`, `@types/*`, mas todo o `src/` é `.js` sem tipos. Você paga o custo do TypeScript (config, deps) sem o benefício. Ou adote TS de verdade, ou remova a infra de TS.

### 2.7 — Números e strings mágicos 🟡

Status (`'pendente'`, `'confirmado'`...) como strings livres; horários hardcoded; cores hex repetidas centenas de vezes. Centralizar em constantes/design tokens.

---

## ETAPA 3 — Performance

### 3.1 — Leitura de coleção inteira sem filtro nem paginação 🔴

`BarbeiroHome.fetchAgendamentos()` e `AnalyticsDashboard` fazem `getDocs` da coleção **inteira** e filtram no cliente com `.filter()`. Com 10.000 agendamentos, o app baixa 10.000 documentos a cada refresh.

**Impacto:** custo de leitura no Firebase (cobra por documento lido), lentidão, e consumo de memória/banda. Em escala, inviável.

**Como resolver:** filtrar no servidor (`where`) + paginar (`limit` + `startAfter`):

```js
const q = query(
  collection(db, 'agendamentos'),
  where('barbeiroId', '==', uid),
  orderBy('createdAt', 'desc'),
  limit(20),
);
```

### 3.2 — Funções de render recriadas a cada render 🟠

`renderBarbeiro`, `renderAgendamento` são redefinidas em todo render e passadas ao `FlatList`. Sem `useCallback` e sem `React.memo` nos itens, cada re-render remonta a lista.

**Como resolver:** extrair itens para componentes memoizados e usar `useCallback`. Adicionar `getItemLayout` quando a altura for fixa.

### 3.3 — Cache existe mas não é usado 🟠

`CacheService` (memória + AsyncStorage com TTL) está pronto e é **bem escrito**, mas nenhuma tela o utiliza. Toda navegação re-busca tudo do Firestore. Ativar cache nas listas reduziria leituras drasticamente.

### 3.4 — Analytics recalculado do zero a cada abertura 🟡

`AnalyticsDashboard` recomputa faturamento, populares, médias em memória a cada mount, lendo tudo. Deveria usar agregação (Firestore aggregation queries `count()`/`sum()`) ou documentos de resumo mantidos por Cloud Function.

### 3.5 — Bundle e imagens

- `minifyEnabled false` no release (Etapa 15) → bundle maior, sem tree-shaking de bytecode.
- Zero imagens reais (só emojis) — bom para tamanho, mas avatares por inicial limitam o design.

---

## ETAPA 4 — Design (UI)

O design é **limpo, porém datado (~2018)**: cards brancos, sombra suave, azul `#3498db` (paleta "Flat UI"/PeterRiver). Funciona, mas não passa a sensação premium de apps 2026.

### Problemas concretos

- **Dark mode quebrado:** `useTheme` só é consumido por `PerfilScreen`, `PaymentScreen`, `PaymentModal` e `ThemeSelector`. `Login`, `Register`, `ClienteHome`, `BarbeiroHome`, `Historico`, `Agendamento` têm cores **hardcoded**. Resultado: o usuário ativa o tema escuro e 4 das 6 telas continuam brancas. Inconsistência visual grave.
- **Contraste insuficiente** (ver Etapa 7): texto secundário `#7f8c8d` e `#bdc3c7` reprovam no WCAG AA.
- **Feedback via `Alert` nativo** para tudo (sucesso, erro, confirmação). Interrompe o fluxo e é visualmente pobre. Apps modernos usam toasts/snackbars e bottom sheets.
- **Sem skeleton loading:** telas mostram spinner + "Carregando..." em tela cheia. O padrão 2026 é skeleton screens.
- **Estados vazios** existem (bom!), mas sem ilustração/CTA.
- **Sem microinterações:** nenhuma animação de transição, press state, haptic feedback.

### Direção moderna sugerida (inspiração Linear/Stripe/Airbnb)

- Design tokens centralizados (spacing 4/8/12/16/24, radius, tipografia escalonada).
- Uma cor de marca com acento, tipografia mais forte (peso e escala), respiro maior.
- Bottom sheet para agendar (em vez de push de tela).
- Skeleton + shimmer nas listas.
- `react-native-reanimated` para transições e press states.

---

## ETAPA 5 — UX

### 5.1 — Fluxo de pagamento confuso e redundante 🟠

Existem **duas** UIs de pagamento (`PaymentModal` e `PaymentScreen`) que fazem quase a mesma coisa, com o Stripe removido. O `PaymentScreen` ainda diz "Processamento seguro via Stripe" e "criptografia de ponta a ponta" — texto **enganoso**, pois não há processamento algum. Risco de credibilidade e até de propaganda enganosa.

### 5.2 — Disponibilidade de horários irreal 🟠

`AgendamentoScreen` oferece 09:00–17:30 fixos, pula só domingo, ignora: horário real de trabalho do barbeiro, duração do serviço, feriados, intervalo de almoço, e permite agendar horário **no passado** (hoje às 09:00 se já são 15:00). Isso gera agendamentos inválidos.

### 5.3 — Cliente identifica agendamento por email 🟡

`ClienteHome` e `Historico` filtram por `where('cliente', '==', email)`. Se o usuário trocar de email, perde o histórico. Deveria ser por `clienteUid` (que já é gravado no documento).

### 5.4 — Sem confirmação de "conta criada" nem verificação de email 🟡

Após cadastro, vai direto para a home. Não há verificação de email (`sendEmailVerification`), então qualquer email inventado vira conta.

### 5.5 — Excesso de cliques e ausência de otimismo

Toda ação faz round-trip ao servidor + Alert + refetch da lista inteira. Sem UI otimista, cada confirmação/cancelamento "trava" por 1–2s.

---

## ETAPA 6 — Responsividade

Sendo mobile nativo, o layout se adapta razoavelmente por Flexbox. Problemas:

- **Sem `SafeAreaView`** (verificado: zero ocorrências) apesar de `react-native-safe-area-context` instalado. Em iPhones com notch e Android com barra de status, o header cola no topo e pode ficar sob a câmera/relógio.
- **Texto sem escala dinâmica:** todos os `fontSize` são fixos. Usuários com fonte grande do sistema (acessibilidade) terão layout quebrado/cortado.
- **Grade de horários** com `flexWrap` pode desalinhar em telas muito estreitas (< 340dp).
- **Sem suporte a tablet/landscape** (`orientation` está travável, mas layout não aproveita largura).

---

## ETAPA 7 — Acessibilidade (WCAG 2.2)

**Verificação: ZERO `accessibilityLabel`, `accessibilityRole` ou `accessibilityHint` em todo o projeto.** Esta é uma das maiores lacunas.

### Falhas concretas

- **Botões só com emoji** (`👤`, `▲/▼`) — leitor de tela lê "figura" ou nada. Sem label. (WCAG 1.1.1, 4.1.2)
- **Estrelas de avaliação** (`RatingComponent`): `TouchableOpacity` com emoji ⭐, sem `accessibilityRole="button"` nem estado. Impossível avaliar com TalkBack/VoiceOver. (WCAG 4.1.2)
- **Contraste (WCAG 1.4.3):**
  - `#7f8c8d` sobre `#ffffff` ≈ **3.9:1** → reprova para texto normal (mínimo 4.5:1).
  - `#bdc3c7` sobre `#ffffff` ≈ **1.9:1** → reprova gravemente (usado em "Criado em", subtítulos).
  - Texto branco em badges laranja `#f39c12` ≈ **2.1:1** → reprova.
- **Alvos de toque (WCAG 2.5.8, novo no 2.2):** `perfilButton` é 36×36px; ícones menores que o mínimo recomendado de 44×44 (iOS) para conforto.
- **Sem gestão de foco** ao abrir modais; foco não é preso no modal (foco pode escapar para trás).
- **Inputs sem associação explícita label→campo** para leitores (usa `<Text>` solto acima do `<TextInput>`).

### Como resolver (exemplo)

```jsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="Abrir meu perfil"
  onPress={() => navigation.navigate('Perfil')}>
  <Text>👤</Text>
</TouchableOpacity>
```

E ajustar as cores secundárias para `#5a6a72` (≈ 4.6:1) ou mais escuras.

---

## ETAPA 8 — Segurança 🔴 (área mais crítica)

### 8.1 — Ausência de regras do Firestore 🔴🔴🔴

Não há `firestore.rules`, `firebase.json` nem `storage.rules` no repositório. Se o banco estiver no modo de teste padrão (`allow read, write: if true;`), **qualquer um com o `projectId` (que está no bundle) pode ler e escrever tudo** via API REST, sem nem abrir o app.

**Impacto:** exfiltração de todos os telefones/emails (LGPD), adulteração de agendamentos, exclusão de dados, criação de avaliações falsas, escalonamento de privilégio.

**Como resolver** — criar `firestore.rules` (exemplo base, requer refino):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isOwner(uid) { return isSignedIn() && request.auth.uid == uid; }
    function isBarbeiro() {
      return isSignedIn() &&
        get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.tipo == 'barbeiro';
    }

    match /usuarios/{uid} {
      allow read: if isOwner(uid);
      // impede o usuário de se auto-promover a barbeiro
      allow create: if isOwner(uid);
      allow update: if isOwner(uid)
        && request.resource.data.tipo == resource.data.tipo;
    }

    match /agendamentos/{id} {
      allow read: if isSignedIn() &&
        (resource.data.clienteUid == request.auth.uid || isBarbeiro());
      allow create: if isSignedIn() &&
        request.resource.data.clienteUid == request.auth.uid;
      allow update: if isSignedIn() &&
        (resource.data.clienteUid == request.auth.uid || isBarbeiro());
    }

    match /barbeiros/{id} {
      allow read: if isSignedIn();
      allow write: if isBarbeiro();
    }

    match /avaliacoes/{id} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() &&
        request.resource.data.cliente == request.auth.token.email;
    }
  }
}
```

### 8.2 — Vazamento de dados entre barbeiros 🔴

`BarbeiroHome.fetchAgendamentos()` **não filtra por `barbeiroId`** — lê todos. Além do problema de performance (Etapa 3), é **vazamento de dados pessoais**: cada barbeiro vê clientes, emails e telefones de todos os outros. Corrigir com `where('barbeiroId', '==', uid)` **e** regra de segurança que só permita ao barbeiro dono.

### 8.3 — Escalonamento de privilégio via role no cliente 🔴

O `tipo` (cliente/barbeiro) fica em `usuarios/{uid}`, gravado pelo próprio usuário no cadastro. Sem regra que trave o campo, um cliente pode editar seu doc e virar barbeiro (ganhando acesso à agenda de todos). A regra do 8.1 mitiga (`tipo` imutável no update), mas o ideal é usar **Custom Claims** do Firebase Auth, definidos por Cloud Function, e nunca confiáveis do cliente.

### 8.4 — Segredos no cliente 🟠

- `WhatsAppConfig.js` foi feito para conter `ACCESS_TOKEN` da API do WhatsApp Business **no bundle**. Qualquer APK pode ser descompilado e o token extraído → envio de mensagens em seu nome, banimento do número. **Chamadas à Graph API têm que sair de um backend/Cloud Function.**
- `firebase.js` expõe a config (isso é normal e esperado para apps Firebase — a chave não é secreta), **mas** só é seguro **com regras de Firestore corretas**. Sem elas (8.1), a config vira porta de entrada.

### 8.5 — Fallback de role frágil 🟡

`LoginScreen`: se não achar o doc do usuário, decide o role por `email.includes('barbeiro')`. Um cliente `barbeirosdojoao@gmail.com` entraria como barbeiro.

### 8.6 — Logs sensíveis 🟡

`NotificationService` faz `console.log('FCM Token:', token)` e `WhatsAppService` loga payloads. Em release, remover logs (babel plugin `transform-remove-console`).

### 8.7 — Sem verificação de email nem rate limit de escrita

Contas com email não verificado; nenhuma proteção contra criação em massa de agendamentos (spam de slots).

---

## ETAPA 9 — Banco de dados

### 9.1 — Índices compostos ausentes 🔴 (falha em runtime)

Consultas com `where` + `orderBy` em campos diferentes exigem **índice composto** no Firestore, senão lançam erro em runtime:

- `agendamentos`: `barbeiroId ==` + `orderBy(createdAt desc)` (AnalyticsDashboard)
- `agendamentos`: `cliente ==` + `status ==` + `orderBy(createdAt desc)` (Historico com filtro)
- `agendamentos`: `barbeiroId ==` + `data ==` + `status in [...]` (Agendamento)

**Como resolver:** criar `firestore.indexes.json` e fazer deploy. O Firebase também sugere o índice via link no erro do console.

### 9.2 — Tipos de dados inadequados 🟠

- **Preço como string `"25,00"`** → impossível somar/ordenar no banco; parsing manual em 3 lugares. Usar **inteiro em centavos** (`2500`).
- **Data e hora como strings separadas** (`data: "2025-07-20"`, `horario: "09:00"`) → não dá para ordenar cronologicamente, filtrar "próximos", ou detectar conflito de forma robusta. Guardar um **`Timestamp` real** do início do atendimento (além dos campos de exibição, se quiser).
- **`new Date(ag.data)`** em `AnalyticsDashboard`: `"2025-07-20"` é parseado como UTC meia-noite → em BRT (UTC-3) o "agendamentos de hoje" pode contar o dia errado. Bug de timezone.

### 9.3 — Identidade inconsistente (email vs uid) 🟠

O cliente é referenciado ora por `cliente` (email), ora por `clienteUid`. Padronizar em `uid` (imutável) e manter email só para exibição.

### 9.4 — Sem integridade referencial / desnormalização não mantida 🟡

`agendamento` copia `barbeiroNome`, `preco`, `servico` do barbeiro. Se o barbeiro mudar o preço, agendamentos antigos ficam inconsistentes (aceitável se for snapshot histórico, mas precisa ser decisão explícita).

### 9.5 — Coleção `barbeiros` desconectada do cadastro 🔴 (bug funcional)

O cadastro de barbeiro grava em `usuarios` com `tipo: 'barbeiro'`, mas `ClienteHome` lê de `barbeiros`. **Nada popula `barbeiros`.** Logo, um barbeiro real cadastrado nunca aparece para os clientes agendarem. O app só "funciona" se você inserir barbeiros manualmente no console. **Fluxo principal quebrado.**

---

## ETAPA 10 — Escalabilidade

| Usuários | Situação atual | Gargalo |
|---|---|---|
| **1 mil** | OK com ajustes | Falta de índices trava consultas |
| **10 mil** | Degradado | `BarbeiroHome`/Analytics lêem coleção inteira; custo de leitura explode |
| **100 mil** | Inviável | Sem paginação, sem agregação, sem cache; faturamento recalculado no cliente |
| **1 milhão** | Impossível sem reescrita | Precisa de Cloud Functions, agregações mantidas, backend para WhatsApp/push, sharding de queries |

**Gargalos-chave:** (1) leituras de coleção inteira, (2) ausência de paginação, (3) analytics no cliente, (4) integrações (WhatsApp/push) que deveriam ser server-side. A arquitetura serverless do Firebase escala bem **se** as queries forem indexadas, filtradas e paginadas — nada disso está feito hoje.

---

## ETAPA 11 — Dependências

- **120 vulnerabilidades reportadas pelo GitHub** (10 críticas, 49 altas) — visto no push. Rodar `npm audit fix` e revisar as críticas manualmente.
- **`@testing-library/react-native` duplicado** no `package.json` (`^12.8.1` e `^13.2.0` na mesma seção) — o npm resolve para um, mas é erro de manutenção.
- **`metro-react-native-babel-preset`** está **deprecado** (substituído por `@react-native/babel-preset`, que você já tem). Remover o antigo.
- **React 19 + RN 0.80** são bleeding edge — compatibilidade de libs de terceiros ainda instável (você já sentiu isso com Stripe/Kotlin no build).
- **`react-native-payments`, `react-native-stripe-payments`, `@stripe/stripe-react-native`** — já removidos por incompatibilidade. Ao reintroduzir pagamento, use **apenas** `@stripe/stripe-react-native` numa versão compatível + backend para PaymentIntents.

---

## ETAPA 12 — Arquitetura

**Estado atual:** arquitetura "screen-driven" — cada tela contém UI + estado + acesso a dados + regra de negócio. Não há camadas.

### Problemas

- **Sem camada de dados (Repository):** `getDocs`/`addDoc`/`updateDoc` espalhados por 8 arquivos. Trocar Firestore por outra coisa (ou mockar em teste) exige mexer em tudo.
- **Regra de negócio na UI:** cálculo de disponibilidade em `AgendamentoScreen`, cálculo de faturamento/analytics em `AnalyticsDashboard`. Deveriam ser use-cases/serviços testáveis isoladamente.
- **Serviços parciais:** existem serviços para WhatsApp/Payment/Cache, mas não para as entidades centrais (Agendamento, Usuário).

### Alvo recomendado (pragmático, não over-engineering)

```
src/
├── data/
│   ├── repositories/   AgendamentoRepository, UsuarioRepository, BarbeiroRepository
│   └── firebase/       cliente Firestore isolado
├── domain/
│   └── usecases/       criarAgendamento, calcularDisponibilidade, confirmarAgendamento
├── ui/
│   ├── screens/
│   ├── components/
│   └── hooks/          useUserProfile, useAgendamentos
└── shared/             utils, theme tokens, constants
```

Não precisa de DDD completo — um `Repository` + `hooks` já resolve 80% dos problemas de acoplamento aqui.

---

## ETAPA 13 — Testes

**Existente (bom que exista):** `App.test.tsx`, `RatingComponent.test.js`, `useOptimizedFetch.test.js` (testa código morto!), `LoginScreen.test.js`, `WhatsAppService.test.js`, e E2E Detox (`login`, `agendamento`).

### Lacunas

- **Cobertura baixa e desalinhada:** testa-se um hook não usado, mas não há teste para o fluxo crítico de agendamento (`AgendamentoScreen`), nem para as regras de disponibilidade, nem para `BarbeiroHome`.
- **Sem testes das regras do Firestore** (que nem existem ainda) — usar o `@firebase/rules-unit-testing`.
- **Sem CI** aparente rodando os testes a cada push.

### Estratégia sugerida

1. Testar use-cases de domínio (disponibilidade, cálculo de preço) — puros, fáceis, alto valor.
2. Testes de integração de repositórios com emulador do Firestore.
3. Testes de regras de segurança (`rules-unit-testing`) — impedem regressão de segurança.
4. Manter 2–3 E2E de fumaça (login, agendar, confirmar).
5. GitHub Actions rodando `npm test` + `npm audit` em cada PR.

---

## ETAPA 14 — SEO

**Não se aplica** — é um app mobile nativo, não web. (Se um dia houver landing page ou versão web/PWA, aí sim: meta tags, Open Graph, Core Web Vitals.) O que **se aplica** é o equivalente mobile: **ASO (App Store Optimization)** — título, palavras-chave, screenshots, descrição na Play Store/App Store. E o `versionName`/`versionCode` precisam de estratégia (hoje travados em `1.0`/`1`).

---

## ETAPA 15 — Conformidade

- 🔴 **Release assinado com a chave de DEBUG** (`build.gradle`: o `release` usa `signingConfigs.debug`). **Não publicável com segurança** — qualquer um pode assinar um "update" do seu app. Gerar keystore de release e configurar via `gradle.properties` seguro (fora do git).
- 🟠 **`minifyEnabled false`** no release — sem ofuscação/redução. Ativar ProGuard/R8.
- 🟠 **LGPD:** coleta nome, email, telefone sem política de privacidade, sem tela de consentimento, sem mecanismo de exclusão de conta/dados (direito do titular). Obrigatório no Brasil.
- 🟡 **Material Design / HIG:** não segue nenhum guideline específico; componentes são custom. Aceitável, mas afasta do "nativo".
- 🟡 **Sem deep links** configurados, apesar de `returnURL: 'barbershopapp://...'` referenciado no código antigo de pagamento.

---

## ETAPA 16 — Melhorias visuais (inspiração 2026)

- **Design tokens** (Stripe/Linear): sistema de spacing, radius, tipografia e cores único, com dark mode aplicado a **todas** as telas.
- **Bottom sheets** (Airbnb/Google Maps) para agendar e confirmar, em vez de `Alert`.
- **Skeleton + shimmer** (Facebook/LinkedIn) no carregamento de listas.
- **Cards com mais respiro e hierarquia** (Notion): título forte, metadados discretos, uma ação primária clara.
- **Haptics + micro-animações** (`react-native-reanimated` + `expo-haptics`/`react-native-haptic-feedback`) nos toques e transições de status.
- **Avatar com foto** (upload no Storage) em vez de inicial.
- **Empty states ilustrados** com CTA ("Ainda não há agendamentos — que tal marcar o primeiro?").

---

## ETAPA 17 — Novas funcionalidades sugeridas

- **Lembretes automáticos** (push/WhatsApp 24h e 1h antes) via Cloud Function agendada — reduz no-show, altíssimo ROI.
- **Bloqueio de horário no passado** e **agenda real do barbeiro** (horário de trabalho, folgas, duração por serviço).
- **Catálogo de serviços** com preços/durações (hoje "Corte e barba" é fixo).
- **Reagendamento em 1 toque** e **lista de espera** para horários cheios.
- **Favoritar barbeiro** e histórico de "meu barbeiro habitual".
- **Busca e filtros** de barbeiros (especialidade, avaliação, proximidade).
- **Dashboard do barbeiro com metas** e comparativo semana/mês (agregado por Function).
- **Pagamento real** (Stripe/PIX via backend) com antecipação opcional.
- **IA:** sugestão de melhor horário com base no histórico; resumo automático de avaliações.
- **Programa de fidelidade** (a cada 10 cortes, 1 grátis).

---

## ETAPA 18 — Roadmap

### 🔴 Prioridade ALTA (crítico — antes de qualquer produção)

1. Criar e fazer deploy de **`firestore.rules`** + `firestore.indexes.json`.
2. Corrigir **vazamento entre barbeiros** (`where barbeiroId` + regra).
3. Conectar **cadastro de barbeiro → coleção `barbeiros`** (consertar fluxo principal).
4. Travar **role** (imutável / custom claims) — anti-escalonamento.
5. Mover **token do WhatsApp** para backend/Cloud Function.
6. **Keystore de release** próprio (parar de usar a chave de debug).
7. Rodar **`npm audit fix`** nas vulnerabilidades críticas.

### 🟠 Prioridade MÉDIA (importante)

8. Paginação + filtro nas listas; ativar `CacheService`.
9. Preço em centavos (número) e datetime como `Timestamp`.
10. Dark mode em todas as telas (tokens) + remover cores hardcoded.
11. Acessibilidade básica (labels, roles, contraste AA, `SafeAreaView`).
12. Camada de Repository + hooks (`useUserProfile`, `useAgendamentos`).
13. Verificação de email + política de privacidade/LGPD + exclusão de conta.
14. Disponibilidade real (agenda do barbeiro, bloqueio de passado, duração).
15. Remover código morto e unificar telas de pagamento.

### 🟡 Prioridade BAIXA (evolução)

16. Migração para TypeScript de verdade.
17. Skeletons, bottom sheets, haptics, micro-animações.
18. Lembretes automáticos, catálogo de serviços, fidelidade.
19. CI (GitHub Actions) + testes das regras + cobertura.
20. Analytics via agregação/Functions; upload de foto de perfil.

---

## ETAPA 19 — Notas (0 a 10)

| Dimensão | Nota | Comentário |
|---|---|---|
| Arquitetura | 4.0 | Screen-driven, sem camadas, lógica na UI |
| Código (Clean/SOLID) | 5.5 | Legível, mas com duplicação e código morto |
| Performance | 3.5 | Coleção inteira sem paginação; cache ocioso |
| UX | 5.5 | Fluxos ok, mas Alerts, sem otimismo, disponibilidade irreal |
| UI (Design) | 5.0 | Limpo porém datado; dark mode quebrado |
| Segurança | 2.0 | Sem regras Firestore, vazamento de dados, segredos no cliente |
| Acessibilidade | 1.5 | Zero labels/roles; contraste reprovado |
| Escalabilidade | 3.5 | Serverless ajuda, mas queries não escalam como estão |
| Responsividade | 5.5 | Flexbox ok, mas sem SafeArea nem escala de fonte |
| Banco de dados | 3.5 | Sem índices, tipos frágeis, `barbeiros` desconectada |
| Organização | 6.0 | Estrutura de pastas clara e sensata |
| Manutenção | 4.5 | Duplicação e acoplamento dificultam evolução |
| Experiência do usuário | 5.0 | Funciona, mas com atritos e um fluxo quebrado |
| Qualidade geral | 4.5 | Boa base, longe de production-ready |

### **NOTA FINAL: 4.6 / 10**

Boa fundação com potencial real. Resolvendo os 7 itens de prioridade alta (estimativa ~2 semanas), o projeto salta para a faixa de **7.0–7.5** e fica apto a um piloto real.

---

## ETAPA 20 — Plano de ação

| # | Problema | Impacto | Gravidade | Esforço | Tempo | Prioridade | Como resolver | Benefício |
|---|---|---|---|---|---|---|---|---|
| 1 | Sem regras do Firestore | Vazamento/adulteração total de dados | Crítica | Médio | 1–2d | Alta | Criar `firestore.rules` + deploy + testes de regras | Fecha o maior buraco de segurança/LGPD |
| 2 | Barbeiro vê agendamentos de todos | Vazamento de dados pessoais | Crítica | Baixo | 2h | Alta | `where('barbeiroId','==',uid)` + regra | Privacidade e menos leitura |
| 3 | Barbeiro cadastrado não aparece | Fluxo principal quebrado | Crítica | Baixo | 4h | Alta | Gravar/espelhar em `barbeiros` no cadastro | App passa a funcionar de fato |
| 4 | Role editável pelo cliente | Escalonamento de privilégio | Crítica | Médio | 1d | Alta | Custom claims / regra imutável | Impede virar barbeiro |
| 5 | Token WhatsApp no cliente | Roubo de credencial | Alta | Médio | 1–2d | Alta | Mover envio para Cloud Function | Segredo protegido |
| 6 | Release com chave de debug | Não publicável com segurança | Alta | Baixo | 2h | Alta | Keystore próprio + gradle seguro | Publicação segura na loja |
| 7 | 120 vulnerabilidades de deps | Superfície de ataque | Alta | Baixo | 3h | Alta | `npm audit fix` + revisão | Dependências saudáveis |
| 8 | Índices compostos ausentes | Consultas falham em runtime | Alta | Baixo | 3h | Alta | `firestore.indexes.json` + deploy | Consultas funcionam |
| 9 | Leitura de coleção inteira | Custo e lentidão | Alta | Médio | 1–2d | Média | Filtro + `limit`/paginação + cache | Escala e reduz custo |
| 10 | Preço string / data string | Bugs de cálculo e timezone | Média | Médio | 1d | Média | Centavos (int) + `Timestamp` | Dados corretos e ordenáveis |
| 11 | Dark mode em 2/6 telas | Inconsistência visual | Média | Médio | 1–2d | Média | Design tokens + `useTheme` em tudo | UI coesa |
| 12 | Zero acessibilidade | Exclui usuários; risco legal | Média | Médio | 2d | Média | Labels/roles + contraste AA + SafeArea | Inclusão + conformidade |
| 13 | Sem camada de dados | Manutenção difícil | Média | Médio | 2–3d | Média | Repositories + hooks | Testável e desacoplado |
| 14 | Disponibilidade irreal | Agendamentos inválidos | Média | Médio | 1–2d | Média | Agenda real + bloqueio de passado | Agenda confiável |
| 15 | Código morto / telas duplicadas | Confusão e bundle maior | Baixa | Baixo | 3h | Média | Remover hook/serviços/App.tsx; unificar pagamento | Base limpa |
| 16 | Sem verificação de email / LGPD | Conformidade | Média | Médio | 1–2d | Média | Verificação + política + exclusão de conta | Legal e confiável |
| 17 | Sem TypeScript real | Bugs de tipo | Baixa | Alto | 1sem | Baixa | Migrar `src/` para `.tsx` tipado | Menos bugs |
| 18 | UX datada (Alerts, sem skeleton) | Percepção de qualidade | Baixa | Médio | 3–4d | Baixa | Toasts, bottom sheets, skeletons, haptics | App premium |
| 19 | Sem CI/cobertura | Regressões | Baixa | Baixo | 4h | Baixa | GitHub Actions (test + audit) | Qualidade contínua |
| 20 | Analytics no cliente | Custo em escala | Baixa | Alto | 3–4d | Baixa | Agregação/Functions + resumos | Analytics escalável |

---

## Resumo executivo final

### Os 20 problemas mais importantes

1. Sem regras de segurança do Firestore (banco potencialmente aberto).
2. Barbeiro enxerga agendamentos/dados de todos os clientes.
3. Barbeiro cadastrado nunca aparece para o cliente (fluxo quebrado).
4. Role de usuário editável pelo próprio cliente (escalonamento).
5. Token da API do WhatsApp destinado ao bundle do cliente.
6. Build de release assinado com a chave de debug.
7. 120 vulnerabilidades em dependências (10 críticas).
8. Índices compostos ausentes → consultas quebram em runtime.
9. Leitura de coleção inteira sem paginação (custo/lentidão).
10. Preço como string e data/hora como strings separadas (bugs).
11. Bug de timezone no cálculo de "agendamentos de hoje".
12. Dark mode aplicado em apenas 2 de 6 telas.
13. Acessibilidade zero (sem labels/roles; contraste reprovado).
14. Sem `SafeAreaView` (sobreposição em notch/status bar).
15. Disponibilidade de horários irreal (permite passado; ignora agenda).
16. Sem verificação de email nem conformidade LGPD.
17. Duplicação de código (status em 3 telas; perfil em 4).
18. ~180 KB de código morto (cache/offline/hook nunca usados).
19. Texto de pagamento enganoso ("via Stripe") sem processamento real.
20. Ausência de camada de dados — lógica e acesso acoplados na UI.

### As 20 melhorias com maior ROI

1. Publicar regras do Firestore + testes de regras.
2. Filtrar agendamentos por barbeiro (2h, fecha vazamento).
3. Popular `barbeiros` no cadastro (destrava o app inteiro).
4. Travar role via custom claims.
5. Backend/Function para WhatsApp e push.
6. Keystore de release + ProGuard.
7. `npm audit fix` + limpeza de dependências.
8. Índices compostos versionados.
9. Paginação + ativar o `CacheService` já pronto.
10. Preço em centavos + datetime `Timestamp`.
11. Design tokens com dark mode em todas as telas.
12. Acessibilidade básica (labels, contraste AA, SafeArea).
13. Camada Repository + hooks reutilizáveis.
14. Agenda real do barbeiro + bloqueio de passado.
15. Verificação de email + LGPD (consentimento/exclusão).
16. Lembretes automáticos (reduz no-show — ROI altíssimo).
17. Remover código morto e unificar pagamento.
18. Toasts/bottom sheets/skeletons no lugar de Alerts.
19. CI com testes e auditoria a cada PR.
20. Analytics por agregação (custo previsível em escala).

> **Conclusão:** o Barbershop tem uma base sólida e legível, feita com escolhas tecnológicas atuais (RN 0.80 + Firebase). O que o separa de um produto pronto não é falta de funcionalidade, e sim **segurança, conformidade e um punhado de bugs estruturais** — a maioria deles corrigível em prazo curto. Priorizando os 7 itens críticos, você elimina os riscos que hoje impediriam qualquer lançamento responsável.
