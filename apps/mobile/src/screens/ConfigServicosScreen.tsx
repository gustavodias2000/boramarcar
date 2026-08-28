/**
 * ConfigServicosScreen — barbeiro cadastra/edita seus serviços
 * com nome, duração e preço. Os serviços são exibidos ao cliente
 * na tela de agendamento para seleção.
 *
 * DOM-01 (perda silenciosa de atualização): esta tela carrega o array INTEIRO
 * de serviços, deixa editar em memória e reescreve o array inteiro. O dono
 * costuma ter a mesma conta aberta no tablet do balcão e no celular — quando
 * os dois salvam, o segundo apagava as mudanças do primeiro sem avisar
 * ninguém.
 *
 * A correção é concorrência otimista, não merge automático: a tela guarda a
 * marca de versão do documento no momento da carga e a repassa ao repositório,
 * que recusa a escrita se o documento tiver mudado. Merge foi recusado de
 * propósito — se os dois lados editaram o PREÇO do mesmo serviço não existe
 * resposta que o código possa inventar, e inventar errado em preço é pior que
 * o problema original.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import {
  getBarbeiro,
  upsertBarbeiroSeNaoMudou,
  marcaDeVersaoBarbeiro,
  ehConflitoDeVersao,
  type MarcaDeVersao,
} from '../data/repositories/BarbeiroRepository';
import { atualizarProfissionalSeNaoMudou } from '../data/repositories/NegocioRepository';
import { registrarAviso } from '../services/ObservabilityService';
import { formatMoney } from '../utils/dateUtils';
import { getServicosPreSelecionados } from '../utils/servicosPadrao';
import { useTheme, type Theme } from '../context/ThemeContext';
import Icone from '../components/Icone';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, ServicoBarbeiro } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfigServicos'>;

const DURACOES = [
  { label: '15 min', value: 15 },
  { label: '20 min', value: 20 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hora', value: 60 },
  { label: '1h 15', value: 75 },
  { label: '1h 30', value: 90 },
  { label: '2 horas', value: 120 },
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function ConfigServicosScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const profissionalId = route.params?.profissionalId;
  const profissionalNome = route.params?.profissionalNome;
  const targetId = profissionalId || auth.currentUser?.uid;

  const [servicos, setServicos] = useState<ServicoBarbeiro[]>([]);
  /** Versão do documento no instante da carga — a base do controle de conflito. */
  const [marcaVersao, setMarcaVersao] = useState<MarcaDeVersao>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Campos do formulário no modal
  const [nomeServico, setNomeServico] = useState('');
  const [duracao, setDuracao] = useState(30);
  const [precoStr, setPrecoStr] = useState('');

  useEffect(() => {
    loadServicos();
    // Carga única na montagem: `loadServicos` só lê o uid autenticado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadServicos = async () => {
    setLoading(true);
    try {
      if (!targetId) return;
      const barbeiro = await getBarbeiro(targetId);
      // A marca tem que ser a do documento QUE O USUÁRIO ESTÁ VENDO —
      // inclusive quando ele veio do cache de 2min do `getBarbeiro`. Se o
      // servidor já mudou desde essa leitura, a tela está mostrando dado
      // velho, e recusar o salvamento é exatamente o comportamento certo.
      setMarcaVersao(marcaDeVersaoBarbeiro(barbeiro));
      if (barbeiro?.servicos && barbeiro.servicos.length > 0) {
        setServicos(barbeiro.servicos);
      } else {
        setServicos(getServicosPreSelecionados());
      }
    } catch (error) {
      // Falhar aqui em silêncio criava um beco sem saída: a lista vinha vazia
      // (indistinguível de "nenhum serviço cadastrado") e, pior, o
      // "Recarregar" oferecido no aviso de conflito não avisava que também
      // falhou — o usuário achava estar vendo a versão do servidor.
      //
      // Não há risco de perda de dado: sem marca de versão, a transação de
      // `gravarBarbeiroSeNaoMudou` recusa toda escrita (falha fechada). O
      // problema era só o usuário não entender por que ficava em conflito.
      registrarAviso(error, { area: 'config-servicos', operacao: 'carregar-servicos' })
        .catch(() => {});
      Alert.alert(
        'Não foi possível carregar',
        'Seus serviços não foram carregados agora. Verifique a conexão e abra a tela de novo — salvar sem carregar apagaria o que está no servidor.',
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Depois de gravar, a marca guardada passa a ser a da versão ANTERIOR — foi
   * o próprio salvamento que mudou o `updatedAt` no servidor. Sem renovar, um
   * segundo "Salvar" na mesma tela acusaria conflito com a própria escrita (o
   * Alert de sucesso do Android fecha ao tocar fora, sem passar pelo OK que
   * volta a tela). Como `serverTimestamp()` só resolve no servidor, a única
   * forma de saber a marca nova é reler.
   */
  const renovarMarcaDeVersao = async (id: string) => {
    try {
      setMarcaVersao(marcaDeVersaoBarbeiro(await getBarbeiro(id)));
    } catch (error) {
      // Falhar aqui NÃO desfaz o salvamento e nunca pode virar o Alert de
      // erro: a gravação deu certo. No pior caso o próximo "Salvar" acusa um
      // conflito que não existe, e o botão "Recarregar" resolve.
      console.warn('Não foi possível renovar a marca de versão:', error);
    }
  };

  const avisarConflito = () => {
    Alert.alert(
      'Alterado em outro aparelho',
      'Os serviços foram alterados em outro aparelho enquanto você editava. '
        + 'Recarregue a tela para ver a versão atual — assim você não apaga sem '
        + 'querer o que foi mudado lá.',
      [
        // Nada do que o usuário digitou é descartado aqui: ele pode fechar o
        // aviso, anotar o que mudou e só então recarregar.
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Recarregar', onPress: () => loadServicos() },
      ],
    );
  };

  const openModal = (servico?: ServicoBarbeiro) => {
    if (servico) {
      setEditingId(servico.id);
      setNomeServico(servico.nome);
      setDuracao(servico.duracaoMinutos);
      const reais = servico.precoEmCentavos / 100;
      setPrecoStr(reais.toFixed(2).replace('.', ','));
    } else {
      setEditingId(null);
      setNomeServico('');
      setDuracao(30);
      setPrecoStr('');
    }
    setModalVisible(true);
  };

  const handleSalvarServico = () => {
    if (!nomeServico.trim()) {
      Alert.alert('Atenção', 'Informe o nome do serviço.');
      return;
    }
    const precoDigits = precoStr.replace(',', '.').replace(/[^0-9.]/g, '');
    const precoEmCentavos = Math.round(parseFloat(precoDigits || '0') * 100);
    if (precoEmCentavos <= 0) {
      Alert.alert('Atenção', 'Informe um preço válido.');
      return;
    }

    setServicos((prev) => {
      if (editingId) {
        return prev.map((servico) =>
          servico.id === editingId
            ? { ...servico, nome: nomeServico.trim(), duracaoMinutos: duracao, precoEmCentavos }
            : servico,
        );
      }
      return [
        ...prev,
        {
          id: generateId(),
          nome: nomeServico.trim(),
          duracaoMinutos: duracao,
          precoEmCentavos,
        },
      ];
    });
    setModalVisible(false);
  };

  const handleExcluir = (id: string) => {
    Alert.alert('Excluir serviço', 'Tem certeza que deseja excluir este serviço?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => setServicos((prev) => prev.filter((servico) => servico.id !== id)),
      },
    ]);
  };

  const handleSaveAll = async () => {
    if (servicos.length === 0) {
      Alert.alert('Atenção', 'Adicione ao menos um serviço.');
      return;
    }
    setSaving(true);
    try {
      if (!targetId) return;
      if (profissionalId) {
        await atualizarProfissionalSeNaoMudou(profissionalId, { servicos }, marcaVersao);
      } else {
        await upsertBarbeiroSeNaoMudou(targetId, { servicos }, marcaVersao);
      }
      await renovarMarcaDeVersao(targetId);
      Alert.alert('Sucesso!', 'Serviços salvos com sucesso.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      if (ehConflitoDeVersao(error)) {
        avisarConflito();
        return;
      }
      // Qualquer outro erro (rede, permissão) continua no caminho antigo.
      console.error('Erro ao salvar serviços:', error);
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
      <FlatList
        data={servicos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <>
            {profissionalId && (
              <View style={s.profissionalBanner}>
                <Text style={s.profissionalBannerText}>
                  Editando os serviços de {profissionalNome || 'um profissional da equipe'}
                </Text>
              </View>
            )}
            <Text style={s.subtitle}>
              Defina seus serviços com duração e preço. O agendamento inteligente
              calculará os horários disponíveis com base na duração.
            </Text>
          </>
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>Nenhum serviço cadastrado.</Text>
            <Text style={s.emptySubtext}>Toque em "+" para adicionar.</Text>
          </View>
        }
        ListFooterComponent={
          <TouchableOpacity
            style={[s.saveButton, saving && s.saveButtonDisabled]}
            onPress={handleSaveAll}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Salvar serviços"
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.textSobrePrimaria} />
            ) : (
              <Text style={s.saveButtonText}>Salvar Serviços</Text>
            )}
          </TouchableOpacity>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardContent}>
              <Text style={s.servicoNome}>{item.nome}</Text>
              <View style={s.servicoMeta}>
                <View style={s.duracaoInfoRow}>
                  <Icone nome="horario" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                  <Text style={s.servicoInfo}>{item.duracaoMinutos} min</Text>
                </View>
                <Text style={s.servicoPreco}>{formatMoney(item.precoEmCentavos)}</Text>
              </View>
            </View>
            <View style={s.cardActions}>
              <TouchableOpacity
                style={[s.iconButton, s.editButton]}
                onPress={() => openModal(item)}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${item.nome}`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icone nome="editar" tamanho={20} cor={theme.colors.text} decorativo />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.iconButton, s.deleteButton]}
                onPress={() => handleExcluir(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Excluir ${item.nome}`}
                accessibilityHint="Remove o serviço permanentemente"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icone nome="excluir" tamanho={20} cor={theme.colors.error} decorativo />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* FAB para adicionar */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => openModal()}
        accessibilityRole="button"
        accessibilityLabel="Adicionar serviço"
      >
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* Modal de edição/criação */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalOverlay}
        >
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>
              {editingId ? 'Editar Serviço' : 'Novo Serviço'}
            </Text>

            <Text style={s.label}>Nome do serviço</Text>
            <TextInput
              value={nomeServico}
              onChangeText={setNomeServico}
              style={s.input}
              placeholder="Ex.: Corte degradê"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="words"
            />

            <Text style={s.label}>Duração</Text>
            <View style={s.duracaoRow}>
              {DURACOES.map((d) => (
                <TouchableOpacity
                  key={d.value}
                  style={[s.duracaoChip, duracao === d.value && s.duracaoChipSelected]}
                  onPress={() => setDuracao(d.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Duração: ${d.label}`}
                  accessibilityState={{ selected: duracao === d.value }}
                >
                  <Text
                    style={[
                      s.duracaoChipText,
                      duracao === d.value && s.duracaoChipTextSelected,
                    ]}
                  >
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Preço (R$)</Text>
            <TextInput
              value={precoStr}
              onChangeText={setPrecoStr}
              style={s.input}
              placeholder="Ex.: 45,00"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.cancelButton}
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancelar edição do serviço"
              >
                <Text style={s.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.confirmButton}
                onPress={handleSalvarServico}
                accessibilityRole="button"
                accessibilityLabel={editingId ? 'Salvar alterações do serviço' : 'Adicionar novo serviço'}
              >
                <Text style={s.confirmButtonText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
      paddingBottom: 100,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    profissionalBanner: {
      backgroundColor: theme.colors.primary + '20',
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    profissionalBannerText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.primary,
      textAlign: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyText: {
      fontSize: 16,
      color: theme.colors.textSecondary,
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.colors.textMuted,
      marginTop: 4,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    cardContent: {
      flex: 1,
    },
    servicoNome: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 4,
    },
    servicoMeta: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    duracaoInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    servicoInfo: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    servicoPreco: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.success,
    },
    cardActions: {
      flexDirection: 'row',
      gap: 8,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    editButton: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    // Hex sem token correspondente no ThemeContext (não existe um fundo
    // "tinta de erro" claro) — mesma exceção documentada em DespesasScreen.tsx.
    deleteButton: {
      backgroundColor: '#fef2f2',
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 16,
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
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 8,
    },
    fabText: {
      color: theme.colors.textSobrePrimaria,
      fontSize: 32,
      lineHeight: 32,
    },
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      paddingBottom: 40,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
      marginBottom: 16,
    },
    duracaoRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    duracaoChip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceVariant,
    },
    duracaoChipSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    duracaoChipText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    duracaoChipTextSelected: {
      color: theme.colors.textSobrePrimaria,
      fontWeight: '700',
    },
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cancelButtonText: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
    },
    confirmButtonText: {
      fontSize: 16,
      color: theme.colors.textSobrePrimaria,
      fontWeight: '700',
    },
  });
