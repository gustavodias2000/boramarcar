/**
 * VinculoClienteRepository — único ponto de acesso ao vínculo do cliente com
 * uma barbearia (negócio) ou profissional autônomo (`usuarios/{uid}/vinculos`)
 * e às Cloud Functions que criam esse vínculo a partir de um QR Code, link,
 * convite ou código digitado.
 */
import { db, functions } from '../../../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from '../../services/CloudFunctionsClient';
import type { OrigemVinculo, TipoVinculo, VinculoCliente } from '../../types';

interface ResgateConvite {
  tipo: TipoVinculo;
  alvoId: string;
  barbeiroOrigemId: string;
  nome: string;
  jaVinculado: boolean;
}

/**
 * Lista os vínculos do cliente logado. Sem filtro `where('ativo','==',true)`
 * no servidor (evitaria índice composto à toa) — filtra em memória.
 */
export async function listarVinculosDoCliente(clienteUid: string): Promise<VinculoCliente[]> {
  const snap = await getDocs(collection(db, 'usuarios', clienteUid, 'vinculos'));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<VinculoCliente, 'id'>), id: d.id }))
    .filter((vinculo) => vinculo.ativo !== false);
}

/**
 * Resgata um convite por código digitado (QR Code, link ou código manual —
 * todos usam a mesma function, diferenciados pelo campo `origem`). Códigos
 * são case-insensitive por especificação: normaliza aqui pra não duplicar
 * essa regra em cada tela chamadora.
 */
export async function resgatarConvitePorCodigo(
  codigo: string,
  origem: OrigemVinculo,
): Promise<ResgateConvite> {
  const resultado = await httpsCallable<
    { codigo: string; origem: OrigemVinculo },
    ResgateConvite
  >(functions, 'criarVinculoCliente')({
    codigo: codigo.trim().toUpperCase(),
    origem,
  });
  return resultado.data;
}

/**
 * Resgata um convite a partir do deep link legado
 * `barbershop://agendar/{barbeiroId}` — mesma function, identificando o
 * barbeiro diretamente em vez de por código.
 */
export async function resgatarConvitePorBarbeiroLegado(barbeiroId: string): Promise<ResgateConvite> {
  const resultado = await httpsCallable<
    { barbeiroIdLegado: string; origem: OrigemVinculo },
    ResgateConvite
  >(functions, 'criarVinculoCliente')({
    barbeiroIdLegado: barbeiroId,
    origem: 'link',
  });
  return resultado.data;
}

/**
 * Garante (cria se ainda não existir) o convite do barbeiro logado — usado
 * pela tela de QR Code do próprio profissional.
 */
export async function obterOuCriarConviteProprio(): Promise<{
  codigo: string;
  tipo: TipoVinculo;
  alvoId: string;
}> {
  const resultado = await httpsCallable<
    Record<string, never>,
    { codigo: string; tipo: TipoVinculo; alvoId: string }
  >(functions, 'garantirConvite')({});
  return resultado.data;
}
