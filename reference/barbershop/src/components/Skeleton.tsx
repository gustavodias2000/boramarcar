/**
 * Skeleton — placeholders animados de carregamento (item 17 da auditoria).
 * Substitui o spinner de tela cheia por "fantasmas" do conteúdo, padrão
 * moderno (Facebook/LinkedIn) que reduz a percepção de espera.
 *
 * Sem dependências externas: usa apenas Animated do próprio React Native.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Animated,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type DimensionValue,
} from 'react-native';
import { useTheme, type Theme } from '../context/ThemeContext';
import { raio } from '../theme/escala';

interface SkeletonBlockProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Bloco básico pulsante.
 */
/**
 * Cor do bloco fantasma. No tema claro, `surfaceVariant` (usado pelo card
 * que envolve o skeleton) já rende ~1.66:1 contra `surface` — suficiente
 * para um placeholder de loading, então é reaproveitada. No tema escuro,
 * depois do ajuste de contraste geral em ThemeContext.tsx, `surfaceVariant`
 * ficou mais clara (para abrir espaço contra `background`) e passou a
 * render só ~1.35:1 contra `surface` — baixo demais até para um "fantasma".
 * Por isso o escuro usa uma cor própria (não deriva de `surfaceVariant`),
 * calibrada para ~1.7:1 contra `surface`.
 */
const SKELETON_BLOCK_COLOR_DARK = '#435161';

export function SkeletonBlock({
  width = '100%',
  height = 16,
  radius = raio.chip,
  style,
}: SkeletonBlockProps) {
  const { theme } = useTheme();
  const skeletonColor = theme.isDark ? SKELETON_BLOCK_COLOR_DARK : theme.colors.surfaceVariant;
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: skeletonColor,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * Card fantasma no formato dos cards de barbeiro/agendamento.
 *
 * `variant="solo"` reflete o card "hero" do profissional solo (modelo de
 * foto de capa em tela cheia, ver `ClienteHome.tsx` / `renderProfissionalHero`):
 * um único bloco pulsante do tamanho do card inteiro — sugere "carregando
 * foto grande", já que no layout real o texto fica sobreposto à foto, e não
 * mais numa faixa separada abaixo dela. Altura precisa bater com
 * `heroCard.height` em `ClienteHome.tsx` (hoje 250). `variant="equipe"`
 * (padrão) mantém o layout compacto original — avatar + linhas de texto
 * lado a lado.
 */
export function SkeletonCard({ variant = 'equipe' }: { variant?: 'solo' | 'equipe' }) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  if (variant === 'solo') {
    return (
      <View style={s.cardSolo}>
        <SkeletonBlock height={250} radius={0} />
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.row}>
        <SkeletonBlock width={50} height={50} radius={raio.circulo} />
        <View style={s.lines}>
          <SkeletonBlock width="60%" height={16} />
          <SkeletonBlock width="40%" height={12} style={styles.mt8} />
          <SkeletonBlock width="30%" height={12} style={styles.mt8} />
        </View>
      </View>
      <SkeletonBlock height={40} radius={raio.input} style={styles.mt14} />
    </View>
  );
}

/**
 * Lista de N cards fantasmas — usada enquanto as telas carregam.
 */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View accessibilityLabel="Carregando conteúdo" accessibilityRole="progressbar">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  mt8: { marginTop: 8 },
  mt14: { marginTop: 14 },
});

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 16,
      borderRadius: raio.card,
    },
    cardSolo: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginVertical: 8,
      borderRadius: raio.card,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    lines: {
      flex: 1,
      marginLeft: 12,
    },
  });
