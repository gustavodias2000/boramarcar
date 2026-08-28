import '@testing-library/jest-native/extend-expect';

// Reanimated (Fase 4 — design): setup oficial do próprio pacote, roda as
// worklets em modo síncrono durante os testes, sem precisar do thread nativo.
require('react-native-reanimated').setUpTests();

// react-native-haptic-feedback (Fase 4 — BotaoComEscala) é um turbo module
// nativo puro, sem build JS-only pra rodar fora de um device/emulador —
// mocka o `trigger` pra não derrubar qualquer teste que renderize um botão
// com `haptic`.
jest.mock('react-native-haptic-feedback', () => ({
  __esModule: true,
  default: { trigger: jest.fn() },
  trigger: jest.fn(),
}));

// NÃO mockar 'react-native' globalmente: no RN 0.80 o spread do módulo
// dispara todos os getters lazy e quebra o preset do Jest.
// Cada teste mocka apenas o que precisa (Alert, Linking etc.).
jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(jest.fn());

// Animated.timing/spring usam setTimeout REAIS por baixo — inclusive o
// `delay` de animações de entrada (ex.: LoginScreen). Esses timers não são
// cancelados quando o teste termina, e como o processo Jest às vezes roda
// vários arquivos de teste no mesmo processo Node (--runInBand ou poucos
// arquivos), um timer real agendado por um arquivo pode disparar durante a
// execução de outro arquivo — e travar/derrubar a suíte inteira quando cai
// em código de animação nativa (findNodeHandle) fora do ambiente de teste
// que o agendou. Torna as animações síncronas nos testes para eliminar
// esses timers "órfãos" de vez.
const RNAnimated = require('react-native').Animated;
const instantAnimation = (value, config) => ({
  start: (callback) => {
    if (typeof config?.toValue === 'number') value.setValue(config.toValue);
    callback && callback({ finished: true });
  },
  stop: () => {},
  reset: () => {},
});
jest.spyOn(RNAnimated, 'timing').mockImplementation(instantAnimation);
jest.spyOn(RNAnimated, 'spring').mockImplementation(instantAnimation);

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock Firebase (app local)
jest.mock('./firebaseConfig', () => ({
  auth: {
    currentUser: { uid: 'test-uid', email: 'test@example.com' },
    signOut: jest.fn(),
  },
  db: {},
  functions: {},
  storage: {},
}));

jest.mock('firebase/auth', () => ({
  // Persistência da sessão (firebaseConfig.ts): nos testes basta existir.
  initializeAuth: jest.fn(() => ({ languageCode: null })),
  getAuth: jest.fn(() => ({ languageCode: null })),
  getReactNativePersistence: jest.fn(() => ({})),
  connectAuthEmulator: jest.fn(),
  // Restauração da sessão: por padrão "ninguém logado", e devolve o
  // unsubscribe que o useSessaoRestaurada chama na limpeza do efeito.
  onAuthStateChanged: jest.fn((_auth, callback) => {
    callback(null);
    return jest.fn();
  }),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendEmailVerification: jest.fn(),
  signOut: jest.fn(),
  updatePassword: jest.fn(),
  deleteUser: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  EmailAuthProvider: { credential: jest.fn() },
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  connectFirestoreEmulator: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  // writeBatch: usado por ClienteContatoRepository.importarClientesEmLote
  // (importação de contatos em lotes de 400 — ver teste de regressão).
  writeBatch: jest.fn(),
  // Agregação server-side (AnalyticsDashboard, InicioScreen/AgendamentoRepository) —
  // conta/soma/média calculadas no Firestore, sem baixar os documentos.
  getCountFromServer: jest.fn(),
  getAggregateFromServer: jest.fn(),
  count: jest.fn(),
  sum: jest.fn(),
  average: jest.fn(),
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
  // Migração da lista de banidos: o campo `clientesBanidos` é apagado do
  // documento público depois de copiado para a subcoleção privada.
  deleteField: jest.fn(() => ({ __deleteField: true })),
  // Reserva atômica de horários (OcupacaoService.reservarSlots). Cada teste
  // decide como a transação se comporta — aqui só existe o ponto de encaixe.
  runTransaction: jest.fn(),
}));

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(),
  connectFunctionsEmulator: jest.fn(),
  // Rejeita por padrão para exercitar o fallback do WhatsAppService
  httpsCallable: jest.fn(() => jest.fn(() => Promise.reject(new Error('offline')))),
}));

// Mock Firebase Storage (foto de perfil do barbeiro — ver FotoPerfilService).
// O SDK real (firebase/storage) reexporta @firebase/storage, cuja resolução
// de módulo (exports map sem condição "react-native") faz o Jest carregar o
// build ESM puro — que quebra o parser (sem transform p/ node_modules do
// pacote "firebase"). Mockar aqui evita depender da resolução real, no
// mesmo padrão já usado para firebase/firestore e firebase/auth acima.
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  connectStorageEmulator: jest.fn(),
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
  getBytes: jest.fn(),
}));

// Mock React Navigation (preserva o módulo real; só substitui os hooks)
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      replace: jest.fn(),
    }),
    useRoute: () => ({
      params: {},
    }),
  };
});

// Mock Firebase Messaging
jest.mock('@react-native-firebase/messaging', () => {
  const messagingInstance = {
    requestPermission: jest.fn(() => Promise.resolve(1)),
    getToken: jest.fn(() => Promise.resolve('mock-token')),
    onMessage: jest.fn(),
    onTokenRefresh: jest.fn(),
    onNotificationOpenedApp: jest.fn(),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
  };
  const messagingFn = () => messagingInstance;
  messagingFn.AuthorizationStatus = { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 };
  return {
    __esModule: true,
    default: messagingFn,
  };
});

// Suppress console warnings during tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock global fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
);
