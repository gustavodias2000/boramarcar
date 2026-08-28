/**
 * AniversariantesScreen — barbeiro vê os clientes da sua agenda por ordem
 * de proximidade do aniversário, com atalho para mandar parabéns pelo
 * WhatsApp.
 *
 * O aniversário (dia/mês) vem de dois lugares: importado automaticamente
 * da agenda de contatos do telefone (quando o contato tem essa informação),
 * ou cadastrado/editado manualmente em Clientes.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../../firebaseConfig';
import { listarClientesDoBarbeiro } from '../data/repositories/ClienteContatoRepository';
import WhatsAppService from '../services/WhatsAppService';
import { aniversarioParaExibicao, diasAteProximoAniversario } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import AvatarIlustrado from '../components/AvatarIlustrado';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, ClienteContato } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Aniversariantes'>;

interface Aniversariante extends ClienteContato {
  aniversario: string; // garantido presente (filtrado antes de exibir)
  diasAte: number;
}

const descricaoDias = (dias: number): string => {
  if (dias === 0) return 'Hoje!';
  if (dias === 1) return 'Amanhã';
  return `Em ${dias} dias`;
};

export default function AniversariantesScreen({ navigation: _navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const [aniversariantes, setAniversariantes] = useState<Aniversariante[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, []),
  );

  const carregar = async () => {
    try {
      const uid = auth.currentUser?.uid;
      const clientes = await listarClientesDoBarbeiro(uid);
      const comAniversario = clientes
        .filter((c): c is ClienteContato & { aniversario: string } => !!c.aniversario)
        .map((c) => ({ ...c, diasAte: diasAteProximoAniversario(c.aniversario) }))
        .sort((a, b) => a.diasAte - b.diasAte);
      setAniversariantes(comAniversario);
    } catch (error) {
      console.error('Erro ao carregar aniversariantes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleParabenizar = (cliente: Aniversariante) => {
    if (!cliente.telefone) {
      Alert.alert('Sem telefone', 'Este cliente não tem telefone cadastrado.');
      return;
    }
    Alert.alert('Enviar parabéns', `Enviar mensagem de aniversário para ${cliente.nome} pelo WhatsApp?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Enviar',
        onPress: async () => {
          try {
            const barbeiroNome =
              auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'nosso salão';
            const mensagem = WhatsAppService.gerarMensagemAniversario(
              { nome: cliente.nome },
              barbeiroNome,
            );
            await WhatsAppService.sendTextMessage(cliente.telefone!, mensagem);
          } catch (error) {
            console.error('Erro ao enviar parabéns:', error);
            Alert.alert('Erro', 'Não foi possível enviar a mensagem. Tente novamente.');
          }
        },
      },
    ]);
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
        data={aniversariantes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          aniversariantes.length > 0 ? (
            <Text style={s.subtitle}>
              {aniversariantes.length} cliente{aniversariantes.length !== 1 ? 's' : ''} com aniversário
              cadastrado, do mais próximo ao mais distante.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <View style={s.emptyIconWrap}>
              <Icone nome="aniversario" tamanho={32} cor={theme.colors.textMuted} decorativo />
            </View>
            <Text style={s.emptyText}>Nenhum aniversário cadastrado</Text>
            <Text style={s.emptySubtext}>
              Cadastre o aniversário dos seus clientes em Clientes, tocando em um cliente da lista,
              ou importe da agenda de contatos do telefone.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.card, item.diasAte === 0 && s.cardHoje]}>
            <View style={s.avatarWrap}>
              <AvatarIlustrado id={item.id} nome={item.nome} size={44} />
            </View>
            <View style={s.clienteInfo}>
              <Text style={s.clienteNome}>{item.nome}</Text>
              <View style={s.metaRow}>
                <Icone nome="aniversario" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                <Text style={s.clienteData}>
                  {aniversarioParaExibicao(item.aniversario)} — {descricaoDias(item.diasAte)}
                </Text>
              </View>
            </View>
            {item.telefone ? (
              <TouchableOpacity
                style={s.parabensButton}
                onPress={() => handleParabenizar(item)}
                accessibilityRole="button"
                accessibilityLabel={`Enviar parabéns para ${item.nome}`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icone nome="mensagem" tamanho={20} cor={theme.colors.primary} decorativo />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
    subtitle: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      marginBottom: 16,
      lineHeight: 18,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
      paddingHorizontal: 32,
    },
    emptyIconWrap: { marginBottom: 12 },
    emptyText: {
      fontSize: tipografia.subtitulo.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
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
    cardHoje: {
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
    },
    avatarWrap: {
      marginRight: 12,
    },
    clienteInfo: { flex: 1 },
    clienteNome: {
      fontSize: tipografia.corpo.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    clienteData: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
    },
    parabensButton: {
      width: 40,
      height: 40,
      borderRadius: raio.modal,
      backgroundColor: theme.colors.primary + '20',
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
