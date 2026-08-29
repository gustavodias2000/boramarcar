/**
 * AgendamentoManualScreen — regressão de **AG-05** (Onda 2), lado do app.
 *
 * Esta tela não tinha suíte nenhuma até aqui. O escopo deste arquivo é
 * DELIBERADAMENTE estreito: cobre o que a Onda 2 mudou na tela, não a tela
 * inteira (seleção de cliente por busca, modo "novo cliente", máscara de
 * telefone, pré-preenchimento vindo de ClientesScreen e a condição de
 * corrida de `requisicaoHorariosRef` continuam sem cobertura — ver o
 * relatório de QA).
 *
 * O que mudou e está coberto aqui:
 *  1. o agendamento sai com `origem:'manual'` e `servicoId` preenchido — são
 *     os dois campos de que `AgendamentoRepository.criarAgendamento` depende
 *     para rotear a chamada à Cloud Function `criarAgendamentoManualSeguro`
 *     (e é o `servicoId` que o servidor usa para buscar o preço no catálogo,
 *     em vez de aceitar o preço do app);
 *  2. a tela NÃO reserva mais slots do lado cliente — a reserva virou parte
 *     da transação do servidor;
 *  3. a colisão de horário devolvida pela Function (`functions/already-exists`)
 *     vira um aviso específico + recarga dos horários, não o erro genérico.
 *
 * Padrão de mock: `jest.mock` por arquivo (o `jest.setup.js` deste repo NÃO
 * mocka `react-native` globalmente, de propósito — ver CLAUDE.md §6), e o
 * `Alert.alert` usado nas asserções é o spy montado no setup global, por isso
 * aqui só se chama `jest.clearAllMocks()`, nunca `restoreAllMocks()`.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import AgendamentoManualScreen from '../../src/screens/AgendamentoManualScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { getHorariosOcupados } from '../../src/services/OcupacaoService';
import { criarAgendamento } from '../../src/data/repositories/AgendamentoRepository';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { listarClientesDoBarbeiro } from '../../src/data/repositories/ClienteContatoRepository';
import useUserProfile from '../../src/hooks/useUserProfile';
import type { ServicoBarbeiro, ConfiguracaoAgenda } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mesma estratégia de AgendamentoScreen.test.tsx: `getDatesDisponiveis` é a
// única função de agendaSlots.ts mockada, porque é a única que depende do
// "hoje" real. `gerarSlots`/`filtrarBloqueiosHorario`/`isTimeInPast` rodam de
// verdade. Datas em 2030 tiram qualquer dependência do dia da execução.
const DATAS_FIXAS = ['2030-01-15', '2030-01-16', '2030-01-17'];
const mockedGetDatesDisponiveis = jest.fn(
  (_config: ConfiguracaoAgenda, datasBloqueadas: string[] = []) =>
    DATAS_FIXAS.filter((d) => !datasBloqueadas.includes(d)).map((d) => ({ date: d, display: d })),
);
jest.mock('../../src/utils/agendaSlots', () => {
  const real = jest.requireActual('../../src/utils/agendaSlots');
  return {
    ...real,
    getDatesDisponiveis: (...args: any[]) => (mockedGetDatesDisponiveis as any)(...args),
  };
});

// ATENÇÃO — este mock é parte da asserção de AG-05, não só encanamento: ele
// expõe SOMENTE `getHorariosOcupados`. Se a tela voltasse a chamar
// `reservarSlots` (a reserva client-side que a Onda 2 removeu), o teste de
// caminho feliz quebraria com "reservarSlots is not a function".
jest.mock('../../src/services/OcupacaoService', () => ({
  getHorariosOcupados: jest.fn(),
}));

jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  criarAgendamento: jest.fn(),
}));

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/ClienteContatoRepository', () => ({
  listarClientesDoBarbeiro: jest.fn(),
}));

jest.mock('../../src/hooks/useUserProfile', () => jest.fn());

const mockedGetHorariosOcupados = getHorariosOcupados as jest.Mock;
const mockedCriarAgendamento = criarAgendamento as jest.Mock;
const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedListarClientes = listarClientesDoBarbeiro as jest.Mock;
const mockedUseUserProfile = useUserProfile as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

// ─── Fixtures ───────────────────────────────────────────────────────────────

// 09:00–11:00, sem almoço, serviço de 30min → 4 slots: 09:00, 09:30, 10:00, 10:30.
const CONFIG_BASE: ConfiguracaoAgenda = {
  horaInicio: '09:00',
  horaFim: '11:00',
  almocoInicio: '',
  almocoFim: '',
  antecedenciaMinutos: 0,
  antecedenciaMaximaDias: 90,
  diasAtendimento: [0, 1, 2, 3, 4, 5, 6],
};

const SERVICO_CORTE: ServicoBarbeiro = {
  id: 's1',
  nome: 'Corte Masculino',
  duracaoMinutos: 30,
  precoEmCentavos: 3000,
};

const CLIENTE_DA_AGENDA = {
  id: 'c1',
  nome: 'Zé da Esquina',
  telefone: '+5511977776666',
  barbeiroId: 'test-uid',
};

const dadosBarbeiro = (overrides: Record<string, unknown> = {}) => ({
  nome: 'Barbeiro Teste',
  telefone: '5511999999999',
  negocioId: 'negocio-1',
  configuracaoAgenda: CONFIG_BASE,
  servicos: [SERVICO_CORTE],
  bloqueiosHorario: [],
  datasBloqueadas: [],
  ...overrides,
});

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() } as any;

const renderScreen = () =>
  render(
    <ThemeProvider>
      <AgendamentoManualScreen navigation={mockNavigation} route={{ params: {} } as any} />
    </ThemeProvider>,
  );

/** Espera a tela sair do carregamento inicial e a grade de horários aparecer. */
const aguardarTelaPronta = async (utils: ReturnType<typeof renderScreen>) => {
  await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());
  await waitFor(() => expect(utils.getByText('Cliente')).toBeTruthy());
  await waitFor(() => expect(utils.getByLabelText('Horário 09:00')).toBeTruthy());
};

/** Preenche o mínimo para o botão de confirmar funcionar: cliente + horário. */
const preencherAgendamento = async (utils: ReturnType<typeof renderScreen>) => {
  await aguardarTelaPronta(utils);
  await act(async () => {
    fireEvent.press(utils.getByLabelText(`Selecionar cliente ${CLIENTE_DA_AGENDA.nome}`));
  });
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Horário 09:00'));
  });
};

beforeEach(() => {
  // `clearAllMocks` (nunca `restoreAllMocks`): restaurar derrubaria o spy de
  // Alert.alert montado no jest.setup.js e usado nas asserções abaixo.
  jest.clearAllMocks();
  mockedGetBarbeiro.mockResolvedValue(dadosBarbeiro());
  mockedListarClientes.mockResolvedValue([CLIENTE_DA_AGENDA]);
  mockedGetHorariosOcupados.mockResolvedValue([]);
  mockedCriarAgendamento.mockResolvedValue('novo-agendamento-id');
  mockedUseUserProfile.mockReturnValue({
    profile: { nome: 'Barbeiro Teste', telefone: '5511999999999' },
    loading: false,
    refresh: jest.fn(),
  });
});

// ─── AG-05: o que a tela manda para o servidor ──────────────────────────────

describe('AgendamentoManualScreen — AG-05: criação via Cloud Function', () => {
  it('ao confirmar, chama criarAgendamento com origem "manual" e servicoId preenchido', async () => {
    const utils = renderScreen();
    await preencherAgendamento(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Criar agendamento'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedCriarAgendamento).toHaveBeenCalledTimes(1);
    const enviado = mockedCriarAgendamento.mock.calls[0][0];
    // `origem: 'manual'` é o que faz o AgendamentoRepository rotear para a
    // Function `criarAgendamentoManualSeguro` em vez do fluxo do cliente;
    // `servicoId` é o único campo de serviço que o servidor aceita (ele
    // resolve nome e preço no catálogo do barbeiro por conta própria).
    expect(enviado).toMatchObject({
      origem: 'manual',
      servicoId: 's1',
      barbeiroId: 'test-uid',
      clienteNome: 'Zé da Esquina',
      clienteUid: '',
      status: 'confirmado',
      data: '2030-01-15',
      horario: '09:00',
    });
    expect(enviado.servicoId).toBeTruthy();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('leva o telefone do cliente escolhido quando ele tem um cadastrado', async () => {
    const utils = renderScreen();
    await preencherAgendamento(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Criar agendamento'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedCriarAgendamento.mock.calls[0][0]).toMatchObject({
      clienteTelefone: '+5511977776666',
    });
  });

  it('sem cliente selecionado, avisa e não chama criarAgendamento', async () => {
    const utils = renderScreen();
    await aguardarTelaPronta(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Horário 09:00'));
    });
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Criar agendamento'));
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith(
      'Atenção',
      'Selecione um cliente da lista ou informe o nome.',
    );
    expect(mockedCriarAgendamento).not.toHaveBeenCalled();
  });

  it('sem horário selecionado, avisa e não chama criarAgendamento', async () => {
    const utils = renderScreen();
    await aguardarTelaPronta(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText(`Selecionar cliente ${CLIENTE_DA_AGENDA.nome}`));
    });
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Criar agendamento'));
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Atenção', 'Selecione o serviço, a data e o horário.');
    expect(mockedCriarAgendamento).not.toHaveBeenCalled();
  });
});

// ─── AG-05: a reserva de slots saiu da tela ─────────────────────────────────

describe('AgendamentoManualScreen — AG-05: nenhuma reserva de slot do lado cliente', () => {
  // Complemento estático ao mock parcial de OcupacaoService lá em cima (que
  // só expõe `getHorariosOcupados`): prova que o arquivo de PRODUÇÃO nem
  // menciona `reservarSlots`, e não apenas que o mock deixaria de expô-lo.
  // Mesmo padrão do teste equivalente em AgendamentoScreen.test.tsx (P0-1).
  it('não importa nem chama reservarSlots no código-fonte (checagem estática)', () => {
    const fs = require('fs');
    const path = require('path');
    const codigo = fs.readFileSync(
      path.join(__dirname, '../../src/screens/AgendamentoManualScreen.tsx'),
      'utf8',
    );
    // Os comentários são removidos antes da checagem de propósito: o arquivo
    // de produção CITA `reservarSlots` num comentário que explica justamente
    // por que a chamada foi removida na Onda 2. Esse comentário é
    // documentação valiosa — o teste tem que olhar para o código executável,
    // não para a prosa, senão obrigaria a apagar a explicação para ficar verde.
    const codigoExecutavel = codigo
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(codigoExecutavel).not.toMatch(/reservarSlots/);
    // Confirma que o import de OcupacaoService continua existindo (não é
    // falso-positivo por o arquivo ter sido esvaziado) e traz só a leitura.
    expect(codigoExecutavel).toMatch(
      /import\s*\{\s*getHorariosOcupados\s*\}\s*from\s*['"]\.\.\/services\/OcupacaoService['"]/,
    );
    // E nenhuma escrita direta na coleção `agendamentos`: a criação passa
    // obrigatoriamente pelo repositório, que chama a Cloud Function.
    expect(codigoExecutavel).not.toMatch(/addDoc/);
  });

  it('no caminho feliz, o serviço de ocupação é usado apenas para LER os horários', async () => {
    const utils = renderScreen();
    await preencherAgendamento(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Criar agendamento'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // A única função de OcupacaoService exposta no mock foi chamada só para
    // montar a grade — e o agendamento foi criado mesmo assim.
    expect(mockedGetHorariosOcupados).toHaveBeenCalledWith('test-uid', '2030-01-15');
    expect(mockedCriarAgendamento).toHaveBeenCalledTimes(1);
  });
});

// ─── AG-05: colisão de horário detectada pelo servidor ──────────────────────

describe('AgendamentoManualScreen — colisão de horário vinda da Cloud Function', () => {
  it('quando a Function recusa com functions/already-exists, avisa "Horário já ocupado" e recarrega os horários', async () => {
    mockedCriarAgendamento.mockRejectedValue({
      code: 'functions/already-exists',
      message: 'Este horário acabou de ser reservado.',
    });
    const utils = renderScreen();
    await preencherAgendamento(utils);

    mockedGetHorariosOcupados.mockClear();
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Criar agendamento'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith(
      'Horário já ocupado',
      expect.stringContaining('acabou de ser preenchido'),
    );
    // Recarrega a grade para o barbeiro ver o horário sumir, em vez de deixar
    // um slot já tomado clicável na tela.
    await waitFor(() => expect(mockedGetHorariosOcupados).toHaveBeenCalled());
    // Não cai no erro genérico nem sai da tela — o barbeiro escolhe outro horário.
    expect(mockedAlert).not.toHaveBeenCalledWith('Erro', expect.any(String));
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('em erro inesperado (rede/permissão), mostra o alerta genérico e permanece na tela', async () => {
    mockedCriarAgendamento.mockRejectedValue(new Error('sem conexão'));
    const utils = renderScreen();
    await preencherAgendamento(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Criar agendamento'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Não foi possível criar o agendamento. Tente novamente.',
    );
    expect(mockedAlert).not.toHaveBeenCalledWith('Horário já ocupado', expect.any(String));
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });
});
