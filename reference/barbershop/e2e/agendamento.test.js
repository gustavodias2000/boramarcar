import { device, expect, element, by, waitFor } from 'detox';

/**
 * Fluxo de agendamento do cliente — realinhado com o estado atual das telas
 * (auditoria técnica, onda "Testes críticos"). Mudanças relevantes desde a
 * versão anterior deste arquivo:
 *
 *  - O card de barbeiro na Home NÃO tem mais um botão "Agendar" direto
 *    (`testID="agendar-button"` não existe mais). O fluxo atual é
 *    ClienteHome → "Ver perfil" (`testID="ver-perfil-button"`) →
 *    `PerfilProfissionalScreen` (lista de serviços) → tocar num serviço →
 *    `AgendamentoScreen`, já com o serviço pré-selecionado (ver comentário em
 *    `src/screens/AgendamentoScreen.tsx` sobre `servicoPreSelecionado`).
 *  - `AgendamentoScreen` mantém os `testID`s usados aqui:
 *    `date-button`, `time-button`, `confirm-button` (ver
 *    `__tests__/screens/AgendamentoScreen.test.tsx`, a suíte unitária desta
 *    mesma onda).
 *  - O modal de confirmação (`PaymentModal`) mostra "Resumo do agendamento" e
 *    um botão de texto "Confirmar agendamento" (minúsculo) — diferente do
 *    texto "Confirmar Agendamento" (maiúsculo) do botão da própria
 *    `AgendamentoScreen`; o app não cobra nada, é só uma confirmação antes de
 *    reservar o horário (ver comentário no topo de `PaymentModal.tsx`).
 *  - A tela final mostra "Agendamento confirmado!" (`AgendamentoConfirmadoScreen`),
 *    não mais "Confirmar Pagamento".
 *  - A aba "Meus Horários" (não uma rota de stack separada chamada
 *    "Histórico") é onde o cliente vê os agendamentos feitos — ver
 *    `src/navigation/ClienteTabs.tsx`.
 *
 * Dados usados pelo seed (`functions/scripts/seed-detox-emulator.js`,
 * disparado por `npm run e2e:seed`/`npm run e2e:android` antes da suíte):
 * um único barbeiro ("Barbeiro Detox") com um único serviço ("Corte Detox",
 * 30 min, R$ 45,00), agenda 09:00–18:00 todos os dias, sem antecedência
 * mínima — sempre há horário disponível hoje.
 */
describe('Agendamento Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    // Remove sessao persistida entre cenarios: cada teste parte do seed local.
    await device.launchApp({ newInstance: true, delete: true });

    // Login como cliente
    await element(by.label('Ir para tela de login')).tap();
    await waitFor(element(by.text('Bem-vindo\nde volta.')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.label('Campo de email')).typeText('cliente@teste.com');
    await element(by.label('Campo de senha')).typeText('123456');
    await element(by.label('Entrar no aplicativo')).tap();

    await waitFor(element(by.text('Barbeiros Disponíveis')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should show the seeded barbeiro on the cliente home', async () => {
    await expect(element(by.text('Barbeiros Disponíveis'))).toBeVisible();
    await expect(element(by.id('barbeiro-card')).atIndex(0)).toBeVisible();
    await expect(element(by.id('ver-perfil-button')).atIndex(0)).toBeVisible();
  });

  it('should open the barbeiro profile and list the seeded service', async () => {
    await element(by.id('ver-perfil-button')).atIndex(0).tap();

    await waitFor(element(by.id('perfil-profissional-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await expect(element(by.text('Serviços'))).toBeVisible();
    await expect(
      element(by.label('Agendar Corte Detox, 30 minutos, R$ 45,00')),
    ).toBeVisible();
  });

  it('should allow selecting date and time after choosing a service', async () => {
    await element(by.id('ver-perfil-button')).atIndex(0).tap();
    await waitFor(element(by.id('perfil-profissional-screen')))
      .toBeVisible()
      .withTimeout(5000);

    await element(by.label('Agendar Corte Detox, 30 minutos, R$ 45,00')).tap();

    // Serviço já vem pré-selecionado (veio da tela de perfil com servicoId) —
    // a etapa "Selecione o Serviço" não aparece.
    await waitFor(element(by.text('Novo Agendamento')))
      .toBeVisible()
      .withTimeout(5000);
    await expect(element(by.text('Selecione a Data'))).toBeVisible();

    await element(by.id('date-button')).atIndex(0).tap();

    await waitFor(element(by.text('Selecione o Horário')))
      .toBeVisible()
      .withTimeout(3000);

    await element(by.id('time-button')).atIndex(0).tap();

    await expect(element(by.text('Resumo do Agendamento'))).toBeVisible();
  });

  it('should confirm the agendamento, keep the session, and open Meus Horários', async () => {
    await element(by.id('ver-perfil-button')).atIndex(0).tap();
    await waitFor(element(by.id('perfil-profissional-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.label('Agendar Corte Detox, 30 minutos, R$ 45,00')).tap();

    await waitFor(element(by.text('Selecione a Data')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('date-button')).atIndex(0).tap();
    await waitFor(element(by.text('Selecione o Horário')))
      .toBeVisible()
      .withTimeout(3000);
    await element(by.id('time-button')).atIndex(0).tap();

    // Confirma na própria tela — abre o modal-resumo (o app não cobra nada,
    // ver PaymentModal.tsx).
    await element(by.id('confirm-button')).tap();
    await waitFor(element(by.text('Resumo do agendamento')))
      .toBeVisible()
      .withTimeout(5000);

    // Botão do MODAL: texto "Confirmar agendamento" em minúsculo — diferente
    // do botão da tela de trás ("Confirmar Agendamento", maiúsculo), que
    // continua presente por baixo do modal.
    await element(by.text('Confirmar agendamento')).tap();

    await waitFor(element(by.text('Agendamento confirmado!')))
      .toBeVisible()
      .withTimeout(10000);

    // A confirmação não oferece cancelamento: ele continua disponível apenas
    // no card da aba de horários.
    await expect(element(by.text('Cancelar Agendamento'))).not.toBeVisible();

    await element(by.label('Concluir')).tap();

    await waitFor(element(by.text('Meus Horários')))
      .toBeVisible()
      .withTimeout(10000);

    // O app continua na área autenticada e a lista recarregada mostra a
    // reserva recém-criada. O card também preserva o cancelamento do cliente.
    await expect(element(by.text('Barbeiro Detox'))).toBeVisible();
    await expect(element(by.text('Pendente'))).toBeVisible();
    await expect(element(by.label('Cancelar agendamento com Barbeiro Detox'))).toBeVisible();
    await expect(element(by.label('Ir para tela de login'))).not.toBeVisible();
  });
});
