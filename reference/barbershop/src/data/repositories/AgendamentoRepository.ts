/**
 * AgendamentoRepository — único ponto de acesso à coleção `agendamentos`.
 *
 * Item 9.3 da auditoria: o cliente agora é identificado por `clienteUid`
 * (imutável) em vez de email. O email continua gravado no doc apenas para
 * exibição/contato.
 */
import { db, functions } from '../../../firebaseConfig';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  limit,
  serverTimestamp,
  getCountFromServer,
  type QueryConstraint,
} from 'firebase/firestore';
import { httpsCallable } from '../../services/CloudFunctionsClient';
import { ehIndiceIndisponivel } from '../../utils/consultaResiliente';
import { registrarAviso } from '../../services/ObservabilityService';
import type { Agendamento, NovoAgendamento, StatusAgendamento } from '../../types';

interface ListarClienteOpts {
  status?: StatusAgendamento | 'todos';
  max?: number;
}

const fromSnap = (d: { id: string; data: () => unknown }): Agendamento => ({
  ...(d.data() as Omit<Agendamento, 'id'>),
  id: d.id,
});

/**
 * O RECORTE "agendamentos deste cliente" — sem o `limit`, que é paginação e
 * não faz parte da definição do conjunto.
 *
 * Compartilhado entre `listarDoCliente` e `contarDoCliente` de propósito: a
 * contagem existe justamente para dizer o TOTAL, então ela é a mesma consulta
 * menos o teto. Qualquer filtro novo na listagem entra na contagem no mesmo
 * commit, em vez de virar um segundo número.
 */
const constraintsDoCliente = (
  clienteUid: string,
  status?: StatusAgendamento | 'todos',
): QueryConstraint[] => [
  where('clienteUid', '==', clienteUid),
  ...(status && status !== 'todos' ? [where('status', '==', status)] : []),
  orderBy('createdAt', 'desc'),
];

/**
 * Lista agendamentos do cliente logado (por uid, não por email).
 */
export async function listarDoCliente(
  clienteUid?: string | null,
  { status, max = 50 }: ListarClienteOpts = {},
): Promise<Agendamento[]> {
  if (!clienteUid) return [];
  const filtros: QueryConstraint[] = [...constraintsDoCliente(clienteUid, status), limit(max)];
  const snap = await getDocs(query(collection(db, 'agendamentos'), ...filtros));
  return snap.docs.map(fromSnap);
}

/**
 * Conta TODOS os agendamentos do cliente, sem teto e sem baixar documento.
 *
 * Existe porque `listarDoCliente` tem `limit`, e `length` de lista limitada
 * não é total: o ClienteHome buscava 20 para renderizar 3 e anunciava
 * "Ver todos (20)" para quem tinha 47. O número estava errado E as outras 17
 * leituras eram jogadas fora a cada foco da tela.
 *
 * Índice: a mesma consulta da listagem, sem o `limit` — nenhum índice novo.
 */
export async function contarDoCliente(
  clienteUid?: string | null,
  { status }: Pick<ListarClienteOpts, 'status'> = {},
): Promise<number> {
  if (!clienteUid) return 0;
  const snap = await getCountFromServer(
    query(collection(db, 'agendamentos'), ...constraintsDoCliente(clienteUid, status)),
  );
  return snap.data().count;
}

/**
 * Lista agendamentos do barbeiro logado.
 */
export async function listarDoBarbeiro(
  barbeiroId?: string | null,
  max: number = 50,
): Promise<Agendamento[]> {
  if (!barbeiroId) return [];
  const snap = await getDocs(
    query(
      collection(db, 'agendamentos'),
      where('barbeiroId', '==', barbeiroId),
      orderBy('createdAt', 'desc'),
      limit(max),
    ),
  );
  return snap.docs.map(fromSnap);
}

/**
 * Lista os agendamentos de todos os profissionais de um negócio (equipe).
 * Usado pelo dono, que gerencia a agenda de todo mundo a partir do próprio
 * login (profissionais da equipe não têm conta própria — ver NegocioRepository).
 */
export async function listarPorNegocio(
  negocioId?: string | null,
  max: number = 50,
): Promise<Agendamento[]> {
  if (!negocioId) return [];
  const snap = await getDocs(
    query(
      collection(db, 'agendamentos'),
      where('negocioId', '==', negocioId),
      orderBy('createdAt', 'desc'),
      limit(max),
    ),
  );
  return snap.docs.map(fromSnap);
}

/**
 * Lista os agendamentos concluídos de um negócio num período — base do
 * relatório de fechamento de comissões (soma por profissional).
 */
export async function listarConcluidosPorNegocio(
  negocioId: string,
  dataInicio: string,
  dataFim: string,
): Promise<Agendamento[]> {
  const snap = await getDocs(
    query(
      collection(db, 'agendamentos'),
      where('negocioId', '==', negocioId),
      where('status', '==', 'concluido'),
      where('data', '>=', dataInicio),
      where('data', '<=', dataFim),
    ),
  );
  return snap.docs.map(fromSnap);
}

/**
 * Lista os agendamentos do barbeiro num intervalo de datas (inclusive) —
 * usado pelo resumo "Esta semana" da tela Início. Precisa do índice
 * composto `barbeiroId` + `data` (ver firestore.indexes.json).
 */
export async function listarPorBarbeiroEPeriodo(
  barbeiroId: string,
  dataInicio: string,
  dataFim: string,
): Promise<Agendamento[]> {
  if (!barbeiroId) return [];
  const snap = await getDocs(
    query(
      collection(db, 'agendamentos'),
      where('barbeiroId', '==', barbeiroId),
      where('data', '>=', dataInicio),
      where('data', '<=', dataFim),
    ),
  );
  return snap.docs.map(fromSnap);
}

/**
 * Busca TODOS os agendamentos do negócio usando só o filtro de igualdade —
 * consulta que o Firestore atende com o índice de campo único (automático),
 * sem depender de nenhum índice composto.
 *
 * É o plano B de `listarPorNegocioEPeriodo` enquanto o índice
 * `negocioId + data` ainda está sendo construído (alguns minutos após
 * `firebase deploy --only firestore:indexes`). Mesmo padrão e mesma
 * justificativa de `DespesaRepository.buscarTodasDoBarbeiro`.
 */
async function buscarTodosDoNegocio(negocioId: string): Promise<Agendamento[]> {
  const snap = await getDocs(
    query(collection(db, 'agendamentos'), where('negocioId', '==', negocioId)),
  );
  return snap.docs.map(fromSnap);
}

/**
 * Lista os agendamentos de TODOS os profissionais do negócio num intervalo
 * de datas (inclusive) — base financeira dos relatórios do dono (ARQ-01).
 *
 * Espelha `listarConcluidosPorNegocio`: sem `orderBy` e sem `limit`. O
 * relatório soma um mês (ou um ano) inteiro — truncar em 50 documentos
 * daria um número menor que o real numa tela de dinheiro, sem nenhum aviso.
 * Precisa do índice composto `negocioId + data` (ver firestore.indexes.json);
 * o índice `negocioId + status + data` que já existia NÃO serve, porque
 * `status` ficaria entre a igualdade e o range.
 */
export async function listarPorNegocioEPeriodo(
  negocioId: string,
  dataInicio: string,
  dataFim: string,
): Promise<Agendamento[]> {
  if (!negocioId) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, 'agendamentos'),
        where('negocioId', '==', negocioId),
        where('data', '>=', dataInicio),
        where('data', '<=', dataFim),
      ),
    );
    return snap.docs.map(fromSnap);
  } catch (error) {
    if (!ehIndiceIndisponivel(error)) throw error;
    // Índice composto ainda em construção: cai para a consulta sem range
    // (só igualdade) e recorta o período em memória. É uma PONTE para a
    // janela entre publicar o APK e o índice terminar de construir — não um
    // regime permanente: baixar o negócio inteiro para recortar no
    // dispositivo custa leitura e banda, e só se sustenta por alguns
    // minutos. Mesmo plano B de `DespesaRepository.listarPorBarbeiroEPeriodo`.
    console.warn('[agendamentos] índice composto indisponível — filtrando o período em memória.');
    const todos = await buscarTodosDoNegocio(negocioId);
    return todos.filter((ag) => ag.data >= dataInicio && ag.data <= dataFim);
  }
}

/**
 * ─── Sentinela da fonte dupla (P3, Release A) ───────────────────────────────
 *
 * `listarDoEscopoFinanceiroPorPeriodo` faz DUAS consultas e deduplica, porque
 * agendamentos criados antes de a conta virar equipe não têm `negocioId`.
 * Queremos poder matar a segunda consulta um dia — mas essa decisão precisa
 * de EVIDÊNCIA de produção, não de argumento: "provavelmente todo mundo já
 * migrou" é exatamente o tipo de premissa que some receita em silêncio.
 *
 * A sentinela mede o único fato que decide a questão: existe agendamento que
 * a consulta por `barbeiroId` acha e a consulta por `negocioId` não acha?
 * Enquanto essa resposta for "sim" em qualquer barbearia, a segunda consulta
 * fica. Quando for "não" por tempo suficiente, ela pode sair.
 *
 * CUSTO ZERO DE LEITURA. Trabalha sobre os dois arrays JÁ buscados. Nenhuma
 * consulta nova, nenhum documento novo.
 *
 * POR QUE `warning` E NÃO `error`. `alertarFalhasOperacionais` dispara email
 * a partir de 5 `error` em 15 minutos. Esta sentinela vai acender em TODA
 * barbearia com histórico anterior à equipe — que é o caso esperado, não uma
 * falha. Marcá-la como `error` encheria a caixa do dono de alarme que não
 * pede ação nenhuma, e alarme inflado ensina a ignorar o painel inteiro.
 *
 * PRIVACIDADE. Sai daqui a QUANTIDADE e ids técnicos — nunca nome, email,
 * telefone ou qualquer campo do cliente. Repare na forma do `amostra`: uma
 * lista de objetos `{ agendamentoId }`, não uma lista de strings. Não é
 * estilo. `sanitizarProfundo` preserva id do Firestore apenas quando ele
 * está sob uma CHAVE conhecida (`CHAVES_ID_TECNICO`); uma string solta dentro
 * de um array cai no padrão de alta entropia e volta como `[redigido]` — a
 * amostra chegaria inútil do outro lado.
 */
const MAXIMO_IDS_NA_AMOSTRA = 3;

/**
 * Chaves de divergência já reportadas nesta sessão do app.
 *
 * DESVIO DELIBERADO da especificação, marcado para revisão. Sem isto, a
 * sentinela emite um evento por CHAMADA: o Início faz duas por foco (semana e
 * mês), e Relatórios e Vendas fazem as suas — dezenas de invocações de
 * Callable por dia, por aparelho, todas dizendo exatamente a mesma coisa.
 *
 * A pergunta que o Release A precisa responder é "isto acontece?", não
 * "quantas vezes por minuto?" — e a chave inclui a quantidade e o período,
 * então QUALQUER divergência nova continua sendo reportada. O que morre é só
 * a repetição idêntica dentro da mesma sessão. Se o objetivo for medir
 * frequência, apague este Set e a checagem abaixo.
 */
const divergenciasJaReportadas = new Set<string>();

function reportarDivergenciaDeFonteDupla(
  barbeiroId: string,
  negocioId: string,
  doNegocio: Agendamento[],
  proprios: Agendamento[],
): void {
  const idsDoNegocio = new Set(doNegocio.map((ag) => ag.id));
  const soNoProprio = proprios.filter((ag) => !idsDoNegocio.has(ag.id));
  if (soNoProprio.length === 0) return;

  const chave = `${barbeiroId}|${negocioId}|${soNoProprio.length}`;
  if (divergenciasJaReportadas.has(chave)) return;
  divergenciasJaReportadas.add(chave);

  registrarAviso('agendamentos achados so pela consulta do barbeiro', {
    area: 'financeiro',
    operacao: 'fonte-dupla-divergente',
    barbeiroId,
    negocioId,
    quantidade: soNoProprio.length,
    amostra: soNoProprio
      .slice(0, MAXIMO_IDS_NA_AMOSTRA)
      .map((ag) => ({ agendamentoId: ag.id })),
  }).catch(() => {});
}

/**
 * Agendamentos que compõem o resultado financeiro do barbeiro logado num
 * período — o escopo que as telas de relatório (Início, Relatórios, Vendas)
 * devem somar (ARQ-01).
 *
 * Regra: quem tem equipe fatura pela equipe inteira; quem é solo fatura só
 * o próprio atendimento.
 *
 * Duas fontes são necessárias porque `negocioId` é denormalizado no momento
 * da criação (ver functions/index.js): agendamentos criados ANTES de a conta
 * virar equipe não têm o campo, e sumiriam do relatório do dono no dia em
 * que ele criasse o negócio — receita despencando sem nada ter acontecido.
 * Mesmo problema, mesma solução, já usados na agenda (BarbeiroHome).
 *
 * A união é feita por `id` num Map: o agendamento do PRÓPRIO dono aparece
 * nas duas fontes (tem `negocioId` e `barbeiroId == uid`), e concatenar sem
 * deduplicar dobraria a receita dele. Esta função existe justamente para que
 * as três telas não reimplementem essa dedupe — a regra mora num lugar só.
 *
 * Sem ordenação: todos os consumidores agregam (somam/agrupam), nenhum
 * exibe a lista crua.
 */
export async function listarDoEscopoFinanceiroPorPeriodo(
  barbeiroId: string,
  negocioId: string | null | undefined,
  dataInicio: string,
  dataFim: string,
): Promise<Agendamento[]> {
  if (!barbeiroId) return [];
  // Barbeiro solo: uma consulta só, o mesmo índice de sempre, resultado
  // idêntico ao de antes — não regride por construção.
  if (!negocioId) return listarPorBarbeiroEPeriodo(barbeiroId, dataInicio, dataFim);

  const [doNegocio, proprios] = await Promise.all([
    listarPorNegocioEPeriodo(negocioId, dataInicio, dataFim),
    listarPorBarbeiroEPeriodo(barbeiroId, dataInicio, dataFim),
  ]);

  reportarDivergenciaDeFonteDupla(barbeiroId, negocioId, doNegocio, proprios);

  const porId = new Map<string, Agendamento>();
  [...doNegocio, ...proprios].forEach((ag) => {
    if (ag.id) porId.set(ag.id, ag);
  });
  return Array.from(porId.values());
}

/** Ordena a agenda cronologicamente depois de unir fontes sem ordem no servidor. */
function ordenarPorDataEHorario(agendamentos: Agendamento[]): Agendamento[] {
  return agendamentos.sort((a, b) => {
    const porData = (a.data || '').localeCompare(b.data || '');
    return porData || (a.horario || '').localeCompare(b.horario || '');
  });
}

/**
 * Busca uma única fonte da agenda já recortada por status. Não acrescentamos
 * `orderBy`: os índices existentes atendem os filtros e a ordenação acontece
 * depois da deduplicação, que é obrigatória para o escopo de equipe.
 */
async function listarPorEscopoEStatus(
  campo: 'barbeiroId' | 'negocioId',
  escopoId: string,
  status: StatusAgendamento,
): Promise<Agendamento[]> {
  const snap = await getDocs(
    query(
      collection(db, 'agendamentos'),
      where(campo, '==', escopoId),
      where('status', '==', status),
    ),
  );
  return snap.docs.map(fromSnap);
}

/**
 * Lista todos os pendentes do escopo da Agenda, sem recorte de data.
 *
 * Para equipe, a fonte do negócio traz todos os profissionais e a fonte do
 * próprio dono preserva os documentos legados anteriores ao `negocioId`.
 * Um atendimento novo do dono aparece nas duas e é deduplicado pelo id.
 */
export async function listarPendentesDoEscopo(
  barbeiroId: string,
  negocioId: string | null | undefined,
): Promise<Agendamento[]> {
  if (!barbeiroId) return [];

  if (!negocioId) {
    return ordenarPorDataEHorario(
      await listarPorEscopoEStatus('barbeiroId', barbeiroId, 'pendente'),
    );
  }

  const [doNegocio, proprios] = await Promise.all([
    listarPorEscopoEStatus('negocioId', negocioId, 'pendente'),
    listarPorEscopoEStatus('barbeiroId', barbeiroId, 'pendente'),
  ]);
  const porId = new Map<string, Agendamento>();
  [...doNegocio, ...proprios].forEach((ag) => {
    if (ag.id) porId.set(ag.id, ag);
  });
  return ordenarPorDataEHorario(Array.from(porId.values()));
}

/**
 * Lista os confirmados cujo atendimento é no dia local informado. A consulta
 * por período existente já limita ambas as fontes ao dia e preserva a
 * deduplicação de equipe/legado; filtrar o status depois evita um índice novo
 * `barbeiroId + status + data` apenas para este card.
 */
export async function listarConfirmadosHojeDoEscopo(
  barbeiroId: string,
  negocioId: string | null | undefined,
  hojeISO: string,
): Promise<Agendamento[]> {
  if (!barbeiroId || !hojeISO) return [];
  const doDia = await listarDoEscopoFinanceiroPorPeriodo(
    barbeiroId,
    negocioId,
    hojeISO,
    hojeISO,
  );
  return ordenarPorDataEHorario(doDia.filter((ag) => ag.status === 'confirmado'));
}

/**
 * Conta os agendamentos AINDA POR ACONTECER (pendentes ou confirmados, de
 * hoje em diante) de um profissional da equipe — usado pelo aviso de
 * desativação em EquipeScreen (DOM-02).
 *
 * Filtra por `negocioId` e recorta o `barbeiroId` em memória, de propósito.
 * A forma óbvia (`where('barbeiroId','==',X)`) seria pior por dois motivos:
 *
 *  1. exigiria um índice composto novo, enquanto esta consulta reusa o
 *     `negocioId + status + data` que JÁ existe em firestore.indexes.json;
 *  2. `negocioId` é o campo que a regra de segurança lê para autorizar o
 *     dono (`podeGerenciarAgendamento` → `isDonoDoNegocio`). Consulta cujo
 *     filtro não bate com o que a regra prova é negada inteira pelo
 *     Firestore — aconteceu de verdade neste projeto, está documentado em
 *     `NegocioRepository.getNegocioPorDono`.
 *
 * `hojeISO` é injetado (a tela passa `toLocalDateString(new Date())`, data
 * LOCAL — em UTC o dia vira antes da meia-noite no horário de Brasília) para
 * a contagem ser testável sem depender do relógio da máquina.
 */
export async function contarFuturosDoProfissional(
  negocioId: string,
  barbeiroId: string,
  hojeISO: string,
): Promise<number> {
  if (!negocioId || !barbeiroId) return 0;
  const snap = await getDocs(
    query(
      collection(db, 'agendamentos'),
      where('negocioId', '==', negocioId),
      where('status', 'in', ['pendente', 'confirmado']),
      where('data', '>=', hojeISO),
    ),
  );
  return snap.docs.map(fromSnap).filter((ag) => ag.barbeiroId === barbeiroId).length;
}

/**
 * Lista o histórico completo de agendamentos entre um cliente e um
 * profissional específicos, mais recente primeiro — base de
 * `HistoricoClienteScreen.tsx` (visitas, total gasto, frequência).
 *
 * ARCH-002 (auditoria, Onda 3): antes essa query vivia direto na tela
 * (`query`/`collection`/`where`/`getDocs` de `firebase/firestore`
 * importados ali). Move para cá — mesma coleção das demais funções deste
 * arquivo — em vez de para um repositório novo: apesar de o pedido original
 * da auditoria ter cogitado colocar isso junto da avaliação
 * (`AvaliacaoRepository`), a query é 100% sobre `agendamentos` (mesmo
 * índice composto `clienteUid`+`barbeiroId`+`data` já declarado em
 * `firestore.indexes.json`), sem nenhuma relação com a coleção
 * `avaliacoes` — mantém "um repositório por coleção" em vez de furar essa
 * convenção do próprio projeto.
 */
export async function listarPorClienteEBarbeiro(
  clienteUid?: string | null,
  barbeiroId?: string | null,
): Promise<Agendamento[]> {
  if (!clienteUid || !barbeiroId) return [];
  const snap = await getDocs(
    query(
      collection(db, 'agendamentos'),
      where('clienteUid', '==', clienteUid),
      where('barbeiroId', '==', barbeiroId),
      orderBy('data', 'desc'),
    ),
  );
  return snap.docs.map(fromSnap);
}

/**
 * Conta os agendamentos pendentes de confirmação do barbeiro — contagem
 * agregada no servidor (mesmo padrão do `AnalyticsDashboard`), sem baixar
 * os documentos. Usa o índice composto já existente `barbeiroId + status`.
 */
export async function contarPendentesDoBarbeiro(barbeiroId?: string | null): Promise<number> {
  if (!barbeiroId) return 0;
  const snap = await getCountFromServer(
    query(
      collection(db, 'agendamentos'),
      where('barbeiroId', '==', barbeiroId),
      where('status', '==', 'pendente'),
    ),
  );
  return snap.data().count;
}

/**
 * Cria um novo agendamento. createdAt é sempre do servidor.
 *
 * AG-05: nem cliente nem barbeiro escrevem agendamentos diretamente no
 * Firestore — as duas Cloud Functions conferem serviço/preço/agenda no
 * profissional e criam agendamento + slots atomicamente, cada uma com a
 * autorização certa para o ator (cliente reservando para si mesmo, ou
 * barbeiro/dono lançando um atendimento manual em nome de um cliente sem
 * conta no app).
 * @returns id do documento criado
 */
export async function criarAgendamento(dados: NovoAgendamento): Promise<string> {
  if (dados.origem === 'manual') {
    const resultado = await httpsCallable<
      Pick<NovoAgendamento, 'barbeiroId' | 'data' | 'horario' | 'servicoId' | 'clienteNome' | 'clienteTelefone'>,
      { agendamento: { id: string } }
    >(functions, 'criarAgendamentoManualSeguro')({
      barbeiroId: dados.barbeiroId,
      data: dados.data,
      horario: dados.horario,
      servicoId: dados.servicoId || '',
      clienteNome: dados.clienteNome || '',
      ...(dados.clienteTelefone ? { clienteTelefone: dados.clienteTelefone } : {}),
    });
    return resultado.data.agendamento.id;
  }
  const resultado = await httpsCallable<
    Pick<NovoAgendamento, 'barbeiroId' | 'data' | 'horario' | 'servicoId'>,
    { agendamento: { id: string } }
  >(functions, 'criarAgendamentoSeguro')({
    barbeiroId: dados.barbeiroId,
    data: dados.data,
    horario: dados.horario,
    servicoId: dados.servicoId || '',
  });
  return resultado.data.agendamento.id;
}

/**
 * Apaga um agendamento de vez.
 *
 * Usado em dois lugares: para desfazer um agendamento cuja reserva de
 * horário falhou (ver AgendamentoScreen — evita deixar um agendamento órfão
 * sem horário reservado) e na exclusão de conta (LGPD).
 */
export async function removerAgendamento(id: string): Promise<void> {
  await deleteDoc(doc(db, 'agendamentos', id));
}

/**
 * Atualiza o status de um agendamento com carimbo de tempo do servidor.
 */
export async function atualizarStatus(
  id: string,
  status: Exclude<StatusAgendamento, 'pendente'>,
  extras: Record<string, unknown> = {},
): Promise<void> {
  const stampField: Record<Exclude<StatusAgendamento, 'pendente'>, string> = {
    confirmado: 'confirmedAt',
    cancelado: 'cancelledAt',
    concluido: 'concludedAt',
    avaliado: 'ratedAt',
  };

  await updateDoc(doc(db, 'agendamentos', id), {
    status,
    [stampField[status]]: serverTimestamp(),
    ...extras,
  });
}

/**
 * Conta os agendamentos AINDA VIVOS (pendentes ou confirmados) que caem
 * dentro de uma faixa de horário que o barbeiro está prestes a bloquear —
 * usado pelo aviso de bloqueio em BloqueiosScreen (AG-03).
 *
 * Irmã de `contarFuturosDoProfissional`, mesma disciplina: CONTAR e AVISAR.
 * Nada aqui cancela nada — quem chama nunca deve encadear `atualizarStatus`
 * no resultado (ver o comentário em `BloqueiosScreen.handleAdicionar`).
 *
 * ── Por que ESTAS duas cláusulas e não outras ───────────────────────────────
 *
 * `barbeiroId` + `data` (as duas de igualdade) reusam o índice composto
 * `barbeiroId + data` que JÁ existe em firestore.indexes.json — o mesmo de
 * `listarPorBarbeiroEPeriodo`. Nenhum índice novo é criado.
 *
 * O `status` fica FORA da consulta e é recortado em memória de propósito:
 * `where('status','in',[...])` entre as duas igualdades exigiria um índice
 * `barbeiroId + status + data` que não existe (o que existe é
 * `barbeiroId + status + createdAt`, que não serve). O recorte custa nada:
 * o resultado é a agenda de UM profissional em UM dia.
 *
 * `barbeiroId` também é o campo que a regra do Firestore lê para autorizar o
 * próprio barbeiro (`podeGerenciarAgendamento` → `ag.barbeiroId ==
 * request.auth.uid`) — o mesmo cuidado que fez `contarFuturosDoProfissional`
 * escolher `negocioId`, aplicado ao ator daqui. Quando quem edita é o DONO
 * mexendo na agenda de um profissional da equipe, a autorização sai pelo
 * outro ramo da mesma regra (`isDonoDoNegocio(ag.negocioId)`), que vale
 * porque `negocioId` é denormalizado em todo agendamento criado para um
 * profissional de equipe (functions/index.js). Se ainda assim a leitura for
 * negada, quem chama trata como "não sei" — nunca como zero.
 *
 * ── Sobreposição: por hora de INÍCIO, e por que só ela ──────────────────────
 *
 * Conta quem COMEÇA dentro de [horaInicio, horaFim) — início inclusivo, fim
 * exclusivo, exatamente o recorte que `filtrarBloqueiosHorario`
 * (src/utils/agendaSlots.ts) aplica ao instante inicial de um slot: lá um
 * slot que começa em `horaFim` não é bloqueado, e um que começa em
 * `horaInicio` é.
 *
 * O que NÃO dá para fazer aqui é o outro lado da sobreposição de
 * `filtrarBloqueiosHorario` (`slotFim > bInicio`): o documento de agendamento
 * NÃO guarda duração. Os campos gravados por `criarAgendamentoSeguro` são
 * barbeiroId/cliente/status/data/horario/servico/preco — `servico` é só o
 * NOME do serviço, e `duracaoMinutos` vive no catálogo do profissional, que
 * muda com o tempo. Deduzir a duração de um agendamento antigo pelo catálogo
 * de hoje seria adivinhação.
 *
 * Consequência assumida: um atendimento das 13:30 que avança sobre um
 * bloqueio das 14:00 não entra nesta conta. A contagem é um PISO, e o aviso
 * que ela alimenta é consultivo — nunca impede a ação. Fechar essa faixa
 * exige cruzar com `ocupacoes` (que guarda o intervalo real, em blocos de
 * 30 min, com o `agendamentoId`) ou denormalizar a duração no agendamento na
 * Cloud Function — as duas coisas fora do escopo desta correção.
 */
export async function contarNaFaixaBloqueada(
  barbeiroId: string,
  data: string,
  horaInicio: string,
  horaFim: string,
): Promise<number> {
  if (!barbeiroId || !data || !horaInicio || !horaFim) return 0;
  const snap = await getDocs(
    query(
      collection(db, 'agendamentos'),
      where('barbeiroId', '==', barbeiroId),
      where('data', '==', data),
    ),
  );
  return snap.docs.map(fromSnap).filter((ag) => {
    // Só o que ainda vai acontecer: 'concluido', 'cancelado' e 'avaliado'
    // não ocupam mais nada na agenda e não são notícia para o barbeiro.
    if (ag.status !== 'pendente' && ag.status !== 'confirmado') return false;
    // Comparação de string em 'HH:MM' — ordena corretamente por ser de
    // largura fixa e zero-padded (mesma premissa dos chips desta tela).
    return typeof ag.horario === 'string'
      && ag.horario >= horaInicio
      && ag.horario < horaFim;
  }).length;
}
