/**
 * useEnderecoAutocomplete — endereço do estabelecimento com autocomplete do
 * Google Places (via Cloud Function — ver GeocodingService).
 *
 * ARQ-02: extraído de PerfilScreen.tsx. Concentra a regra que era mais fácil
 * de quebrar sem perceber: as coordenadas só existem quando o usuário ESCOLHE
 * uma sugestão da lista. Digitar livremente continua permitido, mas invalida
 * o lat/lng anterior — senão o mapa mostrado ao cliente apontaria para um
 * lugar que não corresponde mais ao texto do endereço.
 *
 * A busca é debounced em 400ms para não gerar uma chamada por tecla.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buscarSugestoesEndereco,
  buscarDetalhesEndereco,
  type SugestaoEndereco,
} from '../services/GeocodingService';

/** Abaixo disso não vale consultar o Places — é ruído de digitação. */
const MINIMO_CARACTERES = 3;
const ATRASO_BUSCA_MS = 400;

export interface Coordenadas {
  lat: number;
  lng: number;
}

interface UseEnderecoAutocompleteResult {
  endereco: string;
  coordenadas: Coordenadas | null;
  sugestoes: SugestaoEndereco[];
  buscando: boolean;
  definirEnderecoInicial: (texto: string, coordenadas: Coordenadas | null) => void;
  alterarEndereco: (texto: string) => void;
  selecionarSugestao: (sugestao: SugestaoEndereco) => Promise<void>;
}

export default function useEnderecoAutocomplete(): UseEnderecoAutocompleteResult {
  const [endereco, setEndereco] = useState('');
  const [coordenadas, setCoordenadas] = useState<Coordenadas | null>(null);
  const [sugestoes, setSugestoes] = useState<SugestaoEndereco[]>([]);
  const [buscando, setBuscando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Semeia o endereço já gravado na vitrine, ao carregar a tela. */
  const definirEnderecoInicial = useCallback(
    (texto: string, coordenadasSalvas: Coordenadas | null) => {
      setEndereco(texto);
      if (coordenadasSalvas) setCoordenadas(coordenadasSalvas);
    },
    [],
  );

  const alterarEndereco = useCallback((texto: string) => {
    setEndereco(texto);
    // Qualquer edição manual invalida a sugestão escolhida antes — só volta
    // a ter coordenadas se o usuário escolher uma sugestão nova.
    setCoordenadas(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < MINIMO_CARACTERES) {
      setSugestoes([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const encontradas = await buscarSugestoesEndereco(texto);
        setSugestoes(encontradas);
      } catch {
        // Falha de autocomplete é ESPERADA e não-crítica: usuário sem rede,
        // cota do Places estourada, Function fria. O endereço digitado à mão
        // continua valendo — só não haverá coordenadas, que é exatamente o
        // mesmo estado de quem nunca escolheu uma sugestão.
        //
        // Por isso não vira Alert nem telemetria: sem o `catch`, a rejeição
        // escapava de dentro do `setTimeout` (não havia await de ninguém) e
        // virava unhandled rejection — warning amarelo em dev e ruído em
        // produção, para um caminho que não exige ação de ninguém. Limpar as
        // sugestões evita o outro extremo: manter na tela uma lista velha,
        // que não corresponde mais ao que está digitado.
        setSugestoes([]);
      } finally {
        setBuscando(false);
      }
    }, ATRASO_BUSCA_MS);
  }, []);

  // Timer pendente no desmonte: sem isto, uma tela fechada durante os 400ms
  // ainda dispara a busca e chama `setSugestoes`/`setBuscando` num componente
  // que já saiu. Nenhum comportamento visível muda (o usuário já não está lá),
  // só desaparece a chamada de rede inútil e o warning de update fora do ciclo.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const selecionarSugestao = useCallback(async (sugestao: SugestaoEndereco) => {
    setSugestoes([]);
    setEndereco(sugestao.description);
    setBuscando(true);
    try {
      const detalhes = await buscarDetalhesEndereco(sugestao.placeId);
      if (detalhes?.formattedAddress) {
        setEndereco(detalhes.formattedAddress);
      }
      if (detalhes?.latitude != null && detalhes?.longitude != null) {
        setCoordenadas({ lat: detalhes.latitude, lng: detalhes.longitude });
      }
    } finally {
      setBuscando(false);
    }
  }, []);

  return {
    endereco,
    coordenadas,
    sugestoes,
    buscando,
    definirEnderecoInicial,
    alterarEndereco,
    selecionarSugestao,
  };
}
