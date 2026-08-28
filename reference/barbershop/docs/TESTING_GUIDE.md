# Guia de testes

Este é o guia vigente. Firebase CLI e Detox CLI são dependências de desenvolvimento do projeto; não instale ferramentas globais apenas para executar estes comandos.

## Camadas e comandos

| Camada | Local | Comando |
| --- | --- | --- |
| Unitários/componentes | `__tests__/` | `npm test` |
| Cobertura/CI | `__tests__/` | `npm run test:ci` |
| Regras Firestore | `rules/` | `npm run test:rules` |
| E2E | `e2e/` | `npm run e2e:android` |

O Jest ignora `e2e/` e aplica meta global de 70% para branches, funções, linhas e statements.

## Preparação

```powershell
npm ci
npm run emulators
```

Para verificações locais:

```powershell
npx tsc --noEmit
npm run lint
npm test -- --ci --runInBand
npm run test:rules
npm run e2e:seed
```

## Detox

No Android, com um AVD disponível:

```powershell
npx detox build --configuration android.emu.debug
npm run e2e:android
```

No macOS, para iOS:

```sh
npx detox build --configuration ios.sim.debug
npx detox test --configuration ios.sim.debug
```

### Isolamento do E2E

`npm run e2e:seed` apaga e recria as fixtures `cliente@teste.com` e `barbeiro@teste.com` exclusivamente nos emuladores locais. O script recusa hosts não locais ou ausentes. `npm run e2e:android` executa o mesmo seed dentro de `firebase emulators:exec`; assim, não há dependência de contas ou dados de produção. Para adotar no CI, forneça o AVD/SDK Android e faça o build Detox antes do comando.

## Regras de qualidade

- Use apenas dados fictícios e não inclua PII em fixtures, snapshots ou logs.
- Trate uma falha de regra entre tenants como crítica; não relaxe regras para fazer testes passarem.
- Inclua estados de carregamento, vazio, erro, sucesso e autorização negada.
- Não declare teste executado sem rodar o comando e registrar o resultado.

<!-- Conteúdo anterior preservado como histórico; não é instrução operacional.

# Estado anterior dos testes E2E

Os testes Detox presentes em `e2e/` assumem contas (`cliente@teste.com`, `barbeiro@teste.com`) e dados já existentes. Como ainda não há Firebase Emulator Suite em `firebase.json`, eles não são isolados nem seguros para executar contra produção. A prioridade é configurar emuladores, seed/reset e conexão condicional em builds de teste. Veja [RELATORIOS.md](RELATORIOS.md).

# Guia de Testes - Barbershop App

## Visão Geral

Este documento descreve a estratégia de testes implementada no aplicativo Barbershop, incluindo testes unitários, de integração e end-to-end (E2E).

## Estrutura de Testes

### 1. Testes Unitários (`__tests__/`)

Testam componentes e funções isoladamente:

- **Componentes**: `RatingComponent.test.js`
- **Serviços**: `WhatsAppService.test.js`
- **Telas**: `LoginScreen.test.js`
- **Hooks**: `useOptimizedFetch.test.js`

### 2. Testes E2E (`e2e/`)

Testam fluxos completos do usuário:

- **Login**: `login.test.js`
- **Agendamento**: `agendamento.test.js`

## Configuração

### Dependências de Teste

```bash
# Testes unitários
npm install --save-dev @testing-library/react-native @testing-library/jest-native

# Testes E2E
npm install --save-dev detox detox-cli
```

### Configuração Jest

O arquivo `jest.config.js` está configurado com:

- Preset React Native
- Setup files para mocks
- Transformações para módulos
- Cobertura de código (70% mínimo)

### Configuração Detox

O arquivo `.detoxrc.js` configura:

- Builds para iOS e Android
- Simuladores/emuladores
- Configurações de teste

## Executando Testes

### Testes Unitários

```bash
# Executar todos os testes
npm test

# Executar em modo watch
npm run test:watch

# Executar com cobertura
npm run test:coverage

# Executar para CI
npm run test:ci
```

### Testes E2E

```bash
# Instalar Detox CLI globalmente
npm install -g detox-cli

# Build do app para testes
detox build --configuration android.emu.debug

# Executar testes E2E
detox test --configuration android.emu.debug
```

## Mocks Implementados

### React Native

- `Alert.alert`
- `Linking.canOpenURL` e `Linking.openURL`
- `Platform.OS`

### Firebase

- Auth methods
- Firestore methods
- Messaging

### Stripe

- `initStripe`
- `presentPaymentSheet`
- `initPaymentSheet`

### AsyncStorage

- `getItem`, `setItem`, `removeItem`
- `getAllKeys`, `multiRemove`

## Estratégias de Teste

### 1. Testes de Componentes

```javascript
// Exemplo: Testando renderização
it('should render correctly when visible', () => {
  const { getByText } = render(
    <RatingComponent visible={true} agendamento={mockAgendamento} />
  );
  expect(getByText('Avaliar Atendimento')).toBeTruthy();
});

// Exemplo: Testando interações
it('should call onClose when cancel button is pressed', () => {
  const mockOnClose = jest.fn();
  const { getByText } = render(
    <RatingComponent onClose={mockOnClose} />
  );
  fireEvent.press(getByText('Cancelar'));
  expect(mockOnClose).toHaveBeenCalled();
});
```

### 2. Testes de Serviços

```javascript
// Exemplo: Testando formatação
it('should format Brazilian phone number correctly', () => {
  const formatted = WhatsAppService.formatPhoneNumber('11999999999');
  expect(formatted).toBe('5511999999999');
});

// Exemplo: Testando geração de mensagens
it('should generate correct appointment message', () => {
  const mensagem = WhatsAppService.gerarMensagemAgendamento(
    barbeiro, cliente, data, horario
  );
  expect(mensagem).toContain('João Silva');
  expect(mensagem).toContain('2024-01-15');
});
```

### 3. Testes de Hooks

```javascript
// Exemplo: Testando hook customizado
it('should fetch data successfully', async () => {
  const testData = { id: 1, name: 'Test' };
  mockFetchFunction.mockResolvedValue(testData);

  const { result, waitForNextUpdate } = renderHook(() =>
    useOptimizedFetch(mockFetchFunction, cacheKey)
  );

  await waitForNextUpdate();
  expect(result.current.data).toEqual(testData);
});
```

### 4. Testes E2E

```javascript
// Exemplo: Testando fluxo de login
it('should show login screen on app launch', async () => {
  await expect(element(by.text('Barbershop'))).toBeVisible();
  await expect(element(by.id('email-input'))).toBeVisible();
});

// Exemplo: Testando navegação
it('should navigate to agendamento screen', async () => {
  await element(by.id('agendar-button')).tap();
  await waitFor(element(by.text('Novo Agendamento')))
    .toBeVisible()
    .withTimeout(3000);
});
```

## Cobertura de Código

### Métricas Configuradas

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

### Relatório de Cobertura

```bash
npm run test:coverage
```

Gera relatório em `coverage/lcov-report/index.html`

## Boas Práticas

### 1. Nomenclatura

- Arquivos de teste: `*.test.js`
- Describe blocks: Descrever o que está sendo testado
- Test cases: Usar "should" para descrever comportamento esperado

### 2. Estrutura de Testes

```javascript
describe('ComponentName', () => {
  beforeEach(() => {
    // Setup comum
  });

  it('should do something specific', () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### 3. Mocks

- Sempre limpar mocks entre testes
- Usar mocks específicos para cada teste
- Verificar se mocks foram chamados corretamente

### 4. Async Testing

```javascript
// Para operações assíncronas
it('should handle async operations', async () => {
  const { result, waitForNextUpdate } = renderHook(() => useAsyncHook());
  
  await waitForNextUpdate();
  
  expect(result.current.data).toBeDefined();
});
```

## Debugging de Testes

### 1. Logs

```javascript
// Adicionar logs temporários
console.log('Debug:', result.current);
```

### 2. Snapshot Testing

```javascript
// Para componentes visuais
expect(component).toMatchSnapshot();
```

### 3. Queries de Debug

```javascript
// Para encontrar elementos
const { debug } = render(<Component />);
debug(); // Mostra a árvore de elementos
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run tests
  run: npm run test:ci

- name: Upload coverage
  uses: codecov/codecov-action@v1
  with:
    file: ./coverage/lcov.info
```

### Scripts de Build

```bash
# Verificar testes antes do build
npm run test:ci && npm run build
```

## Próximos Passos

1. **Aumentar cobertura**: Adicionar mais testes unitários
2. **Performance testing**: Testes de performance com Flipper
3. **Visual regression**: Testes de regressão visual
4. **Accessibility testing**: Testes de acessibilidade
5. **Load testing**: Testes de carga para APIs

## Recursos Úteis

- [Testing Library Docs](https://testing-library.com/docs/react-native-testing-library/intro)
- [Detox Documentation](https://github.com/wix/Detox)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Native Testing](https://reactnative.dev/docs/testing-overview)
-->
