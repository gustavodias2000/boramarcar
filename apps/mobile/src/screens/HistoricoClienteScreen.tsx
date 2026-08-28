/**
 * HistoricoClienteScreen — visão detalhada do histórico de um cliente
 * específico para o barbeiro.
 *
 * Mostra: total de visitas, último serviço, total gasto, frequência média,
 * lista completa de agendamentos e botão para banir o cliente.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import Icone from '../components/Icone';
import { listarPorClienteEBarbeiro } from '../data/repositories/AgendamentoRepository';
import { estaBanido, banirCliente } from '../data/repositories/BanimentoRepository';
import { formatMoney } from '../utils/dateUtils';
import { getStatusColor, getStatusText } from '../utils/statusUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Agendamento } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'HistoricoCliente'>;

interface Stats {
  totalVisitas: number;
  totalGastoCentavos: number;
  ultimoServico: string | null;
  ultimaData: string | null;
  frequenciaDias: number | null; // média de dias entre visitas
}

export default function HistoricoClienteScreen({ route, navigation }: Props) {
  const { clienteUid, clienteNome, barbeiroId } = route.params;
  const { theme } = useTheme();
  const s = getStyles(theme);

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalVisitas: 0,
    totalGastoCentavos: 0,
    ultimoServico: null,
    ultimaData: null,
    frequenciaDias: null,
  });
  const [loading, setLoading] = useState(true);
  const [banindo, setBanindo] = useState(false);

  useEffect(() => {
    loadHistorico();
    // Carga única na montagem: `loadHistorico` só lê `route.params`, que o
    // React Navigation mantém estável enquanto a tela existe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistorico = async () => {
    try {
      const dados = await listarPorClienteEBarbeiro(clienteUid, barbeiroId);
      setAgendamentos(dados);
      calcularStats(dados);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      Alert.alert('Erro', 'Não foi possível carregar o histórico.');
    } finally {
      setLoading(false);
    }
  };

  const calcularStats = (dados: Agendamento[]) => {
    const concluidos = dados.filter((a) => ['confirmado', 'concluido', 'avaliado'].includes(a.status));

    const totalGasto = concluidos.reduce(
      (acc, a) => acc + (a.precoEmCentavos ?? 0),
      0,
    );

    const maiorData = dados[0]; // ordenados por data desc

    let frequencia: number | null = null;
    if (concluidos.length >= 2) {
      const datas = concluidos
        .map((a) => a.data)
        .sort()
        .reverse();
      let totalDias = 0;
      for (let i = 0; i < datas.length - 1; i++) {
        const d1 = new Date(datas[i]);
        const d2 = new Date(datas[i + 1]);
        totalDias += Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
      }
      frequencia = Math.round(totalDias / (datas.length - 1));
    }

    setStats({
      totalVisitas: concluidos.length,
      totalGastoCentavos: totalGasto,
      ultimoServico: maiorData?.servico ?? null,
      ultimaData: maiorData?.data ?? null,
      frequenciaDias: frequencia,
    });
  };

  const handleBanir = () => {
    Alert.alert(
      'Banir cliente',
      `Tem certeza que deseja banir ${clienteNome}? Ele não conseguirá mais agendar com você.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Banir',
          style: 'destructive',
          onPress: confirmarBanimento,
        },
      ],
    );
  };

  const confirmarBanimento = async () => {
    setBanindo(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      if (await estaBanido(uid, clienteUid)) {
        Alert.alert('Aviso', 'Este cliente já está na lista de banidos.');
        return;
      }

      const emailCliente = agendamentos[0]?.cliente ?? '';
      await banirCliente(uid, { uid: clienteUid, nome: clienteNome, email: emailCliente });

      Alert.alert('Sucesso!', `${clienteNome} foi banido com sucesso.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Erro ao banir cliente:', error);
      Alert.alert('Erro', 'Não foi possível banir o cliente. Tente novamente.');
    } finally {
      setBanindo(false);
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
      <FlatList
        data={agendamentos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <>
            {/* Cards de stats */}
            <View style={s.statsGrid}>
              <View style={[s.statCard, { borderLeftColor: theme.colors.primary }]}>
                <Text style={s.statValue}>{stats.totalVisitas}</Text>
                <Text style={s.statLabel}>Visitas</Text>
              </View>
              <View style={[s.statCard, { borderLeftColor: theme.colors.success }]}>
                <Text style={s.statValue}>
                  {formatMoney(stats.totalGastoCentavos)}
                </Text>
                <Text style={s.statLabel}>Total gasto</Text>
              </View>
            </View>

            <View style={s.statsGrid}>
              <View style={[s.statCard, s.statCardWarning]}>
                <Text style={s.statValue}>{stats.ultimoServico ?? '—'}</Text>
                <Text style={s.statLabel}>Último serviço</Text>
              </View>
              <View style={[s.statCard, s.statCardSecondary]}>
                <Text style={s.statValue}>
                  {stats.frequenciaDias != null
                    ? `${stats.frequenciaDias}d`
                    : '—'}
                </Text>
                <Text style={s.statLabel}>Frequência média</Text>
              </View>
            </View>

            {/* Botão criar recorrência */}
            <TouchableOpacity
              style={s.recorrenciaButton}
              onPress={() =>
                navigation.navigate('CriarRecorrencia', {
                  clienteUid,
                  clienteNome,
                  clienteEmail: agendamentos[0]?.cliente ?? '',
                  clienteTelefone: agendamentos[0]?.clienteTelefone,
                  barbeiroId,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Criar recorrência para ${clienteNome}`}
            >
              <View style={s.buttonContent}>
                <Icone nome="recarregar" tamanho={16} cor={theme.colors.textSobrePrimaria} decorativo />
                <Text style={s.recorrenciaButtonText}>Criar recorrência</Text>
              </View>
            </TouchableOpacity>

            {/* Botão banir */}
            <TouchableOpacity
              style={[s.banirButton, banindo && s.banirButtonDisabled]}
              onPress={handleBanir}
              disabled={banindo}
              accessibilityRole="button"
              accessibilityLabel={`Banir ${clienteNome}`}
              accessibilityHint="Impede que este cliente agende novamente com você"
              accessibilityState={{ disabled: banindo, busy: banindo }}
            >
              {banindo ? (
                <ActivityIndicator color={theme.colors.textSobreDestaque} size="small" />
              ) : (
                <View style={s.buttonContent}>
                  <Icone nome="bloqueado" tamanho={16} cor={theme.colors.textSobreDestaque} decorativo />
                  <Text style={s.banirButtonText}>Banir este cliente</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={s.sectionTitle}>
              Histórico de Agendamentos ({agendamentos.length})
            </Text>
          </>
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>Nenhum agendamento encontrado.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.agCard}>
            <View style={s.agRow}>
              <View style={s.agDataRow}>
                <Icone nome="calendario" tamanho={16} cor={theme.colors.text} decorativo />
                <Text style={s.agData}>{item.data} às {item.horario}</Text>
              </View>
              <View
                style={[s.statusBadge, { backgroundColor: getStatusColor(item.status) }]}
              >
                <Text style={s.statusText}>{getStatusText(item.status)}</Text>
              </View>
            </View>
            <View style={s.agServicoRow}>
              <Icone nome="tesoura" tamanho={16} cor={theme.colors.textSecondary} decorativo />
              <Text style={s.agServico}>
                {item.servico || 'Serviço'}
                {item.precoEmCentavos
                  ? `  ·  ${formatMoney(item.precoEmCentavos)}`
                  : item.preco
                    ? `  ·  R$ ${item.preco}`
                    : ''}
              </Text>
            </View>
          </View>
        )}
      />
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
    list: {
      padding: 16,
      paddingBottom: 40,
    },
    statsGrid: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 12,
    },
  statCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      padding: 14,
      borderRadius: 14,
      borderLeftWidth: 4,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
  },
  // Sem token correspondente no tema (ver relatório da Fase 1): laranja e
  // roxo usados só como acento lateral do card, não fazem parte da paleta
  // âmbar + azul-profundo.
  statCardWarning: { borderLeftColor: '#f39c12' },
  statCardSecondary: { borderLeftColor: '#9b59b6' },
    statValue: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 2,
    },
    statLabel: {
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    recorrenciaButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 10,
      minHeight: 48,
      justifyContent: 'center',
    },
    recorrenciaButtonText: {
      color: theme.colors.textSobrePrimaria,
      fontSize: 16,
      fontWeight: '700',
    },
    banirButton: {
      backgroundColor: theme.colors.error,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 20,
      minHeight: 48,
      justifyContent: 'center',
    },
    banirButtonDisabled: {
      backgroundColor: theme.colors.textMuted,
    },
    banirButtonText: {
      color: theme.colors.textSobreDestaque,
      fontSize: 16,
      fontWeight: '700',
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 12,
    },
    emptyContainer: {
      paddingVertical: 24,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    agCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    agRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    agDataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    agData: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
      flex: 1,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    // '#fff' mantido de propósito: o fundo deste badge vem de
    // getStatusColor() (STATUS_MAP em src/utils/statusUtils.ts), uma paleta
    // própria de status (laranja/verde/roxo/vermelho/azul) independente dos
    // tokens de tema primary/secondary/error/success/info/warning — não é o
    // padrão botão-âmbar coberto por textSobrePrimaria/textSobreDestaque.
    statusText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    agServicoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    agServico: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
  });
