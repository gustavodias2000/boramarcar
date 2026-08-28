/**
 * PaymentService — o app NÃO cobra nada online.
 *
 * Não existe gateway de pagamento integrado: o cliente paga no local
 * (dinheiro, PIX ou cartão na maquininha do profissional). Este serviço só
 * calcula e formata valores para exibição — nenhuma cobrança é feita aqui.
 *
 * A auditoria apontou que a versão anterior anunciava "Pagamento realizado
 * com sucesso" e listava cartão/PIX como se fossem cobrados pelo app, o que
 * é falso e corrói a confiança do cliente. O texto foi corrigido; a função
 * abaixo continua existindo apenas como ponto de extensão para o dia em que
 * um gateway real for integrado.
 */
import type { Agendamento } from '../types';

export interface PaymentResult {
  success: boolean;
  amount: number;
  /** Sempre 'presential': o pagamento acontece no estabelecimento. */
  paymentMethod: 'presential';
}

export interface PaymentValidation {
  isValid: boolean;
  errors: string[];
}

class PaymentService {
  readonly isInitialized = true;

  /**
   * NÃO processa pagamento algum — apenas registra que a forma de pagamento
   * combinada é presencial. Não movimenta dinheiro nem contata nenhum
   * gateway. Implementação principal: os demais métodos de "pagamento" do
   * serviço chamam este.
   */
  async registrarPagamentoPresencial(
    _agendamento: Partial<Agendamento> | null,
    amount: number,
  ): Promise<PaymentResult> {
    return {
      success: true,
      amount: amount / 100,
      paymentMethod: 'presential',
    };
  }

  /**
   * Wrapper de compatibilidade — mantido com este nome para não quebrar quem
   * ainda consome `PaymentResult` por ele.
   *
   * @deprecated Use `registrarPagamentoPresencial`.
   */
  async processPayment(
    agendamento: Partial<Agendamento> | null,
    amount: number,
  ): Promise<PaymentResult> {
    return this.registrarPagamentoPresencial(agendamento, amount);
  }

  validateConfiguration(): PaymentValidation {
    return { isValid: true, errors: [] };
  }

  /**
   * Formata valor em centavos para exibição em BRL.
   */
  formatCurrency(amountInCents: number): string {
    const amount = amountInCents / 100;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  }

  /**
   * Converte valor em reais para centavos.
   */
  convertToCents(amountInReais: number): number {
    return Math.round(amountInReais * 100);
  }
}

export default new PaymentService();
