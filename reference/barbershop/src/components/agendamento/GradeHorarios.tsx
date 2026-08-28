/**
 * GradeHorarios — seção "Selecione o Horário" de AgendamentoScreen, extraída
 * para arquivo próprio (Fase 2 do plano de design). Agrupa os horários
 * disponíveis em Manhã/Tarde/Noite (agruparPorPeriodo) em vez da lista única
 * de antes — cada bloco só aparece se tiver pelo menos 1 horário.
 *
 * Mantém exatamente os mesmos testID/accessibilityLabel/accessibilityState/
 * textos do bloco original: é troca de agrupamento visual, não de conteúdo.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme, type Theme } from '../../context/ThemeContext';
import { tipografia, raio } from '../../theme/escala';
import { agruparPorPeriodo } from '../../utils/agendaSlots';

interface GradeHorariosProps {
  availableTimes: string[];
  selectedTime: string | null;
  loadingHorarios: boolean;
  selectedDate: string;
  todayStr: string;
  waitlistJoined: boolean;
  onSelectTime: (time: string) => void;
  onEntrarFila: () => void;
}

const ROTULO_PERIODO: Record<'manha' | 'tarde' | 'noite', string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
};

export default function GradeHorarios({
  availableTimes,
  selectedTime,
  loadingHorarios,
  selectedDate,
  todayStr,
  waitlistJoined,
  onSelectTime,
  onEntrarFila,
}: GradeHorariosProps) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const grupos = agruparPorPeriodo(availableTimes);

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Selecione o Horário</Text>

      {loadingHorarios ? (
        <View style={s.loadingHorarios}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={s.loadingHorariosText}>Verificando disponibilidade...</Text>
        </View>
      ) : availableTimes.length > 0 ? (
        (['manha', 'tarde', 'noite'] as const).map((periodo) =>
          grupos[periodo].length === 0 ? null : (
            <View key={periodo} style={s.periodoBloco}>
              <Text style={s.periodoTitulo}>{ROTULO_PERIODO[periodo]}</Text>
              <View style={s.timeGrid}>
                {grupos[periodo].map((time) => (
                  <TouchableOpacity
                    key={time}
                    testID="time-button"
                    style={[
                      s.timeButton,
                      selectedTime === time && s.selectedTimeButton,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Horário ${time}`}
                    accessibilityState={{ selected: selectedTime === time }}
                    onPress={() => onSelectTime(time)}
                  >
                    <Text
                      style={[
                        s.timeButtonText,
                        selectedTime === time && s.selectedTimeButtonText,
                      ]}
                    >
                      {time}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ),
        )
      ) : (
        <View style={s.noTimesContainer}>
          <Text style={s.noTimesText}>
            {selectedDate === todayStr
              ? 'Não há horários disponíveis para hoje. Escolha outro dia.'
              : 'Não há horários disponíveis para esta data.'}
          </Text>
          {selectedDate !== todayStr && (
            waitlistJoined ? (
              <View style={s.waitlistConfirmado}>
                <Text style={s.waitlistConfirmadoText}>
                  ✅ Você está na lista de espera para esta data!
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={s.waitlistButton}
                onPress={onEntrarFila}
                accessibilityRole="button"
                accessibilityLabel="Entrar na lista de espera para esta data"
              >
                <Text style={s.waitlistButtonText}>
                  📋 Entrar na lista de espera
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>
      )}
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    section: {
      backgroundColor: theme.colors.surface,
      margin: 16,
      padding: 16,
      borderRadius: raio.card,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    sectionTitle: {
      fontSize: tipografia.corpoForte.fontSize,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 12,
    },
    periodoBloco: {
      marginBottom: 12,
    },
    periodoTitulo: {
      fontSize: tipografia.apoio.fontSize,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      marginBottom: 8,
    },
    loadingHorarios: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      gap: 12,
    },
    loadingHorariosText: {
      color: theme.colors.textSecondary,
      fontSize: tipografia.apoio.fontSize,
    },
    timeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    timeButton: {
      backgroundColor: theme.colors.surfaceVariant,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: raio.input,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minWidth: 70,
      minHeight: 44,
      justifyContent: 'center',
    },
    selectedTimeButton: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    timeButtonText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    selectedTimeButtonText: {
      // Texto sobre botão de horário selecionado (fundo `primary` — âmbar).
      color: theme.colors.textSobrePrimaria,
      fontWeight: 'bold',
    },
    noTimesContainer: {
      padding: 20,
      alignItems: 'center',
    },
    noTimesText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 12,
    },
    waitlistButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: raio.input,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignItems: 'center',
      minHeight: 44,
      justifyContent: 'center',
    },
    waitlistButtonText: {
      // Texto sobre botão de lista de espera (fundo `primary` — âmbar).
      color: theme.colors.textSobrePrimaria,
      fontSize: tipografia.apoio.fontSize,
      fontWeight: '700',
    },
    waitlistConfirmado: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    waitlistConfirmadoText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.success,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
