/**
 * useExclusaoDeConta — exclusão de conta (LGPD, art. 18, VI).
 *
 * ARQ-02: a regra crítica deste fluxo é a da falha parcial — se o
 * ExclusaoContaService reportar qualquer erro, a conta de autenticação NÃO
 * pode ser apagada, porque sem o uid do titular ninguém mais consegue apagar
 * o que sobrou no Firestore. Antes isso só era verificável montando a
 * PerfilScreen inteira e cavando dentro dos botões de um Alert.
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  reauthenticateWithCredential,
  deleteUser,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { apagarDadosDoUsuario } from '../../src/services/ExclusaoContaService';
import { esquecerSessao } from '../../src/services/SessaoService';
import CacheService from '../../src/services/CacheService';
import {
  limparAgendamentoPendente,
  limparConvitePendente,
} from '../../src/services/DeepLinkService';
import useExclusaoDeConta from '../../src/hooks/useExclusaoDeConta';

jest.mock('../../src/services/ExclusaoContaService', () => ({
  apagarDadosDoUsuario: jest.fn(),
}));

jest.mock('../../src/services/SessaoService', () => ({
  esquecerSessao: jest.fn(),
  encerrarSessao: jest.fn(),
}));

jest.mock('../../src/services/DeepLinkService', () => ({
  limparAgendamentoPendente: jest.fn(),
  limparConvitePendente: jest.fn(),
}));

jest.mock('../../src/services/CacheService', () => ({
  __esModule: true,
  default: { clear: jest.fn(), invalidate: jest.fn(), invalidatePrefix: jest.fn() },
}));

const mockedCacheClear = (CacheService as unknown as { clear: jest.Mock }).clear;
const mockedApagarDados = apagarDadosDoUsuario as jest.Mock;
const mockedEsquecerSessao = esquecerSessao as jest.Mock;
const mockedLimparAgendamento = limparAgendamentoPendente as jest.Mock;
const mockedLimparConvite = limparConvitePendente as jest.Mock;
const mockedReauthenticate = reauthenticateWithCredential as jest.Mock;
const mockedDeleteUser = deleteUser as jest.Mock;
const mockedCredential = EmailAuthProvider.credential as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

const aoExcluirConta = jest.fn();

let hook!: ReturnType<typeof useExclusaoDeConta>;
function Sonda({ ehBarbeiro = false }: { ehBarbeiro?: boolean }) {
  hook = useExclusaoDeConta(ehBarbeiro, aoExcluirConta);
  return <Text>{hook.excluindo ? 'excluindo' : 'ocioso'}</Text>;
}

/** Encontra, entre as chamadas de Alert.alert, a que tem o título dado. */
const chamadaDoAlert = (titulo: string) => {
  const chamada = mockedAlert.mock.calls.find((c) => c[0] === titulo);
  if (!chamada) throw new Error(`Alert "${titulo}" não foi chamado`);
  return chamada;
};

/**
 * Preenche a senha, dispara a exclusão e confirma no botão destrutivo do
 * Alert — o caminho completo que o usuário percorre.
 */
async function confirmarExclusao(senha = 'minhaSenha123') {
  await act(async () => hook.setSenha(senha));
  await act(async () => hook.excluirConta());

  const [, , botoes] = chamadaDoAlert('Excluir conta');
  const botaoExcluir = botoes.find((b: any) => b.text === 'Excluir definitivamente');
  await act(async () => {
    await botaoExcluir.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'test-uid', email: 'test@example.com' };
  mockedApagarDados.mockResolvedValue({ removidos: {}, erros: [] });
  mockedReauthenticate.mockResolvedValue(undefined);
  mockedDeleteUser.mockResolvedValue(undefined);
  mockedEsquecerSessao.mockResolvedValue(undefined);
  mockedLimparAgendamento.mockResolvedValue(undefined);
  mockedLimparConvite.mockResolvedValue(undefined);
  mockedCredential.mockReturnValue({ providerId: 'password' });
});

describe('useExclusaoDeConta — estado e confirmação', () => {
  it('começa fechado, sem senha e sem exclusão em andamento', () => {
    render(<Sonda />);

    expect(hook.secaoAberta).toBe(false);
    expect(hook.senha).toBe('');
    expect(hook.excluindo).toBe(false);
  });

  it('alternarSecao abre e fecha a seção', async () => {
    render(<Sonda />);

    await act(async () => hook.alternarSecao());
    expect(hook.secaoAberta).toBe(true);

    await act(async () => hook.alternarSecao());
    expect(hook.secaoAberta).toBe(false);
  });

  it('exige a senha antes de abrir a confirmação', async () => {
    render(<Sonda />);

    await act(async () => hook.excluirConta());

    expect(mockedAlert).toHaveBeenCalledWith(
      'Atenção',
      'Digite sua senha para confirmar a exclusão.',
    );
    expect(mockedApagarDados).not.toHaveBeenCalled();
  });

  it('oferece "Cancelar" e não apaga nada enquanto o destrutivo não é tocado', async () => {
    render(<Sonda />);
    await act(async () => hook.setSenha('minhaSenha123'));
    await act(async () => hook.excluirConta());

    const [, , botoes] = chamadaDoAlert('Excluir conta');
    expect(botoes.map((b: any) => b.text)).toEqual(
      expect.arrayContaining(['Cancelar', 'Excluir definitivamente']),
    );
    expect(botoes.find((b: any) => b.text === 'Cancelar').style).toBe('cancel');
    expect(mockedApagarDados).not.toHaveBeenCalled();
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });

  it('o aviso do barbeiro cita a equipe e a vitrine; o do cliente, não', async () => {
    render(<Sonda ehBarbeiro />);
    await act(async () => hook.setSenha('minhaSenha123'));
    await act(async () => hook.excluirConta());

    const [, mensagemBarbeiro] = chamadaDoAlert('Excluir conta');
    expect(mensagemBarbeiro).toContain('sua vitrine');
    expect(mensagemBarbeiro).toContain('profissionais cadastrados por você');

    mockedAlert.mockClear();
    render(<Sonda ehBarbeiro={false} />);
    await act(async () => hook.setSenha('minhaSenha123'));
    await act(async () => hook.excluirConta());

    const [, mensagemCliente] = chamadaDoAlert('Excluir conta');
    expect(mensagemCliente).toContain('suas avaliações');
    expect(mensagemCliente).not.toContain('sua vitrine');
  });
});

describe('useExclusaoDeConta — exclusão bem-sucedida', () => {
  it('reautentica, apaga os dados, apaga a conta e limpa o aparelho', async () => {
    render(<Sonda />);
    await confirmarExclusao();

    expect(mockedCredential).toHaveBeenCalledWith('test@example.com', 'minhaSenha123');
    expect(mockedReauthenticate).toHaveBeenCalled();
    expect(mockedApagarDados).toHaveBeenCalledWith('test-uid', 'test@example.com');
    expect(mockedDeleteUser).toHaveBeenCalled();
    expect(mockedEsquecerSessao).toHaveBeenCalled();
    expect(mockedLimparAgendamento).toHaveBeenCalled();
    expect(mockedLimparConvite).toHaveBeenCalled();
  });

  it('limpa o cache em memória — a agenda de contatos tem dado pessoal de terceiros', async () => {
    // Este fluxo NÃO passa por `encerrarSessao()` (não faz sentido dar signOut
    // numa conta já apagada), então o CacheService.clear() de lá precisa ser
    // replicado aqui. Sem isso, `clientes:{uid}` — nome, telefone e
    // aniversário dos clientes do barbeiro — sobrevive à exclusão da conta.
    render(<Sonda ehBarbeiro />);
    await confirmarExclusao();

    expect(mockedCacheClear).toHaveBeenCalled();
  });

  it('apaga os dados do Firestore ANTES da conta de autenticação', async () => {
    render(<Sonda />);
    await confirmarExclusao();

    // Inverter esta ordem deixaria documentos órfãos que ninguém mais pode
    // apagar — as regras autorizam a exclusão pelo uid do titular.
    expect(mockedApagarDados.mock.invocationCallOrder[0]).toBeLessThan(
      mockedDeleteUser.mock.invocationCallOrder[0],
    );
  });

  it('só navega para o Login depois do OK no alerta de sucesso', async () => {
    render(<Sonda />);
    await confirmarExclusao();

    expect(aoExcluirConta).not.toHaveBeenCalled();

    const [, , botoesSucesso] = chamadaDoAlert('Conta excluída');
    await act(async () => botoesSucesso[0].onPress());

    expect(aoExcluirConta).toHaveBeenCalled();
  });
});

describe('useExclusaoDeConta — falha parcial (regra crítica)', () => {
  it('NÃO apaga a conta nem limpa a sessão quando alguma etapa falha', async () => {
    mockedApagarDados.mockResolvedValue({ removidos: {}, erros: ['agendamentos: offline'] });
    render(<Sonda />);
    await confirmarExclusao();

    expect(mockedDeleteUser).not.toHaveBeenCalled();
    expect(mockedEsquecerSessao).not.toHaveBeenCalled();
    expect(mockedLimparAgendamento).not.toHaveBeenCalled();
    expect(mockedLimparConvite).not.toHaveBeenCalled();
    expect(aoExcluirConta).not.toHaveBeenCalled();
    expect(mockedAlert).toHaveBeenCalledWith(
      'Exclusão incompleta',
      expect.stringContaining('Sua conta continua ativa'),
    );
  });

  it('libera o estado de "excluindo" após a falha parcial, para o usuário tentar de novo', async () => {
    mockedApagarDados.mockResolvedValue({ removidos: {}, erros: ['despesas: offline'] });
    const utils = render(<Sonda />);
    await confirmarExclusao();

    expect(utils.getByText('ocioso')).toBeTruthy();
    expect(hook.excluindo).toBe(false);
  });
});

describe('useExclusaoDeConta — erros', () => {
  it.each([['auth/wrong-password'], ['auth/invalid-credential']])(
    'traduz %s para "Senha incorreta." e não apaga nada',
    async (codigo) => {
      mockedReauthenticate.mockRejectedValue({ code: codigo });
      render(<Sonda />);
      await confirmarExclusao('errada');

      expect(mockedApagarDados).not.toHaveBeenCalled();
      expect(mockedDeleteUser).not.toHaveBeenCalled();
      expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Senha incorreta.');
    },
  );

  it('usa mensagem genérica para erro desconhecido', async () => {
    mockedReauthenticate.mockRejectedValue(new Error('offline'));
    render(<Sonda />);
    await confirmarExclusao();

    expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Não foi possível excluir a conta. Tente novamente.',
    );
  });

  it('sem usuário autenticado, não tenta reautenticar nem apagar', async () => {
    (auth as any).currentUser = null;
    render(<Sonda />);
    await confirmarExclusao();

    expect(mockedReauthenticate).not.toHaveBeenCalled();
    expect(mockedApagarDados).not.toHaveBeenCalled();
    expect(hook.excluindo).toBe(false);
  });
});
