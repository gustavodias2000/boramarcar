/**
 * PERF-002 (auditoria, onda 4) — `NotificationService` é um singleton
 * (`export default new NotificationService()`), e `init()` era chamado a
 * cada MONTAGEM de `ClienteHome.tsx` (não uma vez por vida do processo).
 * Logout + login de novo na mesma sessão do app remonta `ClienteHome` e
 * chama `init()` outra vez no mesmo singleton, registrando um SEGUNDO
 * `onMessage`/`onTokenRefresh` sem nunca remover o primeiro — uma
 * notificação em foreground disparava `Alert.alert` uma vez por listener
 * acumulado.
 *
 * Mock manual de `@react-native-firebase/messaging` (sobrepõe, só neste
 * arquivo, o mock global de `jest.setup.js`) — dá controle direto sobre
 * quantas vezes cada `on*` foi registrado e permite capturar/invocar os
 * callbacks para simular uma notificação chegando.
 *
 * IMPORTANTE sobre a estrutura desta suíte: os testes abaixo são
 * INTENCIONALMENTE dependentes de ordem (não é um anti-padrão aqui, é o
 * próprio objeto do teste). `NotificationService` é importado UMA vez no
 * topo do arquivo — a MESMA instância singleton é reutilizada em todos os
 * `it()`, exatamente como no app real (um processo, um singleton, várias
 * chamadas de `init()` ao longo da sessão). `jest.clearAllMocks()` no
 * `beforeEach` zera as CONTAGENS de chamadas dos mocks (para poder assertar
 * cada teste isoladamente), mas não reseta o estado interno do singleton
 * (`_inicializado`) — só um reinício real do processo faria isso, e é
 * exatamente esse comportamento que está sendo testado.
 */
import { Alert } from 'react-native';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth } from '../../firebaseConfig';
import { saveFcmToken } from '../../src/data/repositories/UsuarioRepository';
import messagingImport from '@react-native-firebase/messaging';
import NotificationService from '../../src/services/NotificationService';
import { navigationRef } from '../../App';

jest.mock('@react-native-firebase/messaging', () => {
  const messagingInstance = {
    requestPermission: jest.fn(() => Promise.resolve(1)),
    getToken: jest.fn(() => Promise.resolve('token-do-aparelho')),
    onMessage: jest.fn(),
    onTokenRefresh: jest.fn(),
    onNotificationOpenedApp: jest.fn(),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
  };
  const messagingFn = () => messagingInstance;
  messagingFn.AuthorizationStatus = { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 };
  return { __esModule: true, default: messagingFn };
});

jest.mock('../../src/data/repositories/UsuarioRepository', () => ({
  saveFcmToken: jest.fn().mockResolvedValue(undefined),
}));

// `NotificationService` importa `navigationRef` de `App.tsx` (ver
// `_handleNotificationNavigation`) só para poder navegar a partir de um
// toque em notificação, fora da árvore de componentes. Mockado aqui para
// não arrastar a árvore de import inteira do App (todas as telas) para
// dentro deste teste de unidade — só o formato do ref importa.
jest.mock('../../App', () => ({
  navigationRef: {
    isReady: jest.fn(() => true),
    navigate: jest.fn(),
  },
}));

const messaging = messagingImport as unknown as (() => {
  requestPermission: jest.Mock;
  getToken: jest.Mock;
  onMessage: jest.Mock;
  onTokenRefresh: jest.Mock;
  onNotificationOpenedApp: jest.Mock;
  getInitialNotification: jest.Mock;
}) & { AuthorizationStatus: Record<string, number> };
const mockedSaveFcmToken = saveFcmToken as jest.Mock;

const mockedDoc = doc as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedNavigate = navigationRef.navigate as jest.Mock;
const mockedIsReady = navigationRef.isReady as jest.Mock;

// `_setupBackgroundListeners()` roda uma ÚNICA vez, no construtor, na
// importação do módulo lá em cima (antes de qualquer `beforeEach` ter
// rodado) — captura o callback registrado AGORA, antes do 1º
// `jest.clearAllMocks()` apagar `.mock.calls`. É o único jeito de simular um
// toque em notificação nos testes de navegação mais abaixo, já que `init()`
// não re-registra este listener (não é ele quem `init()` controla).
const onNotificationOpenedAppCallback = messaging().onNotificationOpenedApp.mock
  .calls[0][0] as (msg: { data?: Record<string, string> }) => void;

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'test-uid', email: 'test@example.com' };
  jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  // `doc(db, 'usuarios', uid, 'tokens', token)` — devolve um objeto opaco
  // identificável pelo path só para permitir assertar QUAL doc o
  // `deleteDoc` de `desregistrarDispositivoAtual()` tentou apagar.
  mockedDoc.mockImplementation((_db: unknown, ...partes: string[]) => ({
    path: partes.join('/'),
  }));
  mockedDeleteDoc.mockResolvedValue(undefined);
  mockedIsReady.mockReturnValue(true);
});

// Capturados como `let` no escopo do MÓDULO (não de um único describe) —
// registrados uma única vez, na 1ª chamada de `init()` (primeiro teste do
// describe abaixo), e reaproveitados pelos describes de Onda C mais adiante
// (mesmo singleton, mesmo processo, ver cabeçalho do arquivo).
let onMessageCallback: (msg: unknown) => void;
let onTokenRefreshCallback: (token: string) => void;

describe('NotificationService — init() idempotente por processo, não por sessão de usuário (PERF-002)', () => {
  it('1ª chamada de init(): pede permissão, salva o token do usuário logado e registra os listeners', async () => {
    const habilitado = await NotificationService.init();

    expect(habilitado).toBe(true);
    expect(messaging().requestPermission).toHaveBeenCalledTimes(1);
    expect(messaging().onMessage).toHaveBeenCalledTimes(1);
    expect(messaging().onTokenRefresh).toHaveBeenCalledTimes(1);
    expect(mockedSaveFcmToken).toHaveBeenCalledWith('test-uid', 'token-do-aparelho');

    onMessageCallback = messaging().onMessage.mock.calls[0][0];
    onTokenRefreshCallback = messaging().onTokenRefresh.mock.calls[0][0];
    expect(typeof onMessageCallback).toBe('function');
    expect(typeof onTokenRefreshCallback).toBe('function');
  });

  it('2ª chamada de init() (ex.: logout + login de novo na mesma sessão do app) não repete requestPermission nem registra um segundo listener', async () => {
    const habilitado = await NotificationService.init();

    expect(habilitado).toBe(true);
    expect(messaging().requestPermission).not.toHaveBeenCalled();
    expect(messaging().onMessage).not.toHaveBeenCalled();
    expect(messaging().onTokenRefresh).not.toHaveBeenCalled();
  });

  it('a 2ª chamada de init() ainda salva o token do aparelho no perfil do usuário ATUALMENTE logado, mesmo sendo outro usuário', async () => {
    // Sem isso, um segundo usuário que loga na mesma sessão (sem reiniciar
    // o processo) nunca teria `fcmToken` salvo no próprio perfil — o
    // listener de refresh só dispara quando o FCM decide girar o token do
    // aparelho, o que pode não acontecer durante a sessão inteira.
    (auth as any).currentUser = { uid: 'segundo-usuario', email: 'b@teste.com' };

    await NotificationService.init();

    expect(mockedSaveFcmToken).toHaveBeenCalledWith('segundo-usuario', 'token-do-aparelho');
    // E continua sem registrar um listener novo.
    expect(messaging().onMessage).not.toHaveBeenCalled();
    expect(messaging().onTokenRefresh).not.toHaveBeenCalled();
  });

  it('uma notificação em foreground dispara Alert.alert só uma vez — o callback é o mesmo capturado na 1ª chamada, nunca duplicado', async () => {
    await onMessageCallback({
      notification: { title: 'Novo agendamento', body: 'Você tem um agendamento novo' },
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('Novo agendamento', 'Você tem um agendamento novo');
  });

  it('o listener de refresh de token único associa o token ao usuário logado NO MOMENTO do evento, não no momento do registro', async () => {
    // Simula: login → logout → login de um TERCEIRO usuário, tudo depois de
    // o listener já ter sido registrado (na 1ª chamada de init()) — prova
    // que não é preciso registrar um listener por usuário para o token
    // continuar sendo associado à conta certa.
    (auth as any).currentUser = { uid: 'terceiro-usuario', email: 'c@teste.com' };

    await onTokenRefreshCallback('token-novo-apos-rotacao');

    expect(mockedSaveFcmToken).toHaveBeenCalledTimes(1);
    expect(mockedSaveFcmToken).toHaveBeenCalledWith('terceiro-usuario', 'token-novo-apos-rotacao');
  });

  it('refresh do MESMO token (tokenId reaproveitado) aciona saveFcmToken de novo — a garantia de que isso não duplica o doc na subcoleção (merge por tokenId) é do UsuarioRepository, ver __tests__/data/UsuarioRepository.test.ts', async () => {
    // `beforeEach` já restaurou auth.currentUser para 'test-uid'.
    await onTokenRefreshCallback('token-estavel');
    await onTokenRefreshCallback('token-estavel');

    expect(mockedSaveFcmToken).toHaveBeenCalledTimes(2);
    expect(mockedSaveFcmToken).toHaveBeenNthCalledWith(1, 'test-uid', 'token-estavel');
    expect(mockedSaveFcmToken).toHaveBeenNthCalledWith(2, 'test-uid', 'token-estavel');
  });
});

describe('NotificationService — Onda C: multi-dispositivo (subcoleção usuarios/{uid}/tokens)', () => {
  it('duas "logins" com tokens diferentes (dois dispositivos) repassam CADA token ao UsuarioRepository, sem uma chamada sobrescrever a outra', async () => {
    // A garantia de que os dois tokens viram DOIS documentos distintos na
    // subcoleção (sem se sobrescreverem) é do UsuarioRepository — `tokenId`
    // é o próprio token, ver __tests__/data/UsuarioRepository.test.ts. A
    // garantia testada AQUI é a do NotificationService: cada chamada de
    // `getFCMToken()` (uma por dispositivo/processo obtendo o token do
    // aparelho) repassa o SEU PRÓPRIO token para `saveFcmToken`, nunca
    // reutilizando ou perdendo o token de uma chamada anterior.
    messaging().getToken.mockResolvedValueOnce('token-dispositivo-1');
    await NotificationService.getFCMToken();

    messaging().getToken.mockResolvedValueOnce('token-dispositivo-2');
    await NotificationService.getFCMToken();

    expect(mockedSaveFcmToken).toHaveBeenCalledTimes(2);
    expect(mockedSaveFcmToken).toHaveBeenNthCalledWith(1, 'test-uid', 'token-dispositivo-1');
    expect(mockedSaveFcmToken).toHaveBeenNthCalledWith(2, 'test-uid', 'token-dispositivo-2');
  });

  it('getFCMToken() com messaging().getToken() rejeitando não derruba init() (branch enabled=true, mas a obtenção do token falha)', async () => {
    messaging().getToken.mockRejectedValueOnce(new Error('falha nativa ao obter token'));

    // Singleton já inicializado (testes anteriores) — init() cai no branch
    // de chamada repetida, que ainda assim chama getFCMToken() de novo (ver
    // comentário do próprio init()). getFCMToken() engole o erro e devolve
    // null; init() continua resolvendo `true` normalmente.
    await expect(NotificationService.init()).resolves.toBe(true);
    expect(mockedSaveFcmToken).not.toHaveBeenCalled();
  });
});

describe('NotificationService — navegação ao tocar em notificação (Onda C)', () => {
  // Os 4 valores abaixo são os literais REAIS de `EventoNotificacao`
  // (src/types.ts), gravados em `data.type` por
  // `notificationOrchestrator.js#processarCanalParaDestinatario`
  // (`{ type: evento, agendamentoId }`) — não nomes inventados. Um achado da
  // revisão independente: a versão anterior deste teste verificava
  // 'novo_agendamento', uma string que o backend NUNCA envia (o evento real
  // é 'agendamento_criado') — o teste passava, mas testava um contrato que
  // não existe, mascarando que o toque na notificação de novo agendamento
  // não navegava para lugar nenhum em produção.
  it('data.type === "agendamento_confirmado" navega para "Historico" (cliente)', () => {
    onNotificationOpenedAppCallback({ data: { type: 'agendamento_confirmado' } });

    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith('Historico');
  });

  it('data.type === "agendamento_cancelado_profissional" navega para "Historico" (cliente foi avisado do cancelamento)', () => {
    onNotificationOpenedAppCallback({ data: { type: 'agendamento_cancelado_profissional' } });

    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith('Historico');
  });

  it('data.type === "agendamento_criado" navega para a aba Agenda dentro do stack Barbeiro (profissional)', () => {
    onNotificationOpenedAppCallback({ data: { type: 'agendamento_criado' } });

    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith('Barbeiro', { screen: 'Agenda' });
  });

  it('data.type === "agendamento_cancelado_cliente" navega para a aba Agenda (profissional/dono foi avisado do cancelamento)', () => {
    onNotificationOpenedAppCallback({ data: { type: 'agendamento_cancelado_cliente' } });

    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith('Barbeiro', { screen: 'Agenda' });
  });

  it('data.type desconhecido (payload legado ou de outro evento) não navega para lugar nenhum', () => {
    onNotificationOpenedAppCallback({ data: { type: 'evento_futuro_desconhecido' } });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it('não navega quando o NavigationContainer ainda não está pronto (app aberto via notificação em quit state, antes do container montar)', () => {
    mockedIsReady.mockReturnValue(false);

    onNotificationOpenedAppCallback({ data: { type: 'agendamento_confirmado' } });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it('NÃO valida a propriedade do agendamento — a navegação acontece do mesmo jeito independente de quem é o dono real do evento', () => {
    // Autorização de quem pode VER o agendamento é responsabilidade da
    // TELA de destino (HistoricoScreen/BarbeiroHome filtram por
    // auth.currentUser/dono ao carregar os dados), nunca deste serviço.
    // Este teste prova isso: mesmo com campos extras do payload apontando
    // para OUTRO usuário (clienteUid/barbeiroId alheios), a decisão de tela
    // usa só `data.type` — o pior caso é abrir uma tela vazia para o
    // usuário atual, nunca vazar dado de outra conta.
    onNotificationOpenedAppCallback({
      data: {
        type: 'agendamento_confirmado',
        clienteUid: 'uid-de-outro-usuario-completamente-diferente',
        barbeiroId: 'barbeiro-que-nao-tem-nada-a-ver-com-quem-esta-logado',
      },
    });

    expect(mockedNavigate).toHaveBeenCalledWith('Historico');
  });
});

describe('NotificationService — desregistrarDispositivoAtual() (logout, Onda C)', () => {
  it('apaga o doc do token ATUAL em usuarios/{uid}/tokens/{token}', async () => {
    messaging().getToken.mockResolvedValueOnce('token-para-apagar');
    await NotificationService.getFCMToken(); // define _ultimoToken internamente

    await NotificationService.desregistrarDispositivoAtual();

    expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockedDoc).toHaveBeenCalledWith(
      expect.anything(),
      'usuarios',
      'test-uid',
      'tokens',
      'token-para-apagar',
    );
  });

  it('é no-op silencioso quando este processo nunca obteve um token — não lança erro', async () => {
    (NotificationService as any)._ultimoToken = null;

    await expect(NotificationService.desregistrarDispositivoAtual()).resolves.toBeUndefined();
    expect(mockedDeleteDoc).not.toHaveBeenCalled();
    expect(mockedDoc).not.toHaveBeenCalled();
  });

  it('apaga só o token do dispositivo ATUAL — não afeta outros tokens do mesmo usuário', async () => {
    // Simula dois dispositivos do mesmo usuário: o 1º token obtido
    // representa um aparelho que continua logado em outro lugar (o
    // documento dele no Firestore precisa continuar de pé); o 2º é o do
    // dispositivo que está encerrando a sessão AGORA.
    messaging().getToken.mockResolvedValueOnce('token-outro-aparelho');
    await NotificationService.getFCMToken();
    messaging().getToken.mockResolvedValueOnce('token-deste-aparelho');
    await NotificationService.getFCMToken();

    await NotificationService.desregistrarDispositivoAtual();

    expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockedDoc).toHaveBeenCalledWith(
      expect.anything(),
      'usuarios',
      'test-uid',
      'tokens',
      'token-deste-aparelho',
    );
    expect(mockedDoc).not.toHaveBeenCalledWith(
      expect.anything(),
      'usuarios',
      'test-uid',
      'tokens',
      'token-outro-aparelho',
    );
  });
});

describe('NotificationService — permissão negada (DENIED)', () => {
  it('init() retorna false, nenhum listener adicional é registrado e nenhum token é gravado (nem legado nem subcoleção) quando o processo ainda não tinha permissão', async () => {
    // Reflete o estado de um processo "fresco": diferente do resto do
    // arquivo (que reaproveita deliberadamente o mesmo singleton, ver
    // cabeçalho), este teste simula explicitamente `_inicializado = false`
    // porque é a ÚNICA forma de exercitar o branch de permissão negada —
    // uma vez concedida (testes anteriores), `init()` nunca volta a pedir
    // permissão de novo no mesmo processo real, e não há como reiniciar o
    // processo Node no meio da suíte. É o último describe do arquivo de
    // propósito: deixa `_inicializado` em `false` ao final, sem precisar
    // restaurar para nenhum teste seguinte.
    (NotificationService as any)._inicializado = false;
    messaging().requestPermission.mockResolvedValueOnce(messaging.AuthorizationStatus.DENIED);

    const habilitado = await NotificationService.init();

    expect(habilitado).toBe(false);
    expect(messaging().onMessage).not.toHaveBeenCalled();
    expect(messaging().onTokenRefresh).not.toHaveBeenCalled();
    expect(mockedSaveFcmToken).not.toHaveBeenCalled();
    expect(mockedDoc).not.toHaveBeenCalled();
    expect(mockedDeleteDoc).not.toHaveBeenCalled();
  });
});
