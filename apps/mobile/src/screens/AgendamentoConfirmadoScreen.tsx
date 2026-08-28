/**
 * AgendamentoConfirmadoScreen — tela de confirmação completa exibida após o
 * agendamento ser pago/criado (substitui o Alert nativo usado antes).
 *
 * Inspirada no padrão de mercado (ex.: Masters): resumo do agendamento,
 * status do envio ao barbeiro, contato direto (ligação), endereço com link
 * de mapa e atalho para adicionar ao calendário.
 */
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icone from '../components/Icone';
import CalendarService from '../services/CalendarService';
import { formatMoney } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AgendamentoConfirmado'>;

export default function AgendamentoConfirmadoScreen({ route, navigation }: Props) {
  const { agendamento, barbeiro, whatsappEnviado, mensagemPosAgendamento } = route.params;
  const { theme } = useTheme();
  const s = getStyles(theme);

  const [concluindo, setConcluindo] = useState(false);
  const concluindoRef = useRef(false);

  const handleLigar = () => {
    const telefone = agendamento.barbeiroTelefone || barbeiro.telefone;
    if (!telefone) {
      Alert.alert('Sem telefone', 'Este barbeiro não cadastrou um telefone de contato.');
      return;
    }
    const digits = telefone.replace(/\D/g, '');
    Linking.openURL(`tel:${digits}`).catch(() => {
      Alert.alert('Erro', 'Não foi possível abrir o discador.');
    });
  };

  const handleAbrirMapa = () => {
    // Prefere as coordenadas (geocoding via Google Places) quando existirem
    // — pino exato no mapa. Sem elas, cai para a busca por texto de sempre.
    const temCoordenadas = barbeiro.latitude != null && barbeiro.longitude != null;
    const endereco = barbeiro.enderecoFormatado || barbeiro.endereco;
    if (!temCoordenadas && !endereco) return;

    const url = temCoordenadas
      ? `https://www.google.com/maps/search/?api=1&query=${barbeiro.latitude},${barbeiro.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco!)}`;

    Linking.openURL(url).catch(() => {
      Alert.alert('Erro', 'Não foi possível abrir o mapa.');
    });
  };

  const handleAdicionarCalendario = async () => {
    await CalendarService.addAgendamentoToCalendar(agendamento);
  };

  const handleConcluir = () => {
    // O ref fecha a janela entre toques antes do React reaplicar `disabled`.
    if (concluindoRef.current) return;

    concluindoRef.current = true;
    setConcluindo(true);
    // Reinicia somente a pilha de navegação: a sessão autenticada permanece intacta.
    navigation.reset({
      index: 0,
      routes: [{ name: 'Cliente', params: { screen: 'Agendamentos' } }],
    });
  };

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.successBadge}>
          <View style={s.successIcon}>
            <Icone
              nome="confirmado"
              tamanho={32}
              cor={theme.colors.success}
              decorativo
            />
          </View>
          <Text style={s.successTitle}>Agendamento confirmado!</Text>
          <Text style={s.successSubtitle}>
            {whatsappEnviado
              ? `${agendamento.barbeiroNome} foi avisado por WhatsApp.`
              : 'Entre em contato para confirmar diretamente.'}
          </Text>
        </View>

        <View style={s.card}>
              <Text style={s.cardTitle}>Detalhes</Text>
              {[
                { label: 'Barbeiro', value: agendamento.barbeiroNome },
                { label: 'Serviço', value: agendamento.servico || 'Corte e barba' },
                { label: 'Data', value: agendamento.data },
                { label: 'Horário', value: agendamento.horario },
              ].map((row) => (
                <View key={row.label} style={s.row}>
                  <Text style={s.rowLabel}>{row.label}</Text>
                  <Text style={s.rowValue}>{row.value}</Text>
                </View>
              ))}
              <View style={[s.row, s.rowTotal]}>
                <Text style={s.rowTotalLabel}>Total</Text>
                <Text style={s.rowTotalValue}>{formatMoney(agendamento.precoEmCentavos)}</Text>
              </View>
        </View>

        {mensagemPosAgendamento ? (
          <View style={s.mensagemCard}>
            <View style={s.mensagemIcon}>
              <Icone nome="mensagem" tamanho={20} decorativo />
            </View>
            <Text style={s.mensagemText}>{mensagemPosAgendamento}</Text>
          </View>
        ) : null}

        <View style={s.card}>
              <Text style={s.cardTitle}>Contato e local</Text>

              <TouchableOpacity
                style={s.actionRow}
                onPress={handleLigar}
                accessibilityRole="button"
                accessibilityLabel={`Ligar para ${agendamento.barbeiroNome}`}
              >
                <View style={s.actionIcon}>
                  <Icone nome="telefone" tamanho={20} decorativo />
                </View>
                <Text style={s.actionText}>Ligar para {agendamento.barbeiroNome}</Text>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>

              {barbeiro.enderecoFormatado || barbeiro.endereco ? (
                <TouchableOpacity
                  style={s.actionRow}
                  onPress={handleAbrirMapa}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir endereço no mapa"
                >
                  <View style={s.actionIcon}>
                    <Icone nome="endereco" tamanho={20} decorativo />
                  </View>
                  <View style={s.flexContent}>
                    <Text style={s.actionText}>Ver no mapa</Text>
                    <Text style={s.actionSubtext} numberOfLines={1}>
                      {barbeiro.enderecoFormatado || barbeiro.endereco}
                    </Text>
                  </View>
                  <Text style={s.chevron}>›</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={s.actionRow}
                onPress={handleAdicionarCalendario}
                accessibilityRole="button"
                accessibilityLabel="Adicionar ao calendário"
              >
                <View style={s.actionIcon}>
                  <Icone nome="calendario-mensal" tamanho={20} decorativo />
                </View>
                <Text style={s.actionText}>Adicionar ao Calendário</Text>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.doneButton, concluindo && s.doneButtonDisabled]}
          onPress={handleConcluir}
          disabled={concluindo}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Concluir"
          accessibilityState={{ disabled: concluindo }}
          testID="concluir-agendamento-button"
        >
          <Text style={s.doneButtonText}>Concluir</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    flexContent: { flex: 1 },
    scroll: {
      padding: 16,
      paddingBottom: 40,
    },
    successBadge: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    successIcon: {
      marginBottom: 8,
    },
    successTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.colors.text,
      marginBottom: 6,
      textAlign: 'center',
    },
    successSubtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    rowLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    rowValue: {
      fontSize: 14,
      color: theme.colors.text,
      fontWeight: '600',
      flex: 1,
      textAlign: 'right',
      marginLeft: 8,
    },
    rowTotal: {
      marginTop: 4,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    rowTotalLabel: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    rowTotalValue: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.success,
    },
    mensagemCard: {
      flexDirection: 'row',
      backgroundColor: theme.colors.primary + '15',
      borderRadius: 10,
      padding: 14,
      marginBottom: 16,
      alignItems: 'flex-start',
    },
    mensagemIcon: {
      marginRight: 10,
    },
    mensagemText: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.text,
      lineHeight: 20,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderLight,
      minHeight: 44,
    },
    actionIcon: {
      marginRight: 12,
    },
    actionText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    actionSubtext: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    chevron: {
      fontSize: 20,
      color: theme.colors.textMuted,
      marginLeft: 8,
    },
    doneButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      minHeight: 52,
      justifyContent: 'center',
    },
    doneButtonDisabled: {
      opacity: 0.65,
    },
    doneButtonText: {
      color: theme.colors.textSobrePrimaria,
      fontSize: 16,
      fontWeight: '700',
    },
  });
