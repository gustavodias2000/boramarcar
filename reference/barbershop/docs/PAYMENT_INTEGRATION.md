# ATENÇÃO: este documento foi substituído

O código atual **não processa pagamentos online**. `PaymentService` apenas calcula/formata valores e registra pagamento `presential`; `PaymentModal` confirma o agendamento e informa que o cliente paga no local. Não existem Stripe, Payment Intents, PIX online, webhooks, reembolso ou conciliação neste repositório. O restante deste arquivo é uma proposta histórica, não uma documentação de funcionalidade entregue.

Uma futura integração precisa de backend confiável, webhooks assinados, idempotência, estados de pagamento, cancelamento/reembolso, LGPD e testes em sandbox. Nunca colocar chaves secretas no app.

# Integração de Pagamentos - Barbershop App

## Visão Geral

O aplicativo Barbershop implementa um sistema completo de pagamentos usando Stripe, permitindo que clientes paguem por agendamentos de forma segura e conveniente.

## Arquitetura do Sistema

### Componentes Principais

1. **PaymentService** - Serviço principal para processamento de pagamentos
2. **PaymentModal** - Modal para seleção de método de pagamento
3. **PaymentScreen** - Tela dedicada para finalização de pagamentos
4. **Backend Integration** - APIs para criação de Payment Intents

## Configuração do Stripe

### 1. Conta Stripe

1. Criar conta em [stripe.com](https://stripe.com)
2. Obter chaves de API (Publishable Key e Secret Key)
3. Configurar webhook endpoints (opcional)

### 2. Configuração no App

```javascript
// src/services/PaymentService.js
class PaymentService {
  constructor() {
    this.publishableKey = 'pk_test_YOUR_STRIPE_PUBLISHABLE_KEY_HERE';
    this.serverUrl = 'https://your-backend-url.com';
  }
}
```

### 3. Inicialização

```javascript
await PaymentService.initialize();
```

## Fluxo de Pagamento

### 1. Criação do Agendamento

```javascript
// Cliente seleciona barbeiro, data e horário
const agendamento = {
  barbeiroId: 'barbeiro-1',
  cliente: 'cliente@email.com',
  data: '2024-01-15',
  horario: '14:00',
  preco: '25,00'
};

// Salvar no Firestore
await addDoc(collection(db, 'agendamentos'), agendamento);
```

### 2. Apresentação do Modal de Pagamento

```javascript
// Mostrar modal após criação do agendamento
setShowPaymentModal(true);
```

### 3. Processamento do Pagamento

```javascript
const result = await PaymentService.processPayment(agendamento, precoEmCentavos);

if (result.success) {
  // Pagamento aprovado
  await updateDoc(doc(db, 'agendamentos', agendamento.id), {
    status: 'pago',
    paymentIntentId: result.paymentIntentId,
    paidAt: new Date()
  });
}
```

## Backend Requirements

### 1. Endpoint para Payment Intent

```javascript
// POST /create-payment-intent
app.post('/create-payment-intent', async (req, res) => {
  const { amount, currency, metadata } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency || 'brl',
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.send({
      id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});
```

### 2. Endpoint para Reembolsos

```javascript
// POST /create-refund
app.post('/create-refund', async (req, res) => {
  const { payment_intent, amount, reason } = req.body;

  try {
    const refund = await stripe.refunds.create({
      payment_intent,
      amount,
      reason,
    });

    res.send(refund);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});
```

### 3. Webhooks (Opcional)

```javascript
// POST /webhook
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed.`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      // Atualizar status no banco de dados
      break;
    case 'payment_intent.payment_failed':
      // Lidar com falha no pagamento
      break;
  }

  res.json({received: true});
});
```

## Métodos de Pagamento Suportados

### 1. Cartão de Crédito/Débito

- Visa, Mastercard, American Express
- Validação automática de cartão
- Suporte a 3D Secure

### 2. PIX

- Pagamento instantâneo brasileiro
- QR Code ou código de pagamento
- Confirmação automática

### 3. Pagamento Presencial

- Opção para pagar no estabelecimento
- Dinheiro, cartão ou PIX no local
- Confirmação manual pelo barbeiro

## Segurança

### 1. Criptografia

- Dados do cartão nunca passam pelo app
- Comunicação HTTPS obrigatória
- Tokens seguros para transações

### 2. Validação

```javascript
const validation = PaymentService.validateConfiguration();

if (!validation.isValid) {
  // Mostrar erro de configuração
  console.error('Erros:', validation.errors);
}
```

### 3. Compliance

- PCI DSS compliance via Stripe
- LGPD compliance para dados brasileiros
- Auditoria de transações

## Tratamento de Erros

### 1. Erros de Configuração

```javascript
if (!this.publishableKey.includes('pk_')) {
  throw new Error('Chave Stripe inválida');
}
```

### 2. Erros de Pagamento

```javascript
if (paymentError) {
  if (paymentError.code === 'Canceled') {
    return { success: false, canceled: true };
  }
  throw new Error(paymentError.message);
}
```

### 3. Fallback para Pagamento Presencial

```javascript
if (!validation.isValid) {
  Alert.alert(
    'Configuração Incompleta',
    'Sistema de pagamentos não configurado',
    [
      {
        text: 'Pagar Presencialmente',
        onPress: () => handlePresentialPayment()
      }
    ]
  );
}
```

## Testes

### 1. Cartões de Teste

```javascript
// Cartões de teste do Stripe
const testCards = {
  visa: '4242424242424242',
  visaDebit: '4000056655665556',
  mastercard: '5555555555554444',
  declined: '4000000000000002'
};
```

### 2. Testes Unitários

```javascript
describe('PaymentService', () => {
  it('should convert reais to cents correctly', () => {
    const cents = PaymentService.convertToCents(25.50);
    expect(cents).toBe(2550);
  });

  it('should format currency correctly', () => {
    const formatted = PaymentService.formatCurrency(2550);
    expect(formatted).toBe('R$ 25,50');
  });
});
```

### 3. Testes E2E

```javascript
it('should complete payment flow', async () => {
  await element(by.id('agendar-button')).tap();
  await element(by.id('confirm-button')).tap();
  await element(by.id('pay-button')).tap();
  
  await waitFor(element(by.text('Pagamento Realizado!')))
    .toBeVisible()
    .withTimeout(10000);
});
```

## Monitoramento

### 1. Métricas de Pagamento

- Taxa de conversão
- Valor médio por transação
- Métodos de pagamento preferidos
- Taxa de abandono

### 2. Logs

```javascript
console.log('Payment processed:', {
  agendamentoId: agendamento.id,
  amount: result.amount,
  paymentIntentId: result.paymentIntentId,
  timestamp: new Date()
});
```

### 3. Alertas

- Falhas de pagamento
- Configuração incorreta
- Problemas de conectividade

## Reembolsos

### 1. Processo de Reembolso

```javascript
const refundResult = await PaymentService.requestRefund(
  paymentIntentId,
  amount,
  'requested_by_customer'
);
```

### 2. Políticas

- Reembolso total até 24h antes
- Reembolso parcial até 2h antes
- Sem reembolso após início do atendimento

### 3. Notificações

- Email automático para cliente
- Notificação push no app
- Atualização do status no Firestore

## Relatórios Financeiros

### 1. Dashboard do Barbeiro

- Faturamento diário/mensal
- Comissões do Stripe
- Agendamentos pagos vs. presenciais

### 2. Exportação de Dados

```javascript
const generateFinancialReport = async (startDate, endDate) => {
  const payments = await getPaymentsByDateRange(startDate, endDate);
  return {
    totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
    transactionCount: payments.length,
    averageTicket: totalRevenue / transactionCount
  };
};
```

## Próximos Passos

1. **Apple Pay/Google Pay**: Implementar pagamentos nativos
2. **Assinaturas**: Sistema de planos mensais
3. **Carteira Digital**: Créditos pré-pagos
4. **Programa de Fidelidade**: Pontos e descontos
5. **Split Payment**: Divisão entre barbeiros

## Recursos Úteis

- [Stripe React Native Docs](https://stripe.com/docs/payments/accept-a-payment?platform=react-native)
- [Stripe Testing](https://stripe.com/docs/testing)
- [PIX Integration](https://stripe.com/docs/payments/pix)
- [Webhook Guide](https://stripe.com/docs/webhooks)
