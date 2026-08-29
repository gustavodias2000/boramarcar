/**
 * SuporteScreen — seção de ajuda embutida no app do barbeiro.
 *
 * FAQ com as dúvidas mais comuns e link direto para o WhatsApp de suporte.
 * Inspirado no "Ajuda p/ Configurar" do InBarber.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../context/ThemeContext';
import Icone from '../components/Icone';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Suporte'>;

interface FaqItem {
  pergunta: string;
  resposta: string;
}

const FAQ: FaqItem[] = [
  {
    pergunta: 'Como cadastrar meus serviços?',
    resposta:
      'Acesse Configurações → Meus Serviços. Toque no botão + para adicionar um serviço com nome, duração e preço. Os clientes verão essa lista ao agendar.',
  },
  {
    pergunta: 'Como configurar meus horários de atendimento?',
    resposta:
      'Acesse Configurações → Horário de Atendimento. Defina os dias da semana, horário de início/fim, intervalo de almoço e a antecedência mínima/máxima para agendamentos.',
  },
  {
    pergunta: 'Como confirmar um agendamento?',
    resposta:
      'Na tela principal, encontre o agendamento com status "Pendente" e toque em "Confirmar". O cliente receberá uma mensagem WhatsApp automaticamente.',
  },
  {
    pergunta: 'Como cancelar um agendamento?',
    resposta:
      'Nos cards de agendamento Pendente ou Confirmado, toque em "Cancelar". O horário será liberado e o cliente será notificado via WhatsApp.',
  },
  {
    pergunta: 'O que são clientes banidos?',
    resposta:
      'Clientes banidos não conseguem visualizar nem agendar horários com você. Acesse o histórico de um cliente e toque em "Banir" para adicionar à lista. Gerencie em Configurações → Clientes Banidos.',
  },
  {
    pergunta: 'Como personalizar as mensagens do WhatsApp?',
    resposta:
      'Acesse Configurações → Templates WhatsApp. Edite os textos das mensagens de agendamento, confirmação, cancelamento e lembrete usando as variáveis disponíveis como {nome_cliente}, {data}, {horario}.',
  },
  {
    pergunta: 'O que é a lista de espera?',
    resposta:
      'Quando não há horários disponíveis em uma data, o cliente pode entrar na lista de espera. Você verá os clientes aguardando em Configurações → Lista de Espera e poderá notificá-los quando um horário abrir.',
  },
  {
    pergunta: 'Como funcionam os agendamentos recorrentes?',
    resposta:
      'Agendamentos recorrentes permitem registrar clientes fiéis que vêm toda semana, quinzena ou mês no mesmo horário. Crie via Configurações → Recorrências ou pelo histórico de um cliente.',
  },
  {
    pergunta: 'Como usar o Analytics?',
    resposta:
      'Na tela principal, toque em "Analytics" no cabeçalho. Você verá agendamentos de hoje, semana e mês, avaliação média, faturamento do mês, ticket médio, dias ativos e horários mais populares.',
  },
  {
    pergunta: 'O que é o QR Code?',
    resposta:
      'O QR Code é um código único seu que clientes podem escanear para ir direto à tela de agendamento com você. Acesse Configurações → QR Code e imprima para colar na barbearia.',
  },
];

export default function SuporteScreen(_props: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const [expandido, setExpandido] = useState<number | null>(null);

  const SUPORTE_WHATSAPP = '5511999999999'; // substituir pelo número real de suporte

  const abrirWhatsApp = async () => {
    const url = `https://wa.me/${SUPORTE_WHATSAPP}?text=${encodeURIComponent(
      'Olá! Preciso de ajuda com o app Barbershop.',
    )}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(
          `whatsapp://send?phone=${SUPORTE_WHATSAPP}&text=Olá! Preciso de ajuda com o app Barbershop.`,
        );
      }
    } catch {
      Alert.alert(
        'WhatsApp não encontrado',
        'Não foi possível abrir o WhatsApp. Verifique se ele está instalado.',
      );
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Banner de suporte */}
        <View style={s.supportBanner}>
          <View style={s.bannerText}>
            <Text style={s.bannerTitle}>Olá! Como podemos ajudar?</Text>
            <Text style={s.bannerSubtitle}>
              Confira as perguntas frequentes abaixo ou entre em contato com o
              suporte diretamente.
            </Text>
          </View>
        </View>

        {/* FAQ Accordion */}
        <Text style={s.sectionTitle}>Perguntas Frequentes</Text>

        {FAQ.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={s.faqItem}
            onPress={() => setExpandido(expandido === index ? null : index)}
            accessibilityRole="button"
            accessibilityLabel={item.pergunta}
            accessibilityState={{ expanded: expandido === index }}
          >
            <View style={s.faqHeader}>
              <Text style={s.faqPergunta}>{item.pergunta}</Text>
              <Text style={s.faqChevron}>
                {expandido === index ? '▲' : '▼'}
              </Text>
            </View>
            {expandido === index && (
              <Text style={s.faqResposta}>{item.resposta}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* Botão de suporte */}
        <View style={s.contactCard}>
          <Text style={s.contactTitle}>Não achou o que procurava?</Text>
          <Text style={s.contactText}>
            Entre em contato com o suporte Barbershop diretamente pelo WhatsApp.
            Respondemos em até 24 horas em dias úteis.
          </Text>
          <TouchableOpacity
            style={s.whatsappButton}
            onPress={abrirWhatsApp}
            accessibilityRole="button"
            accessibilityLabel="Falar com o suporte pelo WhatsApp"
          >
            <View style={s.whatsappButtonContent}>
              <Icone nome="mensagem" tamanho={16} cor={theme.colors.textSobreDestaque} decorativo />
              <Text style={s.whatsappButtonText}>Falar com o Suporte</Text>
            </View>
          </TouchableOpacity>
        </View>
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
    scroll: {
      padding: 16,
      paddingBottom: 40,
    },
    supportBanner: {
      backgroundColor: theme.colors.primary,
      borderRadius: 14,
      padding: 20,
      marginBottom: 20,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
    bannerText: {
      flex: 1,
    },
    bannerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textSobrePrimaria,
      marginBottom: 6,
    },
    bannerSubtitle: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.85)',
      lineHeight: 18,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 12,
    },
    faqItem: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    faqHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    faqPergunta: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
      flex: 1,
      paddingRight: 8,
      lineHeight: 20,
    },
    faqChevron: {
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    faqResposta: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: 12,
      lineHeight: 21,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: 12,
    },
    contactCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 20,
      marginTop: 12,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 6,
      elevation: 3,
    },
    contactTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    contactText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 16,
    },
    whatsappButton: {
      backgroundColor: theme.colors.whatsapp,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 28,
      minHeight: 50,
      justifyContent: 'center',
    },
    whatsappButtonText: {
      color: theme.colors.textSobreDestaque,
      fontSize: 16,
      fontWeight: '700',
    },
    whatsappButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
  });
