import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Alert
} from 'react-native';
import { auth } from '../../firebaseConfig';
import { atualizarStatus } from '../data/repositories/AgendamentoRepository';
import { criarAvaliacao } from '../data/repositories/AvaliacaoRepository';
import { useTheme, type Theme } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';
import Icone from './Icone';
import type { Agendamento } from '../types';

interface RatingComponentProps {
  visible: boolean;
  onClose: () => void;
  agendamento: Agendamento | null;
}

export default function RatingComponent({
  visible,
  onClose,
  agendamento,
}: RatingComponentProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const submitRating = async () => {
    if (!agendamento) return;
    if (rating === 0) {
      Alert.alert('Erro', 'Por favor, selecione uma avaliação.');
      return;
    }

    setLoading(true);
    try {
      // Salvar avaliação
      await criarAvaliacao(agendamento.id, {
        barbeiroId: agendamento.barbeiroId,
        barbeiroNome: agendamento.barbeiroNome,
        cliente: auth.currentUser?.email ?? undefined,
        clienteUid: auth.currentUser?.uid,
        clienteNome: agendamento.clienteNome,
        rating,
        comment: comment.trim(),
      });

      // Atualizar status do agendamento via repository
      await atualizarStatus(agendamento.id, 'avaliado', { rating });

      Alert.alert('Sucesso!', 'Avaliação enviada com sucesso!');
      onClose();
    } catch (error) {
      console.error('Erro ao enviar avaliação:', error);
      Alert.alert('Erro', 'Não foi possível enviar a avaliação.');
    } finally {
      setLoading(false);
    }
  };

  const renderStars = () => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => setRating(star)}
            style={styles.starButton}
            accessibilityRole="button"
            accessibilityLabel={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
            accessibilityState={{ selected: star <= rating }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icone
              nome="avaliacao"
              tamanho={32}
              cor={star <= rating ? theme.colors.warning : theme.colors.border}
              decorativo
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Avaliar Atendimento</Text>
          <Text style={styles.subtitle}>
            Como foi seu atendimento com {agendamento?.barbeiroNome}?
          </Text>

          {renderStars()}

          <TextInput
            style={styles.commentInput}
            placeholder="Deixe um comentário (opcional)"
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancelar avaliação"
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.submitButton]}
              onPress={submitRating}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Enviar avaliação"
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Enviando...' : 'Enviar'}
              </Text>
            </TouchableOpacity>
          </View>
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
  },
  title: {
    fontSize: tipografia.subtitulo.fontSize,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: tipografia.corpo.fontSize,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  starButton: {
    padding: 5,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: raio.chip,
    padding: 12,
    fontSize: tipografia.corpo.fontSize,
    color: theme.colors.text,
    marginBottom: 20,
    minHeight: 80,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: raio.chip,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: theme.colors.surfaceVariant,
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: theme.colors.info,
  },
  submitButtonText: {
    color: theme.colors.textSobreDestaque,
    fontWeight: '600',
  },
});
