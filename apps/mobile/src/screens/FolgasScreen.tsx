/**
 * FolgasScreen — o barbeiro marca datas específicas como indisponíveis
 * (férias, feriados, imprevistos). Essas datas somem do calendário do
 * cliente em AgendamentoScreen, evitando agendamentos em dias que o
 * barbeiro não vai atender.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { upsertBarbeiro, getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { atualizarProfissional } from '../data/repositories/NegocioRepository';
import { toLocalDateString } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Folgas'>;

// Quantos dias à frente o barbeiro pode marcar folga
const DIAS_A_FRENTE = 90;

interface DiaCandidato {
  date: string;
  diaSemana: string;
  diaMes: string;
  mes: string;
}

function gerarProximosDias(qtd: number): DiaCandidato[] {
  const result: DiaCandidato[] = [];
  const hoje = new Date();
  for (let i = 0; i <= qtd; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    result.push({
      date: toLocalDateString(d),
      diaSemana: d.toLocaleDateString('pt-BR', { weekday: 'short' }),
      diaMes: String(d.getDate()).padStart(2, '0'),
      mes: d.toLocaleDateString('pt-BR', { month: 'short' }),
    });
  }
  return result;
}

export default function FolgasScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const profissionalId = route.params?.profissionalId;
  const profissionalNome = route.params?.profissionalNome;
  const targetId = profissionalId || auth.currentUser?.uid;

  const [bloqueadas, setBloqueadas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const dias = useMemo(() => gerarProximosDias(DIAS_A_FRENTE), []);

  useEffect(() => {
    loadFolgas();
    // Carga única na montagem: `loadFolgas` só lê o uid autenticado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFolgas = async () => {
    try {
      if (!targetId) return;
      const barbeiro = await getBarbeiro(targetId);
      setBloqueadas(new Set(barbeiro?.datasBloqueadas ?? []));
    } catch (error) {
      console.error('Erro ao carregar folgas:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDia = (date: string) => {
    setBloqueadas((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!targetId) return;
      const dados = { datasBloqueadas: Array.from(bloqueadas).sort() };
      if (profissionalId) {
        await atualizarProfissional(profissionalId, dados);
      } else {
        await upsertBarbeiro(targetId, dados);
      }
      Alert.alert('Sucesso!', 'Dias de folga salvos.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Erro ao salvar folgas:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
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
      {profissionalId && (
        <View style={s.profissionalBanner}>
          <Text style={s.profissionalBannerText}>
            Editando as folgas de {profissionalNome || 'um profissional da equipe'}
          </Text>
        </View>
      )}

      <View style={s.hintCard}>
        <Text style={s.hintText}>
          Toque em uma data para bloqueá-la. Datas bloqueadas não aparecem
          para os clientes no calendário de agendamento.
        </Text>
        {bloqueadas.size > 0 && (
          <Text style={s.countText}>
            {bloqueadas.size} {bloqueadas.size === 1 ? 'dia bloqueado' : 'dias bloqueados'}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={s.grid}>
        {dias.map((dia) => {
          const isBloqueada = bloqueadas.has(dia.date);
          return (
            <TouchableOpacity
              key={dia.date}
              style={[s.diaCard, isBloqueada && s.diaCardBloqueada]}
              onPress={() => toggleDia(dia.date)}
              accessibilityRole="button"
              accessibilityLabel={`${dia.diaSemana} ${dia.diaMes} de ${dia.mes}${isBloqueada ? ', bloqueado' : ', disponível'}`}
              accessibilityState={{ selected: isBloqueada }}
            >
              <Text style={[s.diaSemanaText, isBloqueada && s.diaTextBloqueada]}>
                {dia.diaSemana}
              </Text>
              <Text style={[s.diaMesText, isBloqueada && s.diaTextBloqueada]}>
                {dia.diaMes}
              </Text>
              <Text style={[s.mesText, isBloqueada && s.diaTextBloqueada]}>
                {dia.mes}
              </Text>
              {isBloqueada && (
                <View style={s.diaCardIconWrap}>
                  <Icone nome="bloqueado" tamanho={16} cor={theme.colors.error} decorativo />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.saveButton, saving && s.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Salvar dias de folga"
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.textSobrePrimaria} />
          ) : (
            <Text style={s.saveButtonText}>Salvar Dias de Folga</Text>
          )}
        </TouchableOpacity>
      </View>
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
    profissionalBanner: {
      backgroundColor: theme.colors.primary + '20',
      borderRadius: raio.input,
      padding: 12,
      margin: 16,
      marginBottom: 0,
    },
    profissionalBannerText: {
      fontSize: tipografia.apoio.fontSize,
      fontWeight: '700',
      color: theme.colors.primary,
      textAlign: 'center',
    },
    hintCard: {
      backgroundColor: theme.colors.surface,
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    hintText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
    countText: {
      fontSize: tipografia.apoio.fontSize,
      fontWeight: '700',
      color: theme.colors.primary,
      marginTop: 8,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: 12,
      gap: 8,
      paddingBottom: 24,
    },
    diaCard: {
      width: '22%',
      minWidth: 72,
      minHeight: 72,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: raio.input,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
    },
    diaCardBloqueada: {
      backgroundColor: theme.colors.error + '20',
      borderColor: theme.colors.error,
    },
    diaCardIconWrap: {
      marginTop: 2,
    },
    diaSemanaText: {
      fontSize: tipografia.micro.fontSize,
      color: theme.colors.textSecondary,
      textTransform: 'capitalize',
    },
    diaMesText: {
      fontSize: tipografia.subtitulo.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
    },
    mesText: {
      fontSize: tipografia.micro.fontSize,
      color: theme.colors.textSecondary,
      textTransform: 'capitalize',
    },
    diaTextBloqueada: {
      color: theme.colors.error,
    },
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: raio.input,
      paddingVertical: 16,
      alignItems: 'center',
      minHeight: 52,
      justifyContent: 'center',
    },
    saveButtonDisabled: {
      backgroundColor: theme.colors.textMuted,
    },
    saveButtonText: {
      // Texto sobre botão salvar (fundo `primary` — âmbar).
      color: theme.colors.textSobrePrimaria,
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '700',
    },
  });
