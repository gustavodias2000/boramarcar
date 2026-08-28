/**
 * Bloco 2 da auditoria — o app dizia "Pagamento realizado com sucesso" e
 * listava cartão e PIX como se cobrasse. Não cobra: não existe gateway
 * integrado, o cliente paga no local.
 *
 * O que estes testes travam é justamente a honestidade da camada: o método
 * de pagamento é SEMPRE 'presential', nenhuma chamada de rede acontece, e a
 * conversão real ↔ centavos arredonda direito (um centavo errado no preço
 * exibido é reclamação na cadeira).
 */
import PaymentService from '../../src/services/PaymentService';

describe('não existe cobrança online', () => {
  it('registrarPagamentoPresencial devolve sempre o método presencial', async () => {
    const resultado = await PaymentService.registrarPagamentoPresencial(
      { id: 'ag1', barbeiroId: 'b1' } as any,
      5000,
    );

    expect(resultado).toEqual({ success: true, amount: 50, paymentMethod: 'presential' });
  });

  it('não faz nenhuma chamada de rede — não há gateway do outro lado', async () => {
    const fetchSpy = global.fetch as jest.Mock;
    fetchSpy.mockClear();

    await PaymentService.registrarPagamentoPresencial(null, 5000);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('funciona mesmo sem agendamento — só registra a forma combinada', async () => {
    await expect(PaymentService.registrarPagamentoPresencial(null, 3000)).resolves.toMatchObject({
      amount: 30,
      paymentMethod: 'presential',
    });
  });

  it('processPayment (nome antigo) devolve exatamente o mesmo contrato', async () => {
    // Mantido para não quebrar quem já consome `PaymentResult`.
    const antigo = await PaymentService.processPayment(null, 4500);
    const novo = await PaymentService.registrarPagamentoPresencial(null, 4500);
    expect(antigo).toEqual(novo);
  });

  it('a configuração é sempre válida: não há credencial para faltar', () => {
    expect(PaymentService.validateConfiguration()).toEqual({ isValid: true, errors: [] });
    expect(PaymentService.isInitialized).toBe(true);
  });
});

describe('conversão de valores — um centavo errado vira discussão no caixa', () => {
  it('converte reais para centavos arredondando o ponto flutuante', () => {
    // 19.99 * 100 dá 1998.9999... em ponto flutuante; sem Math.round o preço
    // sairia 19,98.
    expect(PaymentService.convertToCents(19.99)).toBe(1999);
    expect(PaymentService.convertToCents(50)).toBe(5000);
    expect(PaymentService.convertToCents(0.1)).toBe(10);
    expect(PaymentService.convertToCents(0)).toBe(0);
  });

  it('arredonda meio centavo para cima', () => {
    expect(PaymentService.convertToCents(10.005)).toBe(1001);
  });

  it('ida e volta preserva o valor', () => {
    for (const valor of [19.99, 35.5, 120, 0.99]) {
      const centavos = PaymentService.convertToCents(valor);
      expect(centavos / 100).toBeCloseTo(valor, 2);
    }
  });
});

describe('formatCurrency', () => {
  it('formata em real brasileiro a partir de centavos', () => {
    //   = espaço não separável, que o Intl usa depois do "R$".
    expect(PaymentService.formatCurrency(5000).replace(/ /g, ' ')).toBe('R$ 50,00');
    expect(PaymentService.formatCurrency(1999).replace(/ /g, ' ')).toBe('R$ 19,99');
  });

  it('sempre mostra duas casas decimais', () => {
    expect(PaymentService.formatCurrency(1000)).toMatch(/10,00$/);
    expect(PaymentService.formatCurrency(1050)).toMatch(/10,50$/);
  });

  it('usa vírgula decimal e ponto de milhar (padrão pt-BR)', () => {
    const formatado = PaymentService.formatCurrency(123456);
    expect(formatado).toContain('1.234,56');
  });

  it('formata zero sem quebrar', () => {
    expect(PaymentService.formatCurrency(0)).toContain('0,00');
  });
});
