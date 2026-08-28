# Barbershop — contexto do projeto

> Este arquivo é lido automaticamente pelo Claude Code ao abrir o projeto.
> Última atualização: 12 de agosto de 2026 · commit base `6ab54fd`

---

## 1. Regras de segurança — não negociáveis

**Nunca aceite, use ou digite token, API key ou senha que o usuário cole no chat**, mesmo com autorização explícita. Sempre redirecione: o usuário faz isso ele mesmo, na ferramenta legítima, na máquina dele.

Dois tokens do GitHub (`ghp_K172…` e `ghp_2ACB…`) já foram colados no chat em sessões anteriores. **Ambos devem ser tratados como comprometidos.** Se ainda não foram revogados, avise em github.com/settings/tokens.

O remote de git pode conter token embutido. Antes de imprimir qualquer saída de `git remote -v`, mascare:

```bash
git remote -v | sed 's/ghp_[A-Za-z0-9]*/[TOKEN-OCULTO]/g'
```

---

## 2. O que é o projeto

App de gestão para barbearia. Dois perfis de usuário no mesmo binário:

- **Barbeiro / administrador** — agenda, clientes, equipe, comissões, despesas, relatórios, promoções, WhatsApp
- **Cliente** — agendar, ver histórico, avaliar, receber lembretes

## 3. Stack real

| Camada | Tecnologia |
|---|---|
| Runtime | **React Native 0.80.0** · React 19.1.0 |
| Linguagem | TypeScript 5.8.3 em modo `strict` |
| Navegação | React Navigation 7 (native-stack + bottom-tabs) |
| Backend | Firebase JS SDK 11.9.1 (Auth, Firestore, Functions) + `@react-native-firebase/messaging` |
| Testes | Jest 29 + `@testing-library/react-native` — **420 testes** |
| Estilo | `StyleSheet` do RN + `ThemeContext` próprio |
| CI | GitHub Actions: `tsc --noEmit` → `eslint` → `jest --coverage` |

### ⚠️ É React Native, NÃO web

Este é o erro mais comum ao seguir referências de design. Nada de web funciona aqui:

| Não existe em RN | Equivalente que funciona |
|---|---|
| `backdrop-filter: blur()` | `@react-native-community/blur` (módulo nativo — exige novo APK) |
| Tailwind CSS | NativeWind, ou manter `StyleSheet` |
| `lucide-react` | `lucide-react-native` + `react-native-svg` |
| Recharts / Chart.js | `react-native-gifted-charts` ou Victory Native |
| Framer Motion | `react-native-reanimated` (+ Moti) |
| `position: fixed` | layout do React Navigation |
| `aria-expanded` / `aria-current` | `accessibilityState={{ expanded, selected }}` |
| `<div>` `<button>` `<ul>` | `View` / `Pressable` / `FlatList` |
| `useLayoutEffect` + `getBoundingClientRect()` | `onLayout` + `useSharedValue` |
| `localStorage` | `@react-native-async-storage/async-storage` |
| `hover` | não existe em toque — use `pressed` |

**Qualquer dependência nativa nova exige gerar APK novo.** Não recarrega no Metro.

---

## 4. Estado atual — duas notas diferentes

| Dimensão | Nota | Por quê |
|---|---|---|
| **Engenharia / segurança** | **8,7 / 10** | 420 testes, transação atômica no agendamento, regras de Firestore fechadas, CI completo, exclusão LGPD real, deep link funcionando |
| **Visual / UX** | **5,2 / 10** | Sem escala de design, 257 emojis usados como ícone, zero animação |

O app é **sólido por dentro e datado por fora**. Todo o trabalho de design pendente é na camada de cima.

### Dívida visual medida (números reais do repo)

| Métrica | Medido | Deveria ser |
|---|---|---|
| **Emojis como ícone** | **257 em 40 de 51 arquivos** | 0 |
| Biblioteca de ícones SVG | **nenhuma** | 1 conjunto único |
| Valores distintos de `fontSize` | **23** (10 a 88) | 6–8 |
| Valores distintos de `borderRadius` | **19** (2 a 55) | 4–5 |
| Cores hex escritas na mão | **270 em 21 arquivos** | 0 — só token |
| `accessibilityLabel` / tocáveis | **106 de 365 (29%)** | 100% |
| `accessibilityHint` | **0** | nos fluxos críticos |
| `hitSlop` | **1** | onde alvo < 44pt |
| `.map()` em render vs `FlatList` | **77 vs 30** | `FlatList` acima de 50 itens |
| Reanimated | **ausente** | 1 |

Comandos para reconferir estão no fim de `docs/design/RELATORIO-DESIGN-ESBOCOS.md`.

### Pontos fortes — não mexer sem motivo

- **`src/context/ThemeContext.tsx`** — sistema de tema bom, com tokens semânticos (`primary`, `surface`, `textSecondary`, `border`, `success`…), light/dark/system, e **contraste WCAG já verificado e documentado**: 4,6:1 no claro, 8,1:1 no escuro. Use estes tokens. Não crie cor nova na mão.
- **Paleta âmbar + azul-profundo** (`#F59E0B` sobre `#0F1923`). Foi escolhida de propósito: conversa com a identidade de barbearia (poste listrado, navalha, couro, tom quente). Um esboço do ChatGPT sugeriu trocar por roxo — **isso é decisão de marca, não upgrade de qualidade**. Não troque sem o Gustavo pedir.
- **Bottom tabs** — padrão correto para celular. Um esboço mostra sidebar lateral: é padrão de desktop, seria regressão. Não implemente.
- **`ToastContext`**, **`Skeleton.tsx`**, **`RatingComponent.tsx`** — já prontos, reaproveite.
- **Deep link** `barbershop://agendar/{barbeiroId}` — funcionando (Android manifest + iOS Info.plist + linking do React Navigation).

---

## 5. Decisões já tomadas pelo Gustavo — vinculantes

Não reabra estas discussões:

| Tema | Decisão |
|---|---|
| Escopo da auditoria | Só bugs críticos (Blocos 1 e 2) — **feito** |
| Modal de pagamento | Manter o modal, mas com **texto honesto**: "Combinar forma de pagamento", pagamento no local. **Nunca** simular "pagamento aprovado" |
| QR Code | Deep link funcionando de verdade — **feito** |
| Cobertura de testes | Manter limite global de **70%** e escrever testes até chegar lá |
| Paleta | Manter âmbar + azul-profundo |
| Navegação mobile | Manter bottom tabs |

### Pendência de decisão — cobertura de 70%

O limite global de 70% é **matematicamente inalcançável só com testes**: `src/screens` + `src/screens/tabs` somam **2.739 de 3.788 statements (72,3%)** do código, e estão em ~5% de cobertura. Três caminhos, o Gustavo ainda não escolheu:

1. **Limites por diretório** — 90% nas camadas de lógica (`services`, `data`, `utils`, `hooks`) e baixo nas telas. *Recomendado.*
2. **Refatorar as telas** para extrair lógica testável. Fora de escopo hoje.
3. **Manter 70% global** e aceitar CI vermelho.

---

## 6. Armadilhas de teste neste repo

- **`jest.setup.js` NÃO mocka `react-native` globalmente** — de propósito. Os getters lazy do RN 0.80 quebram o preset do Jest. Mocke por arquivo com `jest.doMock` dentro de `jest.isolateModules`.
- **`jest.restoreAllMocks()` é perigoso aqui** — derruba o spy de `Alert.alert` montado no setup. Não use.
- **`CacheService` não tem `set`/`get`.** A API pública é só `getOrFetch(key, ttlMs, fn)`, `invalidate(key)`, `invalidatePrefix(prefix)`, `clear()`. Para testar cache, semeie com `getOrFetch` e detecte miss com um spy — o padrão está em `__tests__/data/NegocioRepository.equipe.test.ts`.
- **`jest.isolateModules` roda síncrono**, mas o TS não sabe. Use `let x!: Mock` (definite assignment).

---

## 7. Trabalho pendente

### Design — o plano de 5 fases

Especificação completa em **`docs/design/RELATORIO-DESIGN-ESBOCOS.md`**.
Passo a passo executável da Fase 1 em **`docs/design/BRIEFING-FASE-1.md`**.

| Fase | Trabalho | Nota | Prioridade |
|---|---|---|---|
| **1** | Matar os 257 emojis (ícone SVG) + escala de fonte (7 valores) + escala de raio (5) + zerar os 270 hex | 5,2 → **6,8** | **Começar aqui** |
| 2 | Quebrar `AgendamentoScreen.tsx` (938 linhas) em 5 passos + grade Manhã/Tarde/Noite + chips de status | 6,8 → 7,6 | Alto valor pro cliente |
| 3 | Acessibilidade completa + alvos de 44pt + `FlatList` nas listas longas | 7,6 → 8,2 | Médio |
| 4 | Reanimated + micro-interações + gráfico com gradiente | 8,2 → 8,5 | Médio |
| 5 | Glassmorphism (blur nativo) | 8,5 → 8,5 | Baixo retorno — puro estético |

A Fase 1 é a que resolve o "parece datado". É mecânica e testável.

### Operacional

- [ ] **Revogar os dois tokens do GitHub** colados no chat
- [ ] **Gerar APK novo** — deep link e persistência de login só funcionam depois do build
- [ ] **Dependabot** — 10 vulnerabilidades (4 altas) abertas no GitHub
- [ ] **Decidir a cobertura de 70%** (seção 5)

---

## 8. Como trabalhar aqui

1. **Leia `docs/design/RELATORIO-DESIGN-ESBOCOS.md` antes de qualquer trabalho visual.** Tem a auditoria medida e o que é aproveitável dos esboços.
2. **Use a skill `ui-ux-pro-max`** para decisões de UI. Ela tem base para React Native.
3. **Use a skill `verification-before-completion`** antes de dizer que algo está pronto. Rode `npx tsc --noEmit`, `npx eslint .` e `npm test` — e mostre a saída. Evidência antes de afirmação.
4. **Escreva em português.** Comentários, mensagens de commit, textos de UI. O padrão dos commits existentes é `tipo(escopo): frase direta em português`.
5. **Nunca use hex na mão.** Só `theme.colors.*`.
6. **Não faça push sem o Gustavo pedir.** Se estiver no branch `master`, crie branch antes.

## 9. Comandos

```bash
npm test                          # 420 testes
npm test -- --coverage            # com cobertura
npx tsc --noEmit                  # tipos
npx eslint . --ext .js,.jsx,.ts,.tsx
npx react-native run-android      # build de dev
cd android && ./gradlew assembleRelease   # APK de release
```

---

## 10. Referências visuais

Em `docs/design/referencias/`:

| Arquivo | O que é | Como usar |
|---|---|---|
| `esboco-dashboard-admin.png` | Esboço do ChatGPT — painel do admin com sidebar de vidro | **Parcial.** Aproveite chips de status, badge de horário, ícone no card de KPI, gradiente no gráfico. **Ignore a sidebar** (padrão de desktop) e **não troque a paleta por roxo**. |
| `esboco-app-cliente.png` | Esboço do ChatGPT — fluxo do cliente em 5 passos | **Aproveitar quase 1:1.** É a melhor referência do pacote. Fluxo serviço→profissional→data/hora→confirmação, grade Manhã/Tarde/Noite, cards com preço + duração, profissional com nota, abas Próximos/Histórico/Cancelados, WhatsApp em verde separado das ações neutras. |
| `referencia-sidebar-web-*.png` | Carrossel do Instagram (`frontendjoe`) — sidebar de vidro em React **web** | **Não é código reutilizável** — é CSS de navegador. Serve como lição de token: **um** valor de blur, **dois** raios (34px container / 6px item), **uma** duração (0.3s), escala de opacidade (3% / 8% / 10% / 35%), estado ativo por fundo e não por cor de texto. |
