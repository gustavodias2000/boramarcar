import React from 'react';
import { Alert, Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { auth } from '../../firebaseConfig';
import {
  adicionarClienteManual,
  listarClientesDoBarbeiro,
  removerCliente,
} from '../../src/data/repositories/ClienteContatoRepository';
import useClientes from '../../src/hooks/useClientes';

jest.mock('@react-navigation/native', () => {
  const ReactModule = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => ReactModule.useEffect(effect, [effect]),
  };
});

jest.mock('../../src/data/repositories/ClienteContatoRepository', () => ({
  adicionarClienteManual: jest.fn(),
  atualizarCliente: jest.fn(),
  importarClientesEmLote: jest.fn(),
  listarClientesDoBarbeiro: jest.fn(),
  removerCliente: jest.fn(),
}));

const mockedListar = listarClientesDoBarbeiro as jest.Mock;
const mockedAdicionar = adicionarClienteManual as jest.Mock;
const mockedRemover = removerCliente as jest.Mock;

let clientesHook: ReturnType<typeof useClientes>;
function Sonda() {
  clientesHook = useClientes();
  return <Text>{clientesHook.loading ? 'carregando' : `${clientesHook.clientes.length} clientes`}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'barbeiro-1' };
  mockedListar.mockResolvedValue([]);
  mockedAdicionar.mockResolvedValue('cliente-1');
  mockedRemover.mockResolvedValue(undefined);
});

describe('useClientes', () => {
  it('lista somente os clientes do profissional autenticado', async () => {
    mockedListar.mockResolvedValue([{ id: 'cliente-1', nome: 'Maria' }]);
    render(<Sonda />);

    await waitFor(() => expect(screen.getByText('1 clientes')).toBeTruthy());

    expect(mockedListar).toHaveBeenCalledWith('barbeiro-1');
  });

  it('não consulta a agenda sem um profissional autenticado', async () => {
    (auth as any).currentUser = null;
    render(<Sonda />);

    await waitFor(() => expect(screen.getByText('0 clientes')).toBeTruthy());

    expect(mockedListar).not.toHaveBeenCalled();
  });

  it('valida o nome antes de criar um cliente', async () => {
    render(<Sonda />);
    await waitFor(() => expect(clientesHook.loading).toBe(false));

    await act(async () => {
      await clientesHook.salvarManual();
    });

    expect(mockedAdicionar).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Atenção', 'Informe o nome do cliente.');
  });

  it('cria o cliente no escopo do profissional e atualiza a lista', async () => {
    render(<Sonda />);
    await waitFor(() => expect(clientesHook.loading).toBe(false));

    await act(async () => {
      clientesHook.setNomeManual(' Maria ');
      clientesHook.setTelefoneManual('(11) 99999-9999');
    });
    await act(async () => {
      await clientesHook.salvarManual();
    });

    expect(mockedAdicionar).toHaveBeenCalledWith('barbeiro-1', {
      nome: 'Maria',
      telefone: '5511999999999',
      aniversario: undefined,
    });
    expect(mockedListar).toHaveBeenCalledTimes(2);
  });

  it('remove somente o cliente confirmado no alerta', async () => {
    const cliente = { id: 'cliente-1', nome: 'Maria' } as any;
    render(<Sonda />);
    await waitFor(() => expect(clientesHook.loading).toBe(false));

    clientesHook.excluirCliente(cliente);
    const botoes = (Alert.alert as jest.Mock).mock.calls[0][2];
    await act(async () => {
      await botoes[1].onPress();
    });

    expect(mockedRemover).toHaveBeenCalledWith('barbeiro-1', 'cliente-1');
  });
});
