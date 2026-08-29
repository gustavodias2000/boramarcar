/**
 * useAlteracaoDeSenha — troca de senha do usuário logado.
 *
 * ARQ-02: estas regras (validação dos três campos, reautenticação obrigatória
 * antes do updatePassword, mapeamento do código de erro do Firebase e limpeza
 * dos campos no sucesso) antes só podiam ser exercitadas montando a
 * PerfilScreen inteira. Aqui são testadas sem árvore de navegação nem tema.
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import useAlteracaoDeSenha from '../../src/hooks/useAlteracaoDeSenha';

const mockedUpdatePassword = updatePassword as jest.Mock;
const mockedReauthenticate = reauthenticateWithCredential as jest.Mock;
const mockedCredential = EmailAuthProvider.credential as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

let hook!: ReturnType<typeof useAlteracaoDeSenha>;
function Sonda() {
  hook = useAlteracaoDeSenha();
  return <Text>{hook.alterandoSenha ? 'alterando' : 'ocioso'}</Text>;
}

/** Preenche os três campos numa única passada de renderização. */
async function preencher(atual: string, nova: string, confirmacao: string) {
  await act(async () => {
    hook.setSenhaAtual(atual);
    hook.setNovaSenha(nova);
    hook.setConfirmarNovaSenha(confirmacao);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Outros arquivos de teste mutam o currentUser do mock compartilhado de
  // firebaseConfig; restauramos o usuário padrão para não depender da ordem.
  (auth as any).currentUser = { uid: 'test-uid', email: 'test@example.com' };
  mockedReauthenticate.mockResolvedValue(undefined);
  mockedUpdatePassword.mockResolvedValue(undefined);
  mockedCredential.mockReturnValue({ providerId: 'password' });
});

describe('useAlteracaoDeSenha — estado inicial e seção', () => {
  it('começa com os campos vazios, seção fechada e sem envio em andamento', () => {
    render(<Sonda />);

    expect(hook.senhaAtual).toBe('');
    expect(hook.novaSenha).toBe('');
    expect(hook.confirmarNovaSenha).toBe('');
    expect(hook.secaoAberta).toBe(false);
    expect(hook.alterandoSenha).toBe(false);
  });

  it('alternarSecao abre e fecha a seção', async () => {
    render(<Sonda />);

    await act(async () => hook.alternarSecao());
    expect(hook.secaoAberta).toBe(true);

    await act(async () => hook.alternarSecao());
    expect(hook.secaoAberta).toBe(false);
  });
});

describe('useAlteracaoDeSenha — validações', () => {
  it('exige a senha atual e não chega a reautenticar', async () => {
    render(<Sonda />);

    await act(async () => {
      await hook.alterarSenha();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Informe sua senha atual.');
    expect(mockedReauthenticate).not.toHaveBeenCalled();
    expect(mockedUpdatePassword).not.toHaveBeenCalled();
  });

  it('rejeita nova senha com menos de 6 caracteres', async () => {
    render(<Sonda />);
    await preencher('atual123', '123', '123');

    await act(async () => {
      await hook.alterarSenha();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Nova senha deve ter pelo menos 6 caracteres.');
    expect(mockedUpdatePassword).not.toHaveBeenCalled();
  });

  it('rejeita nova senha só com espaços', async () => {
    render(<Sonda />);
    await preencher('atual123', '       ', '       ');

    await act(async () => {
      await hook.alterarSenha();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Nova senha deve ter pelo menos 6 caracteres.');
    expect(mockedUpdatePassword).not.toHaveBeenCalled();
  });

  it('rejeita quando a confirmação não confere', async () => {
    render(<Sonda />);
    await preencher('atual123', 'novaSenha123', 'outraCoisa456');

    await act(async () => {
      await hook.alterarSenha();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Novas senhas não conferem.');
    expect(mockedUpdatePassword).not.toHaveBeenCalled();
  });
});

describe('useAlteracaoDeSenha — troca bem-sucedida', () => {
  it('reautentica com a senha atual ANTES de gravar a nova', async () => {
    render(<Sonda />);
    await preencher('atual123', 'novaSenha123', 'novaSenha123');

    await act(async () => {
      await hook.alterarSenha();
    });

    expect(mockedCredential).toHaveBeenCalledWith('test@example.com', 'atual123');
    expect(mockedReauthenticate).toHaveBeenCalled();
    expect(mockedUpdatePassword).toHaveBeenCalledWith(expect.anything(), 'novaSenha123');
    // A ordem importa: o Firebase recusa updatePassword sem login recente.
    expect(mockedReauthenticate.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdatePassword.mock.invocationCallOrder[0],
    );
    expect(mockedAlert).toHaveBeenCalledWith('Sucesso!', 'Senha alterada com sucesso.');
  });

  it('limpa os três campos e fecha a seção no sucesso', async () => {
    render(<Sonda />);
    await act(async () => hook.alternarSecao());
    await preencher('atual123', 'novaSenha123', 'novaSenha123');

    await act(async () => {
      await hook.alterarSenha();
    });

    expect(hook.senhaAtual).toBe('');
    expect(hook.novaSenha).toBe('');
    expect(hook.confirmarNovaSenha).toBe('');
    expect(hook.secaoAberta).toBe(false);
  });

  it('marca alterandoSenha durante o envio e desmarca ao final', async () => {
    let liberar!: () => void;
    mockedReauthenticate.mockReturnValue(new Promise<void>((resolve) => { liberar = resolve; }));

    const utils = render(<Sonda />);
    await preencher('atual123', 'novaSenha123', 'novaSenha123');

    await act(async () => {
      hook.alterarSenha();
      await Promise.resolve();
    });
    expect(utils.getByText('alterando')).toBeTruthy();

    await act(async () => {
      liberar();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(hook.alterandoSenha).toBe(false));
  });
});

describe('useAlteracaoDeSenha — erros', () => {
  it.each([['auth/wrong-password'], ['auth/invalid-credential']])(
    'traduz %s para "Senha atual incorreta."',
    async (codigo) => {
      mockedReauthenticate.mockRejectedValue({ code: codigo });
      render(<Sonda />);
      await preencher('errada123', 'novaSenha123', 'novaSenha123');

      await act(async () => {
        await hook.alterarSenha();
      });

      expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Senha atual incorreta.');
      expect(mockedUpdatePassword).not.toHaveBeenCalled();
    },
  );

  it('usa mensagem genérica para erro desconhecido', async () => {
    mockedUpdatePassword.mockRejectedValue(new Error('offline'));
    render(<Sonda />);
    await preencher('atual123', 'novaSenha123', 'novaSenha123');

    await act(async () => {
      await hook.alterarSenha();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível alterar a senha.');
  });

  it('não deixa o botão travado em "alterando" quando o envio falha', async () => {
    mockedReauthenticate.mockRejectedValue({ code: 'auth/wrong-password' });
    const utils = render(<Sonda />);
    await preencher('errada123', 'novaSenha123', 'novaSenha123');

    await act(async () => {
      await hook.alterarSenha();
    });

    expect(utils.getByText('ocioso')).toBeTruthy();
  });

  it('sem usuário autenticado, não tenta reautenticar nem gravar', async () => {
    (auth as any).currentUser = null;
    render(<Sonda />);
    await preencher('atual123', 'novaSenha123', 'novaSenha123');

    await act(async () => {
      await hook.alterarSenha();
    });

    expect(mockedReauthenticate).not.toHaveBeenCalled();
    expect(mockedUpdatePassword).not.toHaveBeenCalled();
    expect(hook.alterandoSenha).toBe(false);
  });
});
