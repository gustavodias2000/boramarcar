/**
 * TemplatesMensagemScreen — barbeiro personaliza os templates de mensagens
 * enviadas via WhatsApp em cada etapa do agendamento.
 *
 * Variáveis disponíveis:
 *   {nome_barbeiro}  {nome_cliente}  {data}  {horario}  {servico}
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { upsertBarbeiro, getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { useTheme, type Theme } from '../context/ThemeContext';
import Icone, { type NomeIcone } from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TemplatesMensagem } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'TemplatesMensagem'>;

const VARIAVEIS = [
  '{nome_barbeiro}',
  '{nome_cliente}',
  '{data}',
  '{horario}',
  '{servico}',
];

const DEFAULTS: TemplatesMensagem = {
  agendamento: `Olá {nome_barbeiro}! 👋\n\nSou {nome_cliente} e gostaria de agendar um horário.\n\n📅 Data: {data}\n🕐 Horário: {horario}\n✂️ Serviço: {servico}\n\nAguardo confirmação. Obrigado! 🙏`,
  confirmacao: `Olá {nome_cliente}! 👋\n\nSeu agendamento foi confirmado! ✅\n\n👨‍💼 Barbeiro: {nome_barbeiro}\n📅 Data: {data}\n🕐 Horário: {horario}\n✂️ Serviço: {servico}\n\nNos vemos em breve! 💪`,
  cancelamento: `Olá {nome_cliente}! 👋\n\nInfelizmente precisamos cancelar seu agendamento:\n\n📅 Data: {data}\n🕐 Horário: {horario}\n\nPor favor, reagende quando for conveniente. Obrigado! 🙏`,
  lembrete: `Olá {nome_cliente}! 👋\n\n🔔 Lembrete do seu agendamento:\n\n👨‍💼 Barbeiro: {nome_barbeiro}\n📅 Data: {data}\n🕐 Horário: {horario}\n✂️ Serviço: {servico}\n\nTe esperamos! 💪`,
};

// Textos dos rótulos de cada card (chrome da interface) — os emojis que
// ficavam aqui viraram ícone (ver ICONES_LABEL abaixo). NÃO confundir com
// `DEFAULTS` acima: aqueles emojis são CONTEÚDO da mensagem de WhatsApp que
// o barbeiro edita/visualiza, não decoração da interface — por isso
// permanecem intocados.
const LABELS: Record<keyof TemplatesMensagem, string> = {
  agendamento: 'Solicitação de Agendamento',
  confirmacao: 'Confirmação',
  cancelamento: 'Cancelamento',
  lembrete: 'Lembrete',
};

const ICONES_LABEL: Record<keyof TemplatesMensagem, NomeIcone> = {
  agendamento: 'email',
  confirmacao: 'confirmado',
  cancelamento: 'fechar',
  lembrete: 'notificacao',
};

export default function TemplatesMensagemScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const [templates, setTemplates] = useState<TemplatesMensagem>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeField, setActiveField] = useState<keyof TemplatesMensagem | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const barbeiro = await getBarbeiro(uid);
      if (barbeiro?.templatesMensagem) {
        // Merge with defaults for any missing keys
        setTemplates({ ...DEFAULTS, ...barbeiro.templatesMensagem });
      }
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      await upsertBarbeiro(uid, { templatesMensagem: templates });
      Alert.alert('Sucesso!', 'Templates salvos com sucesso.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Erro ao salvar templates:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (key: keyof TemplatesMensagem) => {
    Alert.alert(
      'Restaurar padrão',
      'Restaurar o template padrão para este tipo de mensagem?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: () => setTemplates((prev) => ({ ...prev, [key]: DEFAULTS[key] })),
        },
      ],
    );
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
        {/* Dica sobre variáveis */}
        <View style={s.helpCard}>
          <Text style={s.helpTitle}>Variáveis disponíveis</Text>
          <Text style={s.helpText}>
            Use estas variáveis no texto — elas serão substituídas automaticamente:
          </Text>
          <View style={s.varRow}>
            {VARIAVEIS.map((v) => (
              <View key={v} style={s.varChip}>
                <Text style={s.varChipText}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Um campo de texto por template */}
        {(Object.keys(LABELS) as Array<keyof TemplatesMensagem>).map((key) => (
          <View key={key} style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardTitleRow}>
                <Icone nome={ICONES_LABEL[key]} tamanho={16} cor={theme.colors.text} decorativo />
                <Text style={s.cardTitle}>{LABELS[key]}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleReset(key)}
                accessibilityRole="button"
                accessibilityLabel={`Restaurar template padrão de ${LABELS[key]}`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={s.resetText}>Restaurar padrão</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={templates[key]}
              onChangeText={(text) => setTemplates((prev) => ({ ...prev, [key]: text }))}
              style={[s.textArea, activeField === key && s.textAreaFocused]}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              onFocus={() => setActiveField(key)}
              onBlur={() => setActiveField(null)}
              placeholderTextColor={theme.colors.textMuted}
            />
            <Text style={s.charCount}>{templates[key].length} caracteres</Text>
          </View>
        ))}

        <TouchableOpacity
          style={[s.saveButton, saving && s.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Salvar templates de mensagem"
          accessibilityState={{ disabled: saving, busy: saving }}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.textSobrePrimaria} />
          ) : (
            <Text style={s.saveButtonText}>Salvar Templates</Text>
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
    helpCard: {
      backgroundColor: theme.colors.bannerInfoBackground,
      borderRadius: raio.card,
      padding: 16,
      marginBottom: 16,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
    },
    helpTitle: {
      fontSize: tipografia.apoio.fontSize,
      fontWeight: '700',
      color: theme.colors.primary,
      marginBottom: 6,
    },
    helpText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.bannerInfoText,
      marginBottom: 10,
      lineHeight: 18,
    },
    varRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    varChip: {
      backgroundColor: theme.colors.primary,
      borderRadius: raio.chip,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    varChipText: {
      color: theme.colors.textSobrePrimaria,
      fontSize: tipografia.micro.fontSize,
      fontWeight: '600',
      fontFamily: 'monospace',
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
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    cardTitle: {
      fontSize: tipografia.corpoForte.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
    },
    resetText: {
      fontSize: tipografia.micro.fontSize,
      color: theme.colors.primary,
      fontWeight: '600',
    },
    textArea: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: raio.input,
      padding: 12,
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
      minHeight: 140,
      lineHeight: 20,
    },
    textAreaFocused: {
      borderColor: theme.colors.primary,
      borderWidth: 2,
    },
    charCount: {
      fontSize: tipografia.micro.fontSize,
      color: theme.colors.textMuted,
      textAlign: 'right',
      marginTop: 4,
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
    saveButtonText: {
      color: theme.colors.textSobrePrimaria,
      fontSize: tipografia.corpoForte.fontSize,
      fontWeight: '700',
    },
  });
