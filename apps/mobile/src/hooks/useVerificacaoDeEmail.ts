/**
 * useVerificacaoDeEmail — reenvio do email de confirmação de conta.
 *
 * ARQ-02: extraído de PerfilScreen.tsx. É o menor dos blocos da tela, mas tem
 * uma regra de produto própria — o Firebase limita o reenvio e devolve
 * `auth/too-many-requests`, que vira uma mensagem específica ("aguarde alguns
 * minutos") em vez do erro genérico. Essa distinção só era verificável
 * montando a tela inteira.
 */
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../../firebaseConfig';

interface UseVerificacaoDeEmailResult {
  reenviando: boolean;
  reenviarVerificacao: () => Promise<void>;
}

export default function useVerificacaoDeEmail(): UseVerificacaoDeEmailResult {
  const [reenviando, setReenviando] = useState(false);

  const reenviarVerificacao = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setReenviando(true);
    try {
      await sendEmailVerification(user);
      Alert.alert(
        'Email enviado',
        'Verifique sua caixa de entrada (e o spam) e clique no link de confirmação.',
      );
    } catch (error) {
      const codigo = (error as { code?: string })?.code;
      let msg = 'Não foi possível enviar o email. Tente novamente mais tarde.';
      if (codigo === 'auth/too-many-requests') {
        msg = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
      }
      Alert.alert('Erro', msg);
    } finally {
      setReenviando(false);
    }
  }, []);

  return { reenviando, reenviarVerificacao };
}
