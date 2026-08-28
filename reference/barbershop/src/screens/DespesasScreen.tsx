/**
 * DespesasScreen — o barbeiro lança e gerencia despesas manualmente
 * (aluguel, produtos de trabalho, contas etc.). Alimenta a coluna
 * "Despesas" dos relatórios financeiros (Início e aba Relatórios).
 *
 * Sem integração com meio de pagamento — é só um registro do que foi
 * gasto, parecido com o cadastro de serviços (ConfigServicosScreen), mas
 * usando uma coleção própria no Firestore (`despesas`) em vez de um
 * array embutido no doc do barbeiro, já que despesas crescem sem limite
 * (um lançamento por gasto, não uma lista curta e editável).
 */
import React, { useEffect, useState } from 'react';
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
  criarDespesa,
  listarDoBarbeiro,
  removerDespesa,
} from '../data/repositories/DespesaRepository';
import {
  formatMoney,
  toLocalDateString,
  maskDataCompleta,
  dataCompletaParaISO,
  isoParaDataCompleta,
} from '../utils/dateUtils';
import { mensagemErroConsulta } from '../utils/consultaResiliente';
import { useTheme, type Theme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Despesa } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Despesas'>;

export default function DespesasScreen({ navigation: _navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const { showToast } = useToast();
  const uid = auth.currentUser?.uid;

  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const [descricao, setDescricao] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [dataStr, setDataStr] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      if (!uid) return;
      const lista = await listarDoBarbeiro(uid);
      setDespesas(lista);
      setErro(null);
    } catch (error) {
      // Em vez de deixar a lista vazia sem explicação (o que parecia "não
      // tenho nenhuma despesa"), guardamos uma mensagem que diferencia
      // "ainda não lancei nada" de "não consegui carregar agora".
      console.warn('Erro ao carregar despesas:', error);
      setErro(mensagemErroConsulta(error));
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setDescricao('');
    setValorStr('');
    setDataStr(isoParaDataCompleta(toLocalDateString(new Date())));
    setModalVisible(true);
  };

  const handleSalvar = async () => {
    if (!descricao.trim()) {
      Alert.alert('Atenção', 'Informe uma descrição para a despesa.');
      return;
    }
    const precoDigits = valorStr.replace(',', '.').replace(/[^0-9.]/g, '');
    const valorEmCentavos = Math.round(parseFloat(precoDigits || '0') * 100);
    if (valorEmCentavos <= 0) {
      Alert.alert('Atenção', 'Informe um valor válido.');
      return;
    }
    const dataISO = dataCompletaParaISO(dataStr);
    if (!dataISO) {
      Alert.alert('Atenção', 'Informe uma data válida (DD/MM/AAAA).');
      return;
    }
    if (!uid) return;

    setSaving(true);
    try {
      await criarDespesa({
        barbeiroId: uid,
        descricao: descricao.trim(),
        valorEmCentavos,
        data: dataISO,
      });
      setModalVisible(false);
      showToast('Despesa lançada.');
      await load();
    } catch (error) {
      console.error('Erro ao lançar despesa:', error);
      Alert.alert('Erro', 'Não foi possível lançar a despesa. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = (item: Despesa) => {
    Alert.alert('Excluir despesa', `Remover "${item.descricao}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await removerDespesa(item.id);
            setDespesas((prev) => prev.filter((d) => d.id !== item.id));
            showToast('Despesa removida.', 'info');
          } catch (error) {
            console.error('Erro ao remover despesa:', error);
            Alert.alert('Erro', 'Não foi possível remover. Tente novamente.');
          }
        },
      },
    ]);
  };

  const mesAtual = toLocalDateString(new Date()).slice(0, 7); // "AAAA-MM"
  const totalMesCentavos = despesas
    .filter((d) => d.data?.startsWith(mesAtual))
    .reduce((acc, d) => acc + d.valorEmCentavos, 0);

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
        data={despesas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View style={s.totalCard}>
            <Text style={s.totalLabel}>Despesas este mês</Text>
            <Text style={s.totalValor}>{formatMoney(totalMesCentavos)}</Text>
          </View>
        }
        ListEmptyComponent={
          erro ? (
            <View style={s.emptyContainer}>
              <Text style={s.emptyText}>Não foi possível carregar</Text>
              <Text style={s.emptySubtext}>{erro}</Text>
              <TouchableOpacity
                style={s.retryButton}
                onPress={() => {
                  setLoading(true);
                  load();
                }}
                accessibilityRole="button"
                accessibilityLabel="Tentar carregar as despesas novamente"
              >
                <Text style={s.retryButtonText}>Tentar de novo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.emptyContainer}>
              <Text style={s.emptyText}>Nenhuma despesa lançada.</Text>
              <Text style={s.emptySubtext}>Toque em "+" para adicionar.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardContent}>
              <Text style={s.despesaDescricao}>{item.descricao}</Text>
              <Text style={s.despesaData}>{isoParaDataCompleta(item.data)}</Text>
            </View>
            <Text style={s.despesaValor}>{formatMoney(item.valorEmCentavos)}</Text>
            <TouchableOpacity
              style={s.deleteButton}
              onPress={() => handleExcluir(item)}
              accessibilityRole="button"
              accessibilityLabel={`Excluir despesa ${item.descricao}`}
              accessibilityHint="Remove a despesa permanentemente"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icone nome="excluir" tamanho={16} cor={theme.colors.error} decorativo />
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity
        style={s.fab}
        onPress={openModal}
        accessibilityRole="button"
        accessibilityLabel="Lançar despesa"
      >
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

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
            <Text style={s.modalTitle}>Nova Despesa</Text>

            <Text style={s.label}>Descrição</Text>
            <TextInput
              value={descricao}
              onChangeText={setDescricao}
              style={s.input}
              placeholder="Ex.: Aluguel, produtos de trabalho..."
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="sentences"
            />

            <Text style={s.label}>Valor (R$)</Text>
            <TextInput
              value={valorStr}
              onChangeText={setValorStr}
              style={s.input}
              placeholder="Ex.: 80,00"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={s.label}>Data</Text>
            <TextInput
              value={dataStr}
              onChangeText={(v) => setDataStr(maskDataCompleta(v))}
              style={s.input}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              maxLength={10}
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.cancelButton}
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancelar lançamento de despesa"
              >
                <Text style={s.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmButton, saving && s.buttonDisabled]}
                onPress={handleSalvar}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Salvar despesa"
                accessibilityState={{ disabled: saving, busy: saving }}
              >
                {saving ? (
                  <ActivityIndicator color={theme.colors.textSobrePrimaria} />
                ) : (
                  <Text style={s.confirmButtonText}>Salvar</Text>
                )}
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
    container: { flex: 1, backgroundColor: theme.colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 16, paddingBottom: 100 },
    totalCard: {
      backgroundColor: theme.colors.primary,
      borderRadius: raio.card,
      padding: 20,
      marginBottom: 16,
    },
    totalLabel: { fontSize: tipografia.apoio.fontSize, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
    totalValor: { fontSize: tipografia.display.fontSize, fontWeight: '800', color: theme.colors.textSobrePrimaria, marginTop: 4 },
    emptyContainer: { alignItems: 'center', paddingVertical: 40 },
    emptyText: { fontSize: tipografia.corpo.fontSize, color: theme.colors.textSecondary },
    emptySubtext: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textMuted, marginTop: 4, textAlign: 'center' },
    retryButton: {
      marginTop: 16,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: raio.input,
      backgroundColor: theme.colors.surfaceVariant,
    },
    retryButtonText: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.primary },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
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
    cardContent: { flex: 1 },
    despesaDescricao: { fontSize: tipografia.corpo.fontSize, fontWeight: '700', color: theme.colors.text },
    despesaData: { fontSize: tipografia.micro.fontSize, color: theme.colors.textSecondary, marginTop: 2 },
    despesaValor: { fontSize: tipografia.corpo.fontSize, fontWeight: '700', color: theme.colors.info, marginRight: 12 },
    deleteButton: {
      width: 36,
      height: 36,
      borderRadius: raio.input,
      justifyContent: 'center',
      alignItems: 'center',
      // Hex sem token correspondente no ThemeContext (não existe um fundo
      // "tinta de erro" claro) — documentado no relatório da Fase 1.
      backgroundColor: '#fef2f2',
    },
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: raio.circulo,
      backgroundColor: theme.colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 8,
    },
    fabText: { color: theme.colors.textSobrePrimaria, fontSize: tipografia.display.fontSize, lineHeight: 32 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: raio.modal,
      borderTopRightRadius: raio.modal,
      padding: 24,
      paddingBottom: 40,
    },
    modalTitle: { fontSize: tipografia.subtitulo.fontSize, fontWeight: '700', color: theme.colors.text, marginBottom: 20 },
    label: { fontSize: tipografia.apoio.fontSize, fontWeight: '600', color: theme.colors.text, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: raio.input,
      padding: 12,
      fontSize: tipografia.corpo.fontSize,
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
      marginBottom: 16,
    },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: raio.input,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cancelButtonText: { fontSize: tipografia.corpo.fontSize, color: theme.colors.textSecondary, fontWeight: '600' },
    confirmButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: raio.input,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
      minHeight: 48,
      justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    confirmButtonText: { fontSize: tipografia.corpo.fontSize, color: theme.colors.textSobrePrimaria, fontWeight: '700' },
  });
