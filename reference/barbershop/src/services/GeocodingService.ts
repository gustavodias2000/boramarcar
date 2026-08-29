/**
 * GeocodingService — autocomplete de endereço via Google Places.
 *
 * SEGURANÇA: a chave da API do Google fica só no servidor (Cloud Functions
 * `placesAutocomplete`/`placesDetails`, com secret) — mesmo padrão do
 * WhatsAppService. Se as Functions não estiverem disponíveis (ex.: plano
 * Blaze não ativado, secret não configurado), o autocomplete simplesmente
 * não sugere nada e o campo de endereço continua funcionando como texto
 * livre, exatamente como antes desta feature.
 */
import { httpsCallable } from './CloudFunctionsClient';
import { functions } from '../../firebaseConfig';

export interface SugestaoEndereco {
  placeId: string;
  description: string;
}

export interface DetalhesEndereco {
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
}

const DEBUG_MODE: boolean = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

/**
 * Busca sugestões de endereço para o texto digitado. Retorna lista vazia
 * (nunca lança) se a busca falhar — o autocomplete some silenciosamente e
 * o usuário continua digitando o endereço livremente.
 */
export async function buscarSugestoesEndereco(input: string): Promise<SugestaoEndereco[]> {
  if (input.trim().length < 3) return [];
  try {
    const fn = httpsCallable(functions, 'placesAutocomplete');
    const resp = await fn({ input });
    const data = resp.data as { predictions?: SugestaoEndereco[] };
    return data.predictions || [];
  } catch (error: any) {
    if (DEBUG_MODE) {
      console.warn('Autocomplete de endereço indisponível:', error?.message);
    }
    return [];
  }
}

/**
 * Resolve os detalhes (endereço formatado + coordenadas) de uma sugestão
 * escolhida. Retorna null se falhar.
 */
export async function buscarDetalhesEndereco(placeId: string): Promise<DetalhesEndereco | null> {
  try {
    const fn = httpsCallable(functions, 'placesDetails');
    const resp = await fn({ placeId });
    return resp.data as DetalhesEndereco;
  } catch (error: any) {
    if (DEBUG_MODE) {
      console.warn('Detalhes de endereço indisponíveis:', error?.message);
    }
    return null;
  }
}
