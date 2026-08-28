/**
 * useVerificacaoDeEmail — reenvio do email de confirmação de conta.
 *
 * ARQ-02: a regra que justifica o hook é o tratamento de
 * `auth/too-many-requests` — o Firebase limita o reenvio, e o app precisa
 * dizer "aguarde alguns minutos" em vez do erro genérico, senão o usuário
 * fica tentando de novo sem entender.
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import useVerificacaoDeEmail from '../../src/hooks/useVerificacaoDeEmail';

const mockedSendEmailVerification = sendEmailVerification as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

let hook!: ReturnType<typeof useVerificacaoDeEmail>;
function Sonda() {
  hook = useVerificacaoDeEmail();
  return <Text>{hook.reenviando ? 'reenviando' : 'ocioso'}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'test-uid', email: 'test@example.com' };
  mockedSendEmailVerification.mockResolvedValue(undefined);
});

describe('useVerificacaoDeEmail', () => {
  it('começa ocioso', () => {
    render(<Sonda />);

    expect(hook.reenviando).toBe(false);
  });

  it('reenvia para o usuário logado e confirma o envio', async () => {
    render(<Sonda />);

    await act(async () => {
      await hook.reenviarVerificacao();
    });

    expect(mockedSendEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'test-uid' }),
    );
    expect(mockedAlert).toHaveBeenCalledWith(
      'Email enviado',
      expect.stringContaining('Verifique sua caixa de entrada'),
    );
  });

  it('marca "reenviando" durante o envio e desmarca ao final', async () => {
    let liberar!: () => void;
    mockedSendEmailVerification.mockReturnValue(new Promise<void>((resolve) => { liberar = resolve; }));

    const utils = render(<Sonda />);
    await act(async () => {
      hook.reenviarVerificacao();
      await Promise.resolve();
    });
    expect(utils.getByText('reenviando')).toBeTruthy();

    await act(async () => {
      liberar();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(utils.getByText('ocioso')).toBeTruthy();
  });

  it('avisa para aguardar quando o Firebase bloqueia por excesso de tentativas', async () => {
    mockedSendEmailVerification.mockRejectedValue({ code: 'auth/too-many-requests' });
    render(<Sonda />);

    await act(async () => {
      await hook.reenviarVerificacao();
    });

    expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    );
  });

  it('usa mensagem genérica para erro desconhecido', async () => {
    mockedSendEmailVerification.mockRejectedValue(new Error('offline'));
    render(<Sonda />);

    await act(async () => {
      await hook.reenviarVerificacao();
    });

    expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Não foi possível enviar o email. Tente novamente mais tarde.',
    );
  });

  it('libera o botão mesmo quando o envio falha', async () => {
    mockedSendEmailVerification.mockRejectedValue({ code: 'auth/too-many-requests' });
    const utils = render(<Sonda />);

    await act(async () => {
      await hook.reenviarVerificacao();
    });

    expect(utils.getByText('ocioso')).toBeTruthy();
  });

  it('sem usuário autenticado, não tenta enviar', async () => {
    (auth as any).currentUser = null;
    render(<Sonda />);

    await act(async () => {
      await hook.reenviarVerificacao();
    });

    expect(mockedSendEmailVerification).not.toHaveBeenCalled();
    expect(hook.reenviando).toBe(false);
  });
});
