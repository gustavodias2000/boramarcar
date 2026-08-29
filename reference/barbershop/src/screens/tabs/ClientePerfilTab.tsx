/**
 * ClientePerfilTab — aba de perfil do cliente.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../../firebaseConfig';
import { encerrarSessao } from '../../services/SessaoService';
import useUserProfile from '../../hooks/useUserProfile';
import { useTheme, type Theme } from '../../context/ThemeContext';
import AvatarIlustrado from '../../components/AvatarIlustrado';
import Icone, { type NomeIcone } from '../../components/Icone';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<any, 'PerfilCliente'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ClientePerfilTab({ navigation }: Props) {
  const { theme, themeMode, toggleTheme } = useTheme();
  const s = getStyles(theme);
  const { profile } = useUserProfile();

  const nome = profile?.nome || auth.currentUser?.email?.split('@')[0] || 'Cliente';
  const email = auth.currentUser?.email || '';

  const handleLogout = () => {
    Alert.alert(
      'Sair do aplicativo',
      'Deseja realmente sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await encerrarSessao();
            navigation.replace('Login');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Perfil</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={s.avatarSection}>
          <View style={s.avatarWrap}>
            <AvatarIlustrado id={auth.currentUser?.uid || ''} nome={nome} size={72} />
          </View>
          <Text style={s.nome}>{nome}</Text>
          <Text style={s.email}>{email}</Text>
          <View style={s.badge}>
            <Icone nome="pessoa" tamanho={16} cor={theme.colors.primary} decorativo />
            <Text style={s.badgeText}>Cliente</Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>CONTA</Text>
        <View style={s.group}>
          <TouchableOpacity
            style={s.item}
            onPress={() => navigation.navigate('Perfil')}
            accessibilityRole="button"
            accessibilityLabel="Editar perfil"
          >
            <View style={s.itemIcon}>
              <Icone nome="editar" tamanho={20} cor={theme.colors.textSecondary} decorativo />
            </View>
            <Text style={s.itemLabel}>Editar Perfil</Text>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.item}
            onPress={() => navigation.navigate('AdicionarCodigo')}
            accessibilityRole="button"
            accessibilityLabel="Adicionar barbearia"
          >
            {/* ➕ não tem ícone equivalente no mapa de Icone.tsx (fora do
                escopo da Fase 1 mexer nesse arquivo) — mantido como emoji e
                documentado no relatório da fase. */}
            <Text style={s.itemIcon}>➕</Text>
            <Text style={s.itemLabel}>Adicionar barbearia</Text>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.item}
            onPress={() => navigation.navigate('Privacidade')}
            accessibilityRole="button"
            accessibilityLabel="Ver política de privacidade"
          >
            <View style={s.itemIcon}>
              <Icone nome="senha" tamanho={20} cor={theme.colors.textSecondary} decorativo />
            </View>
            <Text style={s.itemLabel}>Política de Privacidade</Text>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.item}
            onPress={() => navigation.navigate('Suporte')}
            accessibilityRole="button"
            accessibilityLabel="Abrir ajuda e suporte"
          >
            <View style={s.itemIcon}>
              <Icone nome="ajuda" tamanho={20} cor={theme.colors.textSecondary} decorativo />
            </View>
            <Text style={s.itemLabel}>Ajuda e Suporte</Text>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.sectionLabel, s.sectionLabelSpaced]}>APARÊNCIA</Text>
        <View style={s.group}>
          {(['system', 'dark', 'light'] as const).map((mode) => {
            const labels = { system: 'Automático', dark: 'Escuro', light: 'Claro' };
            const icones: Record<typeof mode, NomeIcone> = {
              system: 'tema-escuro',
              dark: 'tema-escuro',
              light: 'tema-claro',
            };
            return (
              <TouchableOpacity
                key={mode}
                style={s.item}
                onPress={() => toggleTheme(mode)}
                accessibilityRole="button"
                accessibilityLabel={`Tema ${labels[mode]}`}
                accessibilityState={{ selected: themeMode === mode }}
              >
                <View style={s.itemIcon}>
                  <Icone nome={icones[mode]} tamanho={20} cor={theme.colors.textSecondary} decorativo />
                </View>
                <Text style={s.itemLabel}>{labels[mode]}</Text>
                {themeMode === mode && (
                  <Icone nome="check" tamanho={20} cor={theme.colors.primary} decorativo />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={s.logoutButton}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Sair do aplicativo"
          accessibilityHint="Encerra a sessão atual"
        >
          <View style={s.logoutContent}>
            <Icone nome="sair" tamanho={20} cor={theme.colors.textSobreDestaque} decorativo />
            <Text style={s.logoutText}>Sair do aplicativo</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  sectionLabelSpaced: { marginTop: 24 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  scroll: { padding: 16, paddingBottom: 40 },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  avatarWrap: {
    marginBottom: 12,
  },
  nome: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  email: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  badgeText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    minHeight: 52,
  },
  itemIcon: { fontSize: 20, marginRight: 12 },
  itemLabel: { flex: 1, fontSize: 16, color: theme.colors.text, fontWeight: '500' },
  chevron: { fontSize: 20, color: theme.colors.textMuted },
  logoutButton: {
    marginTop: 28,
    backgroundColor: theme.colors.error,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
  },
  logoutContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Texto sobre botão de fundo `error`.
  logoutText: { color: theme.colors.textSobreDestaque, fontSize: 16, fontWeight: '700' },
});
