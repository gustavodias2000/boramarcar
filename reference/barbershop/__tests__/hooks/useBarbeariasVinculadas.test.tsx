/**
 * useBarbeariasVinculadas — resolve os vínculos do cliente (QR Code/link/
 * convite/código) para a lista achatada de `Barbeiro[]` que alimenta a
 * vitrine da Home. Estes testes travam os requisitos de produto explícitos:
 * sem uid ou sem vínculos a lista fica vazia (é o caminho que alimenta o
 * estado vazio da Home); vínculos resolvem por tipo (profissional/negócio);
 * profissionais inativos somem; negócios duplicados por vínculos diferentes
 * não duplicam a vitrine; e a falha ao resolver UM vínculo não derruba os
 * demais.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import useBarbeariasVinculadas from '../../src/hooks/useBarbeariasVinculadas';
import { listarVinculosDoCliente } from '../../src/data/repositories/VinculoClienteRepository';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { listarProfissionaisDoNegocio } from '../../src/data/repositories/NegocioRepository';
import type { Barbeiro } from '../../src/types';

jest.mock('../../src/data/repositories/VinculoClienteRepository', () => ({
  listarVinculosDoCliente: jest.fn(),
}));

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/NegocioRepository', () => ({
  listarProfissionaisDoNegocio: jest.fn(),
}));

const mockedListarVinculos = listarVinculosDoCliente as jest.Mock;
const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedListarProfissionaisDoNegocio = listarProfissionaisDoNegocio as jest.Mock;

let hook: ReturnType<typeof useBarbeariasVinculadas>;
function Sonda({ uid }: { uid: string | undefined }) {
  hook = useBarbeariasVinculadas(uid);
  return <Text>{hook.loading ? 'carregando' : `${hook.barbeiros.length} barbeiros`}</Text>;
}

// O hook não dispara mais a busca sozinho na montagem (quem usa o hook,
// ClienteHome.tsx via useFocusEffect, é responsável por chamar `refresh()`)
// — então cada teste precisa disparar o refresh explicitamente.
async function renderSonda(uid: string | undefined) {
  render(<Sonda uid={uid} />);
  await act(async () => {
    await hook.refresh();
  });
}

const vinculo = (over: Partial<any> = {}) => ({
  id: 'v1',
  tipo: 'profissional',
  alvoId: 'b1',
  ...over,
});

const barbeiro = (over: Partial<Barbeiro> = {}) => ({ id: 'b1', nome: 'João', ativo: true, ...over } as Barbeiro);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sem clienteUid', () => {
  it('barbeiros fica [] e não chama listarVinculosDoCliente', async () => {
    await renderSonda(undefined);

    await waitFor(() => expect(screen.getByText('0 barbeiros')).toBeTruthy());
    expect(mockedListarVinculos).not.toHaveBeenCalled();
  });
});

describe('sem vínculos', () => {
  it('barbeiros fica [] — é o caminho que alimenta o estado vazio da Home', async () => {
    mockedListarVinculos.mockResolvedValue([]);

    await renderSonda('cliente-1');

    await waitFor(() => expect(screen.getByText('0 barbeiros')).toBeTruthy());
    expect(mockedListarVinculos).toHaveBeenCalledWith('cliente-1');
  });
});

describe('vínculo tipo "profissional"', () => {
  it('resolve via getBarbeiro e aparece na lista', async () => {
    mockedListarVinculos.mockResolvedValue([vinculo({ tipo: 'profissional', alvoId: 'b1' })]);
    mockedGetBarbeiro.mockResolvedValue(barbeiro({ id: 'b1', ativo: true }));

    await renderSonda('cliente-1');

    await waitFor(() => expect(screen.getByText('1 barbeiros')).toBeTruthy());
    expect(mockedGetBarbeiro).toHaveBeenCalledWith('b1');
    expect(hook.barbeiros).toEqual([expect.objectContaining({ id: 'b1' })]);
  });

  it('não aparece na lista quando getBarbeiro devolve ativo: false', async () => {
    mockedListarVinculos.mockResolvedValue([vinculo({ tipo: 'profissional', alvoId: 'b1' })]);
    mockedGetBarbeiro.mockResolvedValue(barbeiro({ id: 'b1', ativo: false }));

    await renderSonda('cliente-1');

    await waitFor(() => expect(hook.loading).toBe(false));
    expect(hook.barbeiros).toEqual([]);
  });
});

describe('vínculo tipo "negocio"', () => {
  it('resolve via listarProfissionaisDoNegocio e traz todos os profissionais ATIVOS', async () => {
    mockedListarVinculos.mockResolvedValue([vinculo({ tipo: 'negocio', alvoId: 'neg1' })]);
    mockedListarProfissionaisDoNegocio.mockResolvedValue([
      barbeiro({ id: 'b1', nome: 'Ana', ativo: true }),
      barbeiro({ id: 'b2', nome: 'Beto', ativo: false }),
      barbeiro({ id: 'b3', nome: 'Carlos', ativo: true }),
    ]);

    await renderSonda('cliente-1');

    await waitFor(() => expect(screen.getByText('2 barbeiros')).toBeTruthy());
    expect(mockedListarProfissionaisDoNegocio).toHaveBeenCalledWith('neg1');
    expect(hook.barbeiros.map((b) => b.id).sort()).toEqual(['b1', 'b3']);
  });
});

describe('dois vínculos que resolvem para o mesmo negócio', () => {
  it('não duplica a barbearia/profissionais na lista final', async () => {
    mockedListarVinculos.mockResolvedValue([
      vinculo({ id: 'v1', tipo: 'profissional', alvoId: 'b1' }),
      vinculo({ id: 'v2', tipo: 'negocio', alvoId: 'neg1' }),
    ]);
    // O profissional b1 pertence ao mesmo negócio neg1 — ambos os vínculos
    // resolvem para o mesmo id de barbeiro.
    mockedGetBarbeiro.mockResolvedValue(barbeiro({ id: 'b1', nome: 'Ana', ativo: true }));
    mockedListarProfissionaisDoNegocio.mockResolvedValue([
      barbeiro({ id: 'b1', nome: 'Ana', ativo: true }),
      barbeiro({ id: 'b2', nome: 'Beto', ativo: true }),
    ]);

    await renderSonda('cliente-1');

    await waitFor(() => expect(screen.getByText('2 barbeiros')).toBeTruthy());
    expect(hook.barbeiros.map((b) => b.id).sort()).toEqual(['b1', 'b2']);
  });
});

describe('falha ao resolver um vínculo', () => {
  it('não derruba os outros — o que falhou só não aparece', async () => {
    mockedListarVinculos.mockResolvedValue([
      vinculo({ id: 'v1', tipo: 'profissional', alvoId: 'b1' }),
      vinculo({ id: 'v2', tipo: 'profissional', alvoId: 'b2' }),
    ]);
    mockedGetBarbeiro.mockImplementation((id: string) => {
      if (id === 'b1') return Promise.reject(new Error('negócio apagado'));
      return Promise.resolve(barbeiro({ id: 'b2', nome: 'Beto', ativo: true }));
    });

    await renderSonda('cliente-1');

    await waitFor(() => expect(screen.getByText('1 barbeiros')).toBeTruthy());
    expect(hook.barbeiros).toEqual([expect.objectContaining({ id: 'b2' })]);
  });
});
