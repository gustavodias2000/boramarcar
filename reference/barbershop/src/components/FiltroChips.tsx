/**
 * FiltroChips — linha horizontal de chips para filtrar a vitrine de
 * profissionais por tipo de serviço (Fase 2 do redesign de ClienteHome).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, type Theme } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';

export const CHIPS = ['Todos', 'Corte', 'Barba', 'Combos'] as const;
export type ChipFiltro = (typeof CHIPS)[number];

interface FiltroChipsProps {
  ativo: string;
  onSelecionar: (chip: string) => void;
}

export default function FiltroChips({ ativo, onSelecionar }: FiltroChipsProps) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const corTextoSelecionado = theme.isDark ? theme.colors.background : theme.colors.surface;

  return (
    <View style={s.container}>
      {CHIPS.map((chip) => {
        const selecionado = chip === ativo;
        return (
          <TouchableOpacity
            key={chip}
            style={[s.chip, selecionado ? s.chipAtivo : s.chipInativo]}
            accessibilityRole="button"
            accessibilityState={{ selected: selecionado }}
            accessibilityLabel={
              chip === 'Todos' ? 'Mostrar todos os profissionais' : `Filtrar por ${chip}`
            }
            onPress={() => onSelecionar(chip)}
          >
            <Text
              style={[
                s.chipTexto,
                selecionado ? { color: corTextoSelecionado } : { color: theme.colors.textSecondary },
              ]}
            >
              {chip}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      minHeight: 36,
      borderRadius: raio.circulo,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
    },
    chipAtivo: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    chipInativo: {
      backgroundColor: theme.colors.surfaceVariant,
      borderColor: theme.colors.border,
    },
    chipTexto: {
      fontSize: tipografia.micro.fontSize,
      fontWeight: '600',
    },
  });
