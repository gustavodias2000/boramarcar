/**
 * SessaoService — mantém o usuário logado entre aberturas do app.
 *
 * A persistência do token em si é do Firebase (ver `firebaseConfig.ts`, que
 * inicializa o Auth com AsyncStorage). O que falta para abrir o app já
 * logado é saber PARA QUAL área navegar — Cliente ou Barbeiro — antes de
 * montar a navegação.
 *
 * Descobrir isso exige ler o perfil no Firestore, o que é uma ida à rede a
 * cada abertura e falha quando o celular está sem internet. Então gravamos
 * o tipo do usuário aqui junto do uid: na segunda abertura em diante a
 * decisão é instantânea e funciona offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut, type User } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { getProfile } from '../data/repositories/UsuarioRepository';
import { limparAgendamentoPendente, limparConvitePendente } from './DeepLinkService';
import NotificationService from './NotificationService';
import CacheService from './CacheService';
import type { TipoUsuario } from '../types';

/** Rota inicial da pilha de navegação depois de restaurar a sessão. */
export type RotaInicial = 'Welcome' | 'Login' | 'VerifyEmail' | 'Cliente' | 'Barbeiro';

const CHAVE_SESSAO = '@barbershop:sessao';

interface SessaoGravada {
  uid: string;
  tipo: TipoUsuario;
}

const rotaDoTipo = (tipo: TipoUsuario): RotaInicial =>
  tipo === 'barbeiro' ? 'Barbeiro' : 'Cliente';

/**
 * Guarda o tipo do usuário logado. Chamado no login e no cadastro — e
 * também na restauração, para que a primeira abertura pós-atualização já
 * deixe o cache pronto.
 */
export async function lembrarSessao(uid: string, tipo: TipoUsuario): Promise<void> {
  if (!uid) return;
  try {
    await AsyncStorage.setItem(CHAVE_SESSAO, JSON.stringify({ uid, tipo }));
  } catch (error) {
    // Cache é otimização, não requisito: sem ele só voltamos a consultar o
    // Firestore na próxima abertura.
    console.warn('[sessao] não foi possível gravar o tipo do usuário.', error);
  }
}

/**
 * Lê o tipo gravado, mas só se for do MESMO uid que está logado agora —
 * evita mandar um cliente para a área do barbeiro quando duas contas
 * diferentes usam o mesmo aparelho.
 */
export async function lerSessaoLembrada(uid: string): Promise<TipoUsuario | null> {
  if (!uid) return null;
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const sessao = JSON.parse(bruto) as SessaoGravada;
    if (sessao?.uid !== uid) return null;
    return sessao.tipo === 'barbeiro' || sessao.tipo === 'cliente' ? sessao.tipo : null;
  } catch {
    return null;
  }
}

/** Apaga o cache do tipo (logout, troca de conta, exclusão de conta). */
export async function esquecerSessao(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CHAVE_SESSAO);
  } catch (error) {
    console.warn('[sessao] não foi possível limpar o cache do tipo.', error);
  }
}

/**
 * Logout completo: limpa o cache local ANTES de encerrar no Firebase, para
 * nunca sobrar um tipo órfão apontando para a conta anterior. Também descarta
 * qualquer deep link pendente (agendamento ou convite) — ponto único de
 * logout do app, para não deixar um link de outra conta sendo retomado
 * silenciosamente no próximo login (ver DeepLinkService).
 *
 * `desregistrarDispositivoAtual()` roda ANTES de `signOut(auth)`: a regra do
 * Firestore para `usuarios/{uid}/tokens/{tokenId}` exige `isOwner(uid)`
 * (logo, `request.auth` válido) — chamado depois do signOut a escrita de
 * exclusão seria negada pelas regras.
 *
 * `CacheService.clear()`: o processo do app NÃO reinicia entre o logout e o
 * login seguinte, então o cache em memória atravessa a troca de conta.
 *
 * Sendo exato sobre o risco: HOJE toda chave em uso é escopada por
 * uid/barbeiroId/negocioId (`clientes:{id}`, `barbeiro:{uid}`,
 * `negocio:profissionais:{id}`), então a conta que entra depois consulta
 * chaves diferentes e não colide com as do usuário anterior. O que se ganha
 * limpando são duas coisas concretas:
 *
 * 1. o invariante "toda chave é escopada por conta" não é imposto em lugar
 *    nenhum — é convenção. Na primeira chave que não for (uma config global,
 *    um cache de negócio compartilhado), o vazamento entre contas passa a ser
 *    real e silencioso. Limpar aqui elimina a CLASSE do bug, em vez de
 *    depender de uma regra não escrita;
 * 2. dados pessoais de terceiros — a agenda de contatos do barbeiro tem nome,
 *    telefone e aniversário de clientes — não continuam no heap depois que o
 *    dono deles saiu do app.
 *
 * Custo zero: a próxima tela refaz a consulta.
 */
export async function encerrarSessao(): Promise<void> {
  await esquecerSessao();
  CacheService.clear();
  await limparAgendamentoPendente();
  await limparConvitePendente();
  await NotificationService.desregistrarDispositivoAtual();
  await signOut(auth);
}

/**
 * Decide a rota inicial para o usuário restaurado.
 *
 * Ordem: cache local (instantâneo, offline) → Firestore (e grava no cache).
 * Se as duas fontes falharem não há como saber a área correta, então cai em
 * 'Login' — a sessão do Firebase continua válida, é só a navegação que
 * precisa da confirmação. Quando não há ninguém logado, a rota é 'Welcome'
 * (a tela de boas-vindas, porta de entrada do fluxo de autenticação).
 */
export async function rotaInicialParaUsuario(user?: User | string | null): Promise<RotaInicial> {
  if (!user) return 'Welcome';
  // A forma string permanece apenas para compatibilidade com os testes e
  // consumidores antigos. O app sempre chama esta funcao com o User e, por
  // isso, sempre aplica a verificacao antes de restaurar a sessao.
  if (typeof user !== 'string') {
    await user.reload();
    if (!auth.currentUser?.emailVerified) return 'VerifyEmail';
    await auth.currentUser.getIdToken(true);
  }
  const uid = typeof user === 'string' ? user : auth.currentUser?.uid;
  if (!uid) return 'Login';

  const emCache = await lerSessaoLembrada(uid);
  if (emCache) return rotaDoTipo(emCache);

  try {
    const perfil = await getProfile(uid);
    if (!perfil?.tipo) return 'Login';
    await lembrarSessao(uid, perfil.tipo);
    return rotaDoTipo(perfil.tipo);
  } catch (error) {
    console.warn('[sessao] não foi possível ler o perfil para restaurar a sessão.', error);
    return 'Login';
  }
}
