/**
 * BarbeiroHome — regressão de **DB-09** (Onda 2), lado do app.
 *
 * DB-09 nasceu AQUI: era esta tela que, ao concluir um atendimento, buscava
 * o membro da equipe, calculava a comissão no dispositivo do próprio
 * beneficiário (`ComissaoService.calcularComissaoCentavos`) e gravava
 * `status:'concluido'` + `comissaoCentavos` direto no Firestore via
 * `atualizarStatus`. Quem recebia o valor era quem o escrevia.
 *
 * A correção removeu o cálculo da tela: ela agora só dispara a Cloud Function
 * `concluirAgendamentoSeguro` com o `agendamentoId` e reage ao resultado. Este
 * arquivo trava esse contrato — sem ele, alguém poderia "otimizar" a tela de
 * volta para uma escrita direta e nada acusaria.
 *
 * ESCOPO ESTREITO: o eixo principal deste arquivo continua sendo a ação
 * "Marcar Concluído". A ele soma-se agora (ARQ-05) a telemetria das três
 * ações da agenda — confirmar, cancelar e concluir —, porque os três `catch`
 * vazios que foram instrumentados vivem lado a lado no mesmo fluxo e reusam
 * toda a montagem de mocks daqui; um arquivo paralelo só duplicaria isso. O
 * resto de BarbeiroHome (calendário mensal, filtro por data, agenda de equipe
 * vs. solo, pull-to-refresh) continua sem cobertura — ver o relatório de QA.
 *
 * Padrão de mock: por arquivo (o `jest.setup.js` NÃO mocka `react-native`
 * globalmente — CLAUDE.md §6) e nunca `restoreAllMocks()`, que derrubaria o
 * spy de `Alert.alert` do setup global usado nas asserções.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import BarbeiroHome from '../../src/screens/BarbeiroHome';
import { ThemeProvider } from '../../src/context/ThemeContext';
import {
  listarDoEscopoFinanceiroPorPeriodo,
  listarPendentesDoEscopo,
  listarConfirmadosHojeDoEscopo,
  atualizarStatus,
} from '../../src/data/repositories/AgendamentoRepository';
import { getNegocioIdDoDono } from '../../src/data/repositories/NegocioRepository';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { migrarBanidosLegado } from '../../src/data/repositories/BanimentoRepository';
import { getOcupacoesPorPeriodo } from '../../src/services/OcupacaoService';
import { httpsCallable } from '../../src/services/CloudFunctionsClient';
import { registrarErro, registrarAviso } from '../../src/services/ObservabilityService';
import useUserProfile from '../../src/hooks/useUserProfile';
import type { Agendamento } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// `useFocusEffect` real depende de `navigation.addListener`, que o mock
// global de @react-navigation/native (jest.setup.js) não fornece. Aqui ele
// vira um `useEffect` de montagem — que é exatamente o efeito observável numa
// tela renderizada isoladamente, sem navegador por volta.
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const ReactLocal = require('react');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useRoute: () => ({ params: {} }),
    useFocusEffect: (callback: () => void) => {
      ReactLocal.useEffect(callback, []);
    },
  };
});

// OBRIGATÓRIO — defeito de EMPACOTAMENTO do próprio React Native 0.80, não
// deste projeto: `node_modules/react-native/jest/setup.js` mocka
// `RefreshControl` fazendo `requireActual` de
// `../Libraries/Components/RefreshControl/__mocks__/RefreshControlMock` — um
// arquivo que NÃO é publicado no pacote (a pasta `__mocks__` não existe em
// 0.80). Resultado: qualquer tela com pull-to-refresh explode no render com
// "Cannot find module ... RefreshControlMock". `BarbeiroHome` usa
// `<RefreshControl>` na FlatList da agenda. Substituir por um componente de
// host puro (string) resolve sem mockar `react-native` inteiro — o que o
// CLAUDE.md §6 proíbe, porque os getters lazy do RN 0.80 quebram o preset.
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () => ({
  __esModule: true,
  default: 'RefreshControl',
}));

// OBRIGATÓRIO para esta tela — não é conveniência. `BarbeiroHome` renderiza
// `<SkeletonList />` no estado de carregamento, que é o PRIMEIRO render. E
// `Skeleton.tsx` anima com `Animated.loop(Animated.sequence([timing, timing]))`,
// enquanto o `jest.setup.js` global substitui `Animated.timing` por uma
// animação SÍNCRONA que chama `callback({finished:true})` na hora. Loop +
// callback síncrono = recursão infinita: o render estoura com
// "Maximum call stack size exceeded" antes de qualquer asserção.
// É uma armadilha pré-existente da infraestrutura de teste (não da Onda 2) e
// atinge qualquer suíte que renderize um skeleton — ver o relatório de QA.
// ATENÇÃO: `Skeleton.tsx` NÃO tem suíte própria hoje, então este mock não
// está "delegando" a verificação para outro arquivo — a animação do skeleton
// segue sem cobertura. Aqui ele só precisa não derrubar o render.
jest.mock('../../src/components/Skeleton', () => {
  const RN = require('react-native');
  return {
    __esModule: true,
    SkeletonList: () => <RN.View testID="skeleton-list" />,
    SkeletonCard: () => <RN.View testID="skeleton-card" />,
    SkeletonBlock: () => <RN.View testID="skeleton-block" />,
  };
});

// A Agenda carrega a lista por JANELA DE DATA (CRÍTICO 2 da auditoria), não
// mais pelas "50 marcações criadas mais recentemente". Só
// `listarDoEscopoFinanceiroPorPeriodo` e `atualizarStatus` são expostos aqui
// de propósito: se a tela voltasse a chamar `listarDoBarbeiro`/
// `listarPorNegocio`, o carregamento quebraria com "is not a function" e
// todos os testes deste arquivo cairiam — é o mesmo padrão de asserção por
// ausência usado em __tests__/screens/tabs/BarbeiroRelatoriosTab.test.tsx.
// A cobertura da janela em si (datas, mês exibido, escopo solo/equipe) vive
// em __tests__/screens/BarbeiroHome.janela.test.tsx; aqui ela é só o
// encanamento que coloca um agendamento na tela.
jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  listarDoEscopoFinanceiroPorPeriodo: jest.fn(),
  listarPendentesDoEscopo: jest.fn(),
  listarConfirmadosHojeDoEscopo: jest.fn(),
  atualizarStatus: jest.fn(),
}));

jest.mock('../../src/data/repositories/NegocioRepository', () => ({
  getNegocioIdDoDono: jest.fn(),
}));

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/BanimentoRepository', () => ({
  migrarBanidosLegado: jest.fn(),
}));

jest.mock('../../src/services/OcupacaoService', () => ({
  getOcupacoesPorPeriodo: jest.fn(),
  liberarSlotsDoAgendamento: jest.fn(),
}));

jest.mock('../../src/services/CloudFunctionsClient', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('../../src/services/NotificationService', () => ({
  __esModule: true,
  default: { init: jest.fn() },
}));

// ARQ-05: os três `catch {}` vazios da agenda (confirmar/cancelar/concluir)
// viraram eventos em `eventosOperacionais`. Mockado no mesmo padrão de
// AgendamentoScreen.test.tsx — o que se verifica aqui é o evento que a tela
// MONTA (nível, area/operacao e campos do contexto), não o transporte até a
// Cloud Function, coberto em __tests__/services/ObservabilityService.test.ts.
jest.mock('../../src/services/ObservabilityService', () => ({
  registrarErro: jest.fn(() => Promise.resolve()),
  registrarAviso: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/hooks/useUserProfile', () => jest.fn());

const mockedListarEscopo = listarDoEscopoFinanceiroPorPeriodo as jest.Mock;
const mockedListarPendentes = listarPendentesDoEscopo as jest.Mock;
const mockedListarConfirmadosHoje = listarConfirmadosHojeDoEscopo as jest.Mock;
const mockedAtualizarStatus = atualizarStatus as jest.Mock;
const mockedGetNegocioIdDoDono = getNegocioIdDoDono as jest.Mock;
const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedMigrarBanidos = migrarBanidosLegado as jest.Mock;
const mockedGetOcupacoes = getOcupacoesPorPeriodo as jest.Mock;
const mockedHttpsCallable = httpsCallable as jest.Mock;
const mockedUseUserProfile = useUserProfile as jest.Mock;
const mockedRegistrarErro = registrarErro as jest.Mock;
const mockedRegistrarAviso = registrarAviso as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

// ─── Fixtures ───────────────────────────────────────────────────────────────

const AGENDAMENTO_CONFIRMADO = {
  id: 'ag-1',
  barbeiroId: 'test-uid',
  barbeiroNome: 'Barbeiro Teste',
  negocioId: 'negocio-1',
  cliente: 'cliente@teste.com',
  clienteUid: 'cliente-uid',
  clienteNome: 'Zé da Esquina',
  clienteTelefone: '+5511977776666',
  status: 'confirmado',
  data: '2030-01-15',
  horario: '09:00',
  servico: 'Corte Masculino',
  servicoId: 's1',
  preco: '30,00',
  precoEmCentavos: 3000,
} as Agendamento;

/** A Function devolve `{ data: ... }`, igual ao httpsCallable do SDK. */
const chamadaDaFunction = jest.fn();

const renderScreen = () =>
  render(
    <ThemeProvider>
      <BarbeiroHome navigation={{ navigate: jest.fn(), goBack: jest.fn() } as any} route={{ params: {} } as any} />
    </ThemeProvider>,
  );

const aguardarAgenda = async (utils: ReturnType<typeof renderScreen>) => {
  await waitFor(() => expect(mockedListarEscopo).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      utils.getByLabelText('Marcar atendimento de Zé da Esquina como concluído'),
    ).toBeTruthy(),
  );
};

/**
 * "Concluir" abre um Alert de confirmação — o efeito real só acontece quando
 * o barbeiro toca no botão "Concluir" do diálogo. Este helper aperta o botão
 * da tela e depois dispara o callback do Alert, que é o que o usuário faria.
 */
const confirmarNoDialogo = async (utils: ReturnType<typeof renderScreen>) => {
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Marcar atendimento de Zé da Esquina como concluído'));
  });
  const chamada = mockedAlert.mock.calls.find((c) => c[0] === 'Concluir');
  expect(chamada).toBeTruthy();
  const botaoConcluir = chamada[2].find((b: { text: string }) => b.text === 'Concluir');
  await act(async () => {
    await botaoConcluir.onPress();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  // `mockImplementation` (e não `mockResolvedValue`) porque a tela ordena a
  // lista recebida IN PLACE (`data.sort(...)`) — um array compartilhado entre
  // chamadas seria mutado pela tela e vazaria de um teste para o outro.
  mockedListarEscopo.mockImplementation(() => Promise.resolve([AGENDAMENTO_CONFIRMADO]));
  mockedListarPendentes.mockResolvedValue([]);
  mockedListarConfirmadosHoje.mockResolvedValue([]);
  mockedGetNegocioIdDoDono.mockResolvedValue(null);
  mockedGetBarbeiro.mockResolvedValue({
    configuracaoAgenda: {
      horaInicio: '09:00', horaFim: '18:00', almocoInicio: '12:00', almocoFim: '13:00',
      antecedenciaMinutos: 0, antecedenciaMaximaDias: 90, diasAtendimento: [0, 1, 2, 3, 4, 5, 6],
    },
    datasBloqueadas: [],
  });
  mockedMigrarBanidos.mockResolvedValue(undefined);
  mockedGetOcupacoes.mockResolvedValue({});
  mockedUseUserProfile.mockReturnValue({
    profile: { nome: 'Barbeiro Teste' },
    loading: false,
    refresh: jest.fn(),
  });
  chamadaDaFunction.mockResolvedValue({ data: { sucesso: true } });
  mockedHttpsCallable.mockReturnValue(chamadaDaFunction);
  // `clearAllMocks` limpa as chamadas mas NÃO a implementação: sem isto, o
  // teste que força a telemetria a rejeitar contaminaria os seguintes.
  mockedRegistrarErro.mockResolvedValue(undefined);
  mockedRegistrarAviso.mockResolvedValue(undefined);
});

// ─── DB-09: a conclusão passa pelo servidor ─────────────────────────────────

describe('BarbeiroHome — DB-09: concluir atendimento vai pela Cloud Function', () => {
  it('chama concluirAgendamentoSeguro enviando SOMENTE o agendamentoId', async () => {
    const utils = renderScreen();
    await aguardarAgenda(utils);
    await confirmarNoDialogo(utils);

    expect(mockedHttpsCallable).toHaveBeenCalledWith(
      expect.anything(),
      'concluirAgendamentoSeguro',
    );
    // O payload é o ponto central de DB-09: nenhum valor de dinheiro sai do
    // dispositivo do barbeiro. Só a identidade do agendamento — o servidor
    // resolve preço, membro da equipe e comissão sozinho.
    expect(chamadaDaFunction).toHaveBeenCalledWith({ agendamentoId: 'ag-1' });
    const payload = chamadaDaFunction.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(['agendamentoId']);
    expect(payload).not.toHaveProperty('comissaoCentavos');
    expect(payload).not.toHaveProperty('precoEmCentavos');
    expect(payload).not.toHaveProperty('status');
  });

  it('NÃO grava status/comissão direto no Firestore (atualizarStatus não é chamado ao concluir)', async () => {
    const utils = renderScreen();
    await aguardarAgenda(utils);
    await confirmarNoDialogo(utils);

    // Era exatamente por aqui que a comissão forjada entrava antes da
    // correção: `atualizarStatus(ag.id, 'concluido', { comissaoCentavos })`.
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
  });

  it('recarrega a agenda depois de concluir com sucesso', async () => {
    const utils = renderScreen();
    await aguardarAgenda(utils);
    mockedListarEscopo.mockClear();

    await confirmarNoDialogo(utils);

    await waitFor(() => expect(mockedListarEscopo).toHaveBeenCalled());
  });

  it('quando a Function falha (regra negada / rede), avisa e NÃO cai numa escrita direta de compensação', async () => {
    chamadaDaFunction.mockRejectedValue({ code: 'functions/permission-denied' });
    const utils = renderScreen();
    await aguardarAgenda(utils);

    await confirmarNoDialogo(utils);

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível concluir.');
    // O ponto: falhar não pode virar plano B de escrever direto no Firestore.
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
  });

  it('cancelar no diálogo não chama a Function nem escreve nada', async () => {
    const utils = renderScreen();
    await aguardarAgenda(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Marcar atendimento de Zé da Esquina como concluído'));
    });

    expect(mockedHttpsCallable).not.toHaveBeenCalled();
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
  });
});

// ─── DB-09: o cálculo de comissão saiu do app ───────────────────────────────

describe('BarbeiroHome — DB-09: nenhum cálculo de comissão no dispositivo', () => {
  // Checagem estática complementar (mesmo padrão do teste P0-1 em
  // AgendamentoScreen.test.tsx): prova que o arquivo de PRODUÇÃO não calcula
  // mais comissão nem busca o membro da equipe para isso — não apenas que os
  // mocks deste arquivo não expõem essas funções. Comentários são removidos
  // antes da checagem porque o arquivo CITA `ComissaoService` na explicação
  // de por que o cálculo saiu daqui, e essa documentação deve poder ficar.
  it('não importa ComissaoService nem calcula comissaoCentavos no código-fonte', () => {
    const fs = require('fs');
    const path = require('path');
    const codigo = fs.readFileSync(
      path.join(__dirname, '../../src/screens/BarbeiroHome.tsx'),
      'utf8',
    );
    const codigoExecutavel = codigo
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(codigoExecutavel).not.toMatch(/ComissaoService/);
    expect(codigoExecutavel).not.toMatch(/calcularComissaoCentavos/);
    expect(codigoExecutavel).not.toMatch(/comissaoCentavos/);
    // E a chamada à Function continua no lugar (não é falso-positivo por o
    // fluxo de conclusão ter sumido do arquivo).
    expect(codigoExecutavel).toMatch(/concluirAgendamentoSeguro/);
  });
});

// ─── ARQ-05: as três ações da agenda deixaram de falhar em silêncio ─────────
//
// Antes, confirmar/cancelar/concluir tinham `catch {}` vazio: o barbeiro via
// um Alert e o erro morria ali. `console.warn` também não resolveria — em
// React Native de produção não existe agregador de log no aparelho. Agora
// cada falha vira um evento em `eventosOperacionais`, com NÍVEL escolhido um
// a um (ver os comentários no próprio BarbeiroHome.tsx):
//
//   confirmar → 'warning'  nada se perde, nada diverge; o agendamento segue
//                          'pendente', que é o que o cliente vê. Interessa a
//                          tendência, não o alarme.
//   cancelar  → 'error'    o agendamento que o barbeiro decidiu matar segue
//                          ATIVO e o cliente segue achando que tem hora.
//   concluir  → 'error'    atendimento prestado e não registrado: sem
//                          comissão e fora do faturamento. Não é 'fatal' —
//                          nada foi corrompido e o toque é repetível.
//
// Inflar tudo para 'error' encheria o gatilho de `alertarFalhasOperacionais`
// (email com 5 eventos error/fatal em 15 min) e treinaria o dono a ignorar o
// alerta, que é o pior resultado possível.
describe('BarbeiroHome — ARQ-05: telemetria das falhas da agenda', () => {
  const AGENDAMENTO_PENDENTE = {
    ...AGENDAMENTO_CONFIRMADO,
    status: 'pendente',
  } as Agendamento;

  /** Aperta um botão do card e depois o botão do Alert de confirmação. */
  const acionar = async (
    rotuloDoCard: string,
    tituloDoAlert: string,
    botaoDoAlert: string,
  ) => {
    const utils = renderScreen();
    await waitFor(() => expect(mockedListarEscopo).toHaveBeenCalled());
    await waitFor(() => expect(utils.getByLabelText(rotuloDoCard)).toBeTruthy());
    await act(async () => {
      fireEvent.press(utils.getByLabelText(rotuloDoCard));
    });
    const chamada = mockedAlert.mock.calls.find((c) => c[0] === tituloDoAlert);
    expect(chamada).toBeTruthy();
    const botao = chamada[2].find((b: { text: string }) => b.text === botaoDoAlert);
    await act(async () => {
      await botao.onPress();
    });
    return utils;
  };

  const concluirFalhando = () => {
    chamadaDaFunction.mockRejectedValue(
      Object.assign(new Error('Permissão negada'), { code: 'functions/permission-denied' }),
    );
    return acionar(
      'Marcar atendimento de Zé da Esquina como concluído',
      'Concluir',
      'Concluir',
    );
  };

  // ── concluir: operação de dinheiro ───────────────────────────────────────

  it('concluir falhando registra ERRO e mantém o mesmo Alert de sempre', async () => {
    await concluirFalhando();

    expect(mockedRegistrarErro).toHaveBeenCalledTimes(1);
    const [erro, contexto] = mockedRegistrarErro.mock.calls[0];
    expect(erro).toBeInstanceOf(Error);
    expect(contexto).toMatchObject({
      area: 'agenda-barbeiro',
      operacao: 'concluir',
      // O `code` da Function é o que separa "a regra negou" de "a rede caiu"
      // — não aparece na mensagem e é o campo que diz o que fazer.
      codigo: 'functions/permission-denied',
      agendamentoId: 'ag-1',
      barbeiroId: 'test-uid',
      negocioId: 'negocio-1',
      data: '2030-01-15',
      horario: '09:00',
    });
    // Nada mudou para o usuário — mesmo texto, mesmo fluxo.
    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível concluir.');
    // E não é 'warning': dinheiro que não entrou tem que chegar no alerta.
    expect(mockedRegistrarAviso).not.toHaveBeenCalled();
  });

  it('concluir com sucesso não gera evento nenhum (nada de ruído)', async () => {
    await acionar('Marcar atendimento de Zé da Esquina como concluído', 'Concluir', 'Concluir');

    expect(mockedRegistrarErro).not.toHaveBeenCalled();
    expect(mockedRegistrarAviso).not.toHaveBeenCalled();
  });

  it('telemetria caindo não derruba o fluxo — o Alert de erro sai igual', async () => {
    mockedRegistrarErro.mockRejectedValue(new Error('telemetria fora do ar'));

    await concluirFalhando();

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível concluir.');
  });

  // ── cancelar: as duas pontas ficam divergentes ───────────────────────────

  it('cancelar falhando registra ERRO (o agendamento continua ativo dos dois lados)', async () => {
    mockedAtualizarStatus.mockRejectedValue(new Error('permission-denied'));

    await acionar('Cancelar agendamento de Zé da Esquina', 'Cancelar', 'Sim, cancelar');

    expect(mockedRegistrarErro).toHaveBeenCalledTimes(1);
    expect(mockedRegistrarErro.mock.calls[0][1]).toMatchObject({
      area: 'agenda-barbeiro',
      operacao: 'cancelar',
      agendamentoId: 'ag-1',
    });
    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível cancelar.');
  });

  // ── confirmar: o único 'warning' da tela ─────────────────────────────────

  it('confirmar falhando registra AVISO, não ERRO — nada se perde e nada diverge', async () => {
    mockedListarEscopo.mockImplementation(() => Promise.resolve([AGENDAMENTO_PENDENTE]));
    mockedAtualizarStatus.mockRejectedValue(new Error('unavailable'));

    await acionar('Confirmar agendamento de Zé da Esquina', 'Confirmar', 'Confirmar');

    expect(mockedRegistrarAviso).toHaveBeenCalledTimes(1);
    expect(mockedRegistrarAviso.mock.calls[0][1]).toMatchObject({
      area: 'agenda-barbeiro',
      operacao: 'confirmar',
      agendamentoId: 'ag-1',
    });
    // O PONTO deste teste: uma sequência de toques com rede ruim não pode
    // encher o gatilho de email de `alertarFalhasOperacionais`, que só conta
    // eventos 'error'/'fatal'.
    expect(mockedRegistrarErro).not.toHaveBeenCalled();
    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível confirmar.');
  });

  // ── a restrição mais fácil de violar sem perceber ────────────────────────
  //
  // As três ações recebem o `Agendamento` INTEIRO, com clienteNome,
  // `cliente` (email), clienteTelefone e barbeiroNome. Um `...ag` no contexto
  // pareceria inofensivo na revisão e mandaria tudo isso para
  // `eventosOperacionais`. A asserção é feita sobre o contexto ANTES da
  // sanitização — prova que a TELA não entrega dado pessoal, em vez de
  // confiar em `utils/sanitizacao.ts` como rede de segurança.
  it('NUNCA manda dado pessoal: contexto sem nome, email ou telefone', async () => {
    await concluirFalhando();

    const contexto = mockedRegistrarErro.mock.calls[0][1];

    // Lista fechada: campo novo tem que ser decidido aqui, não descoberto em
    // produção.
    expect(Object.keys(contexto).sort()).toEqual([
      'agendamentoId',
      'area',
      'barbeiroId',
      'codigo',
      'data',
      'horario',
      'negocioId',
      'operacao',
    ]);
    ['clienteNome', 'clienteTelefone', 'cliente', 'clienteUid', 'barbeiroNome', 'servico', 'preco']
      .forEach((chave) => expect(contexto).not.toHaveProperty(chave));

    // E nenhum VALOR pessoal, mesmo aninhado num campo de nome inofensivo.
    const serializado = JSON.stringify(contexto);
    expect(serializado).not.toContain('Zé da Esquina');
    expect(serializado).not.toContain('cliente@teste.com');
    expect(serializado).not.toContain('5511977776666');
    expect(serializado).not.toContain('Barbeiro Teste');
  });

  // Checagem estática, mesmo padrão do teste de DB-09 acima: prova que o
  // arquivo de PRODUÇÃO não espalha o agendamento no contexto — não apenas
  // que os mocks deste arquivo não expõem isso.
  it('o código-fonte não espalha o agendamento inteiro no contexto de telemetria', () => {
    const fs = require('fs');
    const path = require('path');
    const codigo = fs.readFileSync(
      path.join(__dirname, '../../src/screens/BarbeiroHome.tsx'),
      'utf8',
    );
    const codigoExecutavel = codigo
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    // `...ag` dentro de um objeto de contexto seria a forma de vazar tudo de
    // uma vez — e a mais fácil de passar batido numa revisão.
    expect(codigoExecutavel).not.toMatch(/\.\.\.ag\b/);
    expect(codigoExecutavel).not.toMatch(/registrar(Erro|Aviso)\(\s*erro\s*,\s*ag\b/);

    // TODA chamada de telemetria desta tela passa pelo funil único
    // `contextoDoAgendamento`, que é onde os campos permitidos são
    // escolhidos. São exatamente três: confirmar, cancelar e concluir.
    const chamadas = codigoExecutavel.match(/registrar(?:Erro|Aviso)\([\s\S]*?\}\)/g) ?? [];
    expect(chamadas).toHaveLength(3);
    chamadas.forEach((chamada: string) => {
      expect(chamada).toContain('...contextoDoAgendamento(ag)');
    });
  });
});
