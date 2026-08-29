/**
 * Resolve os vínculos do cliente logado (QR Code/link/convite/código) para a
 * lista achatada de `Barbeiro[]` que alimenta a vitrine da Home — substitui
 * `listarBarbeiros(50)`, que mostrava TODOS os barbeiros cadastrados.
 */
import { useCallback, useState } from 'react';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { listarProfissionaisDoNegocio } from '../data/repositories/NegocioRepository';
import { listarVinculosDoCliente } from '../data/repositories/VinculoClienteRepository';
import type { Barbeiro } from '../types';

interface BarbeariasVinculadas {
  barbeiros: Barbeiro[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export default function useBarbeariasVinculadas(
  clienteUid: string | undefined,
): BarbeariasVinculadas {
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clienteUid) {
      setBarbeiros([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const vinculos = await listarVinculosDoCliente(clienteUid);

      // Cada vínculo é resolvido isoladamente: um erro pontual (ex.: negócio
      // apagado) não pode derrubar os demais vínculos do cliente.
      const listas = await Promise.all(
        vinculos.map(async (vinculo) => {
          try {
            if (vinculo.tipo === 'profissional') {
              const barbeiro = await getBarbeiro(vinculo.alvoId);
              if (!barbeiro || barbeiro.ativo === false) return [];
              return [barbeiro];
            }
            const profissionais = await listarProfissionaisDoNegocio(vinculo.alvoId);
            return profissionais.filter((p) => p.ativo !== false);
          } catch (error) {
            console.warn('[useBarbeariasVinculadas] falha ao resolver vínculo:', error);
            return [];
          }
        }),
      );

      // Dedupe por id — dois vínculos diferentes podem apontar pro mesmo
      // negócio (ex.: convites de dois membros da mesma equipe).
      const porId = new Map<string, Barbeiro>();
      for (const lista of listas) {
        for (const barbeiro of lista) {
          porId.set(barbeiro.id, barbeiro);
        }
      }
      setBarbeiros(Array.from(porId.values()));
    } finally {
      setLoading(false);
    }
  }, [clienteUid]);

  return { barbeiros, loading, refresh };
}
