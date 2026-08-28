/**
 * FotoPerfilService — upload e remoção da foto de perfil do barbeiro no
 * Firebase Storage (`barbeiros/{barbeiroId}/perfil.jpg`).
 *
 * Separado do BarbeiroRepository (que só fala com o Firestore, como todos os
 * outros repositories) porque aqui a fonte de dados é outro serviço do
 * Firebase, com API e semântica de erro bem diferentes (upload binário,
 * download URL, exclusão de blob) — misturar os dois no mesmo arquivo
 * confundiria a responsabilidade de cada um. Ainda assim, ao final de um
 * upload bem-sucedido este serviço grava `fotoUrl` no doc do barbeiro via
 * `upsertBarbeiro` (já existente), para os dois lados ficarem consistentes.
 */
import { storage } from '../../firebaseConfig';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { upsertBarbeiro } from '../data/repositories/BarbeiroRepository';

function fotoRef(barbeiroId: string) {
  return ref(storage, `barbeiros/${barbeiroId}/perfil.jpg`);
}

/**
 * Faz upload de uma foto local (URI retornada pelo react-native-image-picker)
 * para `barbeiros/{barbeiroId}/perfil.jpg` e grava a URL resultante no doc do
 * barbeiro (`fotoUrl`).
 *
 * `barbeiroId` é o uid do próprio barbeiro OU o id de um profissional da
 * equipe sem login próprio — quem decide se a chamada é permitida é a regra
 * de Storage (`storage.rules`), não este serviço.
 *
 * Retorna a URL já com parâmetro de cache-busting (`?v=timestamp`): sem
 * isso, o componente `Image` do React Native reaproveita a foto antiga do
 * cache (mesma URL do Storage) mesmo depois de um re-upload.
 */
export async function uploadFotoPerfil(barbeiroId: string, uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const blob = await resposta.blob();

  const storageRef = fotoRef(barbeiroId);
  await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });

  const downloadUrl = await getDownloadURL(storageRef);
  const urlComCacheBust = `${downloadUrl}?v=${Date.now()}`;

  await upsertBarbeiro(barbeiroId, { fotoUrl: urlComCacheBust });

  return urlComCacheBust;
}

/**
 * Apaga a foto de perfil do Storage. Tolerante a "a foto nunca existiu"
 * (`storage/object-not-found`) — usada tanto quando o barbeiro remove a
 * própria foto quanto na exclusão de conta (ver ExclusaoContaService), onde
 * nem todo usuário chegou a fazer upload.
 *
 * Não mexe no campo `fotoUrl` do Firestore — quem chama decide (na exclusão
 * de conta o doc do barbeiro inteiro é apagado logo em seguida; numa futura
 * tela de "remover foto" seria o caller que limparia o campo via
 * upsertBarbeiro).
 */
export async function apagarFotoPerfil(barbeiroId: string): Promise<void> {
  try {
    await deleteObject(fotoRef(barbeiroId));
  } catch (error: any) {
    if (error?.code !== 'storage/object-not-found') {
      throw error;
    }
  }
}
