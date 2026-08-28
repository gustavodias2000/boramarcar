/**
 * BadgeContagemServicos — pill pequeno "N serviços" exibido no card hero
 * de profissional solo (Fase 2 do redesign de ClienteHome).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, type Theme } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';

interface BadgeContagemServicosProps {
  count?: number;
  /** true quando o badge fica sobreposto a uma foto (card hero da vitrine) —
   * troca para um pill translúcido com texto âmbar, fixo, independente do
   * tema claro/escuro do app: o fundo aqui é sempre a foto escurecida por um
   * scrim fixo, não `theme.colors.surface`, então as cores do tema (que
   * ficam escuras no modo claro) perderiam contraste. */
  sobreFoto?: boolean;
}

export default function BadgeContagemServicos({ count, sobreFoto }: BadgeContagemServicosProps) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  if (!count) {
    return null;
  }

  return (
    <View
      style={[s.badge, sobreFoto && s.badgeSobreFoto]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[s.texto, sobreFoto && s.textoSobreFoto]}>
        {count} {count === 1 ? 'serviço' : 'serviços'}
      </Text>
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.surfaceVariant,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: raio.chip,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 4,
    },
    texto: {
      fontSize: tipografia.micro.fontSize,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    badgeSobreFoto: {
      backgroundColor: 'rgba(61,39,25,0.75)',
      borderColor: 'rgba(232,169,123,0.4)',
    },
    textoSobreFoto: {
      color: '#E8A97B',
    },
  });
