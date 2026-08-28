/**
 * ClientesBanidosScreen — barbeiro gerencia a lista de clientes banidos.
 *
 * Clientes banidos não conseguem agendar com este barbeiro.
 * A lista é armazenada na subcoleção PRIVADA `barbeiros/{uid}/banidos`
 * (ver BanimentoRepository) — antes ficava dentro do documento público.
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
import { listarBanidos, desbanirCliente } from '../data/repositories/BanimentoRepository';
import { useTheme, type Theme } from '../context/ThemeContext';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, ClienteBanido } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientesBanidos'>;

export default function ClientesBanidosScreen(_props: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const [banidos, setBanidos] = useState<ClienteBanido[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBanidos();
  }, []);

  const loadBanidos = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      setBanidos(await listarBanidos(uid));
    } catch (error) {
      console.error('Erro ao carregar clientes banidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDesbanir = (cliente: ClienteBanido) => {
    Alert.alert(
      'Desbanir cliente',
      `Deseja realmente permitir que ${cliente.nome} agende novamente?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desbanir',
          onPress: async () => {
            try {
              const uid = auth.currentUser?.uid;
              if (!uid) return;
              await desbanirCliente(uid, cliente.uid);
              setBanidos(banidos.filter((b) => b.uid !== cliente.uid));
              Alert.alert('Sucesso!', `${cliente.nome} foi desbanido.`);
            } catch (error) {
              console.error('Erro ao desbanir:', error);
              Alert.alert('Erro', 'Não foi possível desbanir. Tente novamente.');
            }
          },
        },
      ],
    );
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
        data={banidos}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <Text style={s.subtitle}>
            Clientes banidos não conseguem agendar com você. Desbanir permite
            que eles voltem a agendar normalmente.
          </Text>
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <View style={s.emptyIconWrap}>
              <Icone nome="confirmado" tamanho={32} cor={theme.colors.success} decorativo />
            </View>
            <Text style={s.emptyText}>Nenhum cliente banido</Text>
            <Text style={s.emptySubtext}>
              Você pode banir clientes a partir do histórico de atendimento.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {item.nome ? item.nome.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
            <View style={s.clienteInfo}>
              <Text style={s.clienteNome}>{item.nome}</Text>
              <Text style={s.clienteEmail}>{item.email}</Text>
            </View>
            <TouchableOpacity
              style={s.desbanirButton}
              onPress={() => handleDesbanir(item)}
              accessibilityRole="button"
              accessibilityLabel={`Desbanir ${item.nome}`}
              accessibilityHint="Permite que o cliente volte a agendar com você"
            >
              <Text style={s.desbanirText}>Desbanir</Text>
            </TouchableOpacity>
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
    subtitle: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyIconWrap: {
      marginBottom: 12,
    },
    emptyText: {
      fontSize: tipografia.subtitulo.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: 24,
      lineHeight: 20,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: raio.circulo,
      backgroundColor: theme.colors.error,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    avatarText: {
      // Texto sobre avatar de fundo `error` (cliente banido — o vermelho em
      // si já é theme.colors.error, sinal semântico intencional; aqui só o
      // texto/inicial em cima ganha o token de destaque).
      color: theme.colors.textSobreDestaque,
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '700',
    },
    clienteInfo: {
      flex: 1,
    },
    clienteNome: {
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
    },
    clienteEmail: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    desbanirButton: {
      backgroundColor: theme.colors.success,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: raio.input,
      minHeight: 36,
      justifyContent: 'center',
    },
    desbanirText: {
      // Texto sobre botão de fundo `success`.
      color: theme.colors.textSobreDestaque,
      fontSize: tipografia.apoio.fontSize,
      fontWeight: '700',
    },
  });
