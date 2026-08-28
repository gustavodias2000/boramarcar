/**
 * CRÍTICO 3 — o envio em lote não pode relatar sucesso pelo que não enviou.
 *
 * O laço de `enviarParaTodos` somava `sucesso` sempre que
 * `sendTextMessage` devolvia `true`. Só que `true` também vinha do fallback
 * local (`Linking.openURL`), que apenas ABRE o WhatsApp do aparelho com a
 * mensagem pronta — nada sai até um humano tocar em enviar. Com o servidor
 * sem WhatsApp Business configurado (`failed-precondition`), TODAS as
 * chamadas caíam nesse fallback: o app ia para segundo plano no primeiro
 * cliente, os outros 199 nunca eram tentados de verdade, e o barbeiro lia
 * "Mensagem enviada para 200 clientes".
 *
 * A decisão de correção foi (b) do briefing: INTERROMPER o lote assim que o
 * servidor responde "não configurado". É uma condição GLOBAL do servidor,
 * não do destinatário — tentar os outros 199 colhe o mesmo erro. E o lote
 * passa `permitirFallback: false`, então nenhum link é aberto: abrir uma
 * conversa de cada vez para 200 pessoas nunca foi um plano.
 *
 * Estes testes travam três coisas, nesta ordem de importância:
 *  1. o resumo NÃO afirma envio confirmado quando nada foi confirmado;
 *  2. o lote para no primeiro cliente em vez de varrer a lista inteira;
 *  3. só `enviado` (confirmação da Cloud Function) conta como enviado.
 *
 * Padrão de mock: `jest.mock` por arquivo — o `jest.setup.js` deste repo NÃO
 * mocka `react-native` globalmente, de propósito (CLAUDE.md §6) — e nunca
 * `restoreAllMocks()`, que derrubaria o spy de `Alert.alert` do setup global.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import PromocaoScreen from '../../src/screens/PromocaoScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { listarClientesDoBarbeiro } from '../../src/data/repositories/ClienteContatoRepository';
import WhatsAppService from '../../src/services/WhatsAppService';
import type { ClienteContato } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// `useFocusEffect` real depende de `navigation.addListener`, que o mock global
// de @react-navigation/native não fornece.
jest.mock('@react-navigation/native', () => {
  const ReactLocal = require('react');
  return {
    useFocusEffect: (callback: () => void) => ReactLocal.useEffect(callback, [callback]),
  };
});

jest.mock('../../src/data/repositories/ClienteContatoRepository', () => ({
  listarClientesDoBarbeiro: jest.fn(),
}));

// ATENÇÃO — este mock é parte da asserção, não encanamento: o serviço expõe
// aqui `enviarTexto` e NÃO `sendTextMessage`. Se a tela voltar a usar o
// retorno booleano (que não separa "enviado" de "link aberto"), o teste
// quebra com "not a function" em vez de passar por acidente.
jest.mock('../../src/services/WhatsAppService', () => ({
  __esModule: true,
  default: {
    gerarMensagemPromocional: jest.fn((cliente: any, texto: string) =>
      texto.replace(/{nome_cliente}/g, cliente.nome),
    ),
    enviarTexto: jest.fn(),
  },
}));

const mockedListarClientes = listarClientesDoBarbeiro as jest.Mock;
const mockedEnviarTexto = (WhatsAppService as any).enviarTexto as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

// ─── Fixtures ───────────────────────────────────────────────────────────────

const CLIENTES: ClienteContato[] = [
  { id: 'c1', nome: 'Ana', telefone: '11999990001', origem: 'manual' },
  { id: 'c2', nome: 'Bruno', telefone: '11999990002', origem: 'manual' },
  { id: 'c3', nome: 'Carla', telefone: '11999990003', origem: 'contatos' },
];

const renderTela = () =>
  render(
    <ThemeProvider>
      <PromocaoScreen navigation={{} as any} route={{} as any} />
    </ThemeProvider>,
  );

/**
 * Escreve a mensagem, toca em "Enviar promoção" e confirma no alerta de
 * confirmação — devolvendo o controle só depois de o lote terminar.
 */
async function enviarLote(texto = 'Corte com 20% essa semana!') {
  const tela = renderTela();
  await waitFor(() => expect(mockedListarClientes).toHaveBeenCalled());

  fireEvent.changeText(
    tela.getByPlaceholderText(/Essa semana o corte está com 20% de desconto/),
    texto,
  );
  fireEvent.press(tela.getByLabelText('Enviar promoção'));

  // O alerta de confirmação: [Cancelar, Enviar]. Dispara o "Enviar".
  const confirmacao = mockedAlert.mock.calls.find(([titulo]) => titulo === 'Enviar promoção');
  expect(confirmacao).toBeDefined();
  const botaoEnviar = confirmacao![2].find((b: any) => b.text === 'Enviar');
  await botaoEnviar.onPress();

  return tela;
}

/** O alerta de resumo é sempre o último — o de confirmação veio antes. */
const resumo = () => mockedAlert.mock.calls[mockedAlert.mock.calls.length - 1];

beforeEach(() => {
  mockedAlert.mockClear();
  mockedListarClientes.mockReset();
  mockedEnviarTexto.mockReset();
  mockedListarClientes.mockResolvedValue(CLIENTES);
});

// ─── O defeito ──────────────────────────────────────────────────────────────

describe('servidor sem WhatsApp Business — o resumo não pode mentir', () => {
  beforeEach(() => {
    mockedEnviarTexto.mockResolvedValue({
      status: 'nao-configurado',
      motivo: 'WhatsApp API não configurada no servidor.',
    });
  });

  it('não afirma envio confirmado para ninguém', async () => {
    await enviarLote();

    const [titulo, corpo] = resumo();
    expect(titulo).toBe('Envio em massa indisponível');
    expect(corpo).toContain('Nenhuma mensagem foi enviada');
    // A frase do defeito, na forma que o barbeiro lia. Não pode voltar.
    expect(corpo).not.toContain('Mensagem enviada para 3 clientes');
    expect(corpo).not.toMatch(/enviada[s]? com sucesso/);
  });

  it('para no primeiro cliente em vez de varrer os outros dois', async () => {
    await enviarLote();

    // Condição global do servidor: insistir nos demais colheria o mesmo erro.
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);
  });

  it('nunca deixa o serviço abrir link durante o lote', async () => {
    await enviarLote();

    expect(mockedEnviarTexto).toHaveBeenCalledWith(
      '11999990001',
      expect.any(String),
      { permitirFallback: false },
    );
  });

  it('preserva a mensagem escrita — o barbeiro vai precisar dela de novo', async () => {
    const tela = await enviarLote('Promoção de terça');

    await waitFor(() =>
      expect(tela.getByDisplayValue('Promoção de terça')).toBeTruthy(),
    );
  });
});

// ─── Não-regressão do caminho que funciona ──────────────────────────────────

describe('servidor configurado — o caminho feliz continua igual', () => {
  it('conta os três e limpa o campo', async () => {
    mockedEnviarTexto.mockResolvedValue({ status: 'enviado' });

    const tela = await enviarLote();

    expect(mockedEnviarTexto).toHaveBeenCalledTimes(3);
    expect(resumo()).toEqual([
      'Envio concluído',
      'Mensagem enviada para 3 clientes.',
    ]);
    await waitFor(() => expect(tela.getByPlaceholderText(/20% de desconto/).props.value).toBe(''));
  });

  it('personaliza {nome_cliente} por destinatário', async () => {
    mockedEnviarTexto.mockResolvedValue({ status: 'enviado' });

    await enviarLote('Oi {nome_cliente}, corte com desconto!');

    expect(mockedEnviarTexto).toHaveBeenNthCalledWith(
      1,
      '11999990001',
      'Oi Ana, corte com desconto!',
      { permitirFallback: false },
    );
    expect(mockedEnviarTexto).toHaveBeenNthCalledWith(
      2,
      '11999990002',
      'Oi Bruno, corte com desconto!',
      { permitirFallback: false },
    );
  });

  it('recusa por destinatário conta como falha e o lote continua', async () => {
    // `permission-denied`/`resource-exhausted` são decisões POR mensagem —
    // ao contrário de "não configurado", não interrompem o lote.
    mockedEnviarTexto
      .mockResolvedValueOnce({ status: 'enviado' })
      .mockResolvedValueOnce({ status: 'recusado', motivo: 'sem vínculo' })
      .mockResolvedValueOnce({ status: 'enviado' });

    await enviarLote();

    expect(mockedEnviarTexto).toHaveBeenCalledTimes(3);
    expect(resumo()).toEqual([
      'Envio concluído',
      '2 enviadas com sucesso, 1 falhou.',
    ]);
  });

  it('falha de infraestrutura não vira sucesso', async () => {
    // Antes, `internal` caía no fallback local e voltava `true` — três
    // "sucessos" sem uma única mensagem enviada.
    mockedEnviarTexto.mockResolvedValue({ status: 'falhou', motivo: 'offline' });

    await enviarLote();

    expect(resumo()).toEqual([
      'Envio concluído',
      '0 enviadas com sucesso, 3 falharam.',
    ]);
  });
});
