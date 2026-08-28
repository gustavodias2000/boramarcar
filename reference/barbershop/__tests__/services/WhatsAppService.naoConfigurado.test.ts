/**
 * CRÍTICO 3 — o servidor SEM WhatsApp Business configurado.
 *
 * A Cloud Function `sendWhatsApp` responde `failed-precondition` quando o
 * projeto não tem `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID`. Esse código não era
 * reconhecido por ninguém no app: caía no mesmo balde de "função fora do
 * ar", o serviço abria o WhatsApp do aparelho e devolvia `true`. Na tela de
 * Promoções isso rodava num laço por destinatário — o app ia para segundo
 * plano no PRIMEIRO link, os outros 199 se perdiam, e o resumo somava
 * sucesso em todos: "Mensagem enviada para 200 clientes".
 *
 * A correção NÃO foi jogar `failed-precondition` dentro de
 * `RECUSAS_DO_SERVIDOR`. Esses quatro códigos significam "o servidor decidiu
 * barrar você" e o fallback os contornaria; `failed-precondition` significa
 * "você podia enviar, eu é que não tenho por onde" — o vínculo com o
 * destinatário JÁ passou por `podeEnviarPara` no servidor antes disso. Num
 * envio avulso (Aniversários, Lista de espera) abrir o WhatsApp do aparelho
 * continua sendo o plano B legítimo, e é o único jeito de o app servir uma
 * barbearia que nunca contratou a API da Meta.
 *
 * O que estes testes travam é a outra metade: o caso ganhou status PRÓPRIO
 * (`nao-configurado` / `link-aberto`), nunca é confundido com `enviado`, e
 * pode ser desligado com `permitirFallback: false` — que é o que a tela de
 * Promoções usa para não abrir 200 conversas em sequência.
 *
 * As regressões dos quatro códigos originais ficam em
 * `WhatsAppService.recusas.test.ts`, INTOCADO de propósito: um arquivo que
 * não mudou passando de novo é prova melhor do que um reescrito.
 */
import type { Mock } from 'jest-mock';

const erroDoFirebase = (code: string, message = 'recusado') =>
  Object.assign(new Error(message), { code });

/** Recarrega o serviço com o estado do intervalo entre alertas zerado. */
function carregarServico() {
  let servico: any;
  let Alert: any;
  let Linking: any;
  // `jest.isolateModules` roda o callback de forma síncrona, mas o TS não
  // sabe disso — daí o `!` para não reclamar de uso antes da atribuição.
  let httpsCallable!: Mock;

  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      Alert: { alert: jest.fn() },
      Linking: { openURL: jest.fn(() => Promise.resolve()) },
    }));
    jest.doMock('../../src/services/CloudFunctionsClient', () => ({
      httpsCallable: jest.fn(),
    }));
    jest.doMock('../../firebaseConfig', () => ({ functions: {} }));

    servico = require('../../src/services/WhatsAppService').default;
    ({ Alert, Linking } = require('react-native'));
    ({ httpsCallable } = require('../../src/services/CloudFunctionsClient'));
  });

  return { servico, Alert, Linking, httpsCallable };
}

/** Faz a Cloud Function falhar com o código informado. */
const servidorFalhaCom = (httpsCallable: Mock, code: string, message?: string) =>
  (httpsCallable as any).mockReturnValue(() =>
    Promise.reject(erroDoFirebase(code, message)),
  );

const SEM_CONFIG = 'WhatsApp API não configurada no servidor.';

describe('servidor sem WhatsApp Business — `failed-precondition` é reconhecido', () => {
  it.each([
    ['functions/failed-precondition'],
    // O SDK entrega com prefixo, mas o Admin SDK e alguns caminhos de erro
    // entregam o código puro. Os dois têm que ser reconhecidos.
    ['failed-precondition'],
  ])('%s em lote: devolve `nao-configurado` e NÃO abre link nenhum', async (codigo) => {
    const { servico, Linking, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, codigo, SEM_CONFIG);

    await expect(
      servico.enviarTexto('11999999999', 'promoção', { permitirFallback: false }),
    ).resolves.toEqual({ status: 'nao-configurado', motivo: SEM_CONFIG });

    // O coração da correção do lote: nenhuma abertura de link. Era isto que
    // jogava o app para segundo plano no primeiro cliente.
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('nunca é confundido com envio confirmado, mesmo com o fallback ligado', async () => {
    const { servico, Linking, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/failed-precondition', SEM_CONFIG);

    // Envio AVULSO (Aniversários / Lista de espera): o plano B continua
    // valendo — mas o status diz a verdade sobre o que aconteceu.
    await expect(servico.enviarTexto('11999999999', 'oi')).resolves.toEqual({
      status: 'link-aberto',
    });
    expect(Linking.openURL).toHaveBeenCalledWith(
      expect.stringContaining('whatsapp://send?phone=5511999999999'),
    );
  });

  it('envio avulso não regride: `sendTextMessage` segue devolvendo true', async () => {
    // Aniversários e Lista de espera dependem legitimamente do link direto
    // quando o servidor não está configurado. Transformar isso em recusa
    // quebraria as duas telas em toda barbearia sem API da Meta.
    const { servico, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/failed-precondition', SEM_CONFIG);

    await expect(servico.sendTextMessage('11999999999', 'oi')).resolves.toBe(true);
  });

  it('não enche o profissional de alerta: quem avisa é a tela, uma vez só', async () => {
    const { servico, Alert, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/failed-precondition', SEM_CONFIG);

    await servico.enviarTexto('11999999999', 'x', { permitirFallback: false });

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('usa um motivo padrão quando o servidor não manda mensagem', async () => {
    const { servico, httpsCallable } = carregarServico();
    (httpsCallable as any).mockReturnValue(() =>
      Promise.reject({ code: 'functions/failed-precondition' }),
    );

    await expect(
      servico.enviarTexto('11999999999', 'x', { permitirFallback: false }),
    ).resolves.toEqual({
      status: 'nao-configurado',
      motivo: 'O WhatsApp Business não está configurado no servidor.',
    });
  });
});

describe('`permitirFallback: false` vale para TODA falha, não só a de configuração', () => {
  it('função fora do ar em lote: `falhou`, sem abrir link', async () => {
    // Num lote, abrir o WhatsApp do aparelho nunca ajuda — vale para
    // `internal` do mesmo jeito que para `failed-precondition`.
    const { servico, Linking, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/internal', 'deploy em andamento');

    await expect(
      servico.enviarTexto('11999999999', 'x', { permitirFallback: false }),
    ).resolves.toEqual({ status: 'falhou', motivo: 'deploy em andamento' });
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('recusa do servidor em lote: segue `recusado`, com o alerta de sempre', async () => {
    const { servico, Alert, Linking, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/permission-denied', 'sem vínculo');

    await expect(
      servico.enviarTexto('11999999999', 'x', { permitirFallback: false }),
    ).resolves.toEqual({ status: 'recusado', motivo: 'sem vínculo' });
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Mensagem não enviada', 'sem vínculo');
  });

  it('caminho feliz devolve `enviado` — o único status que significa entrega', async () => {
    const { servico, Linking, Alert, httpsCallable } = carregarServico();
    (httpsCallable as any).mockReturnValue(() => Promise.resolve({ data: { ok: true } }));

    await expect(
      servico.enviarTexto('11999999999', 'x', { permitirFallback: false }),
    ).resolves.toEqual({ status: 'enviado' });
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
