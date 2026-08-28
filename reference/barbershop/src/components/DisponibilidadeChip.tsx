/**
 * DisponibilidadeChip — pill de disponibilidade ("Hoje" / "Disponível
 * amanhã") para o card de profissional na vitrine do cliente.
 *
 * Estrutura preparada para a Fase futura que vai calcular `status` via
 * Cloud Function; por enquanto todo mundo recebe `status={null}` e o
 * componente não renderiza nada.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, type Theme } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';

interface DisponibilidadeChipProps {
  status?: 'hoje' | 'amanha' | null;
}

export default function DisponibilidadeChip({ status }: DisponibilidadeChipProps) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  if (!status) {
    return null;
  }

  const cor = status === 'hoje' ? theme.colors.success : theme.colors.info;
  const texto = status === 'hoje' ? 'Hoje' : 'Disponível amanhã';

  return (
    <View style={[s.badge, { backgroundColor: cor }]}>
      <Text style={s.texto}>{texto}</Text>
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      borderRadius: raio.chip,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    texto: {
      fontSize: tipografia.micro.fontSize,
      fontWeight: '600',
      color: theme.isDark ? theme.colors.background : theme.colors.surface,
    },
  });
