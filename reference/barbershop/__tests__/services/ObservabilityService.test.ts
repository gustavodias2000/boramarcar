import { registrarErro } from '../../src/services/ObservabilityService';
import type { ContextoObservabilidade } from '../../src/services/ObservabilityService';
import { httpsCallable } from '../../src/services/CloudFunctionsClient';

jest.mock('../../src/services/CloudFunctionsClient', () => ({
  httpsCallable: jest.fn(),
}));

describe('ObservabilityService', () => {
  it('remove contexto potencialmente sensivel antes de enviar o evento', async () => {
    const enviar = jest.fn().mockResolvedValue({ data: { success: true } });
    (httpsCallable as jest.Mock).mockReturnValue(enviar);

    await registrarErro(new Error('Falha de teste'), {
      area: 'agenda',
      email: 'cliente@exemplo.com',
      telefone: '5511999999999',
      token: 'segredo',
    });

    expect(enviar).toHaveBeenCalledWith({
      nivel: 'error',
      mensagem: 'Falha de teste',
      contexto: { area: 'agenda' },
    });
  });

  it('redige email/telefone embutidos no texto da mensagem, nao so em campos dedicados', async () => {
    const enviar = jest.fn().mockResolvedValue({ data: { success: true } });
    (httpsCallable as jest.Mock).mockReturnValue(enviar);

    await registrarErro(
      new Error('falha ao notificar cliente@exemplo.com pelo telefone (11) 99999-8888'),
      { area: 'notificacao' },
    );

    const evento = enviar.mock.calls[0][0];
    expect(evento.mensagem).not.toContain('cliente@exemplo.com');
    expect(evento.mensagem).not.toContain('99999-8888');
    expect(evento.mensagem).toContain('[redigido]');
  });

  it('sanitiza recursivamente um contexto com objeto aninhado (SEC-002)', async () => {
    const enviar = jest.fn().mockResolvedValue({ data: { success: true } });
    (httpsCallable as jest.Mock).mockReturnValue(enviar);

    await registrarErro(new Error('falha ao processar'), {
      area: 'pagamento',
      detalhe: { email: 'cliente@exemplo.com', codigo: 'card_declined' },
    });

    const evento = enviar.mock.calls[0][0];
    expect(evento.contexto.detalhe).toEqual({ codigo: 'card_declined' });
  });

  it('sanitiza recursivamente PII dentro de um array no contexto (SEC-002)', async () => {
    const enviar = jest.fn().mockResolvedValue({ data: { success: true } });
    (httpsCallable as jest.Mock).mockReturnValue(enviar);

    await registrarErro(new Error('falha em lote'), {
      area: 'notificacao',
      falhas: ['erro para joao@exemplo.com', 'erro generico'],
    });

    const evento = enviar.mock.calls[0][0];
    expect(evento.contexto.falhas[0]).not.toContain('joao@exemplo.com');
    expect(evento.contexto.falhas[0]).toContain('[redigido]');
    expect(evento.contexto.falhas[1]).toBe('erro generico');
  });

  it('sanitiza um token Bearer dentro da stack quando ela é passada como contexto (SEC-002)', async () => {
    const enviar = jest.fn().mockResolvedValue({ data: { success: true } });
    (httpsCallable as jest.Mock).mockReturnValue(enviar);

    const stackFalsa = 'Error: falha na chamada\n  at fetch (Authorization: Bearer abc123def456ghi789)';
    await registrarErro(new Error('falha na API'), { area: 'integracao', stack: stackFalsa });

    const evento = enviar.mock.calls[0][0];
    expect(evento.contexto.stack).not.toContain('abc123def456ghi789');
  });

  it('preserva area/operacao/codigo e não trava com referência circular no contexto (SEC-002)', async () => {
    const enviar = jest.fn().mockResolvedValue({ data: { success: true } });
    (httpsCallable as jest.Mock).mockReturnValue(enviar);

    const contexto: Record<string, unknown> = { area: 'agenda', operacao: 'salvar', codigo: 'x1' };
    contexto.proprio = contexto;

    // `as unknown as ContextoObservabilidade`: um objeto autorreferente não é
    // representável pelo tipo recursivo `ValorContexto` sem essa conversão —
    // é exatamente o cenário (referência circular em runtime) que o teste
    // quer forçar, TypeScript não modela ciclos de valor.
    await expect(
      registrarErro(new Error('falha'), contexto as unknown as ContextoObservabilidade),
    ).resolves.toBeUndefined();
    const evento = enviar.mock.calls[0][0];
    expect(evento.contexto.area).toBe('agenda');
    expect(evento.contexto.operacao).toBe('salvar');
    expect(evento.contexto.codigo).toBe('x1');
  });
});
