/**
 * ClientesScreen — agenda de clientes do barbeiro.
 *
 * Resolve a fricção de cadastro em massa: o barbeiro pode importar sua
 * agenda de contatos do telefone de uma vez (com permissão explícita), ou
 * cadastrar manualmente. Serve de base para uma futura tela de
 * "agendamento manual pelo barbeiro".
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  maskPhone,
  formatPhoneDisplay,
  maskDiaMes,
  aniversarioParaExibicao,
} from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import AvatarIlustrado from '../components/AvatarIlustrado';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import useClientes from '../hooks/useClientes';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Clientes'>;

export default function ClientesScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const {
    clientes,
    loading,
    importando,
    modalVisible,
    salvandoManual,
    nomeManual,
    telefoneManual,
    aniversarioManual,
    clienteEditando,
    setNomeManual,
    setTelefoneManual,
    setAniversarioManual,
    abrirModalManual,
    abrirModalEdicao,
    fecharModal,
    salvarManual,
    excluirCliente,
    importarContatos,
  } = useClientes();

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
        data={clientes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <View style={s.emptyIconWrap}>
              <Icone nome="equipe" tamanho={32} cor={theme.colors.textMuted} decorativo />
            </View>
            <Text style={s.emptyTitle}>Você ainda não possui clientes</Text>
            <Text style={s.emptyDesc}>
              Para facilitar, você pode importar da sua agenda de contatos ou cadastrar manualmente.
            </Text>
            <TouchableOpacity
              style={[s.primaryButton, importando && s.buttonDisabled]}
              onPress={importarContatos}
              disabled={importando}
              accessibilityRole="button"
              accessibilityLabel="Importar contatos"
            >
              {importando ? (
                <ActivityIndicator color={theme.colors.textSobrePrimaria} />
              ) : (
                <View style={s.buttonContent}>
                  <Icone nome="contato" tamanho={16} cor={theme.colors.textSobrePrimaria} decorativo />
                  <Text style={s.primaryButtonText}>Importar contatos</Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={s.ouText}>ou</Text>
            <TouchableOpacity
              style={s.secondaryButton}
              onPress={abrirModalManual}
              accessibilityRole="button"
              accessibilityLabel="Novo cliente"
            >
              <Text style={s.secondaryButtonText}>Novo cliente</Text>
            </TouchableOpacity>
          </View>
        }
        ListHeaderComponent={
          clientes.length > 0 ? (
            <View style={s.headerRow}>
              <Text style={s.subtitle}>
                {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} na sua agenda
              </Text>
              <View style={s.headerActions}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Aniversariantes')}
                  accessibilityRole="button"
                  accessibilityLabel="Ver aniversariantes"
                >
                  <View style={s.linkContent}>
                    <Icone nome="aniversario" tamanho={16} cor={theme.colors.primary} decorativo />
                    <Text style={s.importarLink}>Aniversários</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={importarContatos}
                  disabled={importando}
                  accessibilityRole="button"
                  accessibilityLabel="Importar mais contatos"
                >
                  {importando ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    <View style={s.linkContent}>
                      <Icone nome="contato" tamanho={16} cor={theme.colors.primary} decorativo />
                      <Text style={s.importarLink}>Importar</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.avatarWrap}>
              <AvatarIlustrado id={item.id} nome={item.nome} size={40} />
            </View>
            <View style={s.flexContent}>
              <Text style={s.clienteNome}>{item.nome}</Text>
              {item.telefone ? <Text style={s.clienteTelefone}>{formatPhoneDisplay(item.telefone)}</Text> : null}
              {item.aniversario ? (
                <View style={s.telefoneRow}>
                  <Icone nome="aniversario" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                  <Text style={s.clienteTelefone}>{aniversarioParaExibicao(item.aniversario)}</Text>
                </View>
              ) : null}
            </View>
            {item.origem === 'contatos' && (
              <View style={s.badge}>
                <Text style={s.badgeText}>Contatos</Text>
              </View>
            )}
            <TouchableOpacity
              style={s.editButton}
              onPress={() => abrirModalEdicao(item)}
              accessibilityRole="button"
              accessibilityLabel={`Editar ${item.nome}`}
            >
              <Icone nome="editar" tamanho={16} cor={theme.colors.textSecondary} decorativo />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.agendarButton}
              onPress={() => navigation.navigate('AgendamentoManual', { clienteId: item.id })}
              accessibilityRole="button"
              accessibilityLabel={`Agendar horário para ${item.nome}`}
            >
              <Icone nome="calendario" tamanho={16} cor={theme.colors.textSecondary} decorativo />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.deleteButton}
              onPress={() => excluirCliente(item)}
              accessibilityRole="button"
              accessibilityLabel={`Remover ${item.nome}`}
            >
              <Icone nome="excluir" tamanho={16} cor={theme.colors.textSecondary} decorativo />
            </TouchableOpacity>
          </View>
        )}
      />

      {clientes.length > 0 && (
        <TouchableOpacity
          style={s.fab}
          onPress={abrirModalManual}
          accessibilityRole="button"
          accessibilityLabel="Adicionar cliente"
        >
          <Text style={s.fabText}>+</Text>
        </TouchableOpacity>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={fecharModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalOverlay}
        >
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{clienteEditando ? 'Editar Cliente' : 'Novo Cliente'}</Text>

            <Text style={s.label}>Nome</Text>
            <TextInput
              value={nomeManual}
              onChangeText={setNomeManual}
              style={s.input}
              placeholder="Nome do cliente"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="words"
              accessibilityLabel="Nome do cliente"
            />

            <Text style={s.label}>Telefone (opcional)</Text>
            <TextInput
              value={telefoneManual}
              onChangeText={(t) => setTelefoneManual(maskPhone(t))}
              style={s.input}
              placeholder="(11) 99999-9999"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              maxLength={15}
              accessibilityLabel="Telefone do cliente, opcional"
            />

            <Text style={s.label}>Aniversário (opcional)</Text>
            <TextInput
              value={aniversarioManual}
              onChangeText={(t) => setAniversarioManual(maskDiaMes(t))}
              style={s.input}
              placeholder="DD/MM"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              maxLength={5}
              accessibilityLabel="Aniversário do cliente, opcional"
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.cancelButton}
                onPress={fecharModal}
                accessibilityRole="button"
                accessibilityLabel="Cancelar edição do cliente"
              >
                <Text style={s.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmButton, salvandoManual && s.buttonDisabled]}
                onPress={salvarManual}
                disabled={salvandoManual}
                accessibilityRole="button"
                accessibilityLabel="Salvar cliente"
                accessibilityState={{ disabled: salvandoManual, busy: salvandoManual }}
              >
                {salvandoManual ? (
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
    flexContent: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 16, paddingBottom: 100, flexGrow: 1 },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    linkContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    subtitle: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
    },
    importarLink: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.primary,
      fontWeight: '700',
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
      paddingHorizontal: 32,
    },
    emptyIconWrap: { marginBottom: 16 },
    emptyTitle: {
      fontSize: tipografia.subtitulo.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyDesc: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: raio.input,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: 'center',
      minHeight: 48,
      justifyContent: 'center',
      width: '100%',
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    primaryButtonText: {
      // Texto sobre botão de fundo `primary` (âmbar).
      color: theme.colors.textSobrePrimaria,
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '700',
    },
    ouText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textMuted,
      marginVertical: 12,
    },
    secondaryButton: {
      borderRadius: raio.input,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: 'center',
      minHeight: 48,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      width: '100%',
    },
    secondaryButtonText: {
      color: theme.colors.text,
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
      padding: 14,
      marginBottom: 8,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    avatarWrap: {
      marginRight: 12,
    },
    clienteNome: {
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
    },
    clienteTelefone: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    telefoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    badge: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: raio.input,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginRight: 8,
    },
    badgeText: {
      fontSize: tipografia.micro.fontSize,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    agendarButton: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    editButton: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deleteButton: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
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
    fabText: {
      // Texto sobre FAB de fundo `primary` (âmbar).
      color: theme.colors.textSobrePrimaria,
      fontSize: tipografia.display.fontSize,
      lineHeight: 32,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: raio.modal,
      borderTopRightRadius: raio.modal,
      padding: 24,
      paddingBottom: 40,
    },
    modalTitle: {
      fontSize: tipografia.subtitulo.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 20,
    },
    label: {
      fontSize: tipografia.apoio.fontSize,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 6,
    },
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
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: raio.input,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cancelButtonText: {
      fontSize: tipografia.corpo.fontSize,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: raio.input,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
    },
    confirmButtonText: {
      fontSize: tipografia.corpo.fontSize,
      // Texto sobre botão de fundo `primary` (âmbar).
      color: theme.colors.textSobrePrimaria,
      fontWeight: '700',
    },
  });
