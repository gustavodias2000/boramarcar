/**
 * EquipeScreen — **DOM-02**: avisar antes de desativar um profissional.
 *
 * O enunciado original da auditoria dizia que desativar "quebra" os
 * agendamentos existentes. Não quebra: `validarEPrepararSlots` (Cloud
 * Function) recusa agendamentos NOVOS para profissional inativo, mas o que já
 * está marcado continua na agenda, o cliente continua vendo e podendo
 * cancelar, e o dono continua podendo confirmar/concluir/cancelar cada um.
 *
 * O problema real é de GESTÃO — o dono não sabe quantos compromissos acabou
 * de herdar. Por isso o fluxo aqui CONTA e AVISA, e por isso estes testes
 * travam, mais do que qualquer outra coisa, o que NÃO acontece: nenhum
 * cancelamento em massa, nenhuma chamada a `atualizarStatus`.
 *
 * ESCOPO DELIBERADAMENTE ESTREITO: só o Switch de ativar/desativar. Criação
 * de negócio, ordenação da lista, navegação para EditarProfissional e o card
 * de Comissões continuam sem cobertura própria.
 *
 * Padrão de mock: `jest.mock` por arquivo — o `jest.setup.js` deste repo NÃO
 * mocka `react-native` globalmente, de propósito (CLAUDE.md §6) — e nunca
 * `restoreAllMocks()`, que derrubaria o spy de `Alert.alert` do setup global.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import EquipeScreen from '../../src/screens/EquipeScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import {
  getNegocioPorDono,
  listarMembros,
  listarProfissionaisDoNegocio,
  definirAtivoProfissional,
} from '../../src/data/repositories/NegocioRepository';
import {
  contarFuturosDoProfissional,
  atualizarStatus,
} from '../../src/data/repositories/AgendamentoRepository';
import type { Barbeiro, MembroEquipe, Negocio } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// `useFocusEffect` real depende de `navigation.addListener`, que o mock global
// de @react-navigation/native não fornece. Vira um `useEffect` de montagem —
// que é o efeito observável de uma tela renderizada sem navegador por volta.
jest.mock('@react-navigation/native', () => {
  const ReactLocal = require('react');
  return {
    useFocusEffect: (callback: () => void) => ReactLocal.useEffect(callback, [callback]),
  };
});

// ATENÇÃO — este mock é parte da asserção de DOM-02, não encanamento: o
// módulo de agendamentos expõe aqui SOMENTE `contarFuturosDoProfissional` e
// `atualizarStatus`. Se o fluxo de desativação passasse a cancelar em massa,
// `atualizarStatus` apareceria nas chamadas e os testes acusariam.
jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  contarFuturosDoProfissional: jest.fn(),
  atualizarStatus: jest.fn(),
}));

jest.mock('../../src/data/repositories/NegocioRepository', () => ({
  getNegocioPorDono: jest.fn(),
  listarMembros: jest.fn(),
  listarProfissionaisDoNegocio: jest.fn(),
  criarNegocio: jest.fn(),
  definirAtivoProfissional: jest.fn(),
}));

const mockedGetNegocioPorDono = getNegocioPorDono as jest.Mock;
const mockedListarMembros = listarMembros as jest.Mock;
const mockedListarProfissionais = listarProfissionaisDoNegocio as jest.Mock;
const mockedDefinirAtivo = definirAtivoProfissional as jest.Mock;
const mockedContarFuturos = contarFuturosDoProfissional as jest.Mock;
const mockedAtualizarStatus = atualizarStatus as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

// ─── Fixtures ───────────────────────────────────────────────────────────────

const NEGOCIO: Negocio = { id: 'negocio-1', donoUid: 'test-uid', nome: 'Barbearia do Zé' };

const DONO: Barbeiro = { id: 'test-uid', nome: 'Zé Dono' };
const PROFISSIONAL: Barbeiro = { id: 'prof-1', nome: 'Fulano', ativo: true } as Barbeiro;

const MEMBROS: MembroEquipe[] = [
  { id: 'm-dono', barbeiroId: 'test-uid', papel: 'dono', ativo: true },
  { id: 'm-prof', barbeiroId: 'prof-1', papel: 'profissional', ativo: true },
];

const renderTela = () =>
  render(
    <ThemeProvider>
      <EquipeScreen
        navigation={{ navigate: jest.fn(), goBack: jest.fn() } as any}
        route={{ params: {} } as any}
      />
    </ThemeProvider>,
  );

const aguardarLista = async (utils: ReturnType<typeof renderTela>) => {
  await waitFor(() => expect(utils.getByText('Fulano')).toBeTruthy());
};

/** O Switch do profissional (o dono não tem Switch). */
const switchDe = (utils: ReturnType<typeof renderTela>, rotulo: string) =>
  utils.getByLabelText(rotulo);

/** Aperta o botão de confirmação do diálogo de desativação. */
const confirmarDesativacao = async () => {
  const chamada = mockedAlert.mock.calls.find((c) => c[0] === 'Desativar Fulano?');
  expect(chamada).toBeTruthy();
  const botao = chamada![2].find((b: { text: string }) => b.text === 'Desativar mesmo assim');
  await act(async () => {
    await botao.onPress();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetNegocioPorDono.mockResolvedValue(NEGOCIO);
  mockedListarProfissionais.mockResolvedValue([DONO, PROFISSIONAL]);
  mockedListarMembros.mockResolvedValue(MEMBROS);
  mockedDefinirAtivo.mockResolvedValue(undefined);
  mockedContarFuturos.mockResolvedValue(0);
});

// ─── Desativar com compromissos futuros ─────────────────────────────────────

describe('EquipeScreen — DOM-02: desativar avisa antes, e só desativa', () => {
  it('com 3 compromissos futuros: mostra o número, e só grava depois do "Desativar mesmo assim"', async () => {
    mockedContarFuturos.mockResolvedValue(3);
    const utils = renderTela();
    await aguardarLista(utils);

    await act(async () => {
      fireEvent(switchDe(utils, 'Desativar Fulano'), 'valueChange', false);
    });

    // A contagem usa o negócio (é o campo que a regra do Firestore lê para
    // autorizar o dono) e uma data LOCAL no formato ISO curto.
    expect(mockedContarFuturos).toHaveBeenCalledWith(
      'negocio-1',
      'prof-1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );

    const chamada = mockedAlert.mock.calls.find((c) => c[0] === 'Desativar Fulano?');
    expect(chamada).toBeTruthy();
    expect(chamada![1]).toContain('3 agendamentos já marcados a partir de hoje');
    // O texto tem que ser honesto sobre o que NÃO acontece.
    expect(chamada![1]).toContain('não cancela esses');
    expect(chamada![2].map((b: { text: string }) => b.text)).toEqual([
      'Cancelar',
      'Desativar mesmo assim',
    ]);

    // Nada foi gravado ainda — o diálogo está aberto.
    expect(mockedDefinirAtivo).not.toHaveBeenCalled();

    await confirmarDesativacao();
    expect(mockedDefinirAtivo).toHaveBeenCalledWith('negocio-1', 'prof-1', false);
  });

  it('NUNCA chama atualizarStatus — desativar não cancela agendamento nenhum', async () => {
    mockedContarFuturos.mockResolvedValue(3);
    const utils = renderTela();
    await aguardarLista(utils);

    await act(async () => {
      fireEvent(switchDe(utils, 'Desativar Fulano'), 'valueChange', false);
    });
    await confirmarDesativacao();

    // O ponto central de DOM-02. Um cancelamento em massa aqui seria
    // irreversível com um toque de Switch E dispararia um aviso para cada
    // cliente — o limitador de envio é POR DESTINATÁRIO, então nenhum dos N
    // seria barrado.
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
  });

  it('"Cancelar" no diálogo: nenhuma escrita, e o Switch continua ligado', async () => {
    mockedContarFuturos.mockResolvedValue(3);
    const utils = renderTela();
    await aguardarLista(utils);

    await act(async () => {
      fireEvent(switchDe(utils, 'Desativar Fulano'), 'valueChange', false);
    });

    const chamada = mockedAlert.mock.calls.find((c) => c[0] === 'Desativar Fulano?')!;
    const botaoCancelar = chamada[2].find((b: { text: string }) => b.text === 'Cancelar');
    // Botão de desistir é `style:'cancel'` — no Android é o que o botão
    // físico "voltar" aciona.
    expect(botaoCancelar.style).toBe('cancel');
    // E ele não tem onPress: desistir é literalmente não fazer nada.
    expect(botaoCancelar.onPress).toBeUndefined();

    expect(mockedDefinirAtivo).not.toHaveBeenCalled();
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
    // Sem atualização otimista: o Switch é controlado por `barbeiro.ativo`,
    // que só muda depois da escrita. Desistir já o deixa como estava.
    expect(switchDe(utils, 'Desativar Fulano').props.value).toBe(true);
  });

  it('com 1 compromisso futuro o texto fica no singular', async () => {
    mockedContarFuturos.mockResolvedValue(1);
    const utils = renderTela();
    await aguardarLista(utils);

    await act(async () => {
      fireEvent(switchDe(utils, 'Desativar Fulano'), 'valueChange', false);
    });

    const chamada = mockedAlert.mock.calls.find((c) => c[0] === 'Desativar Fulano?')!;
    expect(chamada[1]).toContain('1 agendamento já marcado a partir de hoje');
  });
});

// ─── Desativar sem compromissos futuros ─────────────────────────────────────

describe('EquipeScreen — DOM-02: sem compromissos futuros não há o que avisar', () => {
  it('com 0 futuros desativa direto, sem diálogo', async () => {
    mockedContarFuturos.mockResolvedValue(0);
    const utils = renderTela();
    await aguardarLista(utils);

    await act(async () => {
      fireEvent(switchDe(utils, 'Desativar Fulano'), 'valueChange', false);
    });

    // Um diálogo aqui seria só atrito: não há compromisso nenhum para o dono
    // herdar.
    expect(mockedAlert).not.toHaveBeenCalledWith(
      'Desativar Fulano?',
      expect.anything(),
      expect.anything(),
    );
    await waitFor(() =>
      expect(mockedDefinirAtivo).toHaveBeenCalledWith('negocio-1', 'prof-1', false),
    );
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
  });
});

// ─── Falha na contagem ──────────────────────────────────────────────────────

describe('EquipeScreen — DOM-02: falha ao contar nunca impede a desativação', () => {
  it('contagem lança erro: avisa SEM número e "Desativar mesmo assim" grava normalmente', async () => {
    mockedContarFuturos.mockRejectedValue(new Error('permission-denied'));
    const utils = renderTela();
    await aguardarLista(utils);

    await act(async () => {
      fireEvent(switchDe(utils, 'Desativar Fulano'), 'valueChange', false);
    });

    const chamada = mockedAlert.mock.calls.find((c) => c[0] === 'Desativar Fulano?');
    expect(chamada).toBeTruthy();
    expect(chamada![1]).toContain('Não consegui conferir agora');
    // Sem número inventado: dizer "0 agendamentos" quando a consulta falhou
    // seria pior que não dizer nada.
    expect(chamada![1]).not.toMatch(/\d+ agendamento/);

    await confirmarDesativacao();
    expect(mockedDefinirAtivo).toHaveBeenCalledWith('negocio-1', 'prof-1', false);
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
  });
});

// ─── Reativar ───────────────────────────────────────────────────────────────

describe('EquipeScreen — DOM-02: reativar é caminho livre', () => {
  beforeEach(() => {
    mockedListarProfissionais.mockResolvedValue([
      DONO,
      { ...PROFISSIONAL, ativo: false } as Barbeiro,
    ]);
    mockedListarMembros.mockResolvedValue([
      MEMBROS[0],
      { ...MEMBROS[1], ativo: false },
    ]);
  });

  it('não abre diálogo e não consulta agendamentos', async () => {
    const utils = renderTela();
    await aguardarLista(utils);

    await act(async () => {
      fireEvent(switchDe(utils, 'Ativar Fulano'), 'valueChange', true);
    });

    // Reativar só torna a agenda do profissional visível de novo — não há
    // nada a avisar, e uma consulta aqui seria leitura à toa.
    expect(mockedContarFuturos).not.toHaveBeenCalled();
    expect(mockedAlert).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockedDefinirAtivo).toHaveBeenCalledWith('negocio-1', 'prof-1', true),
    );
  });
});

// ─── Regressão da migração de PERF (Onda 4) ─────────────────────────────────

/**
 * PERF (Onda 4): seis telas trocaram `getNegocioPorDono` (duas leituras:
 * `barbeiros/{uid}` cacheado + `negocios/{id}` cru) por `getNegocioIdDoDono`
 * (uma leitura só), porque usavam exclusivamente `negocio.id`.
 *
 * EquipeScreen ficou DE FORA da migração, e é a única: ela é a única tela que
 * renderiza `negocio.nome` — o nome do negócio no cabeçalho. Só o id não
 * serve aqui.
 *
 * Este teste é o freio da otimização: se alguém "terminar o trabalho"
 * migrando esta tela também, o cabeçalho fica vazio e a falha aparece aqui,
 * em vez de aparecer no celular do dono.
 */
describe('EquipeScreen — PERF (Onda 4): esta tela precisa do negócio INTEIRO', () => {
  it('mostra o nome do negócio no cabeçalho', async () => {
    const utils = renderTela();
    await aguardarLista(utils);

    expect(utils.getByText('Barbearia do Zé')).toBeTruthy();
  });

  it('resolve o negócio por `getNegocioPorDono` — o id sozinho não renderiza o nome', async () => {
    renderTela();

    // O nome vem do doc `negocios/{id}`, não do doc do barbeiro. Trocar por
    // `getNegocioIdDoDono` aqui economizaria uma leitura e apagaria o título.
    await waitFor(() => expect(mockedGetNegocioPorDono).toHaveBeenCalledWith('test-uid'));
  });

  it('sem negócio, cai na tela de criação em vez de renderizar cabeçalho vazio', async () => {
    mockedGetNegocioPorDono.mockResolvedValue(null);
    const utils = renderTela();

    await waitFor(() => expect(utils.queryByText('Barbearia do Zé')).toBeNull());
    expect(mockedListarProfissionais).not.toHaveBeenCalled();
  });
});
