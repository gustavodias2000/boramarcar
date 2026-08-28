/**
 * AbrirRelatoriosScreen — porta do deep link presente no e-mail financeiro.
 *
 * O URL é deliberadamente só uma intenção de navegação, não uma autorização:
 * antes de abrir Analytics confirmamos sessão, e-mail verificado e perfil de
 * barbeiro no Firestore. Assim encaminhar o e-mail ou abrir a URL sem login
 * não dá a uma pessoa pública (ou cliente) acesso ao painel privado.
 */
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { auth } from '../../firebaseConfig';
import { getProfile } from '../data/repositories/UsuarioRepository';
import { guardarRelatorioPendente } from '../services/DeepLinkService';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AbrirRelatorios'>;

export default function AbrirRelatoriosScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const jaNavegou = useRef(false);

  useEffect(() => {
    let ativo = true;

    const redirecionar = async () => {
      if (jaNavegou.current) return;

      const usuario = auth.currentUser;
      if (!usuario) {
        jaNavegou.current = true;
        await guardarRelatorioPendente();
        if (!ativo) return;
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      if (!usuario.emailVerified) {
        jaNavegou.current = true;
        await guardarRelatorioPendente();
        if (!ativo) return;
        navigation.reset({ index: 0, routes: [{ name: 'VerifyEmail' }] });
        return;
      }

      try {
        const perfil = await getProfile(usuario.uid);
        if (!ativo || jaNavegou.current) return;
        jaNavegou.current = true;

        if (perfil?.tipo === 'barbeiro') {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Barbeiro', params: { screen: 'Analytics' } }],
          });
          return;
        }

        // Um cliente autenticado pode receber/abrir esse endereço, mas a aba
        // financeira continua fora do seu alcance e ele volta à própria área.
        navigation.reset({
          index: 0,
          routes: [{ name: perfil?.tipo === 'cliente' ? 'Cliente' : 'Login' }],
        });
      } catch (error) {
        if (!ativo || jaNavegou.current) return;
        jaNavegou.current = true;
        console.warn('[deeplink] não foi possível validar o acesso ao relatório:', error);
        Alert.alert(
          'Não foi possível abrir o relatório',
          'Verifique sua conexão e tente abrir o link novamente.',
        );
        // Falhar fechado evita escolher a área privada apenas pela URL.
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    };

    redirecionar();
    return () => {
      ativo = false;
    };
  }, [navigation]);

  return (
    <View style={s.container} accessibilityLabel="Validando acesso ao relatório">
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={s.texto}>Abrindo seus relatórios...</Text>
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
