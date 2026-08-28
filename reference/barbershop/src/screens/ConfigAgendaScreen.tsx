/**
 * ConfigAgendaScreen — barbeiro configura horários de atendimento:
 * - Hora de início e fim
 * - Intervalo de almoço
 * - Antecedência mínima para agendamento
 * - Antecedência máxima (quantos dias à frente o cliente pode agendar)
 * - Dias de atendimento
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { upsertBarbeiro, getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { atualizarProfissional } from '../data/repositories/NegocioRepository';
import { useTheme, type Theme } from '../context/ThemeContext';
import Icone from '../components/Icone';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, ConfiguracaoAgenda } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfigAgenda'>;

const HORAS = Array.from({ length: 24 }, (_, h) =>
  [`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`],
).flat();

const ANTECEDENCIAS = [
  { label: 'Sem restrição', value: 0 },
  { label: '15 min antes', value: 15 },
  { label: '30 min antes', value: 30 },
  { label: '1 hora antes', value: 60 },
  { label: '2 horas antes', value: 120 },
  { label: '3 horas antes', value: 180 },
  { label: '6 horas antes', value: 360 },
  { label: '12 horas antes', value: 720 },
  { label: '24 horas antes', value: 1440 },
];

const BUFFERS = [
  { label: 'Sem intervalo', value: 0 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '20 min', value: 20 },
  { label: '30 min', value: 30 },
];

const PERIODO_MAXIMO = [
  { label: '7 dias', value: 7 },
  { label: '15 dias', value: 15 },
  { label: '30 dias', value: 30 },
  { label: '45 dias', value: 45 },
  { label: '60 dias', value: 60 },
  { label: '90 dias', value: 90 },
  { label: '120 dias', value: 120 },
];

const DIAS = [
  { label: 'Dom', value: 0, short: 'D' },
  { label: 'Seg', value: 1, short: 'S' },
  { label: 'Ter', value: 2, short: 'T' },
  { label: 'Qua', value: 3, short: 'Q' },
  { label: 'Qui', value: 4, short: 'Q' },
  { label: 'Sex', value: 5, short: 'S' },
  { label: 'Sáb', value: 6, short: 'S' },
];

const DEFAULT_CONFIG: ConfiguracaoAgenda = {
  horaInicio: '09:00',
  horaFim: '18:00',
  almocoInicio: '12:00',
  almocoFim: '13:00',
  antecedenciaMinutos: 30,
  antecedenciaMaximaDias: 30,
  diasAtendimento: [1, 2, 3, 4, 5, 6],
  intervaloAposAtendimentoMinutos: 0,
  turnoExtraAtivo: false,
  turnoExtraInicio: '19:00',
  turnoExtraFim: '21:00',
};

export default function ConfigAgendaScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  // Dono editando um membro da equipe (via EditarProfissionalScreen) passa
  // profissionalId; ausência = comportamento de sempre (o próprio uid logado).
  const profissionalId = route.params?.profissionalId;
  const profissionalNome = route.params?.profissionalNome;
  const targetId = profissionalId || auth.currentUser?.uid;

  const [config, setConfig] = useState<ConfiguracaoAgenda>(DEFAULT_CONFIG);
  const [mensagemPos, setMensagemPos] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [almoco, setAlmoco] = useState(true); // toggle do intervalo de almoço

  useEffect(() => {
    loadConfig();
    // Carga única na montagem: `loadConfig` só lê o uid autenticado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConfig = async () => {
    try {
      if (!targetId) return;
      const barbeiro = await getBarbeiro(targetId);
      if (barbeiro?.configuracaoAgenda) {
        const c = { ...DEFAULT_CONFIG, ...barbeiro.configuracaoAgenda };
        setConfig(c);
        setAlmoco(!!c.almocoInicio && !!c.almocoFim);
      }
      if (barbeiro?.mensagemPosAgendamento) {
        setMensagemPos(barbeiro.mensagemPosAgendamento);
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDia = (dia: number) => {
    setConfig((prev) => {
      const dias = prev.diasAtendimento.includes(dia)
        ? prev.diasAtendimento.filter((d) => d !== dia)
        : [...prev.diasAtendimento, dia].sort();
      return { ...prev, diasAtendimento: dias };
    });
  };

  const handleSave = async () => {
    const configToSave: ConfiguracaoAgenda = {
      ...config,
      almocoInicio: almoco ? config.almocoInicio : '',
      almocoFim: almoco ? config.almocoFim : '',
    };

    if (configToSave.horaInicio >= configToSave.horaFim) {
      Alert.alert('Atenção', 'A hora de início deve ser anterior à hora de fim.');
      return;
    }
    if (almoco && configToSave.almocoInicio >= configToSave.almocoFim) {
      Alert.alert('Atenção', 'O início do almoço deve ser anterior ao fim.');
      return;
    }
    if (configToSave.turnoExtraAtivo) {
      if (!configToSave.turnoExtraInicio || !configToSave.turnoExtraFim) {
        Alert.alert('Atenção', 'Defina o início e o fim do turno extra.');
        return;
      }
      if (configToSave.turnoExtraInicio >= configToSave.turnoExtraFim) {
        Alert.alert('Atenção', 'O início do turno extra deve ser anterior ao fim.');
        return;
      }
      if (configToSave.turnoExtraInicio < configToSave.horaFim) {
        Alert.alert(
          'Atenção',
          'O turno extra deve começar depois do horário principal, para não se sobrepor.',
        );
        return;
      }
    }
    if (configToSave.diasAtendimento.length === 0) {
      Alert.alert('Atenção', 'Selecione ao menos um dia de atendimento.');
      return;
    }

    setSaving(true);
    try {
      if (!targetId) return;
      const dados = {
        configuracaoAgenda: configToSave,
        mensagemPosAgendamento: mensagemPos.trim() || undefined,
      };
      if (profissionalId) {
        await atualizarProfissional(profissionalId, dados);
      } else {
        await upsertBarbeiro(targetId, dados);
      }
      Alert.alert('Sucesso!', 'Configuração de horários salva.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const renderPickerRow = (
    label: string,
    options: { label: string; value: number | string }[],
    current: number | string,
    onChange: (v: any) => void,
  ) => (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
        {options.map((opt) => (
          <TouchableOpacity
            key={String(opt.value)}
            style={[s.chip, current === opt.value && s.chipSelected]}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${opt.label}`}
            accessibilityState={{ selected: current === opt.value }}
          >
            <Text style={[s.chipText, current === opt.value && s.chipTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const horasOptions = HORAS.map((h) => ({ label: h, value: h }));

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

        {profissionalId && (
          <View style={s.profissionalBanner}>
            <Text style={s.profissionalBannerText}>
              Editando a agenda de {profissionalNome || 'um profissional da equipe'}
            </Text>
          </View>
        )}

        {/* Dias de atendimento */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Dias de Atendimento</Text>
          <View style={s.diasRow}>
            {DIAS.map((dia) => (
              <TouchableOpacity
                key={dia.value}
                style={[
                  s.diaButton,
                  config.diasAtendimento.includes(dia.value) && s.diaButtonSelected,
                ]}
                onPress={() => toggleDia(dia.value)}
                accessibilityRole="button"
                accessibilityLabel={dia.label}
                accessibilityState={{ selected: config.diasAtendimento.includes(dia.value) }}
              >
                <Text
                  style={[
                    s.diaText,
                    config.diasAtendimento.includes(dia.value) && s.diaTextSelected,
                  ]}
                >
                  {dia.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Horário de trabalho */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Horário de Atendimento</Text>
          {renderPickerRow(
            'Início',
            horasOptions.filter((h) => h.value < config.horaFim),
            config.horaInicio,
            (v: string) => setConfig((p) => ({ ...p, horaInicio: v })),
          )}
          {renderPickerRow(
            'Fim',
            horasOptions.filter((h) => h.value > config.horaInicio),
            config.horaFim,
            (v: string) => setConfig((p) => ({ ...p, horaFim: v })),
          )}
        </View>

        {/* Intervalo de almoço */}
        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.cardTitle}>Intervalo de Almoço</Text>
            {/* thumbColor do Switch nativo — não é texto/ícone/ActivityIndicator
                sobre fundo saturado (é o "polegar" do próprio componente), por
                isso fica fora do escopo dos tokens textSobrePrimaria/textSobreDestaque.
                Mesma exceção nos demais switches deste arquivo. */}
            <Switch
              value={almoco}
              onValueChange={setAlmoco}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Ativar intervalo de almoço"
            />
          </View>
          {almoco && (
            <>
              {renderPickerRow(
                'Início do almoço',
                horasOptions.filter(
                  (h) => h.value > config.horaInicio && h.value < config.horaFim,
                ),
                config.almocoInicio,
                (v: string) => setConfig((p) => ({ ...p, almocoInicio: v })),
              )}
              {renderPickerRow(
                'Fim do almoço',
                horasOptions.filter(
                  (h) =>
                    h.value > config.almocoInicio && h.value < config.horaFim,
                ),
                config.almocoFim,
                (v: string) => setConfig((p) => ({ ...p, almocoFim: v })),
              )}
              <Text style={s.hint}>
                Horários entre {config.almocoInicio} e {config.almocoFim} não aparecerão
                para o cliente.
              </Text>
            </>
          )}
        </View>

        {/* Antecedência mínima */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Antecedência Mínima para Agendar</Text>
          <Text style={s.hint}>
            Evite agendamentos em cima da hora. Ex: "30 min antes" bloqueia
            horários nos próximos 30 minutos.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
            {ANTECEDENCIAS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  s.chip,
                  config.antecedenciaMinutos === opt.value && s.chipSelected,
                ]}
                onPress={() =>
                  setConfig((p) => ({ ...p, antecedenciaMinutos: opt.value }))
                }
                accessibilityRole="button"
                accessibilityLabel={`Antecedência mínima: ${opt.label}`}
                accessibilityState={{ selected: config.antecedenciaMinutos === opt.value }}
              >
                <Text
                  style={[
                    s.chipText,
                    config.antecedenciaMinutos === opt.value && s.chipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Intervalo entre atendimentos (buffer) */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Intervalo Entre Atendimentos</Text>
          <Text style={s.hint}>
            Tempo de descanso/limpeza reservado automaticamente depois de cada
            atendimento, antes do próximo horário ficar disponível.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
            {BUFFERS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  s.chip,
                  (config.intervaloAposAtendimentoMinutos ?? 0) === opt.value && s.chipSelected,
                ]}
                onPress={() =>
                  setConfig((p) => ({ ...p, intervaloAposAtendimentoMinutos: opt.value }))
                }
                accessibilityRole="button"
                accessibilityLabel={`Intervalo entre atendimentos: ${opt.label}`}
                accessibilityState={{ selected: (config.intervaloAposAtendimentoMinutos ?? 0) === opt.value }}
              >
                <Text
                  style={[
                    s.chipText,
                    (config.intervaloAposAtendimentoMinutos ?? 0) === opt.value && s.chipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Turno extra (ex: período noturno) */}
        <View style={s.card}>
          <View style={s.rowBetween}>
            <View style={s.flexContent}>
              <Text style={s.cardTitle}>Turno Extra</Text>
              <Text style={s.hint}>
                Ative se você também atende num segundo período no mesmo dia
                (ex.: período noturno), além do horário principal acima.
              </Text>
            </View>
            <Switch
              value={!!config.turnoExtraAtivo}
              onValueChange={(v) => setConfig((p) => ({ ...p, turnoExtraAtivo: v }))}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Ativar turno extra"
            />
          </View>
          {config.turnoExtraAtivo && (
            <>
              {renderPickerRow(
                'Início do turno extra',
                horasOptions,
                config.turnoExtraInicio || '19:00',
                (v: string) => setConfig((p) => ({ ...p, turnoExtraInicio: v })),
              )}
              {renderPickerRow(
                'Fim do turno extra',
                horasOptions.filter((h) => h.value > (config.turnoExtraInicio || '19:00')),
                config.turnoExtraFim || '21:00',
                (v: string) => setConfig((p) => ({ ...p, turnoExtraFim: v })),
              )}
            </>
          )}
        </View>

        {/* Dias de folga */}
        <TouchableOpacity
          style={s.folgasLink}
          onPress={() => navigation.navigate('Folgas', profissionalId ? { profissionalId, profissionalNome } : undefined)}
          accessibilityRole="button"
          accessibilityLabel="Gerenciar dias de folga"
        >
          <View style={s.folgasLinkIcon}>
            <Icone nome="calendario-mensal" tamanho={24} cor={theme.colors.primary} decorativo />
          </View>
          <View style={s.flexContent}>
            <Text style={s.folgasLinkTitle}>Dias de Folga</Text>
            <Text style={s.folgasLinkDesc}>Bloqueie datas específicas (férias, feriados, imprevistos)</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        {/* Bloqueio de horário específico (evento pessoal) */}
        <TouchableOpacity
          style={s.folgasLink}
          onPress={() => navigation.navigate('Bloqueios', profissionalId ? { profissionalId, profissionalNome } : undefined)}
          accessibilityRole="button"
          accessibilityLabel="Bloquear horário específico"
        >
          <View style={s.folgasLinkIcon}>
            <Icone nome="em-obra" tamanho={24} cor={theme.colors.primary} decorativo />
          </View>
          <View style={s.flexContent}>
            <Text style={s.folgasLinkTitle}>Bloquear Horário Específico</Text>
            <Text style={s.folgasLinkDesc}>Reserve um horário dentro do dia para um compromisso pessoal</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        {/* Período máximo */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Período Máximo para Agendar</Text>
          <Text style={s.hint}>
            Quantos dias à frente o cliente pode marcar um horário.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
            {PERIODO_MAXIMO.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  s.chip,
                  config.antecedenciaMaximaDias === opt.value && s.chipSelected,
                ]}
                onPress={() =>
                  setConfig((p) => ({ ...p, antecedenciaMaximaDias: opt.value }))
                }
                accessibilityRole="button"
                accessibilityLabel={`Período máximo: ${opt.label}`}
                accessibilityState={{ selected: config.antecedenciaMaximaDias === opt.value }}
              >
                <Text
                  style={[
                    s.chipText,
                    config.antecedenciaMaximaDias === opt.value && s.chipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Mensagem pós-agendamento */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Mensagem pós-agendamento</Text>
          <Text style={s.hint}>
            Texto exibido ao cliente logo após confirmar o agendamento. Ex.: endereço,
            instruções de preparo ou um recado especial. Deixe em branco para não exibir.
          </Text>
          <TextInput
            style={s.textArea}
            value={mensagemPos}
            onChangeText={setMensagemPos}
            placeholder="Ex.: Nos vemos na Rua das Flores, 42. Chegue 5 min antes!"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            numberOfLines={3}
            maxLength={300}
            accessibilityLabel="Mensagem exibida após o agendamento"
            accessibilityHint="Máximo de 300 caracteres"
          />
          <Text style={s.charCount}>{mensagemPos.length}/300</Text>
        </View>

        {/* Botão salvar */}
        <TouchableOpacity
          style={[s.saveButton, saving && s.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Salvar configurações de horário"
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.textSobrePrimaria} />
          ) : (
            <Text style={s.saveButtonText}>Salvar Configurações</Text>
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
    flexContent: { flex: 1 },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scroll: {
      padding: 16,
      paddingBottom: 40,
    },
    profissionalBanner: {
      backgroundColor: theme.colors.primary + '20',
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    profissionalBannerText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.primary,
      textAlign: 'center',
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 12,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    diasRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    diaButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceVariant,
      minWidth: 44,
      alignItems: 'center',
    },
    diaButtonSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    diaText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      fontWeight: '500',
    },
    diaTextSelected: {
      color: theme.colors.textSobrePrimaria,
      fontWeight: '700',
    },
    fieldGroup: {
      marginBottom: 12,
    },
    fieldLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 6,
      fontWeight: '600',
    },
    chipScroll: {
      flexDirection: 'row',
    },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceVariant,
      marginRight: 8,
    },
    chipSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    chipText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    chipTextSelected: {
      color: theme.colors.textSobrePrimaria,
      fontWeight: '700',
    },
    hint: {
      fontSize: 12,
      color: theme.colors.textMuted,
      marginBottom: 10,
      lineHeight: 17,
    },
    textArea: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceVariant,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    charCount: {
      fontSize: 12,
      color: theme.colors.textMuted,
      textAlign: 'right',
      marginTop: 4,
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      minHeight: 52,
      justifyContent: 'center',
    },
    saveButtonDisabled: {
      backgroundColor: theme.colors.textMuted,
    },
    saveButtonText: {
      color: theme.colors.textSobrePrimaria,
      fontSize: 16,
      fontWeight: '700',
    },
    folgasLink: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    folgasLinkIcon: {
      marginRight: 14,
    },
    folgasLinkTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 2,
    },
    folgasLinkDesc: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      lineHeight: 17,
    },
    chevron: {
      fontSize: 24,
      color: theme.colors.textMuted,
      marginLeft: 8,
    },
  });
