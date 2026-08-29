/**
 * useUserProfile — hook compartilhado para carregar o perfil do usuário logado.
 *
 * Item 12 da auditoria: substitui o bloco fetchUserProfile que estava
 * duplicado em 4 telas (ClienteHome, BarbeiroHome, AgendamentoScreen, Perfil).
 */
import { useState, useEffect, useCallback } from 'react';
import { auth } from '../../firebaseConfig';
import { getProfile } from '../data/repositories/UsuarioRepository';
import type { Usuario } from '../types';

interface UseUserProfileResult {
  profile: Usuario | null;
  loading: boolean;
  refresh: () => Promise<Usuario | null>;
}

export default function useUserProfile(): UseUserProfileResult {
  const [profile, setProfile] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<Usuario | null> => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setProfile(null);
        return null;
      }
      const data = await getProfile(uid);
      setProfile(data);
      return data;
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, loading, refresh };
}
