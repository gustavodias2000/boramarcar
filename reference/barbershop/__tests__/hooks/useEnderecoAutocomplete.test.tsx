/**
 * useEnderecoAutocomplete — endereço do estabelecimento com autocomplete.
 *
 * ARQ-02: a regra de negócio que estes testes protegem é a relação entre
 * texto e coordenadas. lat/lng só podem existir quando o endereço veio de uma
 * sugestão escolhida; qualquer digitação manual depois disso precisa zerar as
 * coordenadas, senão o link de mapa mostrado ao cliente na confirmação do
 * agendamento apontaria para um endereço diferente do que está escrito.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  buscarSugestoesEndereco,
  buscarDetalhesEndereco,
} from '../../src/services/GeocodingService';
import useEnderecoAutocomplete from '../../src/hooks/useEnderecoAutocomplete';

jest.mock('../../src/services/GeocodingService', () => ({
  buscarSugestoesEndereco: jest.fn(() => Promise.resolve([])),
  buscarDetalhesEndereco: jest.fn(() => Promise.resolve(null)),
}));

const mockedBuscarSugestoes = buscarSugestoesEndereco as jest.Mock;
const mockedBuscarDetalhes = buscarDetalhesEndereco as jest.Mock;

let hook!: ReturnType<typeof useEnderecoAutocomplete>;
function Sonda() {
  hook = useEnderecoAutocomplete();
  return <Text>{hook.buscando ? 'buscando' : `${hook.sugestoes.length} sugestões`}</Text>;
}

/** Digita e deixa o debounce de 400ms vencer. */
async function digitarEAguardar(texto: string) {
  await act(async () => hook.alterarEndereco(texto));
  await act(async () => {
    jest.advanceTimersByTime(400);
    await Promise.resolve();
    await Promise.resolve();
  });
}

const SUGESTAO = { placeId: 'p1', description: 'Rua Teste, 123, São Paulo' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockedBuscarSugestoes.mockResolvedValue([]);
  mockedBuscarDetalhes.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useEnderecoAutocomplete — estado inicial', () => {
  it('começa vazio, sem coordenadas e sem sugestões', () => {
    render(<Sonda />);

    expect(hook.endereco).toBe('');
    expect(hook.coordenadas).toBeNull();
    expect(hook.sugestoes).toEqual([]);
    expect(hook.buscando).toBe(false);
  });

  it('definirEnderecoInicial semeia texto e coordenadas já gravados na vitrine', async () => {
    render(<Sonda />);

    await act(async () => hook.definirEnderecoInicial('Rua Salva, 9', { lat: -23.5, lng: -46.6 }));

    expect(hook.endereco).toBe('Rua Salva, 9');
    expect(hook.coordenadas).toEqual({ lat: -23.5, lng: -46.6 });
  });

  it('endereço salvo sem lat/lng fica sem coordenadas', async () => {
    render(<Sonda />);

    await act(async () => hook.definirEnderecoInicial('Rua Sem Mapa, 1', null));

    expect(hook.endereco).toBe('Rua Sem Mapa, 1');
    expect(hook.coordenadas).toBeNull();
  });
});

describe('useEnderecoAutocomplete — busca com debounce', () => {
  it('não consulta o serviço antes dos 400ms', async () => {
    render(<Sonda />);

    await act(async () => hook.alterarEndereco('Rua Teste'));
    await act(async () => {
      jest.advanceTimersByTime(399);
      await Promise.resolve();
    });

    expect(mockedBuscarSugestoes).not.toHaveBeenCalled();
  });

  it('consulta uma única vez depois do debounce e expõe as sugestões', async () => {
    mockedBuscarSugestoes.mockResolvedValue([SUGESTAO]);
    render(<Sonda />);

    await digitarEAguardar('Rua Teste');

    expect(mockedBuscarSugestoes).toHaveBeenCalledTimes(1);
    expect(mockedBuscarSugestoes).toHaveBeenCalledWith('Rua Teste');
    expect(hook.sugestoes).toEqual([SUGESTAO]);
  });

  it('digitação contínua gera UMA busca só, com o último texto', async () => {
    mockedBuscarSugestoes.mockResolvedValue([SUGESTAO]);
    render(<Sonda />);

    await act(async () => {
      hook.alterarEndereco('Rua');
      jest.advanceTimersByTime(100);
      hook.alterarEndereco('Rua T');
      jest.advanceTimersByTime(100);
      hook.alterarEndereco('Rua Teste');
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedBuscarSugestoes).toHaveBeenCalledTimes(1);
    expect(mockedBuscarSugestoes).toHaveBeenCalledWith('Rua Teste');
  });

  it('menos de 3 caracteres limpa as sugestões sem consultar o serviço', async () => {
    render(<Sonda />);

    await digitarEAguardar('Ru');

    expect(mockedBuscarSugestoes).not.toHaveBeenCalled();
    expect(hook.sugestoes).toEqual([]);
  });

  it('espaços não contam para o mínimo de 3 caracteres', async () => {
    render(<Sonda />);

    await digitarEAguardar('  a  ');

    expect(mockedBuscarSugestoes).not.toHaveBeenCalled();
  });

  it('apagar o texto até menos de 3 caracteres descarta as sugestões já exibidas', async () => {
    mockedBuscarSugestoes.mockResolvedValue([SUGESTAO]);
    render(<Sonda />);
    await digitarEAguardar('Rua Teste');
    expect(hook.sugestoes).toHaveLength(1);

    await act(async () => hook.alterarEndereco('Ru'));

    expect(hook.sugestoes).toEqual([]);
  });

});

/**
 * O achado que a extração da Onda 3 herdou da PerfilScreen e deixou anotado:
 * o callback do debounce usava try/finally SEM catch, então uma falha do
 * Places (offline, cota estourada) escapava de dentro do `setTimeout` como
 * unhandled rejection. O `finally` já destravava a UI, então nada travava —
 * mas sobrava a lista de sugestões ANTIGA na tela, agora sem relação com o
 * texto digitado, e um warning amarelo em dev.
 */
describe('useEnderecoAutocomplete — a busca falhou', () => {
  it('descarta as sugestões velhas em vez de deixá-las na tela', async () => {
    // Este é o teste que prova a correção: sem o `catch`, a rejeição pula o
    // `setSugestoes` e a lista de "Rua Teste" continua aberta enquanto o campo
    // já mostra outro endereço.
    mockedBuscarSugestoes.mockResolvedValue([SUGESTAO]);
    render(<Sonda />);
    await digitarEAguardar('Rua Teste');
    expect(hook.sugestoes).toEqual([SUGESTAO]);

    mockedBuscarSugestoes.mockRejectedValue(new Error('offline'));
    await digitarEAguardar('Rua Teste, 456');

    expect(hook.sugestoes).toEqual([]);
  });

  it('destrava o campo — `buscando` não fica preso em true', async () => {
    mockedBuscarSugestoes.mockRejectedValue(new Error('offline'));
    render(<Sonda />);

    await digitarEAguardar('Rua Teste');

    expect(hook.buscando).toBe(false);
  });

  it('a falha não é definitiva: a busca seguinte volta a funcionar', async () => {
    mockedBuscarSugestoes.mockRejectedValue(new Error('offline'));
    render(<Sonda />);
    await digitarEAguardar('Rua Teste');

    mockedBuscarSugestoes.mockResolvedValue([SUGESTAO]);
    await digitarEAguardar('Rua Teste, 456');

    expect(hook.sugestoes).toEqual([SUGESTAO]);
  });

  it('não deixa a rejeição escapar do setTimeout', async () => {
    // Verificado contra o bug: com o `catch` removido do hook, este teste
    // captura a rejeição e falha. O ouvinte é registrado ANTES da render e
    // removido no fim para não vazar entre arquivos de teste.
    const escaparam: unknown[] = [];
    const ouvinte = (motivo: unknown) => { escaparam.push(motivo); };
    process.on('unhandledRejection', ouvinte);
    try {
      mockedBuscarSugestoes.mockRejectedValue(new Error('offline'));
      render(<Sonda />);
      await digitarEAguardar('Rua Teste');

      // O Node só decide que uma rejeição ficou sem dono no fim do macrotask —
      // com timers falsos esse momento nunca chega sozinho.
      jest.useRealTimers();
      await new Promise((resolve) => setImmediate(resolve));

      expect(escaparam).toEqual([]);
    } finally {
      process.off('unhandledRejection', ouvinte);
    }
  });
});

describe('useEnderecoAutocomplete — desmonte', () => {
  it('cancela a busca pendente quando a tela fecha no meio do debounce', async () => {
    const tela = render(<Sonda />);
    await act(async () => hook.alterarEndereco('Rua Teste'));

    tela.unmount();
    jest.advanceTimersByTime(400);
    await Promise.resolve();

    expect(mockedBuscarSugestoes).not.toHaveBeenCalled();
  });
});

describe('useEnderecoAutocomplete — escolher uma sugestão', () => {
  it('adota o endereço formatado e as coordenadas do Places', async () => {
    mockedBuscarDetalhes.mockResolvedValue({
      formattedAddress: 'Rua Teste, 123 - São Paulo, SP',
      latitude: -23.5,
      longitude: -46.6,
    });
    render(<Sonda />);

    await act(async () => {
      await hook.selecionarSugestao(SUGESTAO);
    });

    expect(mockedBuscarDetalhes).toHaveBeenCalledWith('p1');
    expect(hook.endereco).toBe('Rua Teste, 123 - São Paulo, SP');
    expect(hook.coordenadas).toEqual({ lat: -23.5, lng: -46.6 });
  });

  it('fecha a lista de sugestões ao escolher', async () => {
    mockedBuscarSugestoes.mockResolvedValue([SUGESTAO]);
    render(<Sonda />);
    await digitarEAguardar('Rua Teste');
    expect(hook.sugestoes).toHaveLength(1);

    await act(async () => {
      await hook.selecionarSugestao(SUGESTAO);
    });

    expect(hook.sugestoes).toEqual([]);
  });

  it('sem detalhes do Places, mantém o texto da sugestão e segue sem coordenadas', async () => {
    mockedBuscarDetalhes.mockResolvedValue(null);
    render(<Sonda />);

    await act(async () => {
      await hook.selecionarSugestao(SUGESTAO);
    });

    expect(hook.endereco).toBe('Rua Teste, 123, São Paulo');
    expect(hook.coordenadas).toBeNull();
  });

  it('detalhes sem lat/lng não inventam coordenadas', async () => {
    mockedBuscarDetalhes.mockResolvedValue({ formattedAddress: 'Rua Teste, 123 - SP' });
    render(<Sonda />);

    await act(async () => {
      await hook.selecionarSugestao(SUGESTAO);
    });

    expect(hook.endereco).toBe('Rua Teste, 123 - SP');
    expect(hook.coordenadas).toBeNull();
  });
});

describe('useEnderecoAutocomplete — coordenadas x edição manual', () => {
  it('digitar depois de escolher uma sugestão INVALIDA as coordenadas', async () => {
    mockedBuscarDetalhes.mockResolvedValue({
      formattedAddress: 'Rua Teste, 123 - São Paulo, SP',
      latitude: -23.5,
      longitude: -46.6,
    });
    render(<Sonda />);
    await act(async () => {
      await hook.selecionarSugestao(SUGESTAO);
    });
    expect(hook.coordenadas).toEqual({ lat: -23.5, lng: -46.6 });

    // Sem isto, o mapa mostrado ao cliente apontaria para o endereço antigo.
    await act(async () => hook.alterarEndereco('Rua Teste, 456'));

    expect(hook.coordenadas).toBeNull();
    expect(hook.endereco).toBe('Rua Teste, 456');
  });

  it('editar por cima do endereço carregado da vitrine também invalida as coordenadas', async () => {
    render(<Sonda />);
    await act(async () => hook.definirEnderecoInicial('Rua Salva, 9', { lat: -23.5, lng: -46.6 }));

    await act(async () => hook.alterarEndereco('Rua Salva, 10'));

    expect(hook.coordenadas).toBeNull();
  });
});
