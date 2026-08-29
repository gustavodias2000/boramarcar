import React from 'react';
import { Animated } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import ClienteHome from '../../src/screens/ClienteHome';
import { ThemeProvider } from '../../src/context/ThemeContext';
import useBarbeariasVinculadas from '../../src/hooks/useBarbeariasVinculadas';
import { listarDoCliente, contarDoCliente } from '../../src/data/repositories/AgendamentoRepository';
import useUserProfile from '../../src/hooks/useUserProfile';
import NotificationService from '../../src/services/NotificationService';
import type { Barbeiro } from '../../src/types';

// ACHADO (reportado no relatório de QA, não corrigido aqui): no ambiente
// Jest deste projeto, `RefreshControl` de 'react-native' falha ao resolver
// via requireActual (node_modules/react-native/jest/setup.js), derrubando
// TODA a árvore com "Element type is invalid" / "Unable to find node on an
// unmounted component" assim que o FlatList tenta renderizar seu
// `refreshControl`. Isso afeta qualquer tela com pull-to-refresh
// (ClienteHome, BarbeiroHome, HistoricoScreen, InicioScreen,
// ClienteAgendamentosTab) — nenhuma delas tinha teste antes desta fase, por
// isso o problema nunca apareceu. Mock local só para destravar este arquivo.
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () => ({
  __esModule: true,
  default: 'RefreshControl',
}));

// ClienteHome não usa mais `listarBarbeiros` (trocado pelo hook
// `useBarbeariasVinculadas` — ver requisito de vínculo explícito). O
// BarbeiroRepository segue mockado aqui só para a asserção explícita no
// describe abaixo de que a tela NUNCA volta a chamá-lo.
jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  listarBarbeiros: jest.fn(),
}));

jest.mock('../../src/hooks/useBarbeariasVinculadas', () => jest.fn());

// ClienteHome usa useFocusEffect (não useEffect simples) para recarregar os
// vínculos toda vez que a aba ganha foco — sem isso, adicionar uma
// barbearia e voltar mostraria a lista velha. Mesmo mock de
// __tests__/hooks/useClientes.test.tsx: roda como useEffect comum, sem
// exigir um NavigationContainer real.
jest.mock('@react-navigation/native', () => {
  const ReactModule = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => ReactModule.useEffect(effect, [effect]),
  };
});

// `contarDoCliente` é obrigatório aqui, não decorativo: `fetchAgendamentos`
// chama `comFallback(contarDoCliente(uid), ...)` DENTRO do try. Sem o mock, a
// chamada estoura ("is not a function"), o catch engole, `setAgendamentos`
// nunca roda e a seção "Meus Agendamentos" simplesmente não existe — qualquer
// asserção sobre ela passaria por vacuidade.
jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  listarDoCliente: jest.fn(),
  contarDoCliente: jest.fn(),
}));

jest.mock('../../src/hooks/useUserProfile', () => jest.fn());

jest.mock('../../src/services/NotificationService', () => ({
  __esModule: true,
  default: { init: jest.fn().mockResolvedValue(false) },
}));

// ACHADO (reportado no relatório de QA, não corrigido aqui): jest.setup.js
// faz Animated.timing/spring completarem SINCRONAMENTE. Combinado com
// Animated.loop — usado por SkeletonBlock/SkeletonCard, exibidos enquanto
// ClienteHome está com loading=true — o loop reinicia a si mesmo dentro da
// MESMA call stack a cada término síncrono, e estoura a pilha
// (RangeError: Maximum call stack size exceeded) antes mesmo do render()
// retornar. Neutralizamos Animated.loop só neste arquivo para conseguir
// testar o que vem DEPOIS do carregamento; isso não é uma correção do
// problema, só um contorno local.
jest.spyOn(Animated, 'loop').mockImplementation(
  () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }) as any,
);

const mockedUseBarbeariasVinculadas = useBarbeariasVinculadas as jest.Mock;
// `listarBarbeiros` foi removida de BarbeiroRepository (código morto: a Home
// não a chama mais desde a migração para vínculo explícito). O módulo
// continua mockado acima só para provar que NADA dele é usado — pegamos o
// mock via jest.requireMock em vez de importar o símbolo real (que não
// existe mais), para não quebrar a checagem de tipos.
const mockedListarBarbeiros = jest.requireMock(
  '../../src/data/repositories/BarbeiroRepository',
) as Record<string, jest.Mock>;
const mockedListarDoCliente = listarDoCliente as jest.Mock;
const mockedContarDoCliente = contarDoCliente as jest.Mock;
const mockedUseUserProfile = useUserProfile as jest.Mock;

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const mockNavigation = { navigate: jest.fn() } as any;

// Dois profissionais solo + uma equipe de dois profissionais sob o mesmo
// negocioId — cobre agrupamento e o filtro por chip num único cenário.
const barbeiros: Barbeiro[] = [
  {
    id: 'b1',
    nome: 'João',
    especialidade: 'Corte clássico',
    servicos: [{ id: 's1', nome: 'Corte Masculino', duracaoMinutos: 30, precoEmCentavos: 3000 }],
  } as Barbeiro,
  {
    id: 'b2',
    nome: 'Carlos',
    especialidade: 'Barbearia tradicional',
    servicos: [{ id: 's2', nome: 'Barba Completa', duracaoMinutos: 20, precoEmCentavos: 2500 }],
  } as Barbeiro,
  {
    id: 'b3',
    nome: 'Ana',
    negocioId: 'neg1',
    negocioNome: 'Barbearia Central',
    servicos: [{ id: 's3', nome: 'Corte Feminino', duracaoMinutos: 40, precoEmCentavos: 4000 }],
  } as Barbeiro,
  {
    id: 'b4',
    nome: 'Beto',
    negocioId: 'neg1',
    negocioNome: 'Barbearia Central',
    servicos: [{ id: 's4', nome: 'Corte Simples', duracaoMinutos: 30, precoEmCentavos: 3000 }],
  } as Barbeiro,
];

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseBarbeariasVinculadas.mockReturnValue({
    barbeiros,
    loading: false,
    refresh: jest.fn().mockResolvedValue(undefined),
  });
  mockedListarDoCliente.mockResolvedValue([]);
  mockedContarDoCliente.mockResolvedValue(0);
  mockedUseUserProfile.mockReturnValue({ profile: { nome: 'Cliente Teste' }, loading: false, refresh: jest.fn() });
  (NotificationService.init as jest.Mock).mockResolvedValue(false);
});

const aguardarCarregamento = async () => {
  await waitFor(() => expect(mockedListarDoCliente).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
};

describe('ClienteHome — fonte dos barbeiros é o vínculo do cliente, não a vitrine geral', () => {
  it('nunca chama listarBarbeiros (BarbeiroRepository) — a Home só mostra quem o cliente vinculou', async () => {
    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    await waitFor(() => expect(utils.getAllByTestId('barbeiro-card').length).toBeGreaterThan(0));

    expect(mockedListarBarbeiros.listarBarbeiros).not.toHaveBeenCalled();
  });

  it('passa o uid do cliente logado para useBarbeariasVinculadas', async () => {
    renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    expect(mockedUseBarbeariasVinculadas).toHaveBeenCalledWith('test-uid');
  });
});

describe('ClienteHome — estado vazio (sem nenhuma barbearia vinculada)', () => {
  beforeEach(() => {
    mockedUseBarbeariasVinculadas.mockReturnValue({
      barbeiros: [],
      loading: false,
      refresh: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('mostra a mensagem de lista vazia e um botão para adicionar por código', async () => {
    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    await waitFor(() =>
      expect(utils.getByText('Você ainda não adicionou uma barbearia')).toBeTruthy(),
    );
    expect(utils.queryAllByTestId('barbeiro-card')).toHaveLength(0);

    fireEvent.press(utils.getByText('Adicionar por código'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('AdicionarCodigo');
  });
});

describe('ClienteHome — cada profissional tem o próprio card, mesmo dentro de uma equipe', () => {
  it('renderiza um card em destaque por profissional, mesmo os da mesma equipe (não agrupa)', async () => {
    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    await waitFor(() => {
      // 2 solo (João, Carlos) + 2 da equipe (Ana, Beto) = 4 cards — um por profissional.
      expect(utils.getAllByTestId('barbeiro-card')).toHaveLength(4);
    });

    expect(utils.getByText('Ana')).toBeTruthy();
    expect(utils.getByText('Beto')).toBeTruthy();
    // Nome da barbearia aparece como selo sobre a foto de cada profissional dela.
    expect(utils.getAllByText('Barbearia Central').length).toBe(2);
  });

  it('mantém testID="ver-perfil-button" em cada profissional', async () => {
    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    await waitFor(() => {
      // 1 link "Ver perfil" por profissional: João, Carlos, Ana, Beto = 4.
      expect(utils.getAllByTestId('ver-perfil-button')).toHaveLength(4);
    });
  });
});

describe('ClienteHome — texto e testIDs preservados (contrato com o Detox)', () => {
  it('mantém o texto "Barbeiros Disponíveis" no cabeçalho', async () => {
    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    await waitFor(() => expect(utils.getByText('Barbeiros Disponíveis')).toBeTruthy());
  });

  // ACHADO: o fluxo mudou de "Ver horários" (ia direto para Agendamento)
  // para "Ver perfil" (vai para PerfilProfissional, e só de lá o cliente
  // escolhe o serviço e segue para Agendamento). `e2e/agendamento.test.js`
  // ainda espera o testID/comportamento antigo e ficou desatualizado —
  // reportado, não corrigido aqui (fora do escopo desta mudança).
  it('o link "Ver perfil" navega para PerfilProfissional com o barbeiro certo', async () => {
    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    await waitFor(() => expect(utils.getAllByTestId('ver-perfil-button').length).toBeGreaterThan(0));

    fireEvent.press(utils.getAllByTestId('ver-perfil-button')[0]);

    expect(mockNavigation.navigate).toHaveBeenCalledWith(
      'PerfilProfissional',
      expect.objectContaining({ barbeiro: expect.objectContaining({ id: 'b1' }) }),
    );
  });
});

describe('ClienteHome — filtro por chip', () => {
  it('"Todos" mostra todos os profissionais', async () => {
    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    await waitFor(() => expect(utils.getAllByTestId('barbeiro-card')).toHaveLength(4));
  });

  it('filtrar por "Barba" reduz a lista para quem tem um serviço com "barba" no nome', async () => {
    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();
    await waitFor(() => expect(utils.getAllByTestId('barbeiro-card')).toHaveLength(4));

    fireEvent.press(utils.getByText('Barba'));

    await waitFor(() => {
      expect(utils.getAllByTestId('barbeiro-card')).toHaveLength(1);
    });
    expect(utils.getByText('Carlos')).toBeTruthy();
    expect(utils.queryByText('João')).toBeNull();
    expect(utils.queryByText('Ana')).toBeNull();
    expect(utils.queryByText('Beto')).toBeNull();
  });

  it('filtrar por "Corte" mostra somente quem tem um serviço com "corte" no nome', async () => {
    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();
    await waitFor(() => expect(utils.getAllByTestId('barbeiro-card')).toHaveLength(4));

    fireEvent.press(utils.getByText('Corte'));

    await waitFor(() => {
      // João (Corte Masculino), Ana (Corte Feminino) e Beto (Corte Simples)
      // = 3 cards, um por profissional; Carlos (só Barba) some da lista.
      expect(utils.getAllByTestId('barbeiro-card')).toHaveLength(3);
    });
    expect(utils.queryByText('Carlos')).toBeNull();
  });

  it('voltar para "Todos" restaura a lista completa', async () => {
    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();
    await waitFor(() => expect(utils.getAllByTestId('barbeiro-card')).toHaveLength(4));

    fireEvent.press(utils.getByText('Barba'));
    await waitFor(() => expect(utils.getAllByTestId('barbeiro-card')).toHaveLength(1));

    fireEvent.press(utils.getByText('Todos'));
    await waitFor(() => expect(utils.getAllByTestId('barbeiro-card')).toHaveLength(4));
  });
});

// ─── CRÍTICO 1b: alcançabilidade do histórico ───────────────────────────────
//
// Corrigir o botão "Avaliar" em `HistoricoScreen` não adianta nada se o
// cliente não CHEGA lá. O link "Ver todos" desta tela é o único caminho para
// `Historico` no app do cliente, e aparecia só quando o total passava de
// PREVIA_AGENDAMENTOS (3). Cliente com 1, 2 ou 3 agendamentos — incluindo um
// concluído esperando avaliação — nunca via o link: o botão de avaliar
// existia numa tela sem porta de entrada.
//
// A regra nova é "mais de 3 OU existe algum concluído/avaliado". Os dois
// termos são testados: o primeiro para provar que o caminho novo funciona, o
// segundo para provar que ele não virou "link sempre visível".
describe('ClienteHome — CRÍTICO 1b: o link do histórico alcança quem tem atendimento concluído', () => {
  const agendamento = (id: string, status: string) =>
    ({
      id,
      barbeiroId: 'b1',
      barbeiroNome: 'João',
      clienteUid: 'test-uid',
      status,
      data: '2026-08-10',
      horario: '10:00',
    }) as any;

  it('UM único agendamento concluído já mostra o link — antes, exigia mais de 3', async () => {
    mockedListarDoCliente.mockResolvedValue([agendamento('a1', 'concluido')]);
    mockedContarDoCliente.mockResolvedValue(1);

    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    // Guarda contra falso-verde: a seção "Meus Agendamentos" renderizou de
    // verdade (o card do agendamento está lá).
    await waitFor(() => expect(utils.getByLabelText('Status: Concluído')).toBeTruthy());

    // E o link existe E leva mesmo para o Histórico — é isso que destrava o
    // botão "Avaliar".
    const link = utils.getByLabelText('Ver todos os 1 agendamentos');
    fireEvent.press(link);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Historico');
  });

  it('um agendamento JÁ AVALIADO também mantém o caminho aberto (não some depois de avaliar)', async () => {
    mockedListarDoCliente.mockResolvedValue([agendamento('a1', 'avaliado')]);
    mockedContarDoCliente.mockResolvedValue(1);

    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    await waitFor(() => expect(utils.getByLabelText('Status: Avaliado')).toBeTruthy());
    expect(utils.getByLabelText('Ver todos os 1 agendamentos')).toBeTruthy();
  });

  it('poucos agendamentos e NENHUM concluído: comportamento anterior preservado — sem link', async () => {
    // Três agendamentos ativos (o limite antigo), nenhum concluído. Este é o
    // teste que impede a "correção" preguiçosa de mostrar o link sempre.
    mockedListarDoCliente.mockResolvedValue([
      agendamento('a1', 'pendente'),
      agendamento('a2', 'confirmado'),
      agendamento('a3', 'cancelado'),
    ]);
    mockedContarDoCliente.mockResolvedValue(3);

    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    // A seção existe (guarda contra falso-verde por tela vazia)…
    await waitFor(() => expect(utils.getByText('Meus Agendamentos')).toBeTruthy());
    expect(utils.getAllByLabelText(/^Status: /).length).toBe(3);

    // …e mesmo assim não há link: nada a avaliar, nada além da prévia.
    expect(utils.queryByLabelText('Ver todos os 3 agendamentos')).toBeNull();
    expect(utils.queryByText(/^Ver todos/)).toBeNull();
  });

  it('mais de 3 agendamentos sem nenhum concluído: o link continua aparecendo (regra antiga intacta)', async () => {
    mockedListarDoCliente.mockResolvedValue([
      agendamento('a1', 'pendente'),
      agendamento('a2', 'pendente'),
      agendamento('a3', 'pendente'),
      agendamento('a4', 'pendente'),
    ]);
    mockedContarDoCliente.mockResolvedValue(7);

    const utils = renderWithTheme(<ClienteHome navigation={mockNavigation} route={{} as any} />);
    await aguardarCarregamento();

    // O total anunciado vem da CONTAGEM agregada (7), não do tamanho da lista
    // buscada (4 = prévia de 3 + 1).
    await waitFor(() => expect(utils.getByLabelText('Ver todos os 7 agendamentos')).toBeTruthy());
  });
});
