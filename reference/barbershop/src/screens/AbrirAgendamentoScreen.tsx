/**
 * AbrirAgendamentoScreen — porta de entrada do deep link `barbershop://agendar/{uid}`.
 *
 * O QR Code impresso na barbearia carrega só o uid do profissional, mas a
 * tela de agendamento precisa do objeto `Barbeiro` inteiro (serviços, agenda,
 * bloqueios). Esta tela intermediária faz a ponte: busca o profissional e
 * substitui a si mesma pela tela de agendamento, para o botão voltar não
 * trazer o cliente de volta a um spinner.
 *
 * Três desfechos possíveis:
 *  - ninguém logado  → guarda o link e manda para o Login (o LoginScreen retoma)
 *  - uid inexistente → avisa e volta para a área do cliente
 *  - tudo certo      → replace('Agendamento', { barbeiro })
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { auth } from '../../firebaseConfig';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { resgatarConvitePorBarbeiroLegado } from '../data/repositories/VinculoClienteRepository';
import { guardarAgendamentoPendente } from '../services/DeepLinkService';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AbrirAgendamento'>;

export default function AbrirAgendamentoScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const barbeiroId = route.params?.barbeiroId ?? '';

  // O efeito só pode disparar uma navegação — sem a trava, uma re-renderização
  // (troca de tema, por exemplo) empilharia duas telas de agendamento.
  const jaNavegou = useRef(false);

  useEffect(() => {
    let ativo = true;

    const abrir = async () => {
      if (jaNavegou.current) return;

      if (!barbeiroId) {
        jaNavegou.current = true;
        Alert.alert('Link inválido', 'Este link de agendamento está incompleto.');
        navigation.replace('Cliente');
        return;
      }

      // Ninguém logado: guarda o link e pede login. O LoginScreen retoma daqui.
      if (!auth.currentUser) {
        jaNavegou.current = true;
        await guardarAgendamentoPendente(barbeiroId);
        if (!ativo) return;
        Alert.alert(
          'Entre para agendar',
          'Faça login ou crie sua conta — assim que entrar, abrimos a agenda deste profissional para você.',
        );
        navigation.replace('Login');
        return;
      }

      try {
        const barbeiro = await getBarbeiro(barbeiroId);
        if (!ativo || jaNavegou.current) return;

        if (!barbeiro) {
          jaNavegou.current = true;
          Alert.alert(
            'Profissional não encontrado',
            'Este QR Code aponta para um profissional que não está mais disponível no app.',
          );
          navigation.replace('Cliente');
          return;
        }

        // Registra o vínculo nos bastidores — link antigo continua abrindo o
        // agendamento exatamente como sempre; se o backend recusar (ex.:
        // quem escaneou é um barbeiro, não cliente), ignoramos em silêncio,
        // sem atrasar nem bloquear a navegação.
        try {
          await resgatarConvitePorBarbeiroLegado(barbeiroId);
        } catch (error) {
          console.warn('[deeplink] não foi possível registrar o vínculo legado:', error);
        }
        if (!ativo || jaNavegou.current) return;

        jaNavegou.current = true;
        navigation.replace('Agendamento', { barbeiro });
      } catch (error: any) {
        if (!ativo || jaNavegou.current) return;
        jaNavegou.current = true;
        console.warn('[deeplink] falha ao abrir o agendamento:', error?.message);
        Alert.alert(
          'Não foi possível abrir',
          'Verifique sua conexão e tente escanear o QR Code novamente.',
        );
        navigation.replace('Cliente');
      }
    };

    abrir();
    return () => {
      ativo = false;
    };
  }, [barbeiroId, navigation]);

  return (
    <View style={s.container} accessibilityLabel="Abrindo a agenda do profissional">
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={s.texto}>Abrindo a agenda...</Text>
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    texto: {
      marginTop: 16,
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
  });
