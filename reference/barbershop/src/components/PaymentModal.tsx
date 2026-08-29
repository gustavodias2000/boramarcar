/**
 * PaymentModal — resumo do agendamento e confirmação final do cliente.
 *
 * IMPORTANTE: o app não cobra nada. Este passo existe para o cliente conferir
 * profissional, data, horário, serviço e valor antes de fechar — e para
 * deixar claro que o pagamento acontece no estabelecimento.
 *
 * Correção da auditoria: antes esta tela anunciava "Cartão de crédito / PIX"
 * como se o app cobrasse, e o botão "Pagar Agora" abria um alerta dizendo
 * "Pagamento Realizado!" sem que nenhuma cobrança tivesse acontecido.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert
} from 'react-native';
import PaymentService, { type PaymentResult } from '../services/PaymentService';
import { precoParaCentavos } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';
import BotaoComEscala from './BotaoComEscala';
import type { NovoAgendamento } from '../types';

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  agendamento: NovoAgendamento | null;
  onPaymentSuccess?: (result: PaymentResult) => void;
}

export default function PaymentModal({
  visible,
  onClose,
  agendamento,
  onPaymentSuccess,
}: PaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();
  const styles = createStyles(theme);

  // Aceita tanto o campo novo (precoEmCentavos: int) quanto o legado (preco: string)
  const precoEmCentavos =
    agendamento?.precoEmCentavos ?? precoParaCentavos(agendamento?.preco);

  const confirmarAgendamento = async () => {
    setLoading(true);
    try {
      const result = await PaymentService.registrarPagamentoPresencial(
        agendamento,
        precoEmCentavos,
      );
      Alert.alert(
        'Agendamento confirmado!',
        `Seu horário está reservado. Você paga ${PaymentService.formatCurrency(
          precoEmCentavos,
        )} no local, no dia do atendimento.`,
        [
          {
            text: 'OK',
            onPress: () => {
              onPaymentSuccess && onPaymentSuccess(result);
              onClose();
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível confirmar o agendamento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Resumo do agendamento</Text>

          <View style={styles.agendamentoInfo}>
            <Text style={styles.infoLabel}>Barbeiro:</Text>
            <Text style={styles.infoValue}>{agendamento?.barbeiroNome}</Text>
            
            <Text style={styles.infoLabel}>Data:</Text>
            <Text style={styles.infoValue}>{agendamento?.data}</Text>
            
            <Text style={styles.infoLabel}>Horário:</Text>
            <Text style={styles.infoValue}>{agendamento?.horario}</Text>
            
            <Text style={styles.infoLabel}>Serviço:</Text>
            <Text style={styles.infoValue}>{agendamento?.servico || 'Corte e barba'}</Text>
          </View>

          <View style={styles.precoContainer}>
            <Text style={styles.precoLabel}>Valor do serviço:</Text>
            <Text style={styles.precoValue}>
              {PaymentService.formatCurrency(precoEmCentavos)}
            </Text>
          </View>

          <View style={styles.paymentMethods}>
            <Text style={styles.methodsTitle}>Pagamento presencial</Text>
            <Text style={styles.methodsText}>
              O app não cobra nada agora. Você paga direto ao profissional no
              dia do atendimento — em dinheiro, PIX ou cartão na maquininha,
              conforme o que ele aceitar.
            </Text>
          </View>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Voltar sem confirmar"
            >
              <Text style={styles.cancelButtonText}>Voltar</Text>
            </TouchableOpacity>

            <BotaoComEscala
              style={[styles.button, styles.payButton]}
              onPress={confirmarAgendamento}
              disabled={loading}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Confirmar agendamento"
              accessibilityHint="Reserva o horário, o pagamento é combinado presencialmente"
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.textSobreDestaque} />
              ) : (
                <Text style={styles.payButtonText}>Confirmar agendamento</Text>
              )}
            </BotaoComEscala>
          </View>

          <Text style={styles.securityText}>
            Nenhuma cobrança é feita pelo aplicativo.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: theme.colors.surface,
    borderRadius: raio.card,
    padding: 24,
    margin: 20,
    width: '90%',
    maxHeight: '80%',
  },
  title: {
    fontSize: tipografia.subtitulo.fontSize,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  agendamentoInfo: {
    backgroundColor: theme.colors.background,
    padding: 16,
    borderRadius: raio.input,
    marginBottom: 20,
  },
  infoLabel: {
    fontSize: tipografia.apoio.fontSize,
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
  infoValue: {
    fontSize: tipografia.corpo.fontSize,
    color: theme.colors.text,
    fontWeight: '600',
  },
  precoContainer: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 16,
    backgroundColor: theme.colors.success + '20',
    borderRadius: raio.input,
  },
  precoLabel: {
    fontSize: tipografia.corpo.fontSize,
    color: theme.colors.textSecondary,
  },
  precoValue: {
    fontSize: tipografia.titulo.fontSize,
    fontWeight: 'bold',
    color: theme.colors.success,
    marginTop: 4,
  },
  paymentMethods: {
    marginBottom: 20,
  },
  methodsTitle: {
    fontSize: tipografia.corpo.fontSize,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  methodsText: {
    fontSize: tipografia.apoio.fontSize,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: raio.input,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: theme.colors.border,
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  payButton: {
    backgroundColor: theme.colors.success,
  },
  payButtonText: {
    color: theme.colors.textSobreDestaque,
    fontWeight: '600',
    fontSize: tipografia.corpo.fontSize,
  },
  securityText: {
    fontSize: tipografia.micro.fontSize,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});