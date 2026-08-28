import { device, expect, element, by, waitFor } from 'detox';

/**
 * Fluxo de login — realinhado com o estado atual das telas (auditoria
 * técnica, onda "Testes críticos"). Mudanças relevantes desde a versão
 * anterior deste arquivo:
 *
 *  - O app não abre mais direto no Login: a primeira tela para quem não está
 *    logado é `WelcomeScreen` ("BARBERSHOP" + botão "Entrar" — ver
 *    `src/services/SessaoService.ts#rotaInicialParaUsuario`, que devolve
 *    'Welcome' quando não há usuário restaurado).
 *  - `LoginScreen.tsx` NÃO tem `testID` nos campos (só `accessibilityLabel`):
 *    "Campo de email", "Campo de senha", "Entrar no aplicativo" — os
 *    `by.id('email-input')`/`by.id('password-input')`/`by.id('login-button')`
 *    antigos não existem mais no código-fonte. Usamos `by.label()`
 *    (accessibilityLabel) em vez de `by.id()` aqui só porque a tela não
 *    expõe `testID` nesses campos — se algum dia ganhar `testID`, trocar
 *    para `by.id()` é preferível (mais estável que texto/label).
 *  - O barbeiro não cai mais em "Painel do Barbeiro" (texto que não existe
 *    mais em nenhuma tela) — a aba inicial do barbeiro é "Início"
 *    (`InicioScreen.tsx`), com a saudação `Olá, {primeiroNome} 👋`. O seed
 *    (`functions/scripts/seed-detox-emulator.js`) cria o barbeiro com
 *    `displayName: 'Barbeiro Detox'`, então o primeiro nome é sempre
 *    "Barbeiro" — usado abaixo como texto estável de destino pós-login.
 *
 * Dados usados (ver `functions/scripts/seed-detox-emulator.js`, disparado
 * por `npm run e2e:seed`/`npm run e2e:android` antes da suíte):
 *   cliente@teste.com / 123456   (uid e2e-cliente, emailVerified: true)
 *   barbeiro@teste.com / 123456  (uid e2e-barbeiro, emailVerified: true)
 */
describe('Login Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    // Remove sessao persistida entre cenarios: cada teste parte do seed local.
    await device.launchApp({ newInstance: true, delete: true });
  });

  /** Sai da tela de boas-vindas e chega no formulário de login. */
  const irParaLogin = async () => {
    await expect(element(by.text('BARBERSHOP'))).toBeVisible();
    await element(by.label('Ir para tela de login')).tap();
    await waitFor(element(by.text('Bem-vindo\nde volta.')))
      .toBeVisible()
      .withTimeout(5000);
  };

  it('should show the welcome screen on app launch', async () => {
    await expect(element(by.text('BARBERSHOP'))).toBeVisible();
    await expect(element(by.label('Ir para tela de login'))).toBeVisible();
    await expect(element(by.label('Ir para tela de cadastro'))).toBeVisible();
  });

  it('should navigate to the login form and show its fields', async () => {
    await irParaLogin();
    await expect(element(by.label('Campo de email'))).toBeVisible();
    await expect(element(by.label('Campo de senha'))).toBeVisible();
    await expect(element(by.label('Entrar no aplicativo'))).toBeVisible();
  });

  it('should show validation errors for invalid inputs', async () => {
    await irParaLogin();
    await element(by.label('Campo de email')).typeText('invalid-email');
    await element(by.label('Campo de senha')).typeText('123');
    await element(by.label('Entrar no aplicativo')).tap();

    await expect(element(by.text('⚠ Email inválido'))).toBeVisible();
    await expect(element(by.text('⚠ Mínimo 6 caracteres'))).toBeVisible();
  });

  it('should navigate to cliente home for cliente credentials', async () => {
    await irParaLogin();
    await element(by.label('Campo de email')).typeText('cliente@teste.com');
    await element(by.label('Campo de senha')).typeText('123456');
    await element(by.label('Entrar no aplicativo')).tap();

    // "Barbeiros Disponíveis" é o título da aba inicial do cliente
    // (ClienteHome, dentro de ClienteTabs) — ver __tests__/screens/ClienteHome.test.tsx.
    await waitFor(element(by.text('Barbeiros Disponíveis')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should navigate to barbeiro home for barbeiro credentials', async () => {
    await irParaLogin();
    await element(by.label('Campo de email')).typeText('barbeiro@teste.com');
    await element(by.label('Campo de senha')).typeText('123456');
    await element(by.label('Entrar no aplicativo')).tap();

    // Aba inicial do barbeiro é "Início" (InicioScreen), não mais "Agenda" —
    // a saudação usa o primeiro nome do perfil seedado ("Barbeiro Detox").
    await waitFor(element(by.text('Olá, Barbeiro 👋')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
