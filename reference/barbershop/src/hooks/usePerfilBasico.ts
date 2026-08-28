/**
 * usePerfilBasico — dados pessoais do usuário (nome e telefone) e a
 * sincronização da vitrine pública do barbeiro.
 *
 * ARQ-02: extraído de PerfilScreen.tsx. Concentra três regras que antes só
 * eram alcançáveis pela tela inteira:
 *  1. validação de nome (≥3 caracteres) e telefone (≥10 dígitos);
 *  2. o telefone é exibido mascarado e gravado em E.164;
 *  3. só barbeiro sincroniza a coleção `barbeiros`, e o `enderecoFormatado`
 *     só é gravado junto quando há coordenadas — texto digitado à mão não
 *     vira endereço "confirmado no mapa".
 *
 * O endereço em si mora em useEnderecoAutocomplete; aqui ele entra só como
 * dado de entrada na hora de gravar.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { auth } from '../../firebaseConfig';
import { getProfile, updateProfile } from '../data/repositories/UsuarioRepository';
import { upsertBarbeiro, getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { maskPhone, formatPhoneToE164, removerCodigoPaisBrasil } from '../utils/dateUtils';
import type { Coordenadas } from './useEnderecoAutocomplete';
import type { Barbeiro, Usuario } from '../types';

export interface ErrosPerfil {
  nome?: string | null;
  telefone?: string | null;
}

/** Endereço atual do formulário, gravado junto da vitrine do barbeiro. */
interface DadosDeEndereco {
  endereco: string;
  coordenadas: Coordenadas | null;
}

interface UsePerfilBasicoResult {
  userData: Usuario | null;
  nome: string;
  telefone: string;
  loading: boolean;
  saving: boolean;
  errors: ErrosPerfil;
  receberNotificacoesPush: boolean;
  alterarNome: (texto: string) => void;
  alterarTelefone: (texto: string) => void;
  alterarReceberNotificacoesPush: (receber: boolean) => void;
  salvarPerfil: () => Promise<void>;
}

export default function usePerfilBasico(
  dadosDeEndereco: DadosDeEndereco,
  /** Recebe o documento da vitrine quando o usuário é barbeiro (para semear
   *  endereço e foto). Precisa ser estável — use useCallback na tela. */
  aoCarregarVitrine: (barbeiroDoc: Barbeiro | null) => void,
): UsePerfilBasicoResult {
  const [userData, setUserData] = useState<Usuario | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ErrosPerfil>({});
  const [receberNotificacoesPush, setReceberNotificacoesPush] = useState(false);
  const [preferenciaPushAlterada, setPreferenciaPushAlterada] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const data = await getProfile(uid);
        if (data) {
          setUserData(data);
          setNome(data.nome || '');
          setReceberNotificacoesPush(data.consentimentoNotificacoesPush === true);

          // Formatar telefone para exibição
          setTelefone(maskPhone(removerCodigoPaisBrasil(data.telefone)));

          // Endereço e foto só existem na vitrine do barbeiro (coleção
          // `barbeiros`) — quem semeia esses campos é a tela.
          if (data.tipo === 'barbeiro') {
            const barbeiroDoc = await getBarbeiro(uid);
            aoCarregarVitrine(barbeiroDoc);
          }
        }
      } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        Alert.alert('Erro', 'Não foi possível carregar o perfil.');
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, [aoCarregarVitrine]);

  /** Editar um campo com erro limpa o erro daquele campo. */
  const alterarNome = useCallback((texto: string) => {
    setNome(texto);
    setErrors((anteriores) => (anteriores.nome ? { ...anteriores, nome: null } : anteriores));
  }, []);

  const alterarTelefone = useCallback((texto: string) => {
    setTelefone(maskPhone(texto));
    setErrors((anteriores) =>
      anteriores.telefone ? { ...anteriores, telefone: null } : anteriores,
    );
  }, []);

  const alterarReceberNotificacoesPush = useCallback((receber: boolean) => {
    setReceberNotificacoesPush(receber);
    setPreferenciaPushAlterada(true);
  }, []);

  const validar = useCallback(() => {
    const novosErros: ErrosPerfil = {};
    if (!nome.trim() || nome.trim().length < 3) {
      novosErros.nome = 'Nome deve ter pelo menos 3 caracteres';
    }
    const digitos = telefone.replace(/\D/g, '');
    if (!digitos || digitos.length < 10) {
      novosErros.telefone = 'Telefone inválido';
    }
    setErrors(novosErros);
    return Object.keys(novosErros).length === 0;
  }, [nome, telefone]);

  const salvarPerfil = useCallback(async () => {
    if (!validar()) return;

    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const telefoneE164 = formatPhoneToE164(telefone);

      await updateProfile(uid, {
        nome: nome.trim(),
        telefone: telefoneE164,
        ...(preferenciaPushAlterada ? { consentimentoNotificacoesPush: receberNotificacoesPush } : {}),
      });

      setUserData((anterior) => anterior
        ? { ...anterior, ...(preferenciaPushAlterada ? { consentimentoNotificacoesPush: receberNotificacoesPush } : {}) }
        : anterior);
      setPreferenciaPushAlterada(false);

      // Se for barbeiro, mantém a vitrine (coleção `barbeiros`) sincronizada.
      // upsert com merge também cria o doc caso o barbeiro seja antigo (item 3).
      if (userData?.tipo === 'barbeiro') {
        const { endereco, coordenadas } = dadosDeEndereco;
        await upsertBarbeiro(uid, {
          nome: nome.trim(),
          telefone: telefoneE164,
          ...(endereco.trim() ? { endereco: endereco.trim() } : {}),
          // Coordenadas só existem quando o endereço veio de uma sugestão do
          // autocomplete — texto digitado livremente não tem lat/lng. Nesse
          // caso também grava `enderecoFormatado` (usado na tela de
          // confirmação do agendamento e ao reabrir esta tela).
          ...(coordenadas
            ? {
                latitude: coordenadas.lat,
                longitude: coordenadas.lng,
                enderecoFormatado: endereco.trim(),
              }
            : {}),
        });
      }

      Alert.alert('Sucesso!', 'Perfil atualizado com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      Alert.alert('Erro', 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  }, [dadosDeEndereco, nome, telefone, preferenciaPushAlterada, receberNotificacoesPush, userData, validar]);

  return {
    userData,
    nome,
    telefone,
    loading,
    saving,
    errors,
    receberNotificacoesPush,
    alterarNome,
    alterarTelefone,
    alterarReceberNotificacoesPush,
    salvarPerfil,
  };
}
