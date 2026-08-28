/**
 * ThemeSelector — seletor de tema (claro / escuro / sistema).
 *
 * CORREÇÃO (migração TS): antes era um Modal que exigia props
 * `visible`/`onClose`, mas era usado inline no PerfilScreen sem props —
 * bug latente. Agora renderiza inline, que é como a tela o utiliza.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, type Theme, type ThemeMode } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';
import Icone, { type NomeIcone } from './Icone';

interface ThemeOption {
  key: ThemeMode;
  label: string;
  icone: NomeIcone;
}

const THEME_OPTIONS: ThemeOption[] = [
  { key: 'light', label: 'Claro', icone: 'tema-claro' },
  { key: 'dark', label: 'Escuro', icone: 'tema-escuro' },
  { key: 'system', label: 'Sistema', icone: 'configuracao' },
];

export default function ThemeSelector() {
  const { theme, themeMode, toggleTheme } = useTheme();
  const s = getStyles(theme);

  return (
    <View>
      {THEME_OPTIONS.map((option) => {
        const selected = themeMode === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            style={[s.optionButton, selected && s.selectedOption]}
            accessibilityRole="radio"
            accessibilityLabel={`Tema ${option.label}`}
            accessibilityState={{ selected }}
            onPress={() => toggleTheme(option.key)}
          >
            <View style={s.optionIcon}>
              <Icone nome={option.icone} tamanho={20} decorativo />
            </View>
            <Text style={[s.optionText, selected && s.selectedOptionText]}>
              {option.label}
            </Text>
            {selected ? <Icone nome="check" tamanho={16} cor={theme.colors.primary} decorativo /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    optionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: raio.input,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceVariant,
      minHeight: 48,
    },
    selectedOption: {
      backgroundColor: theme.colors.primary + '20',
      borderColor: theme.colors.primary,
    },
    optionIcon: {
      marginRight: 12,
    },
    optionText: {
      flex: 1,
      fontSize: tipografia.corpo.fontSize,
      color: theme.colors.text,
    },
    selectedOptionText: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
  });
