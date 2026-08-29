/**
 * useExclusaoDeConta — exclusão de conta do usuário (LGPD, art. 18, VI).
 *
 * ARQ-02: extraído de PerfilScreen.tsx. A regra mais importante do fluxo — se
 * o ExclusaoContaService reportar QUALQUER erro, a conta de autenticação NÃO
 * é apagada e a sessão NÃO é encerrada — antes só era verificável montando a
 * tela inteira e cavando dentro dos botões de um Alert.
 *
 * O trabalho pesado (apagar agendamentos, ocupações, avaliações, etc.) mora
 * em ExclusaoContaService; aqui ficam só o estado de UI e a orquestração.
 */
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { apagarDadosDoUsuario } from '../services/ExclusaoContaService';
import { esquecerSessao } from '../services/SessaoService';
import CacheService from '../services/CacheService';
import { limparAgendamentoPendente, limparConvitePendente } from '../services/DeepLinkService';

/** Aviso de confirmação: o barbeiro perde bem mais coisa que o cliente. */
const AVISO_BARBEIRO =
  'Esta ação é permanente. Serão apagados: seu perfil, sua vitrine, sua agenda, seus agendamentos, sua lista de clientes, suas despesas e — se você tem uma equipe — os profissionais cadastrados por você. Deseja continuar?';
const AVISO_CLIENTE =
  'Esta ação é permanente. Serão apagados: seu perfil, seus agendamentos (os horários voltam a ficar livres para o profissional), suas avaliações e sua posição em listas de espera. Deseja continuar?';

interface UseExclusaoDeContaResult {
  secaoAberta: boolean;
  senha: string;
  excluindo: boolean;
  setSenha: (valor: string) => void;
  alternarSecao: () => void;
  excluirConta: () => void;
}

export default function useExclusaoDeConta(
  ehBarbeiro: boolean,
  aoExcluirConta: () => void,
): UseExclusaoDeContaResult {
  const [secaoAberta, setSecaoAberta] = useState(false);
  const [senha, setSenha] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  const alternarSecao = useCallback(() => setSecaoAberta((v) => !v), []);

  const excluirConta = useCallback(() => {
    if (!senha.trim()) {
      Alert.alert('Atenção', 'Digite sua senha para confirmar a exclusão.');
      return;
    }

    Alert.alert(
      'Excluir conta',
      ehBarbeiro ? AVISO_BARBEIRO : AVISO_CLIENTE,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir definitivamente',
          style: 'destructive',
          onPress: async () => {
            setExcluindo(true);
            try {
              const user = auth.currentUser;
              if (!user?.email) return;
              const uid = user.uid;
              const emailDoUsuario = user.email;

              // 1. Reautentica (o Firebase exige login recente para excluir)
              const credential = EmailAuthProvider.credential(user.email, senha);
              await reauthenticateWithCredential(user, credential);

              // 2. Apaga TUDO no Firestore. Antes daqui só saíam o perfil e a
              // vitrine — agendamentos, ocupações, avaliações, lista de
              // espera, recorrências, despesas, clientes e banidos ficavam.
              const { erros } = await apagarDadosDoUsuario(uid, emailDoUsuario);

              // 3. Se algo ficou para trás, NÃO encerramos o login: sem o uid
              // do titular ninguém mais consegue apagar o que sobrou. Melhor
              // pedir para tentar de novo do que deixar dado órfão eterno.
              if (erros.length > 0) {
                console.warn('[exclusao] etapas com falha:', erros);
                Alert.alert(
                  'Exclusão incompleta',
                  'Não conseguimos apagar parte dos seus dados (provavelmente falha de conexão). ' +
                    'Sua conta continua ativa. Verifique a internet e tente novamente — ' +
                    'assim garantimos que nada fique para trás.',
                );
                return;
              }

              // 4. Apaga a conta de autenticação
              await deleteUser(user);

              // 5. Limpa o que ficou gravado no aparelho, senão a próxima
              // abertura tentaria restaurar uma conta que não existe mais.
              // Este fluxo não passa por encerrarSessao() (não faz sentido
              // chamar signOut numa conta que acabou de ser apagada), então
              // os dois pendentes de deep link são limpos explicitamente
              // aqui, assim como no logout comum (ver SessaoService).
              await esquecerSessao();
              // O cache em memória guarda a agenda de contatos do barbeiro —
              // nome, telefone e aniversário de TERCEIROS. Apagar a conta sem
              // limpá-lo deixaria esses dados vivos no heap até o app ser
              // fechado. `encerrarSessao` já faz isso no logout comum; aqui
              // precisa ser replicado, porque este fluxo não passa por ela.
              CacheService.clear();
              await limparAgendamentoPendente();
              await limparConvitePendente();

              Alert.alert(
                'Conta excluída',
                'Sua conta e seus dados foram removidos.',
                [{ text: 'OK', onPress: aoExcluirConta }],
              );
            } catch (error) {
              console.error('Erro ao excluir conta:', error);
              const codigo = (error as { code?: string })?.code;
              let msg = 'Não foi possível excluir a conta. Tente novamente.';
              if (codigo === 'auth/wrong-password' || codigo === 'auth/invalid-credential') {
                msg = 'Senha incorreta.';
              }
              Alert.alert('Erro', msg);
            } finally {
              setExcluindo(false);
            }
          },
        },
      ],
    );
  }, [aoExcluirConta, ehBarbeiro, senha]);

  return { secaoAberta, senha, excluindo, setSenha, alternarSecao, excluirConta };
}
