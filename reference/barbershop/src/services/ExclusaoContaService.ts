/**
 * ExclusaoContaService — apaga TODOS os dados do usuário antes de encerrar a
 * conta (LGPD, art. 18, VI — direito à eliminação).
 *
 * A auditoria apontou que a exclusão de conta apagava apenas o perfil
 * (`usuarios/{uid}`) e a vitrine (`barbeiros/{uid}`). Ficavam para trás os
 * agendamentos, as ocupações de horário, as avaliações, a lista de espera,
 * as recorrências, as despesas, a agenda de clientes e a lista de banidos —
 * ou seja, o app dizia "seus dados pessoais foram removidos" e não era
 * verdade. Pior: os documentos órfãos ficavam sem NINGUÉM que pudesse
 * apagá-los depois, porque as regras autorizam a exclusão pelo uid do
 * titular, e esse uid deixava de existir.
 *
 * ORDEM IMPORTA (as regras do Firestore leem documentos vizinhos):
 *  1. libera as `ocupacoes` ANTES de apagar cada agendamento — a regra de
 *     delete do slot resolve a permissão lendo o agendamento;
 *  2. apaga as subcoleções de `barbeiros/{id}` ANTES do documento do
 *     barbeiro — a regra das subcoleções lê o doc pai;
 *  3. apaga `usuarios/{uid}` POR ÚLTIMO — `isBarbeiro()` lê esse perfil para
 *     autorizar a exclusão da vitrine;
 *  4. só então a conta de autenticação é encerrada (isso é feito no
 *     PerfilScreen, e apenas se este serviço não reportar erro — apagar o
 *     login com dados pendentes deixaria lixo permanente).
 */
import { db } from '../../firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { liberarSlotsDoAgendamento } from './OcupacaoService';
import { apagarFotoPerfil } from './FotoPerfilService';
import { removerBarbeiro } from '../data/repositories/BarbeiroRepository';
import { deleteProfile } from '../data/repositories/UsuarioRepository';
import {
  getNegocioPorDono,
  listarProfissionaisDoNegocio,
  listarMembros,
} from '../data/repositories/NegocioRepository';
import type { Agendamento } from '../types';

export interface ResultadoExclusao {
  /** Quantos documentos foram apagados, por coleção. */
  removidos: Record<string, number>;
  /** Falhas encontradas. Vazio = pode encerrar a conta com segurança. */
  erros: string[];
}

/** Apaga uma lista de documentos em paralelo, contando o que deu certo. */
async function apagarDocs(docs: QueryDocumentSnapshot[]): Promise<number> {
  if (docs.length === 0) return 0;
  await Promise.all(docs.map((d) => deleteDoc(d.ref)));
  return docs.length;
}

/**
 * Apaga todos os dados de um usuário.
 *
 * Nunca lança: cada etapa que falha entra em `erros` e as demais continuam,
 * para que uma coleção problemática não impeça a limpeza do resto. Quem
 * chama decide o que fazer com a lista.
 */
export async function apagarDadosDoUsuario(
  uid: string,
  email?: string | null,
): Promise<ResultadoExclusao> {
  const removidos: Record<string, number> = {};
  const erros: string[] = [];

  const etapa = async (nome: string, fn: () => Promise<number>) => {
    try {
      removidos[nome] = (removidos[nome] ?? 0) + (await fn());
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.warn(`[exclusao] falha ao apagar ${nome}:`, msg);
      erros.push(`${nome}: ${msg}`);
    }
  };

  // ── Agendamentos ───────────────────────────────────────────────────────
  // Libera o horário antes de apagar: a regra de delete de `ocupacoes` lê o
  // agendamento para autorizar. Invertido, os slots ficariam presos para
  // sempre e o profissional perderia aqueles horários da agenda.
  const apagarAgendamentos = async (docs: QueryDocumentSnapshot[]) => {
    for (const d of docs) {
      const ag = { ...(d.data() as Omit<Agendamento, 'id'>), id: d.id };
      await liberarSlotsDoAgendamento(ag);
      await deleteDoc(d.ref);
    }
    return docs.length;
  };

  await etapa('agendamentos (como cliente)', async () => {
    const snap = await getDocs(
      query(collection(db, 'agendamentos'), where('clienteUid', '==', uid)),
    );
    return apagarAgendamentos(snap.docs);
  });

  // Documentos antigos, criados antes de o cliente passar a ser identificado
  // por uid (item 9.3 da auditoria anterior): lá o vínculo era o email.
  if (email) {
    await etapa('agendamentos antigos (por email)', async () => {
      const snap = await getDocs(
        query(collection(db, 'agendamentos'), where('cliente', '==', email)),
      );
      return apagarAgendamentos(snap.docs);
    });
  }

  await etapa('agendamentos (como profissional)', async () => {
    const snap = await getDocs(
      query(collection(db, 'agendamentos'), where('barbeiroId', '==', uid)),
    );
    return apagarAgendamentos(snap.docs);
  });

  // ── Avaliações ─────────────────────────────────────────────────────────
  // Gravadas com o email do cliente (ver RatingComponent).
  if (email) {
    await etapa('avaliações', async () => {
      const snap = await getDocs(
        query(collection(db, 'avaliacoes'), where('cliente', '==', email)),
      );
      return apagarDocs(snap.docs);
    });
  }

  // ── Lista de espera / recorrências (o usuário pode estar nos dois papéis) ─
  for (const [colecao, campos] of [
    ['listaEspera', ['clienteUid', 'barbeiroId']],
    ['recorrencias', ['clienteUid', 'barbeiroId']],
  ] as const) {
    for (const campo of campos) {
      await etapa(colecao, async () => {
        const snap = await getDocs(
          query(collection(db, colecao), where(campo, '==', uid)),
        );
        return apagarDocs(snap.docs);
      });
    }
  }

  // ── Despesas (só profissional tem) ─────────────────────────────────────
  await etapa('despesas', async () => {
    const snap = await getDocs(
      query(collection(db, 'despesas'), where('barbeiroId', '==', uid)),
    );
    return apagarDocs(snap.docs);
  });

  // ── Subcoleções do profissional ────────────────────────────────────────
  // Antes do doc pai: a regra de `barbeiros/{id}/clientes` e `/banidos` lê
  // `barbeiros/{id}` para saber quem manda ali.
  const apagarSubcolecoesDoBarbeiro = async (barbeiroId: string) => {
    let total = 0;
    for (const sub of ['clientes', 'banidos']) {
      const snap = await getDocs(collection(db, 'barbeiros', barbeiroId, sub));
      total += await apagarDocs(snap.docs);
    }
    return total;
  };

  await etapa('agenda de clientes e banidos', () => apagarSubcolecoesDoBarbeiro(uid));

  // ── Equipe (se este usuário é dono de um negócio) ──────────────────────
  // Os profissionais criados pelo dono não têm login próprio: se o dono sai
  // e eles ficam, ninguém mais consegue apagá-los nem editá-los, e eles
  // continuam aparecendo na vitrine para os clientes.
  await etapa('equipe', async () => {
    const negocio = await getNegocioPorDono(uid);
    if (!negocio) return 0;
    let total = 0;

    const profissionais = await listarProfissionaisDoNegocio(negocio.id);
    for (const profissional of profissionais) {
      if (!profissional.id || profissional.id === uid) continue;

      // Agendamentos do profissional da equipe (autorizados pelo negocioId).
      const agsSnap = await getDocs(
        query(collection(db, 'agendamentos'), where('barbeiroId', '==', profissional.id)),
      );
      total += await apagarAgendamentos(agsSnap.docs);

      total += await apagarSubcolecoesDoBarbeiro(profissional.id);
      // Mesmo motivo da etapa 'foto de perfil' abaixo, mas para o uid do
      // profissional (não o do dono) — sem isso, o blob no Storage sobrevive
      // à exclusão do doc `barbeiros/{profissional.id}` acima. Captura local
      // (não deixa subir pro `etapa()` externo): uma falha aqui não pode
      // interromper a limpeza dos demais profissionais da equipe no loop.
      await apagarFotoPerfil(profissional.id).catch((error) => {
        console.warn(`[exclusao] falha ao apagar foto de ${profissional.id}:`, error?.message ?? error);
      });
      await deleteDoc(doc(db, 'barbeiros', profissional.id));
      total += 1;
    }

    const membros = await listarMembros(negocio.id);
    await Promise.all(
      membros.map((m) => deleteDoc(doc(db, 'negocios', negocio.id, 'membros', m.id))),
    );
    total += membros.length;

    await deleteDoc(doc(db, 'negocios', negocio.id));
    return total + 1;
  });

  // ── Vínculos com barbearias/profissionais ──────────────────────────────
  // Subcoleção privada do próprio cliente (`usuarios/{uid}/vinculos`) — sem
  // esta etapa, o Firestore não apaga sozinho ao remover o doc pai `usuarios/
  // {uid}` logo abaixo, e o registro de quais barbearias o titular
  // frequentou ficaria órfão para sempre (ninguém mais tem `uid` para provar
  // ser o dono e apagar depois). As regras liberam `delete` (não `create`/
  // `update`) ao próprio titular especificamente para este caso.
  await etapa('vínculos', async () => {
    const snap = await getDocs(collection(db, 'usuarios', uid, 'vinculos'));
    return apagarDocs(snap.docs);
  });

  // ── Foto de perfil (Storage) ────────────────────────────────────────────
  // Não fica no Firestore — sem esta etapa, o blob órfão permanecia no
  // Storage depois da conta apagada (LGPD, mesma lógica das demais etapas).
  // Tolerante a "nunca fez upload" (ver apagarFotoPerfil).
  await etapa('foto de perfil', async () => {
    await apagarFotoPerfil(uid);
    return 1;
  });

  // ── Vitrine do próprio usuário ─────────────────────────────────────────
  await etapa('vitrine', async () => {
    await removerBarbeiro(uid);
    return 1;
  });

  // ── Perfil (por último: `isBarbeiro()` nas regras depende dele) ─────────
  await etapa('perfil', async () => {
    await deleteProfile(uid);
    return 1;
  });

  return { removidos, erros };
}

export default apagarDadosDoUsuario;
