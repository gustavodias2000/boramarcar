/**
 * CalendarioMensal — grid de mês com código de cor por dia (gap competitivo
 * com o Masters: "calendário com código de cor verde/cinza").
 *
 * Verde = dia de atendimento com pelo menos um horário livre.
 * Cinza escuro = dia de atendimento totalmente lotado.
 * Sem cor (apenas contorno) = dia sem atendimento, folga, ou fora do
 * período permitido para agendar.
 *
 * Componente próprio (sem dependência nova) — grid simples com View/
 * TouchableOpacity, no mesmo estilo já usado em FolgasScreen/ConfigAgendaScreen.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { toLocalDateString } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';

export type StatusDia = 'livre' | 'lotado' | 'indisponivel';

interface Props {
  /** Mês exibido (0 = janeiro, como Date.getMonth()) */
  mes: number;
  ano: number;
  diasStatus: Record<string, StatusDia>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onChangeMonth: (delta: number) => void;
  loading?: boolean;
}

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function CalendarioMensal({
  mes, ano, diasStatus, selectedDate, onSelectDate, onChangeMonth, loading,
}: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const primeiroDia = new Date(ano, mes, 1);
  const offset = primeiroDia.getDay(); // dias vazios antes do dia 1
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const hojeStr = toLocalDateString(new Date());

  const celulas: Array<{ date: string; dia: number } | null> = [];
  for (let i = 0; i < offset; i++) celulas.push(null);
  for (let dia = 1; dia <= totalDias; dia++) {
    celulas.push({ date: toLocalDateString(new Date(ano, mes, dia)), dia });
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => onChangeMonth(-1)}
          style={s.navButton}
          accessibilityRole="button"
          accessibilityLabel="Mês anterior"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.navButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.mesTitle}>{NOMES_MES[mes]} {ano}</Text>
        <TouchableOpacity
          onPress={() => onChangeMonth(1)}
          style={s.navButton}
          accessibilityRole="button"
          accessibilityLabel="Próximo mês"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={s.weekRow}>
        {DIAS_SEMANA.map((d, i) => (
          <View key={i} style={s.weekCell}>
            <Text style={s.weekText}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={s.grid}>
        {celulas.map((c, i) => {
          if (!c) return <View key={`empty-${i}`} style={s.dayCell} />;
          const status = diasStatus[c.date];
          const isPast = c.date < hojeStr;
          const isSelected = selectedDate === c.date;
          const isToday = c.date === hojeStr;

          const bgColor =
            status === 'livre' ? theme.colors.success + (isPast ? '30' : '') :
            status === 'lotado' ? theme.colors.textMuted + (isPast ? '30' : '') :
            'transparent';

          return (
            <TouchableOpacity
              key={c.date}
              style={[
                s.dayCell,
                s.dayCellButton,
                { backgroundColor: bgColor },
                isSelected && s.dayCellSelected,
                isToday && !isSelected && s.dayCellToday,
              ]}
              onPress={() => onSelectDate(c.date)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={`Dia ${c.dia}, ${
                status === 'livre' ? 'com horários livres' : status === 'lotado' ? 'lotado' : 'sem atendimento'
              }`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  s.dayText,
                  (status === 'livre' || status === 'lotado') && s.dayTextColorido,
                  isSelected && s.dayTextSelected,
                  isPast && s.dayTextPast,
                ]}
              >
                {c.dia}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.legenda}>
        <View style={s.legendaItem}>
          <View style={[s.legendaDot, { backgroundColor: theme.colors.success }]} />
          <Text style={s.legendaText}>Livre</Text>
        </View>
        <View style={s.legendaItem}>
          <View style={[s.legendaDot, { backgroundColor: theme.colors.textMuted }]} />
          <Text style={s.legendaText}>Lotado</Text>
        </View>
        <View style={s.legendaItem}>
          <View style={[s.legendaDot, s.legendaDotVazio]} />
          <Text style={s.legendaText}>Sem atendimento</Text>
        </View>
      </View>
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: raio.card,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: raio.circulo,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceVariant,
  },
  navButtonText: {
    fontSize: tipografia.subtitulo.fontSize,
    fontWeight: '700',
    color: theme.colors.text,
  },
  mesTitle: {
    fontSize: tipografia.corpo.fontSize,
    fontWeight: '700',
    color: theme.colors.text,
    textTransform: 'capitalize',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekText: {
    fontSize: tipografia.micro.fontSize,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  dayCellButton: {
    borderRadius: raio.input,
  },
  dayCellSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  dayText: {
    fontSize: tipografia.micro.fontSize,
    color: theme.colors.textSecondary,
  },
  dayTextColorido: {
    fontWeight: '700',
    color: theme.colors.text,
  },
  dayTextSelected: {
    color: theme.colors.primary,
    fontWeight: '800',
  },
  dayTextPast: {
    opacity: 0.4,
  },
  legenda: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  legendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendaDot: {
    width: 10,
    height: 10,
    borderRadius: raio.circulo,
  },
  legendaDotVazio: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  legendaText: {
    fontSize: tipografia.micro.fontSize,
    color: theme.colors.textMuted,
  },
});
