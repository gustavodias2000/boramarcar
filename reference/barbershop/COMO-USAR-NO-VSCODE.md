# Como usar este pacote no VS Code

## 1. Extrair na raiz do projeto

Extraia o zip dentro de `D:\claude\barbershop`. A estrutura final:

```
D:\claude\barbershop\
├── CLAUDE.md                          ← lido automaticamente pelo Claude Code
├── docs\
│   └── design\
│       ├── RELATORIO-DESIGN-ESBOCOS.md
│       ├── BRIEFING-FASE-1.md
│       └── referencias\               ← salve as imagens aqui
├── src\
├── package.json
└── ...
```

`CLAUDE.md` vai na **raiz**, no mesmo nível do `package.json`. É esse nome e esse lugar que fazem o Claude Code carregar o arquivo sozinho, em toda sessão, sem você pedir.

## 2. Salvar as imagens

O Claude Code **lê imagem** — mas só se o arquivo estiver na pasta do projeto. Salve as duas do ChatGPT em `docs\design\referencias\` com estes nomes exatos (o `CLAUDE.md` referencia por nome):

| Imagem | Nome do arquivo |
|---|---|
| Esboço do painel admin (sidebar de vidro, comparação atual vs novo) | `esboco-dashboard-admin.png` |
| Esboço do app do cliente (fluxo de 5 passos) | `esboco-app-cliente.png` |

As 6 telas do Instagram são **opcionais** — o relatório já extraiu a lição delas e o código é web, não reutilizável. Se quiser guardar, use `referencia-sidebar-web-1.png` a `referencia-sidebar-web-6.png`.

## 3. Abrir e testar

Abra a pasta no VS Code, rode `claude` no terminal integrado e mande:

```
Leia o CLAUDE.md e o docs/design/BRIEFING-FASE-1.md.
Me diga em que pé está o projeto e o que é a Fase 1.
```

Se ele responder citando os **257 emojis**, os **23 valores de fontSize** e a diferença entre a nota 8,7 de engenharia e a 5,2 de visual, o contexto carregou certo.

## 4. Começar a trabalhar

```
Execute a Fase 1 do docs/design/BRIEFING-FASE-1.md.
Comece pelo Entregável 1 — o componente Icone e a substituição dos emojis.
Trabalhe no branch design/fase-1.
```

Os 4 entregáveis têm critério de aceite em comando de terminal, então ele consegue provar que terminou em vez de só afirmar.

---

## O que cada arquivo faz

| Arquivo | Função |
|---|---|
| **`CLAUDE.md`** | Carregado automaticamente. Stack real, a tabela do que é web e não roda em RN, as duas notas, a dívida medida, suas decisões vinculantes, as armadilhas de teste, as regras de segurança. É o que substitui "entender nossa conversa". |
| **`docs/design/RELATORIO-DESIGN-ESBOCOS.md`** | O relatório completo. Análise dos dois esboços, o que aproveitar e o que é armadilha, cálculo aberto das notas, plano de 5 fases. |
| **`docs/design/BRIEFING-FASE-1.md`** | Ordem de serviço da Fase 1. Mapa emoji→ícone dos 57 emojis, escala de tipografia, escala de raio, eliminação dos hex — cada um com critério de aceite verificável. |

## Manutenção

`CLAUDE.md` é vivo. Quando fechar a Fase 1, atualize a nota e marque a fase como feita. Ele é a memória do projeto entre sessões — vale mais atualizado do que perfeito.

## Aviso

Nada neste pacote contém token, senha ou credencial. Se em algum momento uma sessão pedir para você colar token no chat, não cole — a regra está registrada na seção 1 do `CLAUDE.md`. Os dois tokens do GitHub que passaram pelo chat continuam pendentes de revogação em github.com/settings/tokens.
