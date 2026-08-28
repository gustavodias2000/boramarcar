/**
 * CriarRecorrenciaScreen — cria um agendamento recorrente para um cliente.
 *
 * Pode ser aberta via HistoricoClienteScreen (com dados do cliente pré-preenchidos)
 * ou via RecorrenciasScreen (formulário em branco).
 *
 * Campos: serviço, dia da semana, horário, frequência.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { criarRecorrencia } from '../data/repositories/RecorrenciaRepository';
import { formatMoney } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import AvatarIlustrado from '../components/AvatarIlustrado';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  RootStackParamList,
  ServicoBarbeiro,
  FrequenciaRecorrencia,
} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CriarRecorrencia'>;

const DIAS_SEMANA = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

const FREQUENCIAS: { label: string; value: FrequenciaRecorrencia }[] = [
  { label: 'Toda semana', value: 'semanal' },
  { label: 'A cada 2 semanas', value: 'quinzenal' },
  { label: 'Todo mês', value: 'mensal' },
];

const HORARIOS = Array.from({ length: 28 }, (_, i) => {
  // 8:00 → 21:30 em incrementos de 30min
  const totalMin = 480 + i * 30;
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
});

export default function CriarRecorrenciaScreen({ route, navigation }: Props) {
  const { clienteUid, clienteNome, clienteEmail, clienteTelefone } = route.params;
  const { theme } = useTheme();
  const s = getStyles(theme);

  const [servicos, setServicos] = useState<ServicoBarbeiro[]>([]);
  const [servicoSelecionado, setServicoSelecionado] = useState<ServicoBarbeiro | null>(null);
  const [diaSemana, setDiaSemana] = useState<number>(1); // seg
  const [horario, setHorario] = useState<string>('09:00');
  const [frequencia, setFrequencia] = useState<FrequenciaRecorrencia>('semanal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadServicos();
  }, []);

  const loadServicos = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const barbeiro = await getBarbeiro(uid);
      const svcs = barbeiro?.servicos ?? [];
      setServicos(svcs);
      if (svcs.length > 0) setServicoSelecionado(svcs[0]);
    } catch (error) {
      console.error('Erro ao carregar serviços:', error);
      Alert.alert('Erro', 'Não foi possível carregar os serviços.');
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async () => {
    if (!servicoSelecionado) {
      Alert.alert('Atenção', 'Selecione um serviço.');
      return;
    }
    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      await criarRecorrencia({
        barbeiroId: uid,
        clienteUid,
        clienteNome,
        clienteEmail,
        clienteTelefone,
        servicoId: servicoSelecionado.id,
        servicoNome: servicoSelecionado.nome,
        precoEmCentavos: servicoSelecionado.precoEmCentavos,
        diaSemana,
        horario,
        frequencia,
        ativo: true,
      });

      const diaNome = DIAS_SEMANA.find((d) => d.value === diaSemana)?.label ?? '';
      const freqLabel = FREQUENCIAS.find((f) => f.value === frequencia)?.label ?? '';

      Alert.alert(
        'Recorrência criada!',
        `${clienteNome} • ${servicoSelecionado.nome}\n${diaNome} às ${horario} — ${freqLabel}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (error) {
      console.error('Erro ao criar recorrência:', error);
      Alert.alert('Erro', 'Não foi possível criar a recorrência. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Info do cliente */}
        <View style={s.clienteCard}>
          <AvatarIlustrado id={clienteUid} nome={clienteNome} size={44} />
          <View>
            <Text style={s.clienteNome}>{clienteNome}</Text>
            <Text style={s.clienteEmail}>{clienteEmail}</Text>
          </View>
        </View>

        {/* Serviço */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Serviço</Text>
          {servicos.length === 0 ? (
            <Text style={s.hint}>
              Nenhum serviço cadastrado. Acesse Configurações → Meus Serviços para adicionar.
            </Text>
          ) : (
            servicos.map((sv) => (
              <TouchableOpacity
                key={sv.id}
                style={[
                  s.optionBtn,
                  servicoSelecionado?.id === sv.id && s.optionBtnSelected,
                ]}
                onPress={() => setServicoSelecionado(sv)}
                accessibilityRole="button"
                accessibilityLabel={`Serviço ${sv.nome}, ${sv.duracaoMinutos} minutos, ${formatMoney(sv.precoEmCentavos)}`}
                accessibilityState={{ selected: servicoSelecionado?.id === sv.id }}
              >
                <Text
                  style={[
                    s.optionBtnText,
                    servicoSelecionado?.id === sv.id && s.optionBtnTextSelected,
                  ]}
                >
                  {sv.nome}
                </Text>
                <Text
                  style={[
                    s.optionBtnSub,
                    servicoSelecionado?.id === sv.id && s.optionBtnSubSelected,
                  ]}
                >
                  {sv.duracaoMinutos} min · {formatMoney(sv.precoEmCentavos)}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Dia da semana */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Dia da semana</Text>
          <View style={s.diasRow}>
            {DIAS_SEMANA.map((dia) => (
              <TouchableOpacity
                key={dia.value}
                style={[s.diaBtn, diaSemana === dia.value && s.diaBtnSelected]}
                onPress={() => setDiaSemana(dia.value)}
                accessibilityRole="button"
                accessibilityLabel={dia.label}
                accessibilityState={{ selected: diaSemana === dia.value }}
              >
                <Text
                  style={[
                    s.diaBtnText,
                    diaSemana === dia.value && s.diaBtnTextSelected,
                  ]}
                >
                  {dia.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Horário */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Horário</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
            {HORARIOS.map((h) => (
              <TouchableOpacity
                key={h}
                style={[s.chip, horario === h && s.chipSelected]}
                onPress={() => setHorario(h)}
                accessibilityRole="button"
                accessibilityLabel={`Horário ${h}`}
                accessibilityState={{ selected: horario === h }}
              >
                <Text style={[s.chipText, horario === h && s.chipTextSelected]}>
                  {h}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Frequência */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Frequência</Text>
          {FREQUENCIAS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[s.optionBtn, frequencia === f.value && s.optionBtnSelected]}
              onPress={() => setFrequencia(f.value)}
              accessibilityRole="button"
              accessibilityLabel={`Frequência ${f.label}`}
              accessibilityState={{ selected: frequencia === f.value }}
            >
              <View style={s.freqRow}>
                <Icone
                  nome="recarregar"
                  tamanho={16}
                  cor={frequencia === f.value ? theme.colors.primary : theme.colors.text}
                  decorativo
                />
                <Text
                  style={[
                    s.optionBtnText,
                    frequencia === f.value && s.optionBtnTextSelected,
                  ]}
                >
                  {f.label}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Botão salvar */}
        <TouchableOpacity
          style={[s.saveButton, (saving || !servicoSelecionado) && s.saveButtonDisabled]}
          onPress={handleSalvar}
          disabled={saving || !servicoSelecionado}
          accessibilityRole="button"
          accessibilityLabel="Criar recorrência"
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.textSobrePrimaria} />
          ) : (
            <View style={s.buttonContent}>
              <Icone nome="confirmado" tamanho={16} cor={theme.colors.textSobrePrimaria} decorativo />
              <Text style={s.saveButtonText}>Criar Recorrência</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scroll: {
      padding: 16,
      paddingBottom: 40,
    },
    clienteCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
      padding: 16,
      marginBottom: 16,
      gap: 12,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    clienteNome: {
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
    },
    clienteEmail: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
      padding: 16,
      marginBottom: 16,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    cardTitle: {
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 12,
    },
    hint: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textMuted,
      lineHeight: 18,
    },
    optionBtn: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: raio.input,
      padding: 14,
      marginBottom: 8,
      backgroundColor: theme.colors.surfaceVariant,
    },
    optionBtnSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary + '15',
    },
    freqRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    optionBtnText: {
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '600',
      color: theme.colors.text,
    },
    optionBtnTextSelected: {
      color: theme.colors.primary,
    },
    optionBtnSub: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    optionBtnSubSelected: {
      color: theme.colors.primary,
    },
    diasRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    diaBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: raio.input,
      marginHorizontal: 2,
      backgroundColor: theme.colors.surfaceVariant,
      minHeight: 44,
      justifyContent: 'center',
    },
    diaBtnSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    diaBtnText: {
      fontSize: tipografia.micro.fontSize,
      color: theme.colors.textSecondary,
      fontWeight: '500',
    },
    diaBtnTextSelected: {
      // Texto sobre botão de dia selecionado (fundo `primary` — âmbar).
      color: theme.colors.textSobrePrimaria,
      fontWeight: '700',
    },
    chipScroll: {
      flexDirection: 'row',
    },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: raio.modal,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceVariant,
      marginRight: 8,
      minHeight: 38,
      justifyContent: 'center',
    },
    chipSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    chipText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
    },
    chipTextSelected: {
      // Texto sobre chip de horário selecionado (fundo `primary` — âmbar).
      color: theme.colors.textSobrePrimaria,
      fontWeight: '700',
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: raio.input,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      minHeight: 52,
      justifyContent: 'center',
    },
    saveButtonDisabled: {
      backgroundColor: theme.colors.textMuted,
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    saveButtonText: {
      // Texto sobre botão salvar (fundo `primary` — âmbar).
      color: theme.colors.textSobrePrimaria,
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '700',
    },
  });
