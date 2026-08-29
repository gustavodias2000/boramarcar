/**
 * ConfiguracaoNotificacoesScreen — Onda D do sistema multicanal de avisos.
 *
 * Cobre: carregamento com config padrão (sem doc salvo) e com config
 * existente, salvar com sucesso (objeto `canais`/`eventos` sempre COMPLETO),
 * erro ao salvar, duplo clique, e a garantia de isolamento entre tenants —
 * o alvo é sempre resolvido a partir do uid LOGADO
 * (`resolverAlvoNotificacao`), nunca de `profissionalId` vindo da rota.
 *
 * Sobre "usuário sem autorização": a tela não faz checagem de papel própria
 * — quem chega aqui já passou pela navegação do app (barbeiro autenticado).
 * O isolamento real de dados é garantido pela regra do Firestore (o doc
 * `negocios/{id}/configuracoes/notificacoes` só é legível por quem pertence
 * àquele negócio) e por `NotificationRepository`, que nunca aceita um id
 * vindo de fora — só o uid logado. Aqui testamos que, se essa leitura for
 * negada (ex.: `getBarbeiro` falha), a tela cai graciosamente sem quebrar,
 * em vez de vazar dados de outro tenant ou lançar uma exceção.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import ConfiguracaoNotificacoesScreen from '../../src/screens/ConfiguracaoNotificacoesScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import {
  resolverAlvoNotificacao,
  getConfiguracaoNotificacoes,
  salvarConfiguracaoNotificacoes,
} from '../../src/data/repositories/NotificationRepository';
import { CONFIGURACAO_NOTIFICACOES_PADRAO } from '../../src/types';
import type { Barbeiro } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────
// `firebase/firestore` e `../../firebaseConfig` (auth.currentUser = { uid:
// 'test-uid' }) já vêm mockados globalmente por jest.setup.js.

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/NotificationRepository', () => ({
  resolverAlvoNotificacao: jest.fn(),
  getConfiguracaoNotificacoes: jest.fn(),
  salvarConfiguracaoNotificacoes: jest.fn(),
}));

const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedResolverAlvo = resolverAlvoNotificacao as jest.Mock;
const mockedGetConfig = getConfiguracaoNotificacoes as jest.Mock;
const mockedSalvarConfig = salvarConfiguracaoNotificacoes as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const mockNavigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() } as any;

const BARBEIRO_AUTONOMO: Barbeiro = { id: 'test-uid', nome: 'Barbeiro Autônomo' } as Barbeiro;
const BARBEIRO_DONO_EQUIPE: Barbeiro = {
  id: 'test-uid',
  nome: 'Dono da Equipe',
  negocioId: 'negocio-1',
} as Barbeiro;

const CONFIG_EXISTENTE = {
  canais: { whatsapp: false, sms: true, push: false },
  eventos: { novoAgendamento: false, confirmacao: true, cancelamento: false, lembrete: true },
};

// Mesma lógica de `NotificationRepository.resolverAlvoNotificacao` (real):
// negocioId presente => alvo é o negócio; ausente => alvo é o próprio uid.
const resolverAlvoPadrao = (barbeiro: Barbeiro) =>
  barbeiro.negocioId ? { tipo: 'negocio', id: barbeiro.negocioId } : { tipo: 'autonomo', id: barbeiro.id };

const renderScreen = (params?: { profissionalId?: string; profissionalNome?: string }) =>
  renderWithTheme(
    <ConfiguracaoNotificacoesScreen navigation={mockNavigation} route={{ params } as any} />,
  );

/** Aguarda a tela sair do loading inicial (switch de WhatsApp visível). */
const aguardarCarregamento = async (utils: ReturnType<typeof renderScreen>) => {
  await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());
  await waitFor(() => expect(utils.getByLabelText('Ativar avisos por WhatsApp')).toBeTruthy());
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetBarbeiro.mockResolvedValue(BARBEIRO_AUTONOMO);
  mockedResolverAlvo.mockImplementation(resolverAlvoPadrao);
  mockedGetConfig.mockResolvedValue(CONFIGURACAO_NOTIFICACOES_PADRAO);
  mockedSalvarConfig.mockResolvedValue(undefined);
});

// ─── Carregamento ─────────────────────────────────────────────────────────────

describe('ConfiguracaoNotificacoesScreen — carregamento', () => {
  it('usuário sem config salva ainda: carrega os valores PADRÃO (whatsapp/push ligados, sms desligado, todos os eventos ligados)', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(utils.getByLabelText('Ativar avisos por WhatsApp').props.value).toBe(true);
    expect(utils.getByLabelText('Ativar avisos por SMS').props.value).toBe(false);
    expect(utils.getByLabelText('Ativar avisos por notificação push').props.value).toBe(true);
    expect(utils.getByLabelText('Avisar sobre novo agendamento').props.value).toBe(true);
    expect(utils.getByLabelText('Avisar sobre confirmação de agendamento').props.value).toBe(true);
    expect(utils.getByLabelText('Avisar sobre cancelamento de agendamento').props.value).toBe(true);
    expect(utils.getByLabelText('Avisar sobre lembretes de agendamento').props.value).toBe(true);
    expect(utils.getByLabelText('Ativar lembrete de retorno para clientes inativos').props.value).toBe(false);
  });

  it('usuário com config já salva: carrega os valores existentes, não os padrões', async () => {
    mockedGetConfig.mockResolvedValue(CONFIG_EXISTENTE);
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(utils.getByLabelText('Ativar avisos por WhatsApp').props.value).toBe(false);
    expect(utils.getByLabelText('Ativar avisos por SMS').props.value).toBe(true);
    expect(utils.getByLabelText('Ativar avisos por notificação push').props.value).toBe(false);
    expect(utils.getByLabelText('Avisar sobre novo agendamento').props.value).toBe(false);
    expect(utils.getByLabelText('Avisar sobre confirmação de agendamento').props.value).toBe(true);
  });

  it('resolve o alvo "negócio" (equipe) quando o barbeiro logado é dono de uma equipe', async () => {
    mockedGetBarbeiro.mockResolvedValue(BARBEIRO_DONO_EQUIPE);
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(mockedResolverAlvo).toHaveBeenCalledWith(BARBEIRO_DONO_EQUIPE);
    expect(mockedGetConfig).toHaveBeenCalledWith({ tipo: 'negocio', id: 'negocio-1' });
  });

  it('resolve o alvo "autônomo" quando o barbeiro logado não pertence a uma equipe', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(mockedGetConfig).toHaveBeenCalledWith({ tipo: 'autonomo', id: 'test-uid' });
  });
});

// ─── Isolamento entre negócios / uso de profissionalId só para exibição ───────

describe('ConfiguracaoNotificacoesScreen — isolamento entre negócios', () => {
  it('o alvo é sempre resolvido a partir do uid LOGADO — nunca de `profissionalId` vindo da rota', async () => {
    mockedGetBarbeiro.mockResolvedValue(BARBEIRO_DONO_EQUIPE);
    const utils = renderScreen({ profissionalId: 'profissional-de-outro-negocio', profissionalNome: 'Fulano' });
    await aguardarCarregamento(utils);

    // getBarbeiro é chamado com o uid autenticado (test-uid), não com o
    // profissionalId da rota — que serve só para o texto de exibição.
    expect(mockedGetBarbeiro).toHaveBeenCalledWith('test-uid');
    expect(mockedGetBarbeiro).not.toHaveBeenCalledWith('profissional-de-outro-negocio');
    expect(mockedGetConfig).toHaveBeenCalledWith({ tipo: 'negocio', id: 'negocio-1' });
  });

  it('exibe "Configurando para: {nome}" quando profissionalId vem da rota, mas mantém o dado do negócio', async () => {
    mockedGetBarbeiro.mockResolvedValue(BARBEIRO_DONO_EQUIPE);
    const utils = renderScreen({ profissionalId: 'membro-1', profissionalNome: 'João' });
    await aguardarCarregamento(utils);

    expect(utils.getByText('Configurando para: João')).toBeTruthy();
  });

  it('sem profissionalId, não mostra o banner de "Configurando para"', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(utils.queryByText(/Configurando para:/)).toBeNull();
  });
});

// ─── Salvar ─────────────────────────────────────────────────────────────────

describe('ConfiguracaoNotificacoesScreen — salvar', () => {
  it('salva com sucesso enviando os objetos canais/eventos COMPLETOS e mostra confirmação', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    // Muda só o SMS — o restante do objeto deve continuar completo no envio.
    fireEvent(utils.getByLabelText('Ativar avisos por SMS'), 'valueChange', true);

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Salvar configurações de notificações'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedSalvarConfig).toHaveBeenCalledWith(
      { tipo: 'autonomo', id: 'test-uid' },
      {
        canais: { whatsapp: true, sms: true, push: true },
        eventos: { novoAgendamento: true, confirmacao: true, cancelamento: true, lembrete: true },
        retornoCliente: { ativo: false, diasSemComparecer: 30, canal: 'push' },
      },
      'test-uid',
    );
    expect(mockedAlert).toHaveBeenCalledWith('Sucesso!', 'Configuração de notificações salva.');
  });

  it('permite configurar o retorno entre 7 e 180 dias e salva somente o canal push', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    fireEvent(utils.getByLabelText('Ativar lembrete de retorno para clientes inativos'), 'valueChange', true);
    fireEvent.changeText(utils.getByLabelText('Dias sem comparecer para lembrar o cliente'), '999');

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Salvar configurações de notificações'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedSalvarConfig).toHaveBeenCalledWith(
      { tipo: 'autonomo', id: 'test-uid' },
      expect.objectContaining({
        retornoCliente: { ativo: true, diasSemComparecer: 180, canal: 'push' },
      }),
      'test-uid',
    );
  });

  it('em caso de erro ao salvar, mostra alerta e não quebra a tela', async () => {
    mockedSalvarConfig.mockRejectedValue(new Error('offline'));
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Salvar configurações de notificações'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível salvar. Tente novamente.');
    // A tela continua funcional depois do erro.
    expect(utils.getByLabelText('Ativar avisos por WhatsApp')).toBeTruthy();
  });

  it('protege contra duplo clique: só uma chamada ao repositório enquanto salva', async () => {
    let resolver!: () => void;
    const pendente = new Promise<void>((resolve) => {
      resolver = resolve;
    });
    mockedSalvarConfig.mockReturnValue(pendente);

    const utils = renderScreen();
    await aguardarCarregamento(utils);

    const botao = utils.getByLabelText('Salvar configurações de notificações');
    fireEvent.press(botao);
    fireEvent.press(botao);
    fireEvent.press(botao);

    await waitFor(() => {
      expect(utils.getByLabelText('Salvar configurações de notificações').props.accessibilityState)
        .toEqual(expect.objectContaining({ disabled: true, busy: true }));
    });
    expect(mockedSalvarConfig).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolver();
      await Promise.resolve();
    });
  });
});

// ─── Leitura negada / falha ao carregar (tratamento gracioso) ─────────────────

describe('ConfiguracaoNotificacoesScreen — leitura negada ou falha ao carregar', () => {
  it('quando getBarbeiro falha (ex.: leitura negada), a tela não quebra e Salvar vira um no-op seguro', async () => {
    mockedGetBarbeiro.mockRejectedValue({ code: 'permission-denied' });
    const utils = renderScreen();

    await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());
    await waitFor(() => expect(utils.getByLabelText('Ativar avisos por WhatsApp')).toBeTruthy());

    // Sem alvo resolvido, o botão não deve chamar o repositório nem quebrar.
    fireEvent.press(utils.getByLabelText('Salvar configurações de notificações'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedSalvarConfig).not.toHaveBeenCalled();
  });

  it('quando getConfiguracaoNotificacoes falha, a tela cai graciosamente nos valores padrão em vez de quebrar', async () => {
    mockedGetConfig.mockRejectedValue({ code: 'permission-denied' });
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(utils.getByLabelText('Ativar avisos por WhatsApp').props.value).toBe(true);
    expect(utils.getByLabelText('Ativar avisos por SMS').props.value).toBe(false);
  });
});
