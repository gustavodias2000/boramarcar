/**
 * useSessaoRestaurada — resolve, uma única vez na abertura do app, se já
 * existe alguém logado e para qual área navegar.
 *
 * O `onAuthStateChanged` do Firebase só emite depois de terminar de ler a
 * persistência (o AsyncStorage configurado em `firebaseConfig.ts`), então a
 * PRIMEIRA emissão já é a resposta definitiva: ou vem o usuário restaurado,
 * ou vem `null` porque de fato não há sessão. Não existe um "null
 * provisório" para tratar aqui.
 *
 * As emissões seguintes (login, logout, renovação de token) são ignoradas de
 * propósito: essas telas navegam por conta própria com `navigation.replace`,
 * e mexer na rota inicial no meio de uma navegação só causaria conflito.
 */
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { rotaInicialParaUsuario, type RotaInicial } from '../services/SessaoService';

interface Sessao {
  /** true enquanto ainda não sabemos se há usuário logado. */
  carregando: boolean;
  rotaInicial: RotaInicial;
}

export function useSessaoRestaurada(): Sessao {
  const [rotaInicial, setRotaInicial] = useState<RotaInicial | null>(null);

  useEffect(() => {
    let ativo = true;
    let jaResolveu = false;

    const parar = onAuthStateChanged(auth, async (user) => {
      if (!ativo || jaResolveu) return;
      jaResolveu = true;

      let rota: RotaInicial = 'Login';
      try {
        rota = await rotaInicialParaUsuario(user);
      } catch (error) {
        console.warn('[sessao] falha ao restaurar a sessão — abrindo o login.', error);
      }

      if (!ativo) return;
      setRotaInicial(rota);
    });

    return () => {
      ativo = false;
      if (typeof parar === 'function') parar();
    };
  }, []);

  return {
    carregando: rotaInicial === null,
    rotaInicial: rotaInicial ?? 'Login',
  };
}

export default useSessaoRestaurada;
