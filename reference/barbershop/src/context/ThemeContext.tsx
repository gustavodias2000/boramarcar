import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  surfaceVariant: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderLight: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  // Tokens de banner (UI-001 — auditoria de tema, onda 7): fundo/borda/texto
  // pensados para permanecer legíveis nos dois temas, ao contrário de cor
  // hexadecimal fixa direto na tela (que em modo escuro vira uma caixa clara
  // "grudada" sobre o resto da UI escura). Só existem os pares para os tipos
  // de banner realmente encontrados nas telas auditadas (aviso/dica em
  // amarelo-âmbar, informativo em azul); não crie um par "success"/"error"
  // sem uma tela que precise dele.
  bannerWarningBackground: string;
  bannerWarningBorder: string;
  bannerWarningText: string;
  bannerInfoBackground: string;
  bannerInfoText: string;
  // Token de borda dedicado ao header de tela (UI-002): `border` genérico é
  // reaproveitado em ~90 lugares (inputs, chips, divisores de lista) e não
  // pode ganhar mais contraste sem risco de regressão visual espalhada por
  // dezenas de telas fora desta onda. `headerBorder` é mais escuro/claro que
  // `border` propositalmente, só para a linha que separa o header do
  // conteúdo abaixo, onde o contraste baixo era perceptível.
  headerBorder: string;
  // Cor de sombra (Fase 1 — dívida visual, BRIEFING-FASE-1.md): única
  // exceção tolerada ao "nunca hex direto na tela" — `shadowColor` não faz
  // parte da paleta de marca, é sempre preto nos dois temas (sombra não
  // muda com claro/escuro, sombra é sempre escura por natureza). Vira token
  // mesmo assim para não sobrar NENHUM hex literal em tela.
  sombra: string;
  // Verde oficial do WhatsApp, usado nos botões de contato/notificação via
  // WhatsApp (CLAUDE.md: "WhatsApp em verde separado das ações neutras") —
  // é cor de marca de terceiro, não da paleta âmbar+azul do app, por isso
  // fixa nos dois temas. ATENÇÃO: branco sobre este verde mede ~2:1 de
  // contraste — abaixo do mínimo WCAG AA (3:1 mesmo para texto grande).
  // Pré-existente a este token (só consolida hex espalhados em um só
  // lugar); não corrigido aqui porque mudar a cor de marca do WhatsApp
  // está fora do escopo da Fase 1. Repassar para a Fase 3 (acessibilidade).
  whatsapp: string;
  // Paleta categórica para gráfico de "vendas por serviço"
  // (VendasRelatorioScreen): cores arbitrárias só para diferenciar barras/
  // legendas visualmente (não são par texto×fundo, não carregam significado
  // semântico como success/warning/error), por isso ficam fixas nos dois
  // temas — igual a `whatsapp`/`sombra`. As 3 primeiras cores da paleta já
  // vêm de `info`/`primary`/`success`; estas completam a sequência quando
  // há mais de 3 serviços.
  graficoRoxo: string;
  graficoRosa: string;
  graficoVerdeAgua: string;
  // Texto/ícone sobre o botão `primary`/`secondary` (âmbar) — todos os
  // grupos da Fase 1 bateram nesse mesmo gap (nenhum token "onPrimary"
  // existia) e documentaram a mesma exceção isoladamente; consolidado aqui.
  // Preto, não branco: âmbar é claro/médio demais para branco render bem —
  // medido: preto sobre primary(light) 6.59:1, sobre primary(dark) 9.78:1
  // (ambos acima do mínimo AA de 4.5:1). Fixo nos dois temas porque o botão
  // âmbar não muda de tom entre claro/escuro o bastante pra precisar de dois
  // valores.
  textSobrePrimaria: string;
  // Texto/ícone sobre fundo saturado que NÃO é o âmbar (error/success/info/
  // whatsapp) — branco. ATENÇÃO: mede bem no tema claro (error 4.83:1,
  // success 3.77:1, info 5.17:1 — todos acima do mínimo AA-grande de 3:1),
  // mas cai abaixo do mínimo no tema escuro em pelo menos dois casos
  // (success-dark 2.54:1, info-dark 2.54:1) porque as variantes de acento do
  // tema escuro são mais claras/saturadas. Pré-existente à criação deste
  // token (só consolida hex espalhados por ~40 arquivos); não corrigido aqui
  // porque re-balancear as cores de acento do tema escuro é decisão maior
  // que o escopo da Fase 1. Repassar para a Fase 3 (acessibilidade).
  textSobreDestaque: string;
}

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  isDarkMode: boolean;
  themeMode: ThemeMode;
  toggleTheme: (mode: ThemeMode) => Promise<void>;
}

// ─── Temas ───────────────────────────────────────────────────────────────────

// ─── Paleta: Azul Profundo + Âmbar ───────────────────────────────────────────
// Light: âmbar escuro (#D97706) sobre branco — contraste 4.6:1 (WCAG AA)
// Dark : âmbar claro (#F59E0B) sobre azul-escuro (#1A2735) — contraste 8.1:1

export const lightTheme: Theme = {
  isDark: false,
  colors: {
    primary: '#D97706',          // âmbar escuro — contraste suficiente em fundo claro
    secondary: '#92400E',        // âmbar profundo
    // background/surface/surfaceVariant/textMuted ajustados (auditoria de
    // contraste WCAG 1.4.11): os tons originais eram quase idênticos entre
    // si (~1.05-1.10:1). Valores abaixo dão mais respiro na mesma família
    // cinza-azulada (slate), sem tocar em primary/secondary/text/
    // textSecondary. `background` não desce mais que isto para não colidir
    // com o contraste de `primary` (âmbar) usado sozinho sobre o fundo (ex.:
    // botões-texto/CTAs com borda, sem card por baixo); `surfaceVariant` não
    // desce mais que isto para não derrubar o contraste de `textSecondary`
    // usado em chips/filtros que têm `surfaceVariant` como fundo.
    background: '#E9EAEB',       // cinza-azulado perceptível (era #F8FAFC)
    surface: '#FFFFFF',
    surfaceVariant: '#C6C9CD',   // tom intermediário, distinto de surface (era #F1F5F9)
    text: '#0F172A',             // quase-preto azulado
    textSecondary: '#475569',    // slate-600 — 7.5:1 sobre branco
    textMuted: '#575D6A',        // mais escuro que antes — ~4:1 sobre surfaceVariant (era #94A3B8)
    border: '#CBD5E1',
    borderLight: '#E2E8F0',
    success: '#059669',
    warning: '#D97706',
    error: '#DC2626',
    info: '#2563EB',
    // Banner de aviso/dica (âmbar) — igual ao hex que já estava fixo em
    // AgendamentoScreen/PerfilProfissionalScreen (mantido: já tinha 6.37:1
    // de contraste texto×fundo) e agora também usado por QRCodeScreen, que
    // usava um âmbar ligeiramente diferente (#fefce8/#eab308/#713f12) para
    // o mesmo tipo de aviso — unificado num só par de tokens.
    bannerWarningBackground: '#FEF3C7',
    bannerWarningBorder: '#F59E0B',
    bannerWarningText: '#92400E',   // 6.37:1 sobre bannerWarningBackground
    // Banner informativo (azul) — igual ao hex já usado em
    // TemplatesMensagemScreen.
    bannerInfoBackground: '#EFF6FF',
    bannerInfoText: '#374151',      // 9.47:1 sobre bannerInfoBackground
    // Header — mais escuro que `border` (#CBD5E1, 1.48:1 contra `surface`)
    // para separar visivelmente o header do conteúdo abaixo.
    headerBorder: '#7C8CA0',        // 3.43:1 contra surface (#FFFFFF)
    sombra: '#000000',
    whatsapp: '#25D366',
    graficoRoxo: '#9B59F6',
    graficoRosa: '#FF5C8A',
    graficoVerdeAgua: '#17C3B2',
    textSobrePrimaria: '#000000',
    textSobreDestaque: '#FFFFFF',
  },
};

export const darkTheme: Theme = {
  isDark: true,
  colors: {
    primary: '#F59E0B',          // âmbar — cor de destaque principal
    secondary: '#FCD34D',        // âmbar claro
    // Mesmo ajuste de contraste do tema claro (ver comentário acima), na
    // mesma família azul-profunda já usada aqui: background um pouco mais
    // escuro, surface e surfaceVariant um pouco mais claros, sem perder a
    // identidade escura da marca. `surfaceVariant` não sobe mais que isto
    // para não derrubar o contraste de `textSecondary` sobre chips/filtros.
    background: '#0C141C',       // azul profundo quase-preto (era #0F1923)
    surface: '#232E39',          // cards e modais (era #1A2735)
    surfaceVariant: '#354251',   // inputs e variantes (era #1F3144)
    text: '#F8FAFC',             // branco-azulado
    textSecondary: '#94A3B8',    // slate-400 — 7.2:1 sobre surface
    textMuted: '#9DA1A4',        // mais claro que antes — ~4:1 sobre surfaceVariant (era #5C7A96)
    border: '#2A3F54',
    borderLight: '#1F3347',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#60A5FA',
    // Banner de aviso/dica no escuro: fundo âmbar-carvão (distinto de
    // surface/surfaceVariant, que são azul-acinzentados) com borda igual à
    // `warning` do tema escuro e texto âmbar claro — nunca a cor clara fixa
    // do tema claro (essa é exatamente a falha que este token corrige).
    bannerWarningBackground: '#3A2A0F',
    bannerWarningBorder: '#F59E0B',
    bannerWarningText: '#FCD34D',   // 9.59:1 sobre bannerWarningBackground
    // Banner informativo no escuro: mesma lógica, família azul.
    bannerInfoBackground: '#122A43',
    bannerInfoText: '#BFDBFE',      // 10.28:1 sobre bannerInfoBackground
    // Header — mais claro que `border` (#2A3F54, 1.27:1 contra `surface`).
    headerBorder: '#6483A3',        // 3.50:1 contra surface (#232E39)
    sombra: '#000000',
    whatsapp: '#25D366',
    graficoRoxo: '#9B59F6',
    graficoRosa: '#FF5C8A',
    graficoVerdeAgua: '#17C3B2',
    textSobrePrimaria: '#000000',
    textSobreDestaque: '#FFFFFF',
  },
};

// ─── Contexto ────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');

  useEffect(() => {
    loadThemePreference();

  }, []);

  useEffect(() => {
    if (themeMode === 'system') {
      setIsDarkMode(systemColorScheme === 'dark');
    }
  }, [systemColorScheme, themeMode]);

  const loadThemePreference = async () => {
    try {
      const savedTheme = (await AsyncStorage.getItem('themeMode')) as ThemeMode | null;
      if (savedTheme) {
        setThemeMode(savedTheme);
        if (savedTheme !== 'system') {
          setIsDarkMode(savedTheme === 'dark');
        }
      }
    } catch (error) {
      console.error('Erro ao carregar preferência de tema:', error);
    }
  };

  const toggleTheme = async (mode: ThemeMode) => {
    try {
      setThemeMode(mode);
      await AsyncStorage.setItem('themeMode', mode);

      if (mode === 'light') {
        setIsDarkMode(false);
      } else if (mode === 'dark') {
        setIsDarkMode(true);
      } else {
        setIsDarkMode(systemColorScheme === 'dark');
      }
    } catch (error) {
      console.error('Erro ao salvar preferência de tema:', error);
    }
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, themeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  }
  return context;
};
