/**
 * AbrirConviteScreen — porta de entrada do deep link de convite (QR Code,
 * link compartilhado ou convite do próprio barbeiro). Hoje via App Link
 * `https://{DOMINIO_APP_LINK}/convite/{codigo}` (ver DeepLinkService.ts) —
 * `barbershop://convite/{codigo}` ainda é aceito, por compatibilidade com
 * links já compartilhados antes da migração.
 *
 * Espelha a estrutura de AbrirAgendamentoScreen: tela intermediária que
 * resolve o convite e substitui a si mesma, para o botão voltar não trazer
 * o cliente de volta a um spinner.
 *
 * Desfechos possíveis:
 *  - ninguém logado    → guarda o convite e manda para o Login (o LoginScreen retoma)
 *  - código malformado → avisa e volta para a área do cliente
 *  - sucesso           → toast + replace('PerfilProfissional', ...) ou replace('Cliente')
 *  - erro do backend   → Alert com a mensagem mapeada + replace('Cliente')
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { auth } from '../../firebaseConfig';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { resgatarConvitePorCodigo } from '../data/repositories/VinculoClienteRepository';
import { guardarConvitePendente } from '../services/DeepLinkService';
import { useTheme, type Theme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Barbeiro, OrigemVinculo, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AbrirConvite'>;

/** Mensagem amigável a partir do `error.code` da Cloud Function
 *  `criarVinculoCliente` (formato `functions/<code>` no cliente). Para os
 *  códigos "esperados" preferimos `error.message`, que a function já entrega
 *  em português e mais específico (ex.: distingue código vs. profissional vs.
 *  barbearia indisponível); erro de rede/infra sempre usa a mensagem genérica,
 *  mesmo que venha algum `message`. */
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

export default function AbrirConviteScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const s = getStyles(theme);
  const codigo = route.params?.codigo ?? '';
  const origem = route.params?.origem;

  // O efeito só pode disparar uma navegação — sem a trava, uma re-renderização
  // (troca de tema, por exemplo) empilharia duas telas.
  const jaNavegou = useRef(false);

  useEffect(() => {
    let ativo = true;

    const abrir = async () => {
      if (jaNavegou.current) return;

      if (!codigo) {
        jaNavegou.current = true;
        Alert.alert('Link inválido', 'Este link de convite está incompleto.');
        navigation.replace('Cliente');
        return;
      }

      // Ninguém logado: guarda o convite e pede login. O LoginScreen retoma daqui.
      if (!auth.currentUser) {
        jaNavegou.current = true;
        await guardarConvitePendente(codigo, origem || 'link');
        if (!ativo) return;
        Alert.alert(
          'Entre para adicionar',
          'Faça login ou crie sua conta — assim que entrar, adicionamos esta barbearia à sua lista.',
        );
        navigation.replace('Login');
        return;
      }

      try {
        const resultado = await resgatarConvitePorCodigo(codigo, (origem as OrigemVinculo) || 'link');
        if (!ativo || jaNavegou.current) return;
        jaNavegou.current = true;

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

        if (!ativo) return;
        // Vínculo de equipe (tipo='negocio') pode ter sido aberto pelo código
        // de UM profissional específico que, entre a geração do convite e
        // este resgate, foi desativado — o vínculo com a barbearia continua
        // válido (por design), mas não faz sentido abrir a tela dele.
        // `Cliente` mostra a vitrine já com só os profissionais ativos.
        if (barbeiro && barbeiro.ativo !== false) {
          navigation.replace('PerfilProfissional', { barbeiro });
        } else {
          navigation.replace('Cliente');
        }
      } catch (error: any) {
        if (!ativo || jaNavegou.current) return;
        jaNavegou.current = true;
        console.warn('[convite] falha ao resgatar o convite:', error?.message);
        Alert.alert('Não foi possível adicionar', mensagemErroConvite(error));
        navigation.replace('Cliente');
      }
    };

    abrir();
    return () => {
      ativo = false;
    };
  }, [codigo, origem, navigation, showToast]);

  return (
    <View style={s.container} accessibilityLabel="Adicionando barbearia">
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={s.texto}>Adicionando barbearia...</Text>
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
