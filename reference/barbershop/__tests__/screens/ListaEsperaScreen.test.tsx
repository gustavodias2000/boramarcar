/**
 * ListaEsperaScreen — irmão do CRÍTICO 3: a fila não pode avançar por uma
 * mensagem que nunca saiu.
 *
 * O defeito: a tela chamava `sendTextMessage`, IGNORAVA o retorno, gravava
 * `atualizarStatusFila(id, 'notificado')` e anunciava "Fulano foi notificado"
 * — incondicionalmente. Com o servidor recusando (`permission-denied`,
 * `resource-exhausted`) nada saía, mas a entrada deixava a fila marcada como
 * avisada: o cliente perdia a vez sem nunca ter sido chamado, e o barbeiro
 * não tinha como saber, porque a tela tinha acabado de dizer que deu certo.
 *
 * A correção lê `enviarTexto`, que devolve `{ status }`, e separa duas
 * coisas que o booleano antigo juntava:
 *  - `enviado` / `link-aberto` → a mensagem chega ao cliente; pode marcar;
 *  - `recusado` / `falhou`     → não chegou; a pessoa CONTINUA na fila.
 *
 * Estes testes travam, em ordem de importância:
 *  1. em `recusado`/`falhou`, `atualizarStatusFila` NÃO é chamado — é o que
 *     impede o cliente de perder a vez (e é o teste que quebra se alguém
 *     reintroduzir a regressão);
 *  2. a tela não recarrega nem afirma sucesso quando não houve envio;
 *  3. a data dentro da mensagem sai em formato brasileiro, não ISO cru.
 *
 * Padrão de mock: `jest.mock` por arquivo — o `jest.setup.js` deste repo NÃO
 * mocka `react-native` globalmente, de propósito (CLAUDE.md §6) — e nunca
 * `restoreAllMocks()`, que derrubaria o spy de `Alert.alert` do setup global.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import ListaEsperaScreen from '../../src/screens/ListaEsperaScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import {
  listarFilaDoBarbeiro,
  atualizarStatusFila,
} from '../../src/data/repositories/ListaEsperaRepository';
import WhatsAppService from '../../src/services/WhatsAppService';
import type { EntradaListaEspera } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../src/data/repositories/ListaEsperaRepository', () => ({
  listarFilaDoBarbeiro: jest.fn(),
  atualizarStatusFila: jest.fn(),
}));

// ATENÇÃO — este mock é parte da asserção, não encanamento: o serviço expõe
// aqui `enviarTexto` e NÃO `sendTextMessage`. Se a tela voltar ao retorno
// booleano (que não separa "enviado" de "link aberto" e, pior, era o que
// permitia ignorar o resultado), o teste quebra com "not a function" em vez
// de passar por acidente.
jest.mock('../../src/services/WhatsAppService', () => ({
  __esModule: true,
  default: {
    enviarTexto: jest.fn(),
  },
}));

const mockedListarFila = listarFilaDoBarbeiro as jest.Mock;
const mockedAtualizarStatus = atualizarStatusFila as jest.Mock;
const mockedEnviarTexto = (WhatsAppService as any).enviarTexto as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

// ─── Fixtures ───────────────────────────────────────────────────────────────

const ANA = 'Ana Souza';
const BRUNO = 'Bruno Lima';

const FILA: EntradaListaEspera[] = [
  {
    id: 'fila-1',
    barbeiroId: 'test-uid',
    clienteUid: 'cli-1',
    clienteNome: ANA,
    clienteEmail: 'ana@example.com',
    clienteTelefone: '11999990001',
    data: '2026-08-20',
    servicoNome: 'Corte + barba',
    status: 'aguardando',
  },
  {
    // Sem telefone: o fluxo tem que parar antes de tentar qualquer envio.
    id: 'fila-2',
    barbeiroId: 'test-uid',
    clienteUid: 'cli-2',
    clienteNome: BRUNO,
    clienteEmail: 'bruno@example.com',
    data: '2026-08-21',
    status: 'aguardando',
  },
];

const renderTela = () =>
  render(
    <ThemeProvider>
      <ListaEsperaScreen navigation={{} as any} route={{} as any} />
    </ThemeProvider>,
  );

type Tela = ReturnType<typeof renderTela>;

/** Espera a carga inicial: o spinner sai e os cards da fila aparecem. */
const aguardarFila = async (utils: Tela) => {
  await waitFor(() => expect(utils.getByText(ANA)).toBeTruthy());
};

/** Toca no botão "Notificar" do card — abre o diálogo de confirmação. */
const tocarEmNotificar = async (utils: Tela, nome: string) => {
  await act(async () => {
    fireEvent.press(utils.getByLabelText(`Notificar ${nome} sobre horário disponível`));
  });
};

/** O diálogo de confirmação aberto pelo card, se existir. */
const dialogoDeConfirmacao = () =>
  mockedAlert.mock.calls.find(([titulo]) => titulo === 'Notificar cliente');

/** Dispara o botão "Notificar" do diálogo e espera o fluxo inteiro terminar. */
const confirmarNotificacao = async () => {
  const chamada = dialogoDeConfirmacao();
  expect(chamada).toBeTruthy();
  const botao = chamada![2].find((b: { text: string }) => b.text === 'Notificar');
  await act(async () => {
    await botao.onPress();
  });
};

/** Atalho do caminho completo: renderiza, toca no card e confirma. */
const notificar = async (nome = ANA) => {
  const utils = renderTela();
  await aguardarFila(utils);
  await tocarEmNotificar(utils, nome);
  await confirmarNotificacao();
  return utils;
};

/** O alerta de desfecho é sempre o último — o de confirmação veio antes. */
const desfecho = () => mockedAlert.mock.calls[mockedAlert.mock.calls.length - 1];

/** A afirmação de sucesso apareceu em algum momento? */
const anunciouSucesso = () => mockedAlert.mock.calls.some(([titulo]) => titulo === 'Sucesso!');

beforeEach(() => {
  jest.clearAllMocks();
  mockedListarFila.mockResolvedValue(FILA);
  mockedAtualizarStatus.mockResolvedValue(undefined);
});

// ─── O defeito: envio não confirmado não pode avançar a fila ────────────────

describe('o servidor não aceitou — a pessoa continua na fila', () => {
  it.each([
    ['recusado', { status: 'recusado', motivo: 'Sem vínculo com este número.' }],
    ['falhou', { status: 'falhou', motivo: 'offline' }],
  ])('%s: não grava "notificado" e avisa o barbeiro', async (_rotulo, resultado) => {
    mockedEnviarTexto.mockResolvedValue(resultado);

    await notificar();

    // A tela TENTOU enviar — o que muda é só o que ela faz com a resposta.
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);

    // O ponto central: a entrada não é marcada como avisada. Era exatamente
    // esta escrita que fazia o cliente perder a vez sem ser chamado.
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();

    // E a tela não recarrega a fila: só a carga inicial do `useEffect`.
    expect(mockedListarFila).toHaveBeenCalledTimes(1);

    const [titulo, corpo] = desfecho();
    expect(titulo).toBe('Não foi possível avisar');
    expect(corpo).toContain(ANA);
    expect(corpo).toContain('continua na fila');
    // A frase do defeito, na forma que o barbeiro lia. Não pode voltar.
    expect(anunciouSucesso()).toBe(false);
    expect(corpo).not.toMatch(/foi notificad/);
  });

  it('exceção no envio também não marca "notificado"', async () => {
    // Caminho do `catch`: o serviço estourou em vez de devolver um status.
    mockedEnviarTexto.mockRejectedValue(new Error('offline'));

    await notificar();

    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
    expect(mockedListarFila).toHaveBeenCalledTimes(1);
    expect(desfecho()).toEqual(['Erro', 'Não foi possível enviar a notificação.']);
    expect(anunciouSucesso()).toBe(false);
  });
});

// ─── O caminho que de fato avisa o cliente ─────────────────────────────────

describe('a mensagem chegou ao cliente — a fila avança', () => {
  it.each([
    // Confirmado pela Cloud Function (WhatsApp Business API).
    ['enviado'],
    // Fallback: o WhatsApp do aparelho abriu com a mensagem pronta. Num
    // envio AVULSO isso atende a intenção do profissional — ao contrário do
    // envio EM LOTE, onde a diferença é o problema inteiro (ver
    // PromocaoScreen.test.tsx).
    ['link-aberto'],
  ])('%s: grava "notificado", recarrega a fila e confirma ao barbeiro', async (status) => {
    mockedEnviarTexto.mockResolvedValue({ status });

    await notificar();

    expect(mockedEnviarTexto).toHaveBeenCalledWith('11999990001', expect.any(String));
    expect(mockedAtualizarStatus).toHaveBeenCalledWith('fila-1', 'notificado');
    // Carga inicial + recarga depois da gravação.
    expect(mockedListarFila).toHaveBeenCalledTimes(2);
    expect(desfecho()).toEqual(['Sucesso!', `${ANA} foi notificado.`]);
  });

  it('a data dentro da mensagem sai em formato brasileiro, não ISO', async () => {
    mockedEnviarTexto.mockResolvedValue({ status: 'enviado' });

    await notificar();

    const [, mensagem] = mockedEnviarTexto.mock.calls[0];
    expect(mensagem).toContain('20/08/2026');
    // O defeito: `2026-08-20` cru dentro do texto que o cliente recebe.
    expect(mensagem).not.toContain('2026-08-20');
    expect(mensagem).toContain(ANA);
    expect(mensagem).toContain('Corte + barba');
  });
});

// ─── Não-regressão dos caminhos que já existiam ────────────────────────────

describe('caminhos que já existiam', () => {
  it('cliente sem telefone: avisa e não tenta enviar', async () => {
    mockedEnviarTexto.mockResolvedValue({ status: 'enviado' });

    await notificar(BRUNO);

    expect(mockedEnviarTexto).not.toHaveBeenCalled();
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
    expect(mockedListarFila).toHaveBeenCalledTimes(1);
    expect(desfecho()).toEqual([
      'Sem telefone',
      'Este cliente não tem telefone cadastrado para notificação.',
    ]);
  });

  it('desistir no diálogo não envia nem grava nada', async () => {
    const utils = renderTela();
    await aguardarFila(utils);

    await tocarEmNotificar(utils, ANA);

    const chamada = dialogoDeConfirmacao();
    expect(chamada).toBeTruthy();
    expect(chamada![2].map((b: { text: string }) => b.text)).toEqual(['Cancelar', 'Notificar']);

    const cancelar = chamada![2].find((b: { text: string }) => b.text === 'Cancelar');
    // Botão de desistir é `style:'cancel'` — no Android é o que o botão
    // físico "voltar" aciona. E não tem `onPress`: desistir é não fazer nada.
    expect(cancelar.style).toBe('cancel');
    expect(cancelar.onPress).toBeUndefined();

    expect(mockedEnviarTexto).not.toHaveBeenCalled();
    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
  });

  /**
   * Guarda por lista BRANCA: qualquer status que não seja 'enviado' ou
   * 'link-aberto' barra a marcação. 'nao-configurado' é hoje inalcançável
   * nesta tela (ela não passa `permitirFallback: false`), mas se alguém
   * passar — como Promoções faz — o cliente NÃO pode voltar a ser marcado
   * como avisado sem a mensagem ter saído. Status futuro entra barrado.
   */
  it('nao-configurado tambem NAO marca a fila — a guarda e lista branca', async () => {
    mockedEnviarTexto.mockResolvedValue({ status: 'nao-configurado' });

    await notificar();

    expect(mockedAtualizarStatus).not.toHaveBeenCalled();
    expect(mockedListarFila).toHaveBeenCalledTimes(1);
  });
});
