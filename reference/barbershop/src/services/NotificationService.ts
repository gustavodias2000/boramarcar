/**
 * NotificationService — gerencia FCM push notifications.
 *
 * CORREÇÃO (auditoria item 2.5):
 * O construtor NÃO solicita permissão mais. A permissão só é pedida
 * explicitamente via `init()`, chamado pela tela principal APÓS o login,
 * no momento certo da jornada do usuário.
 *
 * Isso impede que o OS dialog "Permitir notificações?" apareça na tela
 * de carregamento, antes mesmo de o usuário entender o app — prática
 * reprovada pela Apple App Review e que reduz a taxa de opt-in.
 */
import messaging, {
  type FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import { Alert } from 'react-native';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { saveFcmToken } from '../data/repositories/UsuarioRepository';
import { navigationRef } from '../../App';

type RemoteMessage = FirebaseMessagingTypes.RemoteMessage;

class NotificationService {
  // PERF-002 (auditoria, onda 4): `init()` é chamado a partir de um
  // `useEffect` de MONTAGEM de `ClienteHome.tsx` — dispara de novo toda vez
  // que a tela remonta (ex.: logout seguido de login de novo na MESMA sessão
  // do app, sem matar o processo JS). Como este serviço é um singleton (uma
  // única instância viva por processo — ver `export default new
  // NotificationService()` no fim do arquivo), sem essa proteção cada
  // remontagem registraria um NOVO `onMessage`/`onTokenRefresh` por cima dos
  // anteriores, nunca desinscritos — uma notificação em foreground disparia
  // `Alert.alert` uma vez por listener acumulado.
  private _inicializado = false;

  // Onda C (multi-dispositivo): último token FCM obtido por este processo,
  // atualizado em `getFCMToken()` e no callback de `onTokenRefresh`.
  // Necessário só para `desregistrarDispositivoAtual()` saber qual doc
  // apagar no logout sem precisar chamar `messaging().getToken()` de novo
  // (evita uma ida a mais ao SDK nativo bem no meio do fluxo de logout).
  private _ultimoToken: string | null = null;

  constructor() {
    // Sem efeito colateral no import.
    // Configure listeners passivos aqui (sem pedir permissão):
    this._setupBackgroundListeners();
  }

  /**
   * Inicializa as notificações push.
   * Chame este método UMA VEZ após o login do usuário, em um momento
   * contextualmente adequado (ex.: depois de exibir uma explicação).
   *
   * Idempotente por PROCESSO (não por sessão de usuário): chamar de novo
   * depois de um logout/login não registra um segundo `onMessage`/
   * `onTokenRefresh`. Isso é seguro porque:
   *  - `_setupTokenRefreshListener` lê `auth.currentUser?.uid` DENTRO do
   *    callback, no momento em que o token gira — não no momento do
   *    registro. Então o listener único, registrado uma vez, sempre associa
   *    o token ao usuário que estiver logado quando o evento disparar,
   *    mesmo depois de trocar de conta no mesmo aparelho.
   *  - A permissão do sistema operacional e o token do FCM são atributos do
   *    APARELHO/processo, não da sessão de um usuário específico — não há
   *    "dono" por usuário para devolver no logout. Por isso não existe um
   *    `destroy()`/unsubscribe chamado no logout: o dono do ciclo de vida
   *    destes listeners é o processo do app, não a sessão logada.
   *
   * Desvio deliberado de uma idempotência "tudo ou nada": mesmo na chamada
   * repetida (guarda abaixo), `getFCMToken()` roda de novo. Motivo: ela é
   * quem GRAVA o token no perfil do usuário logado (`saveFcmToken`). Se o
   * usuário A fizer login (1ª chamada de `init()`, token salvo no perfil de
   * A) e depois, na MESMA sessão do app, o usuário B fizer login (2ª
   * chamada), sem repetir `getFCMToken()` aqui o perfil de B nunca receberia
   * o token — o listener de refresh só dispara quando o FCM decide girar o
   * token, o que pode levar dias ou nunca acontecer nessa sessão. Repetir
   * `getFCMToken()` é seguro e barato (uma leitura de token já em cache
   * localmente pelo SDK + um `setDoc`), diferente de repetir
   * `requestPermission` (reabriria o dialog do SO) ou os `messaging().on*`
   * (duplicaria listeners, o próprio bug desta correção).
   */
  async init(): Promise<boolean> {
    if (this._inicializado) {
      // Permissão já concedida e listeners já registrados numa chamada
      // anterior deste mesmo processo — não repete `requestPermission` nem
      // o registro dos listeners. Ainda assim garante que o usuário
      // ATUALMENTE logado tenha o token do aparelho salvo no próprio
      // perfil (ver comentário acima do método).
      await this.getFCMToken();
      return true;
    }

    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      await this.getFCMToken();
      this._setupForegroundListener();
      this._setupTokenRefreshListener();
      this._inicializado = true;
    }

    return enabled;
  }

  private _setupBackgroundListeners(): void {
    // Listener para quando o app é aberto via notificação (background)
    messaging().onNotificationOpenedApp((remoteMessage) => {
      this._handleNotificationNavigation(remoteMessage);
    });

    // Notificação que abriu o app (quit state)
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          this._handleNotificationNavigation(remoteMessage);
        }
      })
      .catch(() => {});
  }

  private _setupForegroundListener(): void {
    messaging().onMessage(async (remoteMessage) => {
      Alert.alert(
        remoteMessage.notification?.title || 'Nova notificação',
        remoteMessage.notification?.body || 'Você tem uma nova mensagem',
      );
    });
  }

  private _setupTokenRefreshListener(): void {
    // O FCM pode girar o token; mantém o perfil sempre atualizado
    messaging().onTokenRefresh((token) => {
      this._ultimoToken = token || this._ultimoToken;
      const uid = auth.currentUser?.uid;
      if (uid && token) {
        saveFcmToken(uid, token);
      }
    });
  }

  async getFCMToken(): Promise<string | null> {
    try {
      const token = await messaging().getToken();
      this._ultimoToken = token || this._ultimoToken;
      // Item 18: salva o token no perfil — os lembretes automáticos
      // (Cloud Function agendada) usam este campo para enviar o push.
      const uid = auth.currentUser?.uid;
      if (uid && token) {
        await saveFcmToken(uid, token);
      }
      return token;
    } catch (error) {
      console.error('Erro ao obter FCM token:', error);
      return null;
    }
  }

  /**
   * Apaga SÓ o registro do dispositivo ATUAL (`usuarios/{uid}/tokens/{token}`)
   * — nunca outros tokens do mesmo usuário (outros aparelhos continuam
   * recebendo push depois deste logout). Chamado por `SessaoService.
   * encerrarSessao()` ANTES de `signOut(auth)` (a regra `isOwner` exige
   * `request.auth` válido).
   *
   * No-op silencioso se este processo nunca obteve um token — mesma
   * filosofia de `saveFcmToken`: push é acessório, uma falha aqui nunca pode
   * impedir o logout de completar.
   */
  async desregistrarDispositivoAtual(): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid || !this._ultimoToken) return;
    try {
      await deleteDoc(doc(db, 'usuarios', uid, 'tokens', this._ultimoToken));
    } catch (error: any) {
      console.warn('Não foi possível remover o token de push do dispositivo:', error?.message);
    }
  }

  /**
   * Decide a tela de destino SÓ pelo `data.type` do payload — nunca por
   * outros campos (`clienteUid`/`barbeiroId`/etc.). Autorização de quem pode
   * VER o que está nessa tela é responsabilidade da PRÓPRIA TELA de destino
   * (`HistoricoScreen`/`BarbeiroHome`, ambas filtram por
   * `auth.currentUser`/dono ao carregar os dados) — não deste serviço. Um
   * payload desatualizado (notificação de um evento antigo) ou adulterado
   * no máximo abre uma tela vazia/errada para o usuário atual, nunca vaza
   * dado de outro usuário, porque a tela nunca confia em nada que veio da
   * notificação para decidir QUAIS dados mostrar.
   */
  private _handleNotificationNavigation(remoteMessage: RemoteMessage): void {
    if (!navigationRef.isReady()) {
      // A notificação abriu o app antes do NavigationContainer montar
      // (caso `getInitialNotification`, app em quit state) — navegar aqui
      // derrubaria o app. Sem fallback: a tela inicial normal (restauração
      // de sessão) já leva o usuário para a área certa.
      return;
    }
    // Valores reais que chegam aqui: os 4 literais de `EventoNotificacao`
    // (src/types.ts), gravados em `data.type` por
    // `functions/notificationOrchestrator.js#processarCanalParaDestinatario`
    // (`{ type: evento, agendamentoId }`) — NÃO os nomes do stub antigo
    // ('novo_agendamento'/'agendamento_confirmado' incompleto), que nunca
    // foram enviados pelo backend e deixavam o toque na notificação de
    // "novo agendamento" sem nenhum efeito (achado da revisão independente).
    const { data } = remoteMessage;
    const tipo = data?.type;

    if (tipo === 'agendamento_confirmado' || tipo === 'agendamento_cancelado_profissional') {
      // Cliente: veja a confirmação/cancelamento no próprio histórico.
      navigationRef.navigate('Historico');
    } else if (tipo === 'agendamento_criado' || tipo === 'agendamento_cancelado_cliente') {
      // Profissional/dono: veja a agenda atualizada.
      // `RootStackParamList.Barbeiro` é tipado como `undefined` (é a rota
      // que monta o Tab Navigator `BarbeiroTabs`, sem params próprios) — o
      // TypeScript não modela nesse tipo o formato `{ screen, params }` de
      // navegação para dentro de um navigator aninhado a partir de uma ref
      // externa. O cast é só nos PARAMS (não no nome da rota, que continua
      // com checagem normal); em runtime o React Navigation aceita esse
      // formato normalmente para entrar direto na aba "Agenda".
      navigationRef.navigate('Barbeiro', { screen: 'Agenda' } as never);
    }
  }
}

export default new NotificationService();
