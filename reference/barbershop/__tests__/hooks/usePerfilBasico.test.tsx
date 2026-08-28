/**
 * usePerfilBasico — dados pessoais e sincronização da vitrine do barbeiro.
 *
 * ARQ-02: além da validação, estes testes cobrem a composição do payload de
 * `upsertBarbeiro` — em especial o par coordenadas/`enderecoFormatado`, que
 * decide se o cliente vê ou não um link de mapa na confirmação do
 * agendamento. Essa combinação não era alcançável pelos testes de tela.
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { auth } from '../../firebaseConfig';
import { getProfile, updateProfile } from '../../src/data/repositories/UsuarioRepository';
import { upsertBarbeiro, getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import usePerfilBasico from '../../src/hooks/usePerfilBasico';
import type { Coordenadas } from '../../src/hooks/useEnderecoAutocomplete';
import type { Barbeiro, Usuario } from '../../src/types';

jest.mock('../../src/data/repositories/UsuarioRepository', () => ({
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  upsertBarbeiro: jest.fn(),
  getBarbeiro: jest.fn(),
}));

const mockedGetProfile = getProfile as jest.Mock;
const mockedUpdateProfile = updateProfile as jest.Mock;
const mockedUpsertBarbeiro = upsertBarbeiro as jest.Mock;
const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

const PERFIL_CLIENTE: Usuario = {
  uid: 'test-uid',
  nome: 'Cliente Teste',
  email: 'test@example.com',
  telefone: '5511988887777',
  tipo: 'cliente',
};

const PERFIL_BARBEIRO: Usuario = { ...PERFIL_CLIENTE, nome: 'Barbeiro Teste', tipo: 'barbeiro' };

const BARBEIRO_DOC = {
  id: 'test-uid',
  nome: 'Barbeiro Teste',
  telefone: '5511988887777',
  endereco: 'Rua Teste, 123',
} as Barbeiro;

const semearVitrine = jest.fn();

let hook!: ReturnType<typeof usePerfilBasico>;
function Sonda({
  endereco = '',
  coordenadas = null,
}: {
  endereco?: string;
  coordenadas?: Coordenadas | null;
}) {
  // O objeto precisa ser recriado a cada render, como acontece na tela real
  // (é o retorno de useEnderecoAutocomplete).
  hook = usePerfilBasico({ endereco, coordenadas }, semearVitrine);
  return <Text>{hook.loading ? 'carregando' : hook.nome || 'sem nome'}</Text>;
}

/** Renderiza e aguarda o carregamento inicial do perfil terminar. */
async function renderSonda(props: React.ComponentProps<typeof Sonda> = {}) {
  const utils = render(<Sonda {...props} />);
  await waitFor(() => expect(hook.loading).toBe(false));
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'test-uid', email: 'test@example.com' };
  mockedGetProfile.mockResolvedValue(PERFIL_CLIENTE);
  mockedUpdateProfile.mockResolvedValue(undefined);
  mockedUpsertBarbeiro.mockResolvedValue(undefined);
  mockedGetBarbeiro.mockResolvedValue(BARBEIRO_DOC);
});

describe('usePerfilBasico — carregamento', () => {
  it('carrega nome e exibe o telefone mascarado', async () => {
    await renderSonda();

    expect(mockedGetProfile).toHaveBeenCalledWith('test-uid');
    expect(hook.nome).toBe('Cliente Teste');
    expect(hook.telefone).toBe('(11) 98888-7777');
    expect(hook.userData).toEqual(PERFIL_CLIENTE);
  });

  it('cliente não busca a vitrine', async () => {
    await renderSonda();

    expect(mockedGetBarbeiro).not.toHaveBeenCalled();
    expect(semearVitrine).not.toHaveBeenCalled();
  });

  it('barbeiro busca a vitrine e entrega o documento para semear endereço e foto', async () => {
    mockedGetProfile.mockResolvedValue(PERFIL_BARBEIRO);
    await renderSonda();

    expect(mockedGetBarbeiro).toHaveBeenCalledWith('test-uid');
    expect(semearVitrine).toHaveBeenCalledWith(BARBEIRO_DOC);
  });

  it('avisa quando o carregamento falha e sai do estado de loading', async () => {
    mockedGetProfile.mockRejectedValue(new Error('offline'));
    await renderSonda();

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível carregar o perfil.');
    expect(hook.loading).toBe(false);
  });

  it('sem usuário autenticado, não consulta o perfil', async () => {
    (auth as any).currentUser = null;
    await renderSonda();

    expect(mockedGetProfile).not.toHaveBeenCalled();
  });
});

describe('usePerfilBasico — validação', () => {
  it('rejeita nome com menos de 3 caracteres', async () => {
    await renderSonda();
    await act(async () => hook.alterarNome('Jo'));

    await act(async () => {
      await hook.salvarPerfil();
    });

    expect(hook.errors.nome).toBe('Nome deve ter pelo menos 3 caracteres');
    expect(mockedUpdateProfile).not.toHaveBeenCalled();
  });

  it('rejeita telefone com menos de 10 dígitos', async () => {
    await renderSonda();
    await act(async () => hook.alterarTelefone('123'));

    await act(async () => {
      await hook.salvarPerfil();
    });

    expect(hook.errors.telefone).toBe('Telefone inválido');
    expect(mockedUpdateProfile).not.toHaveBeenCalled();
  });

  it('editar um campo com erro limpa o erro daquele campo', async () => {
    await renderSonda();
    await act(async () => hook.alterarNome('Jo'));
    await act(async () => {
      await hook.salvarPerfil();
    });
    expect(hook.errors.nome).toBeTruthy();

    await act(async () => hook.alterarNome('João da Silva'));

    expect(hook.errors.nome).toBeNull();
  });

  it('mascara o telefone enquanto o usuário digita', async () => {
    await renderSonda();

    await act(async () => hook.alterarTelefone('11977776666'));

    expect(hook.telefone).toBe('(11) 97777-6666');
  });
});

describe('usePerfilBasico — gravação do perfil', () => {
  it('grava nome sem espaços sobrando e telefone em E.164', async () => {
    await renderSonda();
    await act(async () => hook.alterarNome('  Cliente Editado  '));

    await act(async () => {
      await hook.salvarPerfil();
    });

    expect(mockedUpdateProfile).toHaveBeenCalledWith('test-uid', {
      nome: 'Cliente Editado',
      telefone: '5511988887777',
    });
    expect(mockedAlert).toHaveBeenCalledWith('Sucesso!', 'Perfil atualizado com sucesso.');
  });

  it('cliente comum NÃO sincroniza a vitrine pública', async () => {
    await renderSonda();

    await act(async () => {
      await hook.salvarPerfil();
    });

    expect(mockedUpsertBarbeiro).not.toHaveBeenCalled();
  });

  it('avisa quando a gravação falha', async () => {
    mockedUpdateProfile.mockRejectedValue(new Error('offline'));
    await renderSonda();

    await act(async () => {
      await hook.salvarPerfil();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível salvar as alterações.');
    expect(hook.saving).toBe(false);
  });
});

describe('usePerfilBasico — sincronização da vitrine (barbeiro)', () => {
  beforeEach(() => {
    mockedGetProfile.mockResolvedValue(PERFIL_BARBEIRO);
  });

  it('endereço digitado à mão grava `endereco`, sem lat/lng nem enderecoFormatado', async () => {
    await renderSonda({ endereco: 'Rua Digitada, 45', coordenadas: null });

    await act(async () => {
      await hook.salvarPerfil();
    });

    const payload = mockedUpsertBarbeiro.mock.calls[0][1];
    expect(payload).toMatchObject({ nome: 'Barbeiro Teste', endereco: 'Rua Digitada, 45' });
    expect(payload).not.toHaveProperty('latitude');
    expect(payload).not.toHaveProperty('longitude');
    // Sem coordenadas não existe endereço "confirmado no mapa".
    expect(payload).not.toHaveProperty('enderecoFormatado');
  });

  it('endereço vindo de sugestão grava lat/lng E enderecoFormatado', async () => {
    await renderSonda({
      endereco: 'Rua Teste, 123 - São Paulo, SP',
      coordenadas: { lat: -23.5, lng: -46.6 },
    });

    await act(async () => {
      await hook.salvarPerfil();
    });

    expect(mockedUpsertBarbeiro).toHaveBeenCalledWith(
      'test-uid',
      expect.objectContaining({
        endereco: 'Rua Teste, 123 - São Paulo, SP',
        latitude: -23.5,
        longitude: -46.6,
        enderecoFormatado: 'Rua Teste, 123 - São Paulo, SP',
      }),
    );
  });

  it('endereço vazio não grava o campo `endereco`', async () => {
    await renderSonda({ endereco: '   ', coordenadas: null });

    await act(async () => {
      await hook.salvarPerfil();
    });

    expect(mockedUpsertBarbeiro.mock.calls[0][1]).not.toHaveProperty('endereco');
  });

  it('grava o perfil ANTES da vitrine', async () => {
    await renderSonda({ endereco: 'Rua Teste, 123', coordenadas: null });

    await act(async () => {
      await hook.salvarPerfil();
    });

    expect(mockedUpdateProfile.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpsertBarbeiro.mock.invocationCallOrder[0],
    );
  });
});
