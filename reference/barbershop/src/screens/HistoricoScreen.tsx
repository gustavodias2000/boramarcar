import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import Icone from '../components/Icone';
import RatingComponent from '../components/RatingComponent';
import { liberarSlotsDoAgendamento } from '../services/OcupacaoService';
import {
  listarDoCliente,
  atualizarStatus,
} from '../data/repositories/AgendamentoRepository';
import { formatDateTime, formatPreco } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import { getStatusColor, getStatusText } from '../utils/statusUtils';
import { SkeletonList } from '../components/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Agendamento, StatusAgendamento } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Historico'>;
type Filtro = StatusAgendamento | 'todos';

interface FiltroOption {
  key: Filtro;
  label: string;
}

const FILTROS: FiltroOption[] = [
  { key: 'todos',     label: 'Todos' },
  { key: 'pendente',  label: 'Pendentes' },
  { key: 'confirmado',label: 'Confirmados' },
  { key: 'concluido', label: 'Concluídos' },
  { key: 'cancelado', label: 'Cancelados' },
];

export default function HistoricoScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [showRating, setShowRating] = useState(false);
  const [selectedAgendamento, setSelectedAgendamento] = useState<Agendamento | null>(null);
  // Identifica a requisição de histórico "atual" — evita que uma resposta
  // fora de ordem (o usuário trocou de filtro rápido demais, ou um
  // pull-to-refresh cruzou com uma troca de filtro) sobrescreva a lista com
  // dados de um filtro que não é mais o selecionado. Mesmo padrão de
  // `requisicaoHorariosRef` em `AgendamentoScreen.tsx#fetchHorariosDisponiveis`.
  const requisicaoHistoricoRef = useRef(0);

  useEffect(() => {
    fetchAgendamentos();
    // `fetchAgendamentos` só lê `filtro`, que já está na lista de dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  const fetchAgendamentos = async () => {
    const minhaRequisicao = ++requisicaoHistoricoRef.current;
    try {
      // Item 9.3: identidade por uid (imutável), não mais por email
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const resultado = await listarDoCliente(uid, { status: filtro, max: 50 });
      // Resposta obsoleta: outra requisição (troca de filtro ou refresh) já
      // foi disparada depois desta — descarta, quem manda é a mais recente.
      if (minhaRequisicao !== requisicaoHistoricoRef.current) return;
      setAgendamentos(resultado);
    } catch (error) {
      if (minhaRequisicao !== requisicaoHistoricoRef.current) return;
      console.error('Erro ao buscar histórico:', error);
      Alert.alert('Erro', 'Não foi possível carregar o histórico.');
    } finally {
      if (minhaRequisicao === requisicaoHistoricoRef.current) {
        setLoading(false);
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchAgendamentos();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const cancelarAgendamento = async (agendamento: Agendamento) => {
    Alert.alert(
      'Cancelar Agendamento',
      'Tem certeza que deseja cancelar este agendamento?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              await atualizarStatus(agendamento.id, 'cancelado', {
                cancelledBy: 'cliente',
              });

              // Libera TODOS os blocos reservados (um corte de 1h ocupa 2
              // blocos de 30 min — antes só o primeiro era liberado).
              await liberarSlotsDoAgendamento(agendamento);

              // O aviso ao barbeiro agora é responsabilidade do trigger
              // reativo `notificarMudancaStatusAgendamento`
              // (functions/index.js, evento `agendamento_cancelado_cliente`)
              // — mandar o WhatsApp também daqui duplicaria a notificação.

              Alert.alert('Sucesso', 'Agendamento cancelado com sucesso.');
              await fetchAgendamentos();
            } catch (error) {
              console.error('Erro ao cancelar:', error);
              Alert.alert('Erro', 'Não foi possível cancelar o agendamento.');
            }
          },
        },
      ],
    );
  };

  const reagendar = (agendamento: Agendamento) => {
    const barbeiro = {
      id: agendamento.barbeiroId,
      nome: agendamento.barbeiroNome,
      telefone: agendamento.barbeiroTelefone,
      especialidade: agendamento.servico,
      preco: agendamento.preco,
    };
    navigation.navigate('Agendamento', { barbeiro });
  };

  const renderAgendamento = ({ item }: { item: Agendamento }) => (
    <View style={s.agendamentoCard}>
      <View style={s.cardHeader}>
        <View style={s.barbeiroInfo}>
          <Text style={s.barbeiroNome}>{item.barbeiroNome}</Text>
          <Text style={s.servico}>{item.servico || 'Corte e barba'}</Text>
        </View>
        <View
          style={[s.statusBadge, { backgroundColor: getStatusColor(item.status) }]}
          accessibilityLabel={`Status: ${getStatusText(item.status)}`}
        >
          <Text style={s.statusText}>{getStatusText(item.status)}</Text>
        </View>
      </View>

      <View style={s.agendamentoDetails}>
        <View style={s.detailRow}>
          <Icone nome="calendario" tamanho={16} cor={theme.colors.text} decorativo />
          <Text style={s.dataHorario}>
            {item.data} às {item.horario}
          </Text>
        </View>
        <View style={s.detailRow}>
          <Icone nome="carteira" tamanho={16} cor={theme.colors.success} decorativo />
          <Text style={s.preco}>{formatPreco(item)}</Text>
        </View>
        <Text style={s.criadoEm}>
          Criado em: {formatDateTime(item.createdAt)}
        </Text>
      </View>

      {/*
        CRÍTICO 1 da auditoria: "Avaliar" estava condicionado a 'confirmado',
        mas a regra do Firestore (statusPermitidoAoCliente, firestore.rules)
        só aceita a transição para 'avaliado' a partir de 'concluido' — não
        existia caminho na UI para o único estado que a regra autoriza, e a
        coleção `avaliacoes` nunca recebia nada.
        Cancelar agora cobre 'pendente' E 'confirmado' — o mesmo par que
        `statusPermitidoAoCliente()` permite cancelar (nunca a partir de
        'concluido'/'avaliado': "impede desfazer um atendimento já
        prestado").
      */}
      {(item.status === 'pendente' || item.status === 'confirmado') && (
        <View style={s.actionButtons}>
          <TouchableOpacity
            style={[s.actionButton, s.cancelButton]}
            accessibilityRole="button"
            accessibilityLabel="Cancelar este agendamento"
            accessibilityHint="Libera o horário, não pode ser desfeito"
            onPress={() => cancelarAgendamento(item)}
          >
            <Text style={[s.actionButtonText, s.cancelButtonText]}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}

      {item.status === 'cancelado' && (
        <View style={s.actionButtons}>
          <TouchableOpacity
            style={[s.actionButton, s.reagendarButton]}
            accessibilityRole="button"
            accessibilityLabel={`Reagendar com ${item.barbeiroNome}`}
            onPress={() => reagendar(item)}
          >
            <Text style={[s.actionButtonText, s.reagendarButtonText]}>Reagendar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/*
        'concluido' mostra Reagendar E Avaliar juntos — não são mutuamente
        exclusivos. `reagendar()` só navega para criar um agendamento NOVO
        com o mesmo barbeiro (não toca no item concluído); "Avaliar" abre o
        modal que transiciona ESTE item para 'avaliado'. As duas ações não
        conflitam e fazem sentido juntas: o cliente pode querer avaliar o
        corte que acabou de fazer E já marcar o próximo.
        'avaliado' não cai em nenhum bloco acima — a regra trata 'avaliado'
        como terminal para o cliente (só o barbeiro edita campos neutros
        depois disso), então nenhum botão de ação aparece.
      */}
      {item.status === 'concluido' && (
        <View style={s.actionButtons}>
          <TouchableOpacity
            style={[s.actionButton, s.reagendarButton]}
            accessibilityRole="button"
            accessibilityLabel={`Reagendar com ${item.barbeiroNome}`}
            onPress={() => reagendar(item)}
          >
            <Text style={[s.actionButtonText, s.reagendarButtonText]}>Reagendar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionButton, s.avaliarButton]}
            accessibilityRole="button"
            accessibilityLabel={`Avaliar ${item.barbeiroNome}`}
            onPress={() => {
              setSelectedAgendamento(item);
              setShowRating(true);
            }}
          >
            <Text style={s.actionButtonText}>Avaliar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderFiltros = () => (
    <View style={s.filtrosContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {FILTROS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[s.filtroButton, filtro === item.key && s.filtroButtonActive]}
            accessibilityRole="button"
            accessibilityLabel={`Filtrar por: ${item.label}`}
            accessibilityState={{ selected: filtro === item.key }}
            onPress={() => {
              setLoading(true);
              setFiltro(item.key);
            }}
          >
            <Text
              style={[
                s.filtroButtonText,
                filtro === item.key && s.filtroButtonTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  if (loading) {
    // Skeleton loading (item 17)
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <SkeletonList count={4} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Text style={s.title}>Histórico de Agendamentos</Text>
      </View>

      {renderFiltros()}

      <FlatList
        data={agendamentos}
        keyExtractor={(item) => item.id}
        renderItem={renderAgendamento}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>
              {filtro === 'todos'
                ? 'Nenhum agendamento encontrado'
                : `Nenhum agendamento ${getStatusText(filtro).toLowerCase()} encontrado`}
            </Text>
            <Text style={s.emptySubtext}>
              Seus agendamentos aparecerão aqui
            </Text>
          </View>
        }
        contentContainerStyle={agendamentos.length === 0 && s.emptyList}
      />

      <RatingComponent
        visible={showRating}
        onClose={() => {
          setShowRating(false);
          setSelectedAgendamento(null);
          fetchAgendamentos();
        }}
        agendamento={selectedAgendamento}
      />
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  header: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  filtrosContainer: {
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filtroButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceVariant,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 40,
    justifyContent: 'center',
  },
  filtroButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filtroButtonText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  filtroButtonTextActive: {
    color: theme.colors.textSobrePrimaria,
    fontWeight: 'bold',
  },
  agendamentoCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.sombra,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  barbeiroInfo: {
    flex: 1,
    marginRight: 8,
  },
  barbeiroNome: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  servico: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  // '#fff' mantido: o fundo do badge vem de `getStatusColor()`
  // (src/utils/statusUtils.ts), uma paleta própria de cores de status
  // (laranja/verde/roxo/vermelho/azul) fora dos tokens primary/secondary/
  // error/success/info/warning/whatsapp do ThemeContext — não é o padrão
  // botão âmbar nem o padrão "destaque" mapeado por este token.
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  agendamentoDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dataHorario: {
    fontSize: 14,
    color: theme.colors.text,
  },
  preco: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.success,
  },
  criadoEm: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: theme.colors.error,
  },
  reagendarButton: {
    backgroundColor: theme.colors.primary,
  },
  // Sem token correspondente no tema (ver relatório da Fase 1): roxo usado só
  // no botão "Avaliar", fora da paleta âmbar + azul-profundo.
  avaliarButton: {
    backgroundColor: '#8e44ad',
  },
  // Cor branca fixa usada como base para o botão "Avaliar" (fundo roxo
  // customizado em `avaliarButton`, fora da paleta de tokens do tema — ver
  // comentário acima). Os botões Cancelar e Reagendar sobrescrevem esta cor
  // logo abaixo com os tokens corretos para seus fundos `error`/`primary`.
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButtonText: {
    color: theme.colors.textSobreDestaque,
  },
  reagendarButtonText: {
    color: theme.colors.textSobrePrimaria,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
