/**
 * Regressão do pedido de 25/07/2026: "toda vez que vou entrar no sistema
 * preciso ficar colocando o login e senha".
 *
 * A persistência do token é do Firebase (firebaseConfig usa AsyncStorage).
 * O que este módulo garante é a outra metade do problema: saber para qual
 * área navegar na abertura sem depender da rede, e não deixar cache órfão
 * apontando para a conta anterior depois do logout.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';
import { getProfile } from '../../src/data/repositories/UsuarioRepository';
import {
  lembrarSessao,
  lerSessaoLembrada,
  esquecerSessao,
  encerrarSessao,
  rotaInicialParaUsuario,
} from '../../src/services/SessaoService';
import CacheService from '../../src/services/CacheService';

jest.mock('../../src/data/repositories/UsuarioRepository', () => ({
  getProfile: jest.fn(),
}));

const mockedSetItem = AsyncStorage.setItem as jest.Mock;
const mockedGetItem = AsyncStorage.getItem as jest.Mock;
const mockedRemoveItem = AsyncStorage.removeItem as jest.Mock;
const mockedGetProfile = getProfile as jest.Mock;
const mockedSignOut = signOut as jest.Mock;

const CHAVE = '@barbershop:sessao';

describe('SessaoService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSetItem.mockResolvedValue(undefined);
    mockedGetItem.mockResolvedValue(null);
    mockedRemoveItem.mockResolvedValue(undefined);
    CacheService.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('lembrarSessao / lerSessaoLembrada', () => {
    it('grava uid e tipo juntos no aparelho', async () => {
      await lembrarSessao('uid1', 'barbeiro');
      expect(mockedSetItem).toHaveBeenCalledWith(
        CHAVE,
        JSON.stringify({ uid: 'uid1', tipo: 'barbeiro' }),
      );
    });

    it('não grava nada quando não há uid', async () => {
      await lembrarSessao('', 'cliente');
      expect(mockedSetItem).not.toHaveBeenCalled();
    });

    it('devolve o tipo gravado para o mesmo uid', async () => {
      mockedGetItem.mockResolvedValue(JSON.stringify({ uid: 'uid1', tipo: 'barbeiro' }));
      await expect(lerSessaoLembrada('uid1')).resolves.toBe('barbeiro');
    });

    it('IGNORA o cache de outra conta no mesmo aparelho', async () => {
      mockedGetItem.mockResolvedValue(JSON.stringify({ uid: 'outro', tipo: 'barbeiro' }));
      await expect(lerSessaoLembrada('uid1')).resolves.toBeNull();
    });

    it('não quebra com cache corrompido nem com storage vazio', async () => {
      mockedGetItem.mockResolvedValue('{isso não é json');
      await expect(lerSessaoLembrada('uid1')).resolves.toBeNull();
      mockedGetItem.mockResolvedValue(null);
      await expect(lerSessaoLembrada('uid1')).resolves.toBeNull();
    });

    it('não deixa passar tipo desconhecido gravado por uma versão antiga', async () => {
      mockedGetItem.mockResolvedValue(JSON.stringify({ uid: 'uid1', tipo: 'admin' }));
      await expect(lerSessaoLembrada('uid1')).resolves.toBeNull();
    });

    it('falha de escrita no AsyncStorage não derruba o login', async () => {
      mockedSetItem.mockRejectedValue(new Error('disco cheio'));
      await expect(lembrarSessao('uid1', 'cliente')).resolves.toBeUndefined();
    });
  });

  describe('encerrarSessao', () => {
    it('limpa o cache local ANTES de sair do Firebase (não deixa tipo órfão)', async () => {
      const ordem: string[] = [];
      mockedRemoveItem.mockImplementation(async (chave: string) => { ordem.push(`removeItem:${chave}`); });
      mockedSignOut.mockImplementation(async () => { ordem.push('signOut'); });

      await encerrarSessao();

      // signOut só acontece depois de TODA a limpeza local, nunca antes.
      expect(ordem[ordem.length - 1]).toBe('signOut');
      expect(ordem.filter((e) => e === 'signOut')).toHaveLength(1);
    });

    it('esquecerSessao apaga a chave da sessão', async () => {
      await esquecerSessao();
      expect(mockedRemoveItem).toHaveBeenCalledWith(CHAVE);
    });

    // CLEAN-002: `limparConvitePendente` (DeepLinkService) nunca era chamada
    // em nenhum ponto de encerramento de sessão — nem `limparAgendamentoPendente`
    // era chamada no logout (só na exclusão de conta). encerrarSessao() é o
    // ponto único de logout do app, então os dois pendentes de deep link
    // (agendamento e convite) são limpos aqui, para não sobrar um link de uma
    // conta anterior sendo retomado silenciosamente no próximo login.
    it('CLEAN-002: limpa os dois pendentes de deep link (agendamento e convite) no logout', async () => {
      await encerrarSessao();

      expect(mockedRemoveItem).toHaveBeenCalledWith('@barbershop:deeplink-pendente');
      expect(mockedRemoveItem).toHaveBeenCalledWith('@barbershop:convite-pendente');
    });

    it('CLEAN-002: limpa os pendentes mesmo que a limpeza do tipo de sessão falhe', async () => {
      mockedRemoveItem.mockImplementation(async (chave: string) => {
        if (chave === CHAVE) throw new Error('falha ao gravar');
      });

      await encerrarSessao();

      expect(mockedRemoveItem).toHaveBeenCalledWith('@barbershop:deeplink-pendente');
      expect(mockedRemoveItem).toHaveBeenCalledWith('@barbershop:convite-pendente');
      expect(mockedSignOut).toHaveBeenCalled();
    });

    /**
     * O cache em memória atravessa a troca de conta: o processo do app não
     * reinicia entre o logout e o login seguinte.
     *
     * Hoje toda chave é escopada por uid/barbeiroId, então a conta seguinte
     * não colide com as do usuário anterior — mas esse invariante é
     * convenção, não é imposto por nada. Este teste trava a limpeza para que
     * a primeira chave NÃO escopada (uma config global, um cache de negócio
     * compartilhado) não vire um vazamento silencioso entre contas. E, mesmo
     * sem colisão, mantém fora do heap dados pessoais de terceiros (nome,
     * telefone e aniversário dos clientes) depois que o dono deles saiu.
     *
     * O CacheService não expõe get/set (CLAUDE.md §6): semear é buscar uma
     * vez, e "foi limpo" é a busca seguinte precisar rodar de novo.
     */
    it('LIMPA o cache em memória no logout — nada da sessão anterior sobrevive', async () => {
      await CacheService.getOrFetch('clientes:barbeiro-anterior', 60_000, async () => ['antigo']);

      await encerrarSessao();

      const buscaDeNovo = jest.fn(async () => ['novo']);
      await CacheService.getOrFetch('clientes:barbeiro-anterior', 60_000, buscaDeNovo);
      expect(buscaDeNovo).toHaveBeenCalled();
    });

    it('controle do medidor: sem logout, a chave semeada continua servindo do cache', async () => {
      // Sem este teste, o de cima passaria mesmo que semear não guardasse
      // nada — "precisou buscar de novo" seria verdade por vacuidade.
      await CacheService.getOrFetch('clientes:barbeiro-anterior', 60_000, async () => ['antigo']);

      const busca = jest.fn(async () => ['novo']);
      await CacheService.getOrFetch('clientes:barbeiro-anterior', 60_000, busca);
      expect(busca).not.toHaveBeenCalled();
    });
  });

  describe('rotaInicialParaUsuario', () => {
    it('manda para o Welcome quando não há ninguém logado', async () => {
      await expect(rotaInicialParaUsuario(null)).resolves.toBe('Welcome');
      await expect(rotaInicialParaUsuario(undefined)).resolves.toBe('Welcome');
      expect(mockedGetProfile).not.toHaveBeenCalled();
    });

    it('usa o cache e NÃO vai ao Firestore (abre offline e instantâneo)', async () => {
      mockedGetItem.mockResolvedValue(JSON.stringify({ uid: 'uid1', tipo: 'barbeiro' }));

      await expect(rotaInicialParaUsuario('uid1')).resolves.toBe('Barbeiro');
      expect(mockedGetProfile).not.toHaveBeenCalled();
    });

    it('consulta o perfil na primeira abertura e já grava o cache', async () => {
      mockedGetProfile.mockResolvedValue({ uid: 'uid1', tipo: 'cliente' });

      await expect(rotaInicialParaUsuario('uid1')).resolves.toBe('Cliente');
      expect(mockedGetProfile).toHaveBeenCalledWith('uid1');
      expect(mockedSetItem).toHaveBeenCalledWith(
        CHAVE,
        JSON.stringify({ uid: 'uid1', tipo: 'cliente' }),
      );
    });

    it('cai no Login quando o perfil não existe', async () => {
      mockedGetProfile.mockResolvedValue(null);
      await expect(rotaInicialParaUsuario('uid1')).resolves.toBe('Login');
    });

    it('cai no Login (sem estourar) quando o Firestore falha e não há cache', async () => {
      mockedGetProfile.mockRejectedValue(new Error('offline'));
      await expect(rotaInicialParaUsuario('uid1')).resolves.toBe('Login');
    });
  });
});
