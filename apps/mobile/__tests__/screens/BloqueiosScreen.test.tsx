/**
 * BloqueiosScreen — **AG-03**: avisar antes de bloquear uma faixa que já tem
 * cliente marcado dentro.
 *
 * O defeito: a tela gravava `bloqueiosHorario` sem nunca ler `agendamentos`.
 * O barbeiro bloqueava a tarde de sexta para ir ao médico, o app aceitava em
 * silêncio, e os clientes que já tinham horário marcado continuavam com
 * agendamento ATIVO — some da grade de horários novos, mas não é cancelado
 * nem avisado. Ele descobria quando o cliente batia na porta.
 *
 * A correção segue a mesma disciplina do DOM-02 (`EquipeScreen`): CONTAR e
 * AVISAR. Por isso estes testes travam, mais do que qualquer outra coisa, o
 * que NÃO acontece: nenhuma escrita antes da confirmação, nenhum
 * cancelamento em massa, nenhuma chamada a `atualizarStatus`.
 *
 * ESCOPO DELIBERADAMENTE ESTREITO: só o caminho adicionar/remover bloqueio.
 * Seleção de data, pickers de hora, campo de motivo e o modo "dono editando a
 * agenda de um profissional da equipe" continuam sem cobertura própria — a
 * tela usa os padrões default (hoje, 14:00–15:00), que é o que basta para o
 * fluxo sob teste.
 *
 * Padrão de mock: `jest.mock` por arquivo — o `jest.setup.js` deste repo NÃO
 * mocka `react-native` globalmente, de propósito (CLAUDE.md §6) — e nunca
 * `restoreAllMocks()`, que derrubaria o spy de `Alert.alert` do setup global.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import BloqueiosScreen from '../../src/screens/BloqueiosScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { getBarbeiro, upsertBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { atualizarProfissional } from '../../src/data/repositories/NegocioRepository';
import {
  getMotivosBloqueio,
  upsertMotivoBloqueio,
  removerMotivoBloqueio,
} from '../../src/data/repositories/BloqueioRepository';
import {
  contarNaFaixaBloqueada,
  atualizarStatus,
} from '../../src/data/repositories/AgendamentoRepository';
import { toLocalDateString } from '../../src/utils/dateUtils';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// ATENÇÃO — este mock é parte da asserção de AG-03, não encanamento: o módulo
// de agendamentos expõe aqui SOMENTE `contarNaFaixaBloqueada` e
// `atualizarStatus`. Se o fluxo de bloqueio passasse a cancelar em massa,
// `atualizarStatus` apareceria nas chamadas e os testes acusariam.
jest.mock('../../src/data/repositories/AgendamentoRepository', () => ({
  contarNaFaixaBloqueada: jest.fn(),
  atualizarStatus: jest.fn(),
}));

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  getBarbeiro: jest.fn(),
  upsertBarbeiro: jest.fn(),
}));

jest.mock('../../src/data/repositories/NegocioRepository', () => ({
  atualizarProfissional: jest.fn(),
}));

jest.mock('../../src/data/repositories/BloqueioRepository', () => ({
  getMotivosBloqueio: jest.fn(),
  upsertMotivoBloqueio: jest.fn(),
  removerMotivoBloqueio: jest.fn(),
}));

const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedUpsertBarbeiro = upsertBarbeiro as jest.Mock;
const mockedAtualizarProfissional = atualizarProfissional as jest.Mock;
const mockedGetMotivos = getMotivosBloqueio as jest.Mock;
const mockedUpsertMotivo = upsertMotivoBloqueio as jest.Mock;
const mockedRemoverMotivo = removerMotivoBloqueio as jest.Mock;
const mockedContar = contarNaFaixaBloqueada as jest.Mock;
const mockedAtualizarStatus = atualizarStatus as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

// ─── Fixtures ───────────────────────────────────────────────────────────────

/** Padrões da tela recém-carregada: primeiro dia da lista (hoje) e 14:00–15:00. */
const HOJE = toLocalDateString(new Date());
const INICIO = '14:00';
const FIM = '15:00';

const TITULO_AVISO = 'Bloquear esse horário?';

const renderTela = () =>
  render(
    <ThemeProvider>
      <BloqueiosScreen
        navigation={{ navigate: jest.fn(), goBack: jest.fn() } as any}
        route={{ params: undefined } as any}
      />
    </ThemeProvider>,
  );

type Tela = ReturnType<typeof renderTela>;

/** Espera a carga inicial terminar (o spinner sai e o formulário aparece). */
const aguardarCarga = async (utils: Tela) => {
  await waitFor(() => expect(utils.getByLabelText('Adicionar bloqueio')).toBeTruthy());
};

const tocarEmAdicionar = async (utils: Tela) => {
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Adicionar bloqueio'));
  });
};

/** O diálogo de aviso do AG-03, se tiver aberto. */
const avisoAberto = () => mockedAlert.mock.calls.find((c) => c[0] === TITULO_AVISO);

/** Aperta o botão de confirmação do diálogo de aviso. */
const confirmarBloqueio = async () => {
  const chamada = avisoAberto();
  expect(chamada).toBeTruthy();
  const botao = chamada![2].find((b: { text: string }) => b.text === 'Bloquear mesmo assim');
  await act(async () => {
    await botao.onPress();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetBarbeiro.mockResolvedValue({ id: 'test-uid', nome: 'Zé', bloqueiosHorario: [] });
  mockedGetMotivos.mockResolvedValue({});
  mockedUpsertBarbeiro.mockResolvedValue(undefined);
  mockedAtualizarProfissional.mockResolvedValue(undefined);
  mockedUpsertMotivo.mockResolvedValue(undefined);
  mockedRemoverMotivo.mockResolvedValue(undefined);
  mockedContar.mockResolvedValue(0);
});

// ─── Faixa com gente marcada dentro ─────────────────────────────────────────

describe('BloqueiosScreen — AG-03: bloquear faixa ocupada avisa antes de gravar', () => {
  it('com 2 agendamentos: avisa, e só grava depois do "Bloquear mesmo assim"', async () => {
    mockedContar.mockResolvedValue(2);
    const utils = renderTela();
    await aguardarCarga(utils);

    await tocarEmAdicionar(utils);

    // A contagem usa `barbeiroId` (o campo que a regra do Firestore lê para
    // autorizar o próprio barbeiro) + a data e a faixa escolhidas na tela.
    expect(mockedContar).toHaveBeenCalledWith('test-uid', HOJE, INICIO, FIM);

    const chamada = avisoAberto();
    expect(chamada).toBeTruthy();
    expect(chamada![1]).toContain('2 agendamentos marcados');
    expect(chamada![1]).toContain(`entre ${INICIO} e ${FIM}`);
    // O texto tem que ser honesto sobre o que NÃO acontece.
    expect(chamada![1]).toContain('não cancela');
    expect(chamada![1]).toContain('remarcar ou cancelar cada um');
    expect(chamada![2].map((b: { text: string }) => b.text)).toEqual([
      'Cancelar',
      'Bloquear mesmo assim',
    ]);

    // O ponto central: NADA foi gravado ainda — o diálogo está aberto.
    expect(mockedUpsertBarbeiro).not.toHaveBeenCalled();
    expect(mockedAtualizarProfissional).not.toHaveBeenCalled();

    await confirmarBloqueio();

    expect(mockedUpsertBarbeiro).toHaveBeenCalledWith('test-uid', {
      bloqueiosHorario: [{ id: expect.any(String), data: HOJE, horaInicio: INICIO, horaFim: FIM }],
    });
  });

  it('com 1 agendamento o texto fica no singular', async () => {
    mockedContar.mockResolvedValue(1);
    const utils = renderTela();
    await aguardarCarga(utils);

    await tocarEmAdicionar(utils);

    expect(avisoAberto()![1]).toContain('1 agendamento marcado');
    expect(avisoAberto()![1]).toContain('ele continua na sua agenda');
  });

  it('"Cancelar" no diálogo: nada é gravado, nem o bloqueio nem o motivo', async () => {
    mockedContar.mockResolvedValue(2);
    const utils = renderTela();
    await aguardarCarga(utils);

    await tocarEmAdicionar(utils);

    const chamada = avisoAberto()!;
    const botaoCancelar = chamada[2].find((b: { text: string }) => b.text === 'Cancelar');
    // Botão de desistir é `style:'cancel'` — no Android é o que o botão
    // físico "voltar" aciona.
    expect(botaoCancelar.style).toBe('cancel');
    // E ele não tem onPress: desistir é literalmente não fazer nada.
    expect(botaoCancelar.onPress).toBeUndefined();

    expect(mockedUpsertBarbeiro).not.toHaveBeenCalled();
    expect(mockedAtualizarProfissional).not.toHaveBeenCalled();
    expect(mockedUpsertMotivo).not.toHaveBeenCalled();
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();

    // Sem atualização otimista: a lista da tela é escrita por `salvarLista`
    // só DEPOIS que a escrita volta. Desistir a deixa como estava.
    expect(utils.getByText('Nenhum bloqueio ativo')).toBeTruthy();
  });

  it('NUNCA chama atualizarStatus — bloquear não cancela agendamento nenhum', async () => {
    mockedContar.mockResolvedValue(3);
    const utils = renderTela();
    await aguardarCarga(utils);

    await tocarEmAdicionar(utils);
    await confirmarBloqueio();

    // O ponto central do AG-03. Um cancelamento em massa aqui seria
    // irreversível com um toque E dispararia um aviso para cada cliente — o
    // limitador de envio é POR DESTINATÁRIO, então nenhum dos N seria barrado.
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
  });
});

// ─── Faixa livre ────────────────────────────────────────────────────────────

describe('BloqueiosScreen — AG-03: faixa livre não leva atrito', () => {
  it('com 0 agendamentos grava direto, sem diálogo', async () => {
    mockedContar.mockResolvedValue(0);
    const utils = renderTela();
    await aguardarCarga(utils);

    await tocarEmAdicionar(utils);

    // Um diálogo aqui seria só atrito: não há ninguém para o barbeiro avisar.
    expect(avisoAberto()).toBeUndefined();
    await waitFor(() => expect(mockedUpsertBarbeiro).toHaveBeenCalled());
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
  });
});

// ─── Contagem indisponível ──────────────────────────────────────────────────

describe('BloqueiosScreen — AG-03: falha na contagem não vira indisponibilidade', () => {
  it('erro na contagem: avisa SEM número, e "Bloquear mesmo assim" grava', async () => {
    mockedContar.mockRejectedValue(new Error('permission-denied'));
    const utils = renderTela();
    await aguardarCarga(utils);

    await tocarEmAdicionar(utils);

    const chamada = avisoAberto();
    expect(chamada).toBeTruthy();
    // Sem número inventado: a tela não sabe quantos são, e dizer "0" seria
    // exatamente a mentira que o AG-03 descreve.
    expect(chamada![1]).toContain('Não consegui conferir agora');
    expect(chamada![1]).not.toMatch(/\d+ agendamento/);

    expect(mockedUpsertBarbeiro).not.toHaveBeenCalled();

    await confirmarBloqueio();

    // Uma checagem que não conseguiu rodar não pode impedir o barbeiro de
    // bloquear a própria agenda.
    expect(mockedUpsertBarbeiro).toHaveBeenCalled();
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
  });
});

// ─── Remover ────────────────────────────────────────────────────────────────

describe('BloqueiosScreen — AG-03: remover bloqueio passa direto', () => {
  it('remover não abre diálogo e não consulta agendamento nenhum', async () => {
    mockedGetBarbeiro.mockResolvedValue({
      id: 'test-uid',
      nome: 'Zé',
      bloqueiosHorario: [{ id: 'b-1', data: '2026-08-20', horaInicio: '14:00', horaFim: '17:00' }],
    });
    const utils = renderTela();
    await aguardarCarga(utils);
    await waitFor(() => expect(utils.getByLabelText('Remover bloqueio')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Remover bloqueio'));
    });

    // Tirar um bloqueio só DEVOLVE disponibilidade: não surpreende ninguém,
    // não conflita com nada e não precisa de contagem. Simétrico à decisão de
    // "reativar profissional" do DOM-02, que também passa direto.
    expect(mockedAlert).not.toHaveBeenCalled();
    expect(mockedContar).not.toHaveBeenCalled();
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockedUpsertBarbeiro).toHaveBeenCalledWith('test-uid', { bloqueiosHorario: [] }),
    );
  });
});
