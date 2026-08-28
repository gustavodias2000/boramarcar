/**
 * OcupacaoService — controla os horários ocupados de cada barbeiro
 * SEM expor dados pessoais do cliente.
 *
 * A coleção `agendamentos` é privada (só o cliente dono e o barbeiro dono
 * podem ler). Mas o cliente precisa saber quais horários já estão tomados
 * para montar a grade de disponibilidade. Para isso usamos a coleção
 * `ocupacoes`, que contém apenas { barbeiroId, data, horario, agendamentoId }
 * — nada de nome, email ou telefone. O `agendamentoId` é um id opaco: só
 * quem já tem permissão de ler o agendamento consegue ligar o slot a alguém.
 *
 * DUAS CORREÇÕES DA AUDITORIA VIVEM AQUI:
 *
 * 1. Reserva atômica (`reservarSlots`): antes os blocos eram marcados um a um,
 *    em escritas independentes. Duas pessoas escolhendo o mesmo horário ao
 *    mesmo tempo conseguiam agendar as duas. Agora todos os blocos são lidos
 *    e gravados dentro de uma única `runTransaction`: se qualquer bloco já
 *    estiver ocupado — ou for ocupado por outra pessoa no meio do caminho —
 *    a transação inteira falha e nada é gravado.
 *
 * 2. Liberação completa (`liberarSlotsDoAgendamento`): um serviço de 1h ocupa
 *    dois blocos de 30 min, mas o cancelamento só apagava o primeiro, deixando
 *    o resto da agenda travado para sempre. Agora liberamos todos os slots do
 *    agendamento de uma vez.
 *
 * TELEMETRIA DA LIBERAÇÃO (ARQ-05): as duas funções de liberação engolem o
 * próprio erro de propósito — o cancelamento que as motivou já foi persistido,
 * e rejeitar aqui faria o usuário achar que o cancelamento falhou. Só que
 * engolir em silêncio é o que torna o slot órfão INVISÍVEL: o job
 * `reconciliarSlotsOrfaos` limpa o lixo, mas ninguém nunca vê POR QUE ele
 * aparece. Agora cada falha vira um evento em `eventosOperacionais` — o
 * comportamento observável continua idêntico (nada é lançado, nada muda na
 * tela), a diferença é que a causa raiz passa a ser consultável.
 */
import { db } from '../../firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { registrarAviso } from './ObservabilityService';
import type { DataISO, Horario } from '../types';

// ID determinístico do slot: evita duplicidade e facilita liberar depois.
// Ex.: "abc123_2026-07-20_09-00"
export const slotId = (barbeiroId: string, data: DataISO, horario: Horario): string =>
  `${barbeiroId}_${data}_${String(horario).replace(':', '-')}`;

/**
 * Erro lançado quando um ou mais blocos já estavam ocupados no momento da
 * reserva. A tela usa `horarios` para dizer exatamente qual horário caiu.
 */
export class HorarioIndisponivelError extends Error {
  horarios: Horario[];
  constructor(horarios: Horario[]) {
    super(
      horarios.length > 0
        ? `Horário indisponível: ${horarios.join(', ')}`
        : 'Horário indisponível',
    );
    this.name = 'HorarioIndisponivelError';
    this.horarios = horarios;
  }
}

/**
 * Retorna os horários já ocupados de um barbeiro numa data.
 * @returns ex.: ['09:00', '10:30']
 */
export async function getHorariosOcupados(
  barbeiroId?: string | null,
  data?: DataISO | null,
): Promise<Horario[]> {
  if (!barbeiroId || !data) return [];
  const q = query(
    collection(db, 'ocupacoes'),
    where('barbeiroId', '==', barbeiroId),
    where('data', '==', data),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (d.data() as { horario: Horario }).horario);
}

/**
 * Retorna os horários ocupados de um barbeiro num intervalo de datas,
 * agrupados por data — usado pelo calendário colorido (verde = tem
 * disponibilidade, cinza = lotado) para não precisar de uma query por dia.
 * Mesmo padrão de "1 equalidade + 1 intervalo, sem orderBy" já usado em
 * `listarConcluidosPorNegocio` (AgendamentoRepository), que não exige índice
 * composto adicional.
 */
export async function getOcupacoesPorPeriodo(
  barbeiroId: string,
  dataInicio: DataISO,
  dataFim: DataISO,
): Promise<Record<string, Horario[]>> {
  const q = query(
    collection(db, 'ocupacoes'),
    where('barbeiroId', '==', barbeiroId),
    where('data', '>=', dataInicio),
    where('data', '<=', dataFim),
  );
  const snap = await getDocs(q);
  const mapa: Record<string, Horario[]> = {};
  snap.docs.forEach((d) => {
    const item = d.data() as { data: DataISO; horario: Horario };
    if (!mapa[item.data]) mapa[item.data] = [];
    mapa[item.data].push(item.horario);
  });
  return mapa;
}

/**
 * Reserva TODOS os blocos de um agendamento de uma vez só, de forma atômica.
 *
 * Como funciona a garantia: dentro de `runTransaction` lemos cada documento
 * de slot ANTES de escrever qualquer coisa. O Firestore registra essas
 * leituras; se outro cliente gravar um desses documentos entre a leitura e o
 * commit, o commit é rejeitado e a transação é reexecutada automaticamente.
 * Na reexecução a leitura já encontra o slot ocupado e lançamos
 * `HorarioIndisponivelError`. Resultado: ou todos os blocos ficam reservados
 * para este agendamento, ou nenhum fica — nunca meia reserva, nunca dois
 * clientes no mesmo horário.
 *
 * @param horarios blocos de 30 min cobertos pelo serviço (com o intervalo)
 * @param agendamentoId id do agendamento correspondente — é o que autoriza a
 *        escrita nas regras do Firestore e o que permite liberar tudo depois
 * @throws HorarioIndisponivelError se algum bloco já estiver ocupado
 */
export async function reservarSlots(
  barbeiroId: string,
  data: DataISO,
  horarios: Horario[],
  agendamentoId: string,
): Promise<void> {
  const unicos = Array.from(new Set(horarios));
  if (unicos.length === 0) return;

  await runTransaction(db, async (transaction) => {
    const refs = unicos.map((h) => doc(db, 'ocupacoes', slotId(barbeiroId, data, h)));

    // 1) TODAS as leituras primeiro (exigência do Firestore).
    const snaps = await Promise.all(refs.map((ref) => transaction.get(ref)));

    // 2) Qualquer bloco já ocupado por OUTRO agendamento derruba tudo.
    const ocupados: Horario[] = [];
    snaps.forEach((snap, i) => {
      if (!snap.exists()) return;
      const dono = (snap.data() as { agendamentoId?: string }).agendamentoId;
      if (dono !== agendamentoId) ocupados.push(unicos[i]);
    });
    if (ocupados.length > 0) throw new HorarioIndisponivelError(ocupados);

    // 3) Só então grava.
    const todosJaPertencemAoAgendamento = snaps.every(
      (snap) => snap.exists()
        && (snap.data() as { agendamentoId?: string }).agendamentoId === agendamentoId,
    );
    if (todosJaPertencemAoAgendamento) return;

    refs.forEach((ref, i) => {
      transaction.set(ref, {
        barbeiroId,
        data,
        horario: unicos[i],
        agendamentoId,
        createdAt: serverTimestamp(),
      });
    });
  });
}

/**
 * Libera um horário (ao cancelar um agendamento).
 * Silencioso: se o slot não existir, não faz nada.
 */
export async function liberarSlot(
  barbeiroId?: string | null,
  data?: DataISO | null,
  horario?: Horario | null,
): Promise<void> {
  if (!barbeiroId || !data || !horario) return;
  try {
    await deleteDoc(doc(db, 'ocupacoes', slotId(barbeiroId, data, horario)));
  } catch (erro) {
    // NÍVEL 'warning', não 'error' — dois motivos:
    //  1. o cancelamento que motivou a liberação JÁ foi persistido; o que
    //     sobra é lixo (slot órfão) que `reconciliarSlotsOrfaos` limpa
    //     sozinho. Nada de irreversível aconteceu, e já existe um mecanismo
    //     de recuperação rodando em produção;
    //  2. VOLUME. Esta falha é independente de qualquer falha visível ao
    //     usuário: uma regra que bloqueie só o delete em `ocupacoes` produz
    //     um evento por cancelamento — e um serviço de 1h gera vários blocos
    //     — enquanto TODO cancelamento continua "dando certo" da perspectiva
    //     de quem clicou. Como 'error' isso encheria sozinho o gatilho de
    //     `alertarFalhasOperacionais` (5 eventos error/fatal em 15 min →
    //     email) para um problema que o job já remedia, e alerta que chega
    //     sem exigir ação treina o dono a ignorar o próximo. Como 'warning' o
    //     mesmo surto continua visível na consulta, só não acorda ninguém.
    //
    // O `console.warn` anterior foi removido, não substituído por outro:
    // `registrarEvento` já imprime no console em __DEV__ — e usa exatamente
    // `console.warn` para o nível 'warning' —, então a depuração local
    // continua igual (com o evento estruturado, inclusive). Em produção o
    // console.warn não chegava a lugar nenhum; manter os dois só duplicaria a
    // saída em DEV.
    //
    // Contexto sem dado pessoal: ids opacos, data e horário. Não existe nome,
    // email nem telefone no escopo desta função.
    registrarAviso(erro, {
      area: 'ocupacao',
      operacao: 'liberar-slot',
      barbeiroId,
      data,
      horario,
    }).catch(() => {});
  }
}

/**
 * Libera TODOS os blocos reservados por um agendamento.
 *
 * Caminho principal: query por `agendamentoId` (índice de campo único, criado
 * automaticamente pelo Firestore — não precisa de índice composto).
 *
 * Fallback: agendamentos criados antes desta correção não têm `agendamentoId`
 * gravado nos slots. Nesse caso apagamos pelo menos o bloco inicial, que é
 * exatamente o comportamento antigo — nenhuma regressão.
 */
export async function liberarSlotsDoAgendamento(ag: {
  id?: string | null;
  barbeiroId?: string | null;
  data?: DataISO | null;
  horario?: Horario | null;
}): Promise<void> {
  try {
    if (ag?.id) {
      const q = query(collection(db, 'ocupacoes'), where('agendamentoId', '==', ag.id));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
        return;
      }
    }
    await liberarSlot(ag?.barbeiroId, ag?.data, ag?.horario);
  } catch (erro) {
    // Mesmo nível e mesmo raciocínio de `liberarSlot` acima: 'warning'.
    //
    // CUIDADO AO MEXER AQUI: `ag` é o objeto de agendamento INTEIRO e carrega
    // `clienteNome`, `cliente` (email), `clienteTelefone` e `barbeiroNome`.
    // Passar `ag` direto — ou espalhar `...ag` — vazaria dado pessoal para a
    // telemetria. Por isso os campos são escolhidos um a um, e só entram ids
    // opacos, data e horário.
    registrarAviso(erro, {
      area: 'ocupacao',
      operacao: 'liberar-slots-do-agendamento',
      agendamentoId: ag?.id,
      barbeiroId: ag?.barbeiroId,
      data: ag?.data,
      horario: ag?.horario,
    }).catch(() => {});
  }
}

/**
 * Checagem barata (fora de transação) usada só para dar uma mensagem melhor
 * ao usuário antes de tentar a reserva. NÃO substitui `reservarSlots`: a
 * garantia real contra reserva dupla é a transação.
 */
export async function algumSlotOcupado(
  barbeiroId: string,
  data: DataISO,
  horarios: Horario[],
): Promise<Horario[]> {
  const snaps = await Promise.all(
    horarios.map((h) => getDoc(doc(db, 'ocupacoes', slotId(barbeiroId, data, h)))),
  );
  return horarios.filter((_, i) => snaps[i].exists());
}
