/**
 * EditarProfissionalScreen — dono cria ou edita um membro da equipe.
 * Sem `profissionalId`: cadastra um profissional novo (sem login próprio).
 * Com `profissionalId`: edita nome/especialidade e dá acesso rápido à
 * agenda, serviços e folgas desse profissional (reaproveitando as telas de
 * sempre, agora com o profissional selecionado via parâmetro de rota).
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { auth } from '../../firebaseConfig';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import {
  getNegocioIdDoDono,
  criarProfissional,
  atualizarProfissional,
} from '../data/repositories/NegocioRepository';
import { uploadFotoPerfil } from '../services/FotoPerfilService';
import AvatarIlustrado from '../components/AvatarIlustrado';
import Icone from '../components/Icone';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Barbeiro } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditarProfissional'>;

export default function EditarProfissionalScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const profissionalId = route.params?.profissionalId;

  const [loading, setLoading] = useState(!!profissionalId);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [profissional, setProfissional] = useState<Barbeiro | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | undefined>(undefined);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  useEffect(() => {
    if (!profissionalId) return;
    (async () => {
      try {
        const b = await getBarbeiro(profissionalId);
        setProfissional(b);
        setNome(b?.nome || '');
        setEspecialidade(b?.especialidade || '');
        setFotoUrl(b?.fotoUrl);
      } catch (error) {
        console.error('Erro ao carregar profissional:', error);
        Alert.alert('Erro', 'Não foi possível carregar os dados do profissional.');
      } finally {
        setLoading(false);
      }
    })();
  }, [profissionalId]);

  const handleSalvar = async () => {
    if (!nome.trim() || nome.trim().length < 2) {
      Alert.alert('Atenção', 'Digite o nome do profissional.');
      return;
    }

    setSaving(true);
    try {
      if (profissionalId) {
        await atualizarProfissional(profissionalId, {
          nome: nome.trim(),
          ...(especialidade.trim() ? { especialidade: especialidade.trim() } : {}),
        });
        Alert.alert('Sucesso!', 'Dados atualizados.');
        navigation.goBack();
        return;
      }

      const uid = auth.currentUser?.uid;
      // PERF (Onda 4): só o ID — `criarProfissional` é o único consumidor
      // aqui e recebe apenas o id. O id já vem denormalizado (e cacheado) no
      // doc do barbeiro, então ler `negocios/{id}` para descartar o resto era
      // uma ida à rede a mais no toque de "Salvar".
      const negocioIdDoDono = uid ? await getNegocioIdDoDono(uid) : null;
      if (!negocioIdDoDono) {
        Alert.alert('Erro', 'Você ainda não tem uma equipe criada.');
        return;
      }

      const novo = await criarProfissional(negocioIdDoDono, {
        nome: nome.trim(),
        especialidade: especialidade.trim() || undefined,
      });

      // Troca para o "modo edição" do próprio profissional recém-criado,
      // revelando os atalhos de agenda/serviços/folgas abaixo.
      navigation.replace('EditarProfissional', { profissionalId: novo.id });
    } catch (error) {
      console.error('Erro ao salvar profissional:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Dono sobe a foto de um profissional da equipe sem login próprio — mesma
   * lógica de PerfilScreen.handleTrocarFoto, mas o alvo é `profissionalId`
   * (o auth.currentUser aqui é sempre o dono, nunca o profissional).
   */
  const handleTrocarFoto = async () => {
    if (!profissionalId) return;

    const resultado = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
    });
    if (resultado.didCancel) return;
    if (resultado.errorCode) {
      Alert.alert('Erro', resultado.errorMessage || 'Não foi possível abrir a galeria de fotos.');
      return;
    }
    const uri = resultado.assets?.[0]?.uri;
    if (!uri) return;

    setUploadingFoto(true);
    try {
      const url = await uploadFotoPerfil(profissionalId, uri);
      setFotoUrl(url);
    } catch (error) {
      console.error('Erro ao enviar foto do profissional:', error);
      Alert.alert('Erro', 'Não foi possível enviar a foto. Tente novamente.');
    } finally {
      setUploadingFoto(false);
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
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={s.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.formCard}>
            <Text style={s.label}>Nome do profissional</Text>
            <TextInput
              value={nome}
              onChangeText={setNome}
              style={s.input}
              placeholder="Ex.: João Silva"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="words"
            />

            <Text style={s.label}>Especialidade (opcional)</Text>
            <TextInput
              value={especialidade}
              onChangeText={setEspecialidade}
              style={s.input}
              placeholder="Ex.: Corte e barba, degradê"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="sentences"
            />

            <TouchableOpacity
              style={[s.primaryButton, saving && s.buttonDisabled]}
              onPress={handleSalvar}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={profissionalId ? 'Salvar alterações' : 'Cadastrar profissional'}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.textSobrePrimaria} />
              ) : (
                <Text style={s.primaryButtonText}>
                  {profissionalId ? 'Salvar alterações' : 'Cadastrar profissional'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {profissionalId && profissional && (
            <View style={s.formCard}>
              <Text style={s.label}>Foto de perfil</Text>
              <View style={s.fotoPerfilRow}>
                <AvatarIlustrado
                  id={profissionalId}
                  nome={nome}
                  fotoUrl={fotoUrl}
                  fotoPadraoId={profissional?.fotoPadraoId}
                  size={72}
                />
                <TouchableOpacity
                  style={[s.trocarFotoButton, uploadingFoto && s.buttonDisabled]}
                  onPress={handleTrocarFoto}
                  disabled={uploadingFoto}
                  accessibilityRole="button"
                  accessibilityLabel="Trocar foto de perfil do profissional"
                  accessibilityState={{ disabled: uploadingFoto, busy: uploadingFoto }}
                >
                  {uploadingFoto ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    <Text style={s.trocarFotoButtonText}>Trocar foto</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {profissionalId && profissional && (
            <View style={s.group}>
              <Text style={s.hint}>
                Configure a agenda e os serviços deste profissional — os
                clientes verão exatamente essas opções ao agendar com ele.
              </Text>

              <TouchableOpacity
                style={s.item}
                onPress={() => navigation.navigate('ConfigAgenda', { profissionalId, profissionalNome: nome })}
                accessibilityRole="button"
                accessibilityLabel={`Horário de atendimento de ${nome}`}
              >
                <View style={s.itemIcon}>
                  <Icone nome="calendario" tamanho={20} cor={theme.colors.text} decorativo />
                </View>
                <Text style={s.itemLabel}>Horário de atendimento</Text>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.item}
                onPress={() => navigation.navigate('ConfigServicos', { profissionalId, profissionalNome: nome })}
                accessibilityRole="button"
                accessibilityLabel={`Serviços de ${nome}`}
              >
                <View style={s.itemIcon}>
                  <Icone nome="tesoura" tamanho={20} cor={theme.colors.text} decorativo />
                </View>
                <Text style={s.itemLabel}>Serviços</Text>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.item}
                onPress={() => navigation.navigate('Folgas', { profissionalId, profissionalNome: nome })}
                accessibilityRole="button"
                accessibilityLabel={`Dias de folga de ${nome}`}
              >
                <View style={s.itemIcon}>
                  <Icone nome="bloqueado" tamanho={20} cor={theme.colors.text} decorativo />
                </View>
                <Text style={s.itemLabel}>Dias de folga</Text>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.item, s.itemLast]}
                onPress={() => navigation.navigate('ConfiguracaoNotificacoes', { profissionalId, profissionalNome: nome })}
                accessibilityRole="button"
                accessibilityLabel={`Notificações de agendamento de ${nome}`}
              >
                <View style={s.itemIcon}>
                  <Icone nome="notificacao" tamanho={20} cor={theme.colors.text} decorativo />
                </View>
                <Text style={s.itemLabel}>Notificações de agendamento</Text>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
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
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  // Texto sobre fundo `primary` saturado — token consolidado na Fase 1.
  primaryButtonText: { color: theme.colors.textSobrePrimaria, fontSize: 16, fontWeight: '700' },
  fotoPerfilRow: { flexDirection: 'row', alignItems: 'center' },
  trocarFotoButton: {
    marginLeft: 20,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trocarFotoButtonText: { fontSize: 16, fontWeight: '600', color: theme.colors.primary },
  hint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 17,
    padding: 16,
    paddingBottom: 8,
  },
  group: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  itemLast: { borderBottomWidth: 0 },
  itemIcon: { marginRight: 14 },
  itemLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: theme.colors.text },
  chevron: { fontSize: 24, color: theme.colors.textMuted, marginLeft: 8 },
});
