/**
 * AdicionarCodigoScreen — entrada manual do código de convite de uma
 * barbearia/profissional, para quem não pode escanear o QR Code nem abrir o
 * link (ex.: ditado por telefone). Mesma Cloud Function `criarVinculoCliente`
 * usada por AbrirConviteScreen, aqui com `origem: 'codigo'`.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icone from '../components/Icone';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { resgatarConvitePorCodigo } from '../data/repositories/VinculoClienteRepository';
import { useTheme, type Theme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Barbeiro, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdicionarCodigo'>;

/** Mesma lógica de mapeamento de AbrirConviteScreen — não extraída em
 *  helper compartilhado de propósito: é pouco código e as mensagens podem
 *  divergir levemente por contexto no futuro. */
function mensagemErroConvite(error: any): string {
  const codigo: string = error?.code || '';
  if (!codigo || codigo.endsWith('unavailable')) {
    return 'Verifique sua conexão e tente novamente.';
  }
  if (
    codigo.endsWith('not-found') ||
    codigo.endsWith('failed-precondition') ||
    codigo.endsWith('permission-denied') ||
    codigo.endsWith('invalid-argument')
  ) {
    return error?.message || 'Não foi possível adicionar esta barbearia.';
  }
  return 'Não foi possível adicionar esta barbearia. Tente novamente.';
}

export default function AdicionarCodigoScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const s = getStyles(theme);

  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdicionar = async () => {
    const digitado = codigo.trim();
    if (!digitado) {
      Alert.alert('Atenção', 'Digite o código da barbearia.');
      return;
    }
    setLoading(true);
    try {
      const resultado = await resgatarConvitePorCodigo(digitado, 'codigo');

      if (resultado.jaVinculado) {
        showToast('Você já tinha essa barbearia na sua lista.', 'info');
      } else {
        showToast(`${resultado.nome} foi adicionado à sua lista.`, 'success');
      }

      let barbeiro: Barbeiro | null = null;
      try {
        barbeiro = await getBarbeiro(resultado.barbeiroOrigemId);
      } catch (error) {
        console.warn('[convite] falha ao buscar o profissional para abrir o perfil:', error);
      }

      // Vínculo de equipe (tipo='negocio') pode ter sido aberto pelo código de
      // UM profissional específico que, entre a geração do convite e este
      // resgate, foi desativado — o vínculo com a barbearia continua válido
      // (por design), mas não faz sentido abrir a tela dele. `Cliente` mostra
      // a vitrine já com só os profissionais ativos da equipe.
      if (barbeiro && barbeiro.ativo !== false) {
        navigation.replace('PerfilProfissional', { barbeiro });
      } else {
        navigation.replace('Cliente');
      }
    } catch (error: any) {
      console.warn('[convite] falha ao resgatar código digitado:', error?.message);
      Alert.alert('Não foi possível adicionar', mensagemErroConvite(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <View style={s.content}>
        <View style={s.icon}>
          <Icone nome="chave" tamanho={32} decorativo />
        </View>
        <Text style={s.title}>Digite o código de convite</Text>
        <Text style={s.subtitle}>
          Peça o código para o barbeiro ou barbearia — ele também está disponível
          no QR Code impresso no local.
        </Text>

        <TextInput
          value={codigo}
          onChangeText={setCodigo}
          style={s.input}
          placeholder="Ex.: AB12CD34"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={24}
          editable={!loading}
          accessibilityLabel="Campo do código de convite"
        />

        <TouchableOpacity
          style={[s.button, loading && s.buttonDisabled]}
          onPress={handleAdicionar}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Adicionar barbearia"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.textSobrePrimaria} />
          ) : (
            <Text style={s.buttonText}>Adicionar</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    content: { flex: 1, padding: 24, alignItems: 'center' },
    icon: { marginTop: 24, marginBottom: 12 },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 28,
    },
    input: {
      width: '100%',
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      fontFamily: 'monospace',
      letterSpacing: 1,
      textAlign: 'center',
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceVariant,
      marginBottom: 20,
      minHeight: 54,
    },
    button: {
      width: '100%',
      backgroundColor: theme.colors.primary,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: theme.colors.textSobrePrimaria, fontSize: 16, fontWeight: '700' },
  });
