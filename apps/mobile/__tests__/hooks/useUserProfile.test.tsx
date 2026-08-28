/**
 * useUserProfile — o hook que quatro telas usam para saber QUEM está logado
 * (e, por consequência, se a pessoa é cliente ou profissional).
 *
 * O detalhe que importa: `loading` tem que virar `false` em TODOS os
 * caminhos — inclusive quando não há ninguém logado e quando o Firestore
 * recusa a leitura. Uma tela que espera `loading` cair fica no spinner para
 * sempre se o hook esquecer o `finally`.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';
import { auth } from '../../firebaseConfig';
import { getProfile } from '../../src/data/repositories/UsuarioRepository';
import useUserProfile from '../../src/hooks/useUserProfile';

jest.mock('../../src/data/repositories/UsuarioRepository', () => ({
  getProfile: jest.fn(),
}));

const mockedGetProfile = getProfile as jest.Mock;

const perfil = { uid: 'test-uid', nome: 'Gustavo', tipo: 'cliente' as const };

let hook: ReturnType<typeof useUserProfile>;
function Sonda() {
  hook = useUserProfile();
  return <Text>{hook.loading ? 'carregando' : (hook.profile?.nome ?? 'sem perfil')}</Text>;
}

const renderizar = () => render(<Sonda />);

const aguardar = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'test-uid' };
  mockedGetProfile.mockResolvedValue(perfil);
});

describe('carregamento inicial', () => {
  it('começa carregando', () => {
    renderizar();
    expect(screen.getByText('carregando')).toBeTruthy();
  });

  it('busca o perfil do usuário logado e entrega para a tela', async () => {
    renderizar();
    await aguardar();

    expect(mockedGetProfile).toHaveBeenCalledWith('test-uid');
    expect(hook.profile).toEqual(perfil);
    expect(hook.loading).toBe(false);
    expect(screen.getByText('Gustavo')).toBeTruthy();
  });

  it('busca uma única vez na montagem — não entra em laço de efeito', async () => {
    renderizar();
    await aguardar();
    await aguardar();

    expect(mockedGetProfile).toHaveBeenCalledTimes(1);
  });
});

describe('ninguém logado', () => {
  it('não chama o Firestore e para de carregar', async () => {
    // Sem uid não há regra que autorize a leitura; tentar mesmo assim só
    // gera permission-denied no console e assusta quem lê o log.
    (auth as any).currentUser = null;

    renderizar();
    await aguardar();

    expect(mockedGetProfile).not.toHaveBeenCalled();
    expect(hook.profile).toBeNull();
    expect(hook.loading).toBe(false);
  });

  it('devolve null no refresh, sem lançar', async () => {
    (auth as any).currentUser = null;
    renderizar();
    await aguardar();

    await act(async () => {
      await expect(hook.refresh()).resolves.toBeNull();
    });
  });
});

describe('quando o perfil não vem', () => {
  it('erro de rede não trava a tela no spinner', async () => {
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetProfile.mockRejectedValue(new Error('network-request-failed'));

    renderizar();
    await aguardar();

    expect(hook.loading).toBe(false);
    expect(hook.profile).toBeNull();
    erro.mockRestore();
  });

  it('documento inexistente vira perfil nulo, não erro', async () => {
    mockedGetProfile.mockResolvedValue(null);

    renderizar();
    await aguardar();

    expect(hook.profile).toBeNull();
    expect(hook.loading).toBe(false);
    expect(screen.getByText('sem perfil')).toBeTruthy();
  });

  it('o perfil anterior é preservado quando um refresh falha', async () => {
    // A tela já mostra o nome do usuário; um refresh que falhou não pode
    // apagar o que estava correto na tela.
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    renderizar();
    await aguardar();
    expect(hook.profile).toEqual(perfil);

    mockedGetProfile.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await hook.refresh();
    });

    expect(hook.profile).toEqual(perfil);
    erro.mockRestore();
  });
});

describe('refresh', () => {
  it('rebusca e devolve o perfil atualizado (usado depois de editar o cadastro)', async () => {
    renderizar();
    await aguardar();

    const atualizado = { ...perfil, nome: 'Gustavo Dias' };
    mockedGetProfile.mockResolvedValue(atualizado);

    let retorno: any;
    await act(async () => {
      retorno = await hook.refresh();
    });

    expect(retorno).toEqual(atualizado);
    expect(hook.profile).toEqual(atualizado);
    expect(screen.getByText('Gustavo Dias')).toBeTruthy();
  });

  it('enxerga a troca de usuário — o uid é lido a cada chamada, não capturado', async () => {
    // Depois de sair e entrar com outra conta, o hook não pode continuar
    // devolvendo o perfil do usuário anterior.
    renderizar();
    await aguardar();

    (auth as any).currentUser = { uid: 'outro-uid' };
    mockedGetProfile.mockResolvedValue({ uid: 'outro-uid', nome: 'Ana', tipo: 'barbeiro' });

    await act(async () => {
      await hook.refresh();
    });

    expect(mockedGetProfile).toHaveBeenLastCalledWith('outro-uid');
    expect(hook.profile?.nome).toBe('Ana');
  });

  it('a identidade de refresh é estável — senão o efeito rebusca em cada render', async () => {
    renderizar();
    await aguardar();
    const primeiro = hook.refresh;

    await act(async () => {
      await hook.refresh();
    });

    expect(hook.refresh).toBe(primeiro);
  });
});
