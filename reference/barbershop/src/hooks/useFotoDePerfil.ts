/**
 * useFotoDePerfil — foto da vitrine pública do barbeiro.
 *
 * ARQ-02: extraído de PerfilScreen.tsx. Só o barbeiro tem foto (ver
 * AvatarIlustrado/FotoPerfilService); a tela carrega a foto atual junto do
 * documento da vitrine e depois pode trocá-la pela galeria.
 *
 * O estado de envio só liga DEPOIS que o usuário escolhe uma imagem de fato:
 * cancelar a galeria ou receber erro de permissão não deve piscar spinner no
 * botão.
 */
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { auth } from '../../firebaseConfig';
import { uploadFotoPerfil } from '../services/FotoPerfilService';

interface UseFotoDePerfilResult {
  fotoUrl: string | undefined;
  fotoPadraoId: string | undefined;
  enviandoFoto: boolean;
  definirFotoInicial: (url: string | undefined, padraoId: string | undefined) => void;
  trocarFoto: () => Promise<void>;
}

export default function useFotoDePerfil(): UseFotoDePerfilResult {
  const [fotoUrl, setFotoUrl] = useState<string | undefined>(undefined);
  const [fotoPadraoId, setFotoPadraoId] = useState<string | undefined>(undefined);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  /** Semeia a foto vinda do documento da vitrine, ao carregar a tela. */
  const definirFotoInicial = useCallback(
    (url: string | undefined, padraoId: string | undefined) => {
      setFotoUrl(url);
      setFotoPadraoId(padraoId);
    },
    [],
  );

  /** Abre a galeria e envia a foto escolhida para o Storage. */
  const trocarFoto = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const resultado = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
    });
    if (resultado.didCancel) return;
    if (resultado.errorCode) {
      Alert.alert('Erro', resultado.errorMessage || 'Não foi possível abrir a galeria de fotos.');
      return;
    }
    const uri = resultado.assets?.[0]?.uri;
    if (!uri) return;

    setEnviandoFoto(true);
    try {
      const url = await uploadFotoPerfil(uid, uri);
      setFotoUrl(url);
    } catch (error) {
      console.error('Erro ao enviar foto de perfil:', error);
      Alert.alert('Erro', 'Não foi possível enviar a foto. Tente novamente.');
    } finally {
      setEnviandoFoto(false);
    }
  }, []);

  return { fotoUrl, fotoPadraoId, enviandoFoto, definirFotoInicial, trocarFoto };
}
