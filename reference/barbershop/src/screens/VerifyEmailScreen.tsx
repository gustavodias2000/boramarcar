import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendEmailVerification } from 'firebase/auth';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { auth } from '../../firebaseConfig';
import { getProfile } from '../data/repositories/UsuarioRepository';
import { upsertBarbeiro } from '../data/repositories/BarbeiroRepository';
import { lembrarSessao, encerrarSessao } from '../services/SessaoService';
import {
  consumirAgendamentoPendente,
  consumirConvitePendente,
  consumirRelatorioPendente,
} from '../services/DeepLinkService';
import { useTheme, type Theme } from '../context/ThemeContext';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>;

export default function VerifyEmailScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const resend = async () => {
    const user = auth.currentUser;
    if (!user) return navigation.replace('Login');
    setResending(true);
    try {
      await sendEmailVerification(user);
      Alert.alert('Email reenviado', 'Verifique a caixa de entrada e a pasta de spam.');
    } catch (error: any) {
      Alert.alert('Não foi possível reenviar', error?.code === 'auth/too-many-requests'
        ? 'Aguarde alguns minutos antes de tentar novamente.' : 'Tente novamente mais tarde.');
    } finally {
      setResending(false);
    }
  };

  const checkVerification = async () => {
    const user = auth.currentUser;
    if (!user) return navigation.replace('Login');
    setLoading(true);
    try {
      await user.reload();
      const refreshedUser = auth.currentUser;
      if (!refreshedUser?.emailVerified) {
        Alert.alert('Email ainda não confirmado', 'Abra o link enviado por email e tente novamente.');
        return;
      }
      await refreshedUser.getIdToken(true);
      const profile = await getProfile(refreshedUser.uid);
      if (!profile) throw new Error('Perfil não encontrado.');
      if (profile.tipo === 'barbeiro') {
        await upsertBarbeiro(refreshedUser.uid, {
          nome: profile.nome,
          telefone: profile.telefone,
          especialidade: profile.especialidade || 'Corte e barba',
        });
      }
      await lembrarSessao(refreshedUser.uid, profile.tipo);

      // Convite pendente tem prioridade sobre agendamento pendente (mesma
      // ordem do LoginScreen) — consumido sempre, mesmo se não for cliente,
      // para não disparar depois na conta errada.
      // Consumido também para cliente: só o ramo barbeiro abaixo pode usar a
      // intenção de abrir Analytics.
      const relatorioPendente = await consumirRelatorioPendente();
      const convitePendente = await consumirConvitePendente();
      const agendamentoPendente = await consumirAgendamentoPendente();
      if (profile.tipo === 'cliente' && convitePendente) {
        // Após a confirmação, a pilha autenticada substitui todo o fluxo
        // público de cadastro/verificação; o convite fica acima de Cliente.
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Cliente' },
            {
              name: 'AbrirConvite',
              params: { codigo: convitePendente.codigo, origem: convitePendente.origem },
            },
          ],
        });
      } else if (profile.tipo === 'cliente' && agendamentoPendente) {
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Cliente' },
            { name: 'AbrirAgendamento', params: { barbeiroId: agendamentoPendente } },
          ],
        });
      } else if (profile.tipo === 'barbeiro' && relatorioPendente) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Barbeiro', params: { screen: 'Analytics' } }],
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: profile.tipo === 'barbeiro' ? 'Barbeiro' : 'Cliente' }],
        });
      }
    } catch (error) {
      console.warn('Falha ao concluir verificação de email:', error);
      Alert.alert('Não foi possível liberar o acesso', 'Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await encerrarSessao();
    navigation.replace('Login');
  };

  return (
    <SafeAreaView style={s.safe}><View style={s.card}>
      <View style={s.icon}>
        <Icone nome="email" tamanho={32} cor={theme.colors.primary} decorativo />
      </View>
      <Text style={s.title}>Confirme seu email</Text>
      <Text style={s.text}>Enviamos um link para {auth.currentUser?.email || 'seu email'}. Confirme-o para acessar o aplicativo.</Text>
      <TouchableOpacity style={s.primary} onPress={checkVerification} disabled={loading} accessibilityRole="button" accessibilityLabel="Já confirmei meu email">
        {loading ? <ActivityIndicator color={theme.colors.textSobrePrimaria} /> : <Text style={s.primaryText}>Já confirmei meu email</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={s.secondary} onPress={resend} disabled={resending} accessibilityRole="button" accessibilityLabel="Reenviar email de verificação">
        {resending ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={s.secondaryText}>Reenviar email</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={logout} accessibilityRole="button" accessibilityLabel="Sair da conta" accessibilityHint="Encerra a sessão atual"><Text style={s.logout}>Usar outra conta</Text></TouchableOpacity>
    </View></SafeAreaView>
  );
}

const styles = (theme: Theme) => StyleSheet.create({
  safe: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.colors.background },
  card: { padding: 24, borderRadius: raio.card, backgroundColor: theme.colors.surface, alignItems: 'center' },
  icon: { marginBottom: 12 }, title: { fontSize: tipografia.titulo.fontSize, fontWeight: '700', color: theme.colors.text },
  text: { marginTop: 12, marginBottom: 24, textAlign: 'center', lineHeight: 22, color: theme.colors.textSecondary },
  primary: { width: '100%', minHeight: 52, borderRadius: raio.input, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary },
  primaryText: { color: theme.colors.textSobrePrimaria, fontSize: tipografia.corpoForte.fontSize, fontWeight: '700' }, secondary: { paddingVertical: 16 },
  secondaryText: { color: theme.colors.primary, fontWeight: '700' }, logout: { color: theme.colors.textSecondary, textDecorationLine: 'underline' },
});
