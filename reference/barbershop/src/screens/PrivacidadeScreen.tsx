/**
 * PrivacidadeScreen — Política de Privacidade (LGPD).
 *
 * Item 13 da auditoria: o app coleta nome, email e telefone, portanto a
 * Lei Geral de Proteção de Dados (Lei 13.709/2018) exige transparência
 * sobre a coleta, finalidade, compartilhamento e direitos do titular.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';

const SECOES = [
  {
    titulo: '1. Dados que coletamos',
    texto:
      'Ao criar sua conta, coletamos: nome completo, endereço de email e ' +
      'número de telefone/WhatsApp. Se você é barbeiro, coletamos também sua ' +
      'especialidade e preço do serviço. Ao usar o app, registramos seus ' +
      'agendamentos (data, horário, barbeiro escolhido e status) e, se você ' +
      'permitir, um identificador do aparelho para envio de notificações.',
  },
  {
    titulo: '2. Para que usamos seus dados',
    texto:
      'Usamos seus dados exclusivamente para operar o serviço: criar e ' +
      'gerenciar agendamentos, conectar clientes e barbeiros, enviar ' +
      'confirmações e lembretes (por notificação e/ou WhatsApp) e exibir seu ' +
      'histórico. Não vendemos nem compartilhamos seus dados com terceiros ' +
      'para fins de marketing.',
  },
  {
    titulo: '3. Com quem compartilhamos',
    texto:
      'Seus dados de contato são compartilhados apenas com a outra parte do ' +
      'agendamento: o barbeiro vê o nome e telefone do cliente que agendou ' +
      'com ele, e o cliente vê os dados públicos do barbeiro. A infraestrutura ' +
      'utiliza o Google Firebase (Google LLC), que armazena os dados em nuvem ' +
      'seguindo padrões internacionais de segurança.',
  },
  {
    titulo: '4. Por quanto tempo guardamos',
    texto:
      'Mantemos seus dados enquanto sua conta existir. Ao excluir sua conta, ' +
      'seu perfil é removido imediatamente. Registros de agendamentos podem ' +
      'ser mantidos de forma desvinculada pelo período necessário para fins ' +
      'legais e de histórico do estabelecimento.',
  },
  {
    titulo: '5. Seus direitos (LGPD)',
    texto:
      'Você pode, a qualquer momento: acessar e corrigir seus dados na tela ' +
      'de Perfil; revogar a permissão de notificações nas configurações do ' +
      'aparelho; e excluir sua conta e dados pessoais pela opção "Excluir ' +
      'conta" na tela de Perfil. Para outras solicitações previstas na Lei ' +
      '13.709/2018 (portabilidade, informação sobre compartilhamento, etc.), ' +
      'entre em contato pelo email do desenvolvedor.',
  },
  {
    titulo: '6. Segurança',
    texto:
      'O acesso aos dados é protegido por autenticação e por regras de ' +
      'segurança no servidor: cada usuário só consegue ler e alterar os ' +
      'próprios dados, e o barbeiro só acessa os agendamentos feitos com ele.',
  },
  {
    titulo: '7. Alterações desta política',
    texto:
      'Esta política pode ser atualizada. Alterações relevantes serão ' +
      'comunicadas pelo app. Última atualização: julho de 2026.',
  },
];

export default function PrivacidadeScreen() {
  const { theme } = useTheme();
  const s = getStyles(theme);

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Política de Privacidade</Text>
        <Text style={s.intro}>
          O Barbershop respeita a sua privacidade. Este documento explica, em
          linguagem simples, como tratamos seus dados pessoais, conforme a Lei
          Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
        </Text>

        {SECOES.map((sec) => (
          <View key={sec.titulo} style={s.section}>
            <Text style={s.sectionTitle}>{sec.titulo}</Text>
            <Text style={s.sectionText}>{sec.texto}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    title: {
      fontSize: tipografia.titulo.fontSize,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 12,
    },
    intro: {
      fontSize: tipografia.apoio.fontSize,
      lineHeight: 22,
      color: theme.colors.textSecondary,
      marginBottom: 20,
    },
    section: {
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
      padding: 16,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: tipografia.corpoForte.fontSize,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 8,
    },
    sectionText: {
      fontSize: tipografia.apoio.fontSize,
      lineHeight: 21,
      color: theme.colors.textSecondary,
    },
  });
