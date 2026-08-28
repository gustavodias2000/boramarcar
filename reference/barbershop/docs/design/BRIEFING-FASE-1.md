# Briefing executável — Fase 1: matar a dívida visual

**Meta:** nota visual de **5,2 → 6,8** sem tocar em nenhuma regra de negócio.
**Natureza do trabalho:** mecânico, verificável, reversível. Nenhuma lógica muda.
**Pré-requisito:** ler `RELATORIO-DESIGN-ESBOCOS.md` e a seção 4 de `CLAUDE.md`.

---

## Por que esta fase primeiro

É a única fase onde o ganho de nota vem de trabalho **mecânico e testável**, não de decisão de gosto. E resolve a causa raiz do "parece datado": o app usa **257 emojis do sistema operacional** no lugar de ícones, e não tem escala nenhuma de tipografia ou de raio.

Efeito colateral bom: depois desta fase, as Fases 2 a 5 ficam muito mais rápidas, porque passa a existir um vocabulário visual para construir em cima.

---

## Entregável 1 — Substituir os 257 emojis por ícones SVG

### Instalação

```bash
npm install react-native-svg lucide-react-native
cd ios && pod install && cd ..     # só se for buildar iOS
```

⚠️ `react-native-svg` é módulo nativo. **Exige APK novo.** Agrupe com o build que já está pendente do deep link.

### Criar o componente único de ícone

`src/components/Icone.tsx` — ponto único de entrada. Ninguém importa de `lucide-react-native` direto.

Requisitos:

- Recebe `nome`, `tamanho` (default 20), `cor` (default `theme.colors.text`)
- Puxa cor do `ThemeContext` quando `cor` não vem
- Tamanhos vindos da escala: `16` / `20` / `24` / `32`. Nada fora disso.
- `strokeWidth` fixo em `2` no app inteiro — regra `icon-style-consistent`
- Aceita `accessibilityLabel`; quando o ícone é decorativo ao lado de texto, marcar `accessibilityElementsHidden`

### Mapa de substituição

Inventário real (57 emojis distintos, 257 ocorrências). Traduzir assim:

| Emoji | Ocorr. | Ícone Lucide | Contexto |
|---|---|---|---|
| 📅 | 21 | `Calendar` | agenda, data |
| ✂ | 16 | `Scissors` | serviço de corte |
| 💈 | 9 | `Store` ou logo próprio | identidade da barbearia |
| ✅ | 9 | `CheckCircle2` | confirmado |
| ✓ | 7 | `Check` | seleção |
| 👋 | 7 | *remover* | saudação — texto basta |
| 🔄 | 7 | `RefreshCw` | recarregar, recorrência |
| 🎂 | 6 | `Cake` | aniversariantes |
| 🕐 | 5 | `Clock` | horário |
| 🗑 | 5 | `Trash2` | excluir |
| 💬 | 5 | `MessageCircle` | WhatsApp, mensagem |
| 🚫 | 5 | `Ban` | cliente banido, bloqueio |
| 📋 | 4 | `ClipboardList` | lista, histórico |
| 🧑 👤 👨 | 9 | `User` | pessoa |
| 👥 | 3 | `Users` | equipe, clientes |
| ☀ | 3 | `Sun` | tema claro |
| 🌙 🌗 | 5 | `Moon` | tema escuro |
| 🏷 | 3 | `Tag` | preço, categoria |
| ⚠ | 3 | `AlertTriangle` | aviso |
| 🙏 | 3 | *remover* | ruído |
| 🔔 | 3 | `Bell` | notificação |
| ✏ | 3 | `Pencil` | editar |
| 🔒 🔑 | 4 | `Lock` / `KeyRound` | segurança, senha |
| 🚀 | 3 | *remover* | ruído |
| ⚙ | 2 | `Settings` | configuração |
| 📊 📈 | 3 | `BarChart3` / `TrendingUp` | relatório |
| 💰 💸 💳 | 5 | `Wallet` / `Banknote` / `CreditCard` | financeiro |
| 🗓 | 2 | `CalendarDays` | agenda mensal |
| ✉ 📩 | 3 | `Mail` | e-mail |
| 📍 | 2 | `MapPin` | endereço |
| 💼 | 2 | `Briefcase` | profissional |
| 📣 | 2 | `Megaphone` | promoção |
| 📱 📵 | 3 | `Smartphone` | telefone |
| 📇 | 2 | `Contact` | contatos |
| 🤝 | 2 | `Handshake` | comissão |
| 🔲 | 2 | `QrCode` | QR Code |
| 🎉 | 2 | `PartyPopper` | sucesso |
| ❓ | 2 | `HelpCircle` | suporte |
| 🚪 | 2 | `LogOut` | sair |
| ⭐ | 1 | `Star` | avaliação |
| 🏠 | 1 | `Home` | início |
| ✕ ❌ | 2 | `X` | fechar, erro |
| 🚧 | 1 | `Construction` | em obra |
| 😊 💪 🔥 👍 🙈 | 5 | *remover* | ruído decorativo |
| 📄 | 1 | `FileText` | documento |
| 👁 | 1 | `Eye` | mostrar senha |

**Regra:** emoji que é **decoração** (👋 🙏 🚀 😊 💪 🔥 👍) some. Não vira ícone. Emoji que é **função** vira ícone SVG.

### Critério de aceite

```bash
# tem que retornar 0
python3 -c "
import re, pathlib
e = re.compile('[\U0001F000-\U0001FAFF☀-➿⬀-⯿]')
n = sum(len(e.findall(p.read_text(encoding='utf-8'))) for p in pathlib.Path('src').rglob('*.tsx'))
print('emojis restantes:', n)
"
```

---

## Entregável 2 — Escala de tipografia

Hoje: **23 valores diferentes** de `fontSize`, de 10 a 88. É ruído, não hierarquia.

Criar `src/theme/escala.ts` com **7 níveis**, mapeados dos usos reais (13, 14 e 16 concentram 258 das ocorrências):

| Token | px | Peso | Uso |
|---|---|---|---|
| `display` | 32 | 700 | número grande de KPI |
| `titulo` | 24 | 700 | título de tela |
| `subtitulo` | 20 | 600 | seção |
| `corpoForte` | 16 | 600 | rótulo, botão |
| `corpo` | 16 | 400 | texto padrão — **mínimo em mobile**, evita zoom automático do iOS |
| `apoio` | 14 | 400 | secundário, legenda |
| `micro` | 12 | 500 | chip, badge, timestamp |

**Nada abaixo de 12.** Hoje existe um `fontSize: 10` — subir para 12.
`lineHeight` de 1,5 em todo texto corrido.

### Critério de aceite

```bash
# tem que listar no máximo 7 valores distintos
grep -rhoP "fontSize:\s*\d+" src --include=*.tsx | grep -oP "\d+" | sort -n | uniq -c
```

---

## Entregável 3 — Escala de raio e de espaçamento

Hoje: **19 valores** de `borderRadius`, de 2 a 55.

Reduzir a **5** (os usos reais concentram em 8, 10 e 12 — 149 ocorrências):

| Token | px | Uso |
|---|---|---|
| `raio.chip` | 6 | chip, badge, tag |
| `raio.input` | 10 | campo, botão |
| `raio.card` | 14 | card, seção |
| `raio.modal` | 20 | modal, bottom sheet |
| `raio.circulo` | 999 | avatar, FAB |

Espaçamento na escala de **4pt**: `4 / 8 / 12 / 16 / 24 / 32 / 48`. Nada fora disso.

### Critério de aceite

```bash
# no máximo 5 valores (+ 999)
grep -rhoP "borderRadius:\s*\d+" src --include=*.tsx | grep -oP "\d+" | sort -n | uniq -c
```

---

## Entregável 4 — Zerar as 270 cores hex escritas na mão

Estão em 21 dos 51 arquivos. O `ThemeContext` já tem todos os tokens semânticos necessários (`primary`, `surface`, `surfaceVariant`, `text`, `textSecondary`, `textMuted`, `border`, `borderLight`, `success`, `warning`, `error`, `info`).

Mapear cada hex para o token mais próximo. Se algum hex não tiver token correspondente, **isso é um sinal de que falta um token** — adicione ao `ThemeContext` nas duas variantes (light e dark) e **verifique o contraste**, não invente.

Única exceção tolerada: `shadowColor: '#000'`, que não faz parte da paleta. Melhor ainda: virar `theme.colors.sombra`.

### Critério de aceite

```bash
# tem que retornar 0 (fora shadowColor)
grep -rn "#[0-9a-fA-F]\{6\}\|#[0-9a-fA-F]\{3\}\b" src --include=*.tsx | grep -v shadowColor
```

---

## Verificação obrigatória antes de dizer que acabou

Aplicar a skill `verification-before-completion`. Rodar e **mostrar a saída real**:

```bash
npx tsc --noEmit                                  # zero erro
npx eslint . --ext .js,.jsx,.ts,.tsx              # zero erro
npm test                                          # os 420 continuam verdes
```

Mais os 4 critérios de aceite acima. **Nenhum teste deve precisar de alteração** — se um teste quebrou, a mudança saiu do escopo visual e entrou na lógica. Reverta.

### Checklist visual em aparelho real

- [ ] Tema claro e tema escuro nas telas principais
- [ ] Nenhum ícone com cor fora do tema
- [ ] Nenhum ícone com tamanho fora da escala
- [ ] TalkBack ligado: nenhum ícone lido como "tesoura" ou "poste de barbeiro"
- [ ] Fonte do sistema em 200%: nada truncado ou sobreposto

---

## Fronteira do escopo — o que NÃO fazer nesta fase

- Não quebrar `AgendamentoScreen.tsx` — é Fase 2
- Não instalar Reanimated — é Fase 4
- Não instalar blur / glassmorphism — é Fase 5, e é a de menor retorno
- Não trocar a paleta âmbar por roxo — decisão de marca, o Gustavo mantém o âmbar
- Não implementar sidebar lateral — padrão de desktop, seria regressão em mobile
- Não mexer em nenhum service, repository ou regra de Firestore

---

## Commits sugeridos

Em português, no padrão do repo:

```
feat(design): componente Icone único sobre lucide-react-native
refactor(design): trocar os 257 emojis por ícones SVG
feat(design): escala de tipografia com 7 níveis
feat(design): escala de raio e espaçamento em 4pt
refactor(design): eliminar as 270 cores hex fora do token
```

Trabalhe em branch (`design/fase-1`). **Não faça push sem o Gustavo pedir.**
