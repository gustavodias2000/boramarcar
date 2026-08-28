/**
 * Bloco 1 da auditoria — a trava anti-abuso que o próprio app contornava.
 *
 * O token da WhatsApp Business API vive só no servidor, e a Cloud Function
 * `sendWhatsApp` recusa envios abusivos (limite atingido, número sem vínculo
 * com quem envia, chamada sem login). O problema: o cliente tratava QUALQUER
 * erro como "função fora do ar" e caía no fallback local, que abre o WhatsApp
 * do aparelho e devolve `true`. Resultado: a recusa do servidor não recusava
 * nada, e ainda dizia para a tela que a mensagem tinha saído.
 *
 * Estes testes separam as duas famílias de erro:
 *  - RECUSA do servidor  -> não envia, devolve false, avisa o profissional;
 *  - falha de INFRA      -> fallback local, porque aí a intenção era legítima.
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

describe('sendTextMessage — recusa do servidor NÃO pode virar envio local', () => {
  it.each([
    ['functions/permission-denied', 'número não pertence à sua carteira de clientes'],
    ['functions/resource-exhausted', 'limite diário de mensagens atingido'],
    ['functions/invalid-argument', 'telefone em formato inválido'],
    ['functions/unauthenticated', 'sessão expirada'],
  ])('%s: devolve false e não abre o WhatsApp do aparelho', async (codigo, motivo) => {
    const { servico, Linking, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, codigo, motivo);

    await expect(servico.sendTextMessage('11999999999', 'oi')).resolves.toBe(false);

    // Este é o coração da correção: nenhuma abertura de link.
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('mostra ao profissional o motivo que veio do servidor', async () => {
    const { servico, Alert, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/resource-exhausted', 'limite diário atingido');

    await servico.sendTextMessage('11999999999', 'oi');

    expect(Alert.alert).toHaveBeenCalledWith(
      'Mensagem não enviada',
      'limite diário atingido',
    );
  });

  it('usa um texto padrão quando o servidor não manda mensagem', async () => {
    const { servico, Alert, httpsCallable } = carregarServico();
    (httpsCallable as any).mockReturnValue(() =>
      Promise.reject({ code: 'functions/permission-denied' }),
    );

    await servico.sendTextMessage('11999999999', 'oi');

    expect(Alert.alert).toHaveBeenCalledWith(
      'Mensagem não enviada',
      'O servidor não autorizou o envio desta mensagem.',
    );
  });

  it('reconhece o código sem o prefixo `functions/`', async () => {
    // O SDK entrega `functions/permission-denied`, mas o Admin SDK e alguns
    // caminhos de erro entregam o código puro. Os dois têm que travar.
    const { servico, Linking, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'permission-denied');

    await expect(servico.sendTextMessage('11999999999', 'oi')).resolves.toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});

describe('envio em lote — o profissional não pode receber 40 alertas iguais', () => {
  it('agrupa recusas seguidas em um único alerta', async () => {
    // Tela de Promoções: um clique dispara dezenas de envios. Sem intervalo,
    // cada recusa abriria um alerta para fechar na mão.
    const { servico, Alert, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/resource-exhausted');

    for (let i = 0; i < 20; i++) {
      await servico.sendTextMessage(`1199999${i}`, 'promoção');
    }

    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('mas todas as 20 continuam devolvendo false — nenhuma foi enviada', async () => {
    // Suprimir o alerta não pode suprimir a recusa.
    const { servico, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/resource-exhausted');

    const resultados = await Promise.all(
      Array.from({ length: 20 }, (_, i) => servico.sendTextMessage(`1199999${i}`, 'x')),
    );

    expect(resultados.every((r) => r === false)).toBe(true);
  });

  it('volta a avisar depois de 10 segundos', async () => {
    const { servico, Alert, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/resource-exhausted');
    const agora = Date.now();
    const relogio = jest.spyOn(Date, 'now');

    relogio.mockReturnValue(agora);
    await servico.sendTextMessage('11999999999', 'x');
    relogio.mockReturnValue(agora + 5000);
    await servico.sendTextMessage('11999999999', 'x');
    expect(Alert.alert).toHaveBeenCalledTimes(1);

    relogio.mockReturnValue(agora + 11000);
    await servico.sendTextMessage('11999999999', 'x');
    expect(Alert.alert).toHaveBeenCalledTimes(2);

    relogio.mockRestore();
  });
});

describe('falha de infraestrutura — aí o fallback local é legítimo', () => {
  it('função fora do ar: abre o WhatsApp do aparelho e devolve true', async () => {
    const { servico, Linking, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/internal', 'deploy em andamento');

    await expect(servico.sendTextMessage('11999999999', 'oi')).resolves.toBe(true);

    expect(Linking.openURL).toHaveBeenCalledWith(
      expect.stringContaining('whatsapp://send?phone=5511999999999'),
    );
  });

  it('sem internet (erro sem código): também cai no fallback', async () => {
    const { servico, Linking, httpsCallable } = carregarServico();
    (httpsCallable as any).mockReturnValue(() => Promise.reject(new Error('offline')));

    await expect(servico.sendTextMessage('11999999999', 'oi')).resolves.toBe(true);
    expect(Linking.openURL).toHaveBeenCalled();
  });

  it('`unavailable` é infra, não recusa — o servidor nem chegou a decidir', async () => {
    const { servico, Linking, httpsCallable } = carregarServico();
    servidorFalhaCom(httpsCallable, 'functions/unavailable');

    await expect(servico.sendTextMessage('11999999999', 'oi')).resolves.toBe(true);
    expect(Linking.openURL).toHaveBeenCalled();
  });

  it('não abre nada quando o servidor aceita o envio', async () => {
    const { servico, Linking, Alert, httpsCallable } = carregarServico();
    (httpsCallable as any).mockReturnValue(() => Promise.resolve({ data: { ok: true } }));

    await expect(servico.sendTextMessage('11999999999', 'oi')).resolves.toBe(true);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
