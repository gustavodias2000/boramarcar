/**
 * useAlteracaoDeSenha — troca de senha do usuário logado.
 *
 * ARQ-02: extraído de PerfilScreen.tsx. A validação dos três campos e o
 * mapeamento do código de erro do Firebase para mensagem em português só
 * podiam ser exercitados montando a tela inteira; aqui são testáveis sozinhos.
 *
 * O Firebase exige login recente para trocar a senha, por isso o fluxo
 * reautentica com a senha atual antes de chamar `updatePassword`.
 */
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { auth } from '../../firebaseConfig';

interface UseAlteracaoDeSenhaResult {
  senhaAtual: string;
  novaSenha: string;
  confirmarNovaSenha: string;
  alterandoSenha: boolean;
  secaoAberta: boolean;
  setSenhaAtual: (valor: string) => void;
  setNovaSenha: (valor: string) => void;
  setConfirmarNovaSenha: (valor: string) => void;
  alternarSecao: () => void;
  alterarSenha: () => Promise<void>;
}

export default function useAlteracaoDeSenha(): UseAlteracaoDeSenhaResult {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('');
  const [alterandoSenha, setAlterandoSenha] = useState(false);
  const [secaoAberta, setSecaoAberta] = useState(false);

  const alternarSecao = useCallback(() => setSecaoAberta((v) => !v), []);

  const alterarSenha = useCallback(async () => {
    if (!senhaAtual.trim()) {
      Alert.alert('Erro', 'Informe sua senha atual.');
      return;
    }
    if (!novaSenha.trim() || novaSenha.length < 6) {
      Alert.alert('Erro', 'Nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmarNovaSenha) {
      Alert.alert('Erro', 'Novas senhas não conferem.');
      return;
    }

    setAlterandoSenha(true);
    try {
      const user = auth.currentUser;
      if (!user?.email) return;
      const credential = EmailAuthProvider.credential(user.email, senhaAtual);

      // Reautenticar antes de trocar a senha
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, novaSenha);

      Alert.alert('Sucesso!', 'Senha alterada com sucesso.');
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarNovaSenha('');
      setSecaoAberta(false);
    } catch (error) {
      console.error('Erro ao trocar senha:', error);
      const codigo = (error as { code?: string })?.code;
      let msg = 'Não foi possível alterar a senha.';
      if (codigo === 'auth/wrong-password' || codigo === 'auth/invalid-credential') {
        msg = 'Senha atual incorreta.';
      }
      Alert.alert('Erro', msg);
    } finally {
      setAlterandoSenha(false);
    }
  }, [confirmarNovaSenha, novaSenha, senhaAtual]);

  return {
    senhaAtual,
    novaSenha,
    confirmarNovaSenha,
    alterandoSenha,
    secaoAberta,
    setSenhaAtual,
    setNovaSenha,
    setConfirmarNovaSenha,
    alternarSecao,
    alterarSenha,
  };
}
