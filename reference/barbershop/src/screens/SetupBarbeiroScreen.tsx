/**
 * SetupBarbeiroScreen — wizard de configuração exibido uma única vez, logo
 * após o barbeiro concluir o onboarding (slides de apresentação).
 *
 * Resolve o "problema do primeiro dia": hoje o barbeiro cai direto numa
 * home vazia e precisa descobrir sozinho que precisa ir em Configurações →
 * Meus Serviços e Configurações → Horário de Atendimento antes de aparecer
 * para os clientes (o próprio BarbeiroConfigTab já avisa disso). Este
 * wizard resolve os dois de forma guiada, em 2 passos + confirmação:
 *
 *   1. Serviços sugeridos (seleção rápida, editável depois)
 *   2. Horário de funcionamento (dias, início/fim, almoço, turno extra)
 *   3. Concluído
 *
 * Pode ser pulado a qualquer momento — o barbeiro sempre pode configurar
 * tudo depois em Configurações, então não vale a pena arriscar abandono
 * forçando o fluxo completo.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { getBarbeiro, upsertBarbeiro } from '../data/repositories/BarbeiroRepository';
import { sortearFotoPadrao } from '../assets/barbeirosPadrao';
import { SERVICOS_SUGERIDOS, getServicosPreSelecionados } from '../utils/servicosPadrao';
import { formatMoney } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import Icone from '../components/Icone';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, ServicoBarbeiro, ConfiguracaoAgenda } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SetupBarbeiro'>;

const HORAS = Array.from({ length: 24 }, (_, h) =>
  [`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`],
).flat();

const DIAS = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

const CONFIG_INICIAL: ConfiguracaoAgenda = {
  horaInicio: '09:00',
  horaFim: '19:00',
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

const TOTAL_PASSOS = 3;

export default function SetupBarbeiroScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const [passo, setPasso] = useState(1);
  const [saving, setSaving] = useState(false);

  const [servicosSelecionados, setServicosSelecionados] = useState<Set<string>>(
    () => new Set(getServicosPreSelecionados().map((sv) => sv.id)),
  );
  const [almoco, setAlmoco] = useState(true);
  const [config, setConfig] = useState<ConfiguracaoAgenda>(CONFIG_INICIAL);

  const toggleServico = (id: string) => {
    setServicosSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDia = (dia: number) => {
    setConfig((prev) => {
      const dias = prev.diasAtendimento.includes(dia)
        ? prev.diasAtendimento.filter((d) => d !== dia)
        : [...prev.diasAtendimento, dia].sort();
      return { ...prev, diasAtendimento: dias };
    });
  };

  const irParaBarbeiro = () => navigation.replace('Barbeiro');

  const handlePular = () => {
    Alert.alert(
      'Pular configuração inicial?',
      'Você pode configurar seus serviços e horário depois, em Configurações. Mas seus clientes só vão conseguir agendar depois disso.',
      [
        { text: 'Continuar configurando', style: 'cancel' },
        { text: 'Pular por enquanto', style: 'destructive', onPress: irParaBarbeiro },
      ],
    );
  };

  const handleContinuarServicos = () => {
    if (servicosSelecionados.size === 0) {
      Alert.alert('Atenção', 'Selecione ao menos um serviço para continuar (dá para editar depois).');
      return;
    }
    setPasso(2);
  };

  const handleContinuarHorario = () => {
    if (config.diasAtendimento.length === 0) {
      Alert.alert('Atenção', 'Selecione ao menos um dia de atendimento.');
      return;
    }
    if (config.horaInicio >= config.horaFim) {
      Alert.alert('Atenção', 'A hora de início deve ser anterior à hora de fim.');
      return;
    }
    if (almoco && config.almocoInicio >= config.almocoFim) {
      Alert.alert('Atenção', 'O início do almoço deve ser anterior ao fim.');
      return;
    }
    if (config.turnoExtraAtivo) {
      if (!config.turnoExtraInicio || !config.turnoExtraFim || config.turnoExtraInicio >= config.turnoExtraFim) {
        Alert.alert('Atenção', 'Verifique o início e o fim do turno extra.');
        return;
      }
    }
    setPasso(3);
  };

  const handleConcluir = async () => {
    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const servicos: ServicoBarbeiro[] = SERVICOS_SUGERIDOS.filter((sv) =>
        servicosSelecionados.has(sv.id),
      );

      // Sorteia uma foto padrão só se o barbeiro ainda não tem nenhuma foto
      // (real ou padrão) — idempotente, não re-sorteia se rodar de novo.
      const barbeiroAtual = await getBarbeiro(uid);
      const fotoPadraoId =
        !barbeiroAtual?.fotoUrl && !barbeiroAtual?.fotoPadraoId ? sortearFotoPadrao() : undefined;

      await upsertBarbeiro(uid, {
        servicos,
        configuracaoAgenda: {
          ...config,
          almocoInicio: almoco ? config.almocoInicio : '',
          almocoFim: almoco ? config.almocoFim : '',
        },
        ...(fotoPadraoId ? { fotoPadraoId } : {}),
      });

      irParaBarbeiro();
    } catch (error) {
      console.error('Erro ao salvar configuração inicial:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Você pode tentar de novo em Configurações.');
      setSaving(false);
    }
  };

  const renderHeader = (titulo: string, subtitulo: string) => (
    <View style={s.header}>
      <View style={s.headerTop}>
        <View style={s.progressoRow}>
          {Array.from({ length: TOTAL_PASSOS }, (_, i) => (
            <View
              key={i}
              style={[s.progressoDot, i < passo && s.progressoDotAtivo]}
            />
          ))}
        </View>
        {passo < 3 && (
          <TouchableOpacity
            onPress={handlePular}
            accessibilityRole="button"
            accessibilityLabel="Pular configuração"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={s.pularText}>Pular</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={s.headerTitulo}>{titulo}</Text>
      <Text style={s.headerSubtitulo}>{subtitulo}</Text>
    </View>
  );

  const renderPickerRow = (
    label: string,
    options: { label: string; value: string }[],
    current: string,
    onChange: (v: string) => void,
  ) => (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[s.chip, current === opt.value && s.chipSelected]}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${opt.label}`}
            accessibilityState={{ selected: current === opt.value }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
      {passo === 1 && (
        <>
          {renderHeader(
            'Quais serviços você oferece?',
            'Selecionamos os mais comuns para você começar rápido. Toque para marcar ou desmarcar — dá para editar preço e duração depois.',
          )}
          <ScrollView contentContainerStyle={s.scroll}>
            {SERVICOS_SUGERIDOS.map((sv) => {
              const selecionado = servicosSelecionados.has(sv.id);
              return (
                <TouchableOpacity
                  key={sv.id}
                  style={[s.servicoCard, selecionado && s.servicoCardSelected]}
                  onPress={() => toggleServico(sv.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selecionado }}
                  accessibilityLabel={`${sv.nome}, ${sv.duracaoMinutos} minutos, ${formatMoney(sv.precoEmCentavos)}`}
                >
                  <View style={[s.checkbox, selecionado && s.checkboxChecked]}>
                    {selecionado ? (
                      <Icone nome="check" tamanho={16} cor={theme.colors.textSobrePrimaria} decorativo />
                    ) : null}
                  </View>
                  <View style={s.flexContent}>
                    <Text style={s.servicoNome}>{sv.nome}</Text>
                    <View style={s.servicoMetaRow}>
                      <Icone nome="horario" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                      <Text style={s.servicoMeta}>
                        {sv.duracaoMinutos} min · {formatMoney(sv.precoEmCentavos)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={s.footer}>
            <TouchableOpacity
              style={s.primaryButton}
              onPress={handleContinuarServicos}
              accessibilityRole="button"
              accessibilityLabel="Continuar para o horário de funcionamento"
            >
              <Text style={s.primaryButtonText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {passo === 2 && (
        <>
          {renderHeader(
            'Qual seu horário de funcionamento?',
            'Configure os dias e horários em que você atende. Você pode ajustar tudo isso depois.',
          )}
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.fieldLabel}>Dias de atendimento</Text>
            <View style={s.diasRow}>
              {DIAS.map((dia) => (
                <TouchableOpacity
                  key={dia.value}
                  style={[s.diaButton, config.diasAtendimento.includes(dia.value) && s.diaButtonSelected]}
                  onPress={() => toggleDia(dia.value)}
                  accessibilityRole="button"
                  accessibilityLabel={dia.label}
                  accessibilityState={{ selected: config.diasAtendimento.includes(dia.value) }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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

            {renderPickerRow(
              'Início',
              horasOptions.filter((h) => h.value < config.horaFim),
              config.horaInicio,
              (v) => setConfig((p) => ({ ...p, horaInicio: v })),
            )}
            {renderPickerRow(
              'Fim',
              horasOptions.filter((h) => h.value > config.horaInicio),
              config.horaFim,
              (v) => setConfig((p) => ({ ...p, horaFim: v })),
            )}

            <View style={s.switchRow}>
              <Text style={s.fieldLabel}>Faço pausa para almoço</Text>
              <Switch
                value={almoco}
                onValueChange={setAlmoco}
                trackColor={{ true: theme.colors.primary }}
                // thumbColor do Switch nativo — não é texto/ícone/ActivityIndicator
                // sobre fundo saturado (é o "polegar" do próprio componente), por
                // isso fica fora do escopo dos tokens textSobrePrimaria/textSobreDestaque.
                thumbColor="#fff"
              />
            </View>
            {almoco && (
              <>
                {renderPickerRow(
                  'Início do almoço',
                  horasOptions.filter((h) => h.value > config.horaInicio && h.value < config.horaFim),
                  config.almocoInicio,
                  (v) => setConfig((p) => ({ ...p, almocoInicio: v })),
                )}
                {renderPickerRow(
                  'Fim do almoço',
                  horasOptions.filter((h) => h.value > config.almocoInicio && h.value < config.horaFim),
                  config.almocoFim,
                  (v) => setConfig((p) => ({ ...p, almocoFim: v })),
                )}
              </>
            )}

            <View style={s.switchRow}>
              <Text style={s.fieldLabel}>Também atendo em outro turno (ex.: noite)</Text>
              <Switch
                value={!!config.turnoExtraAtivo}
                onValueChange={(v) => setConfig((p) => ({ ...p, turnoExtraAtivo: v }))}
                trackColor={{ true: theme.colors.primary }}
                // thumbColor do Switch nativo — mesma exceção do switch acima.
                thumbColor="#fff"
              />
            </View>
            {config.turnoExtraAtivo && (
              <>
                {renderPickerRow(
                  'Início do turno extra',
                  horasOptions,
                  config.turnoExtraInicio || '19:00',
                  (v) => setConfig((p) => ({ ...p, turnoExtraInicio: v })),
                )}
                {renderPickerRow(
                  'Fim do turno extra',
                  horasOptions.filter((h) => h.value > (config.turnoExtraInicio || '19:00')),
                  config.turnoExtraFim || '21:00',
                  (v) => setConfig((p) => ({ ...p, turnoExtraFim: v })),
                )}
              </>
            )}
          </ScrollView>
          <View style={s.footer}>
            <TouchableOpacity
              style={s.secondaryButton}
              onPress={() => setPasso(1)}
              accessibilityRole="button"
              accessibilityLabel="Voltar para os serviços"
            >
              <Text style={s.secondaryButtonText}>Voltar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryButton, s.primaryButtonFlex]}
              onPress={handleContinuarHorario}
              accessibilityRole="button"
              accessibilityLabel="Continuar para a confirmação"
            >
              <Text style={s.primaryButtonText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {passo === 3 && (
        <View style={s.concluidoContainer}>
          {/* Emoji decorativo original (foguete) removido — sem substituição
              por ícone, mapa de substituição da Fase 1 classifica como
              ruído puro, não função. */}
          <Text style={s.concluidoTitulo}>Tudo pronto para começar!</Text>
          <Text style={s.concluidoTexto}>
            {servicosSelecionados.size} {servicosSelecionados.size === 1 ? 'serviço configurado' : 'serviços configurados'} ·{' '}
            {config.diasAtendimento.length} {config.diasAtendimento.length === 1 ? 'dia' : 'dias'} de atendimento
          </Text>
          <Text style={s.concluidoHint}>
            Você pode revisar ou ajustar tudo isso a qualquer momento em Configurações.
          </Text>

          <TouchableOpacity
            style={[s.primaryButton, s.concluidoButton, saving && s.primaryButtonDisabled]}
            onPress={handleConcluir}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Ir para o painel"
          >
            {saving ? <ActivityIndicator color={theme.colors.textSobrePrimaria} /> : <Text style={s.primaryButtonText}>Ir para o Painel</Text>}
          </TouchableOpacity>
        </View>
      )}
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
    header: {
      padding: 20,
      paddingBottom: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    progressoRow: {
      flexDirection: 'row',
      gap: 6,
    },
    progressoDot: {
      width: 24,
      height: 4,
      borderRadius: 6,
      backgroundColor: theme.colors.border,
    },
    progressoDotAtivo: {
      backgroundColor: theme.colors.primary,
    },
    pularText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      fontWeight: '600',
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    headerTitulo: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.colors.text,
      marginBottom: 6,
    },
    headerSubtitulo: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    scroll: {
      padding: 16,
      paddingBottom: 32,
    },
    servicoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceVariant,
      marginBottom: 10,
    },
    servicoCardSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary + '15',
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    checkboxChecked: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    servicoNome: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 2,
    },
    servicoMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    servicoMeta: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    fieldGroup: {
      marginBottom: 16,
    },
    fieldLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 8,
      fontWeight: '600',
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
    diasRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 20,
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
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
      gap: 12,
    },
    footer: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      minHeight: 52,
      justifyContent: 'center',
      flex: 1,
    },
    primaryButtonFlex: {
      flex: 2,
    },
    primaryButtonDisabled: {
      backgroundColor: theme.colors.textMuted,
    },
    primaryButtonText: {
      color: theme.colors.textSobrePrimaria,
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryButton: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      minHeight: 52,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    secondaryButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 16,
      fontWeight: '700',
    },
    concluidoContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    concluidoTitulo: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: 12,
    },
    concluidoTexto: {
      fontSize: 16,
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: 8,
      fontWeight: '600',
    },
    concluidoHint: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 19,
    },
    concluidoButton: {
      width: '100%',
    },
  });
