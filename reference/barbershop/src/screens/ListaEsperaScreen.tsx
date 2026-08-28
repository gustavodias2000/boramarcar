/**
 * ListaEsperaScreen — barbeiro vê quem está aguardando um horário.
 *
 * Mostra clientes na fila de espera agrupados por data.
 * Ao cancelar um agendamento, o barbeiro pode notificar
 * o próximo da fila via WhatsApp.
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
import {
  listarFilaDoBarbeiro,
  atualizarStatusFila,
} from '../data/repositories/ListaEsperaRepository';
import WhatsAppService from '../services/WhatsAppService';
import { isoParaDataCompleta } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import AvatarIlustrado from '../components/AvatarIlustrado';
import Icone from '../components/Icone';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, EntradaListaEspera } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ListaEspera'>;

export default function ListaEsperaScreen(_props: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const [fila, setFila] = useState<EntradaListaEspera[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFila();
  }, []);

  const loadFila = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const dados = await listarFilaDoBarbeiro(uid);
      setFila(dados);
    } catch (error) {
      console.error('Erro ao carregar lista de espera:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificar = async (entrada: EntradaListaEspera) => {
    Alert.alert(
      'Notificar cliente',
      `Enviar mensagem WhatsApp para ${entrada.clienteNome} avisando que há um horário disponível em ${entrada.data}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Notificar',
          onPress: async () => {
            try {
              if (!entrada.clienteTelefone) {
                Alert.alert(
                  'Sem telefone',
                  'Este cliente não tem telefone cadastrado para notificação.',
                );
                return;
              }

              const mensagem =
                `Olá ${entrada.clienteNome}! 👋\n\n` +
                `Tenho um horário disponível para você no dia ${isoParaDataCompleta(entrada.data)}.\n` +
                (entrada.servicoNome ? `✂️ Serviço: ${entrada.servicoNome}\n\n` : '\n') +
                `Entre em contato ou abra o app para confirmar! 🙏`;

              // Irmão do CRÍTICO 3: antes o retorno era ignorado, a fila era
              // marcada 'notificado' e a tela afirmava sucesso INCONDICIONALMENTE.
              // Com o servidor recusando (permission-denied/resource-exhausted)
              // nada saía, e a entrada deixava a fila como avisada — o cliente
              // perdia a vez sem nunca ter sido chamado.
              const resultado = await WhatsAppService.enviarTexto(
                entrada.clienteTelefone,
                mensagem,
              );

              // Lista BRANCA, não negra: só 'enviado' e 'link-aberto' contam
              // como avisado. Com lista negra ('recusado'/'falhou'), o status
              // 'nao-configurado' cairia no ramo de sucesso — hoje inalcançável
              // aqui (a tela não passa `permitirFallback: false`), mas basta
              // alguém passar, como Promoções faz, para o cliente voltar a
              // perder a vez marcado como avisado. Status novo entra barrado
              // por padrão, que é o lado certo de errar numa fila de espera.
              if (resultado.status !== 'enviado' && resultado.status !== 'link-aberto') {
                Alert.alert(
                  'Não foi possível avisar',
                  `A mensagem para ${entrada.clienteNome} não saiu. A pessoa continua na fila — tente de novo em instantes.`,
                );
                return;
              }

              // 'enviado' (confirmado pela API) e 'link-aberto' (o barbeiro
              // manda pelo app do WhatsApp) contam como avisado: nos dois a
              // mensagem chega ao cliente.
              await atualizarStatusFila(entrada.id, 'notificado');
              await loadFila();

              Alert.alert('Sucesso!', `${entrada.clienteNome} foi notificado.`);
            } catch (error) {
              console.error('Erro ao notificar:', error);
              Alert.alert('Erro', 'Não foi possível enviar a notificação.');
            }
          },
        },
      ],
    );
  };

  const handleRemover = (entrada: EntradaListaEspera) => {
    Alert.alert(
      'Remover da fila',
      `Remover ${entrada.clienteNome} da lista de espera?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            await atualizarStatusFila(entrada.id, 'expirado');
            await loadFila();
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
        data={fila}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <Text style={s.subtitle}>
            Clientes aguardando um horário disponível. Notifique-os quando um
            agendamento for cancelado.
          </Text>
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <View style={s.emptyIconWrap}>
              <Icone nome="confirmado" tamanho={32} cor={theme.colors.textMuted} decorativo />
            </View>
            <Text style={s.emptyText}>Nenhum cliente em espera</Text>
            <Text style={s.emptySubtext}>
              Quando todos os horários estiverem ocupados, os clientes que
              quiserem agendar poderão entrar nesta lista.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.avatarWrap}>
                <AvatarIlustrado id={item.id} nome={item.clienteNome || '?'} size={40} />
              </View>
              <View style={s.clienteInfo}>
                <Text style={s.clienteNome}>{item.clienteNome}</Text>
                <Text style={s.clienteEmail}>{item.clienteEmail}</Text>
              </View>
              <View style={s.statusBadge}>
                {item.status === 'notificado' && (
                  <Icone nome="check" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                )}
                <Text style={s.statusText}>
                  {item.status === 'notificado' ? 'Notificado' : 'Aguardando'}
                </Text>
              </View>
            </View>

            <View style={s.cardMeta}>
              <View style={s.metaRow}>
                <Icone nome="calendario" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                <Text style={s.metaItem}>Data desejada: {item.data}</Text>
              </View>
              {item.servicoNome && (
                <View style={s.metaRow}>
                  <Icone nome="tesoura" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                  <Text style={s.metaItem}>Serviço: {item.servicoNome}</Text>
                </View>
              )}
              {item.clienteTelefone && (
                <View style={s.metaRow}>
                  <Icone nome="telefone" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                  <Text style={s.metaItem}>{item.clienteTelefone}</Text>
                </View>
              )}
            </View>

            <View style={s.cardActions}>
              <TouchableOpacity
                style={[s.actionBtn, s.notificarBtn]}
                onPress={() => handleNotificar(item)}
                accessibilityRole="button"
                accessibilityLabel={`Notificar ${item.clienteNome} sobre horário disponível`}
              >
                <View style={s.actionBtnContent}>
                  <Icone nome="mensagem" tamanho={16} cor={theme.colors.textSobreDestaque} decorativo />
                  <Text style={s.actionBtnText}>Notificar</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, s.removerBtn]}
                onPress={() => handleRemover(item)}
                accessibilityRole="button"
                accessibilityLabel={`Remover ${item.clienteNome} da lista de espera`}
                accessibilityHint="Remove o cliente da lista de espera permanentemente"
              >
                <Text style={s.actionBtnText}>Remover</Text>
              </TouchableOpacity>
            </View>
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
      fontSize: 14,
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
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: 24,
      lineHeight: 20,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    avatarWrap: {
      marginRight: 12,
    },
    clienteInfo: {
      flex: 1,
    },
    clienteNome: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    clienteEmail: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    statusBadge: {
      backgroundColor: theme.colors.surfaceVariant,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    statusText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    cardMeta: {
      gap: 4,
      marginBottom: 12,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    metaItem: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    cardActions: {
      flexDirection: 'row',
      gap: 8,
    },
    actionBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 6,
      alignItems: 'center',
      minHeight: 40,
      justifyContent: 'center',
    },
    notificarBtn: {
      backgroundColor: theme.colors.whatsapp,
    },
    removerBtn: {
      backgroundColor: theme.colors.surfaceVariant,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    actionBtnText: {
      // Texto sobre botão de ação (fundo `whatsapp` no botão notificar; o
      // mesmo estilo é reaproveitado no botão remover, de fundo neutro,
      // sem mudança de valor — branco já era a cor usada nos dois).
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textSobreDestaque,
    },
    actionBtnContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
  });
