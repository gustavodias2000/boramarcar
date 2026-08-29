/**
 * NegocioRepository — modelo de "equipe" (multi-profissional).
 *
 * Um negócio agrupa vários documentos `Barbeiro` sob um dono único
 * (`negocios/{negocioId}`, com a subcoleção privada
 * `negocios/{negocioId}/membros/{barbeiroId}` guardando papel e comissão).
 *
 * Profissionais criados pelo dono (Opção A do plano) não têm login próprio:
 * o id do documento `Barbeiro` é gerado pelo Firestore e não corresponde a
 * nenhum uid do Firebase Auth. A permissão de escrita vem de ser dono do
 * negócio (ver firestore.rules), não de `isOwner(barbeiroId)`.
 */
import { db, functions } from '../../../firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import type { Barbeiro, MembroEquipe, Negocio, PapelEquipe, TipoComissao } from '../../types';
import {
  getBarbeiro,
  upsertBarbeiro,
  gravarBarbeiroSeNaoMudou,
  ehConflitoDeVersao,
  type MarcaDeVersao,
} from './BarbeiroRepository';
import { sortearFotoPadrao } from '../../assets/barbeirosPadrao';
import CacheService from '../../services/CacheService';
import { httpsCallable } from '../../services/CloudFunctionsClient';
import { registrarAviso } from '../../services/ObservabilityService';
import { semCamposIndefinidos } from '../../utils/firestoreUtils';

// Mesmo prefixo usado em BarbeiroRepository. A função que criava chaves com
// esse prefixo (`listarBarbeiros`) foi removida por ser código morto (ver
// auditoria — substituída por `useBarbeariasVinculadas`/
// `VinculoClienteRepository`), então hoje esta invalidação é um no-op. Mantida
// de propósito: se algum dia surgir outra leitura em lista cacheada com esse
// prefixo, ela já sai invalidada por escrita aqui, sem exigir lembrar de
// religar isso.
const PREFIXO_LISTA_BARBEIROS = 'barbeiros:list:';

// COST-004 (auditoria — Onda 2): `listarProfissionaisDoNegocio` era o único
// método deste repositório sem cache, diferente do resto (ver `getBarbeiro`
// em BarbeiroRepository.ts). Mesmo TTL de `getBarbeiro` (2min): é a mesma
// natureza de dado — a lista de profissionais de UM negócio muda na mesma
// cadência que o doc individual de um barbeiro (edição manual do dono), não
// há motivo para um TTL diferente. A chave SEMPRE inclui `negocioId` —
// nunca compartilhar essa lista entre negócios diferentes (isolamento
// multi-tenant).
const TTL_PROFISSIONAIS_MS = 2 * 60 * 1000;
const chaveProfissionaisDoNegocio = (negocioId: string) => `negocio:${negocioId}:profissionais`;

/**
 * Atualiza campos do doc público `barbeiros/{id}` de um profissional da
 * equipe SEM passar pelo `upsertBarbeiro` do BarbeiroRepository — este
 * último sempre grava um campo `uid` igual ao id passado, o que é errado
 * aqui: profissionais criados pelo dono (Opção A) não têm login/uid próprio.
 * Use também para o dono editar nome/especialidade de um membro da equipe.
 */
export async function atualizarProfissional(
  barbeiroId: string,
  dados: Partial<Omit<Barbeiro, 'id' | 'uid'>>,
): Promise<void> {
  // A maioria das chamadas (agenda, serviços, bloqueios, folgas) não passa
  // `negocioId` em `dados` — só edita outros campos. Para invalidar a lista
  // cacheada do negócio certo mesmo assim, descobre o `negocioId` ANTES da
  // escrita (usa o cache de `getBarbeiro`, geralmente já quente porque a
  // tela que chamou isto acabou de carregar o mesmo documento — não é uma
  // leitura nova na maioria dos casos).
  const negocioId = dados.negocioId ?? (await getBarbeiro(barbeiroId))?.negocioId;

  await setDoc(
    doc(db, 'barbeiros', barbeiroId),
    { ...semCamposIndefinidos(dados), updatedAt: serverTimestamp() },
    { merge: true },
  );
  CacheService.invalidate(`barbeiro:${barbeiroId}`);
  CacheService.invalidatePrefix(PREFIXO_LISTA_BARBEIROS);
  if (negocioId) CacheService.invalidate(chaveProfissionaisDoNegocio(negocioId));
}

/**
 * `atualizarProfissional` com detecção de conflito (DOM-01).
 *
 * Mesmo payload (sem `uid` — profissionais da Opção A não têm conta no Auth) e
 * MESMAS três invalidações de cache da versão sem transação. A descoberta do
 * `negocioId` continua acontecendo ANTES da escrita, pelo mesmo motivo
 * explicado em `atualizarProfissional`, e é de graça no caso normal (o cache
 * de `getBarbeiro` acabou de ser aquecido pela tela que carregou o documento).
 *
 * Conflito invalida as mesmas chaves do sucesso — pelo mesmo motivo explicado
 * em `upsertBarbeiroSeNaoMudou`: a recusa PROVA que o documento em cache está
 * velho, e sem invalidar o "Recarregar" da tela devolveria a mesma versão.
 * Erro de rede não invalida nada.
 *
 * @throws ConflitoDeVersaoError se o documento mudou desde a carga
 */
export async function atualizarProfissionalSeNaoMudou(
  barbeiroId: string,
  dados: Partial<Omit<Barbeiro, 'id' | 'uid'>>,
  marcaCarregada: MarcaDeVersao,
): Promise<void> {
  const negocioId = dados.negocioId ?? (await getBarbeiro(barbeiroId))?.negocioId;

  const invalidar = () => {
    CacheService.invalidate(`barbeiro:${barbeiroId}`);
    CacheService.invalidatePrefix(PREFIXO_LISTA_BARBEIROS);
    if (negocioId) CacheService.invalidate(chaveProfissionaisDoNegocio(negocioId));
  };

  try {
    await gravarBarbeiroSeNaoMudou(barbeiroId, semCamposIndefinidos(dados), marcaCarregada);
  } catch (erro) {
    if (ehConflitoDeVersao(erro)) invalidar();
    throw erro;
  }
  invalidar();
}

const membrosRef = (negocioId: string) =>
  collection(db, 'negocios', negocioId, 'membros');

/**
 * Busca um negócio pelo id.
 */
export async function getNegocio(negocioId?: string | null): Promise<Negocio | null> {
  if (!negocioId) return null;
  const snap = await getDoc(doc(db, 'negocios', negocioId));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<Negocio, 'id'>), id: snap.id };
}

/**
 * Busca o negócio do qual o uid logado é dono (no máximo um, hoje).
 *
 * Antes fazia uma QUERY em `negocios` (where donoUid == uid) — mas o
 * Firestore não consegue provar a regra de segurança de `negocios` para
 * esse tipo de busca (ela depende de uma leitura na subcoleção `membros`
 * sem relação direta com o campo `donoUid` filtrado), e nega a operação
 * inteira mesmo quando o usuário é o dono de verdade (reproduzido em teste
 * real: "Missing or insufficient permissions" logo ao abrir Agenda/Equipe).
 *
 * Em vez disso, busca o `negocioId` já denormalizado no próprio doc
 * `barbeiros/{donoUid}` (gravado por `criarNegocio`) e então busca o
 * negócio por ID conhecido — um `get()` simples, que a regra já suporta.
 */
export async function getNegocioPorDono(donoUid?: string | null): Promise<Negocio | null> {
  if (!donoUid) return null;
  const barbeiro = await getBarbeiro(donoUid);
  if (!barbeiro?.negocioId) return null;
  return getNegocio(barbeiro.negocioId);
}

/**
 * Só o ID do negócio do dono — sem ler `negocios/{id}`.
 *
 * PERF (Onda 4): a maioria das telas que chamava `getNegocioPorDono` usava
 * exclusivamente `negocio.id`, e esse id já vem de graça no doc do barbeiro
 * (`criarNegocio` denormaliza `negocioId`/`negocioNome` via `upsertBarbeiro`).
 * A segunda leitura era pura perda:
 *
 *  - custo — a regra de `negocios/{id}` (firestore.rules) avalia
 *    `isDonoDoNegocio(negocioId)`, que faz `exists()` + `get()` na subcoleção
 *    `membros`; access calls de regra são cobradas como leitura, então cada
 *    `getNegocio` custava ~2 leituras, não 1;
 *  - latência — o `await` ficava EM SÉRIE antes do `Promise.all` das telas
 *    quentes (Início, Relatórios, Vendas), somando 1 RTT ao caminho crítico
 *    do primeiro paint;
 *  - correção — quando essa leitura era negada (membro faltando, regra
 *    recém-publicada), o `comFallback` das telas financeiras degradava para
 *    `null` e o faturamento era sub-reportado EM SILÊNCIO. Sem a leitura,
 *    essa classe de falha deixa de existir.
 *
 * Herda o cache e a invalidação de `getBarbeiro` (TTL de 2min, invalidado por
 * `upsertBarbeiro`, `atualizarProfissional` e `definirAtivoProfissional`) —
 * nenhuma chave de cache nova.
 *
 * Use `getNegocioPorDono` apenas quando precisar de outro campo do negócio
 * (hoje só `EquipeScreen`, que renderiza `negocio.nome`).
 */
export async function getNegocioIdDoDono(donoUid?: string | null): Promise<string | null> {
  if (!donoUid) return null;
  return (await getBarbeiro(donoUid))?.negocioId ?? null;
}

/**
 * Cria um negócio novo para o barbeiro logado ("transformar em equipe"):
 * cria o doc `negocios/{id}`, registra o dono como membro, e marca o
 * próprio Barbeiro do dono com o `negocioId` recém-criado.
 */
export async function criarNegocio(donoUid: string, nome: string): Promise<Negocio> {
  // Não dá para juntar as duas escritas abaixo num writeBatch: a regra de
  // `negocios/{negocioId}/membros/{donoUid}` faz um get() no doc de negócio,
  // e get() dentro de uma regra de segurança NÃO enxerga escritas pendentes
  // do MESMO batch/transação — só o estado já commitado antes. Num batch, a
  // regra do membro sempre veria "negócio ainda não existe" e falharia.
  const negocioDoc = await addDoc(collection(db, 'negocios'), {
    donoUid,
    nome,
    createdAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(membrosRef(negocioDoc.id), donoUid), {
      id: donoUid,
      barbeiroId: donoUid,
      papel: 'dono' as PapelEquipe,
      ativo: true,
      createdAt: serverTimestamp(),
    });
  } catch (erro) {
    // Sem o membro "dono", o negócio fica travado pra sempre (nenhuma regra
    // de isDonoDoNegocio() nunca mais autoriza nada nele) — melhor apagar e
    // deixar quem chamou tentar de novo do zero do que deixar lixo órfão.
    await deleteDoc(negocioDoc).catch(() => {});
    throw erro;
  }

  await upsertBarbeiro(donoUid, { negocioId: negocioDoc.id, negocioNome: nome });

  // Carimba os agendamentos ANTIGOS do dono com o negocioId recém-criado
  // (Release B1). Sem isto, todo atendimento feito antes de "virar equipe"
  // fica sem o campo para sempre — e é justamente por causa desse buraco que
  // `listarDoEscopoFinanceiroPorPeriodo` precisa consultar duas fontes e
  // deduplicar por id, o que impede trocar as telas de dinheiro por agregação
  // server-side. Este é o ÚNICO ponto do app em que um barbeiro existente
  // passa de sem-negocioId para com-negocioId; fechá-lo aqui é o que impede o
  // buraco de reabrir a cada equipe nova.
  //
  // DEPOIS do upsertBarbeiro de propósito: a Function lê
  // `barbeiros/{donoUid}.negocioId` para provar que o carimbo é o correto, e
  // recusa com `failed-precondition` se for chamada antes.
  //
  // Falha aqui NÃO derruba a criação do negócio: o negócio já existe, já tem
  // o membro-dono e já está denormalizado no doc do barbeiro — está válido e
  // utilizável. O carimbo é uma otimização de leitura, não parte do contrato;
  // o backfill agendado (`backfillNegocioIdAgendamentos`) pega o que sobrar.
  try {
    await httpsCallable<{ negocioId: string }, { carimbados: number }>(
      functions,
      'carimbarAgendamentosDoNovoNegocio',
    )({ negocioId: negocioDoc.id });
  } catch (erro) {
    registrarAviso(erro, {
      area: 'negocio',
      operacao: 'carimbar-agendamentos-do-novo-negocio',
      negocioId: negocioDoc.id,
    }).catch(() => {});
  }

  return { id: negocioDoc.id, donoUid, nome };
}

/**
 * Lista os membros (profissionais) de um negócio.
 */
export async function listarMembros(negocioId?: string | null): Promise<MembroEquipe[]> {
  if (!negocioId) return [];
  const snap = await getDocs(membrosRef(negocioId));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<MembroEquipe, 'id'>), id: d.id }));
}

/**
 * Busca a config de um membro específico (ex.: comissão).
 */
export async function getMembro(
  negocioId?: string | null,
  barbeiroId?: string | null,
): Promise<MembroEquipe | null> {
  if (!negocioId || !barbeiroId) return null;
  const snap = await getDoc(doc(membrosRef(negocioId), barbeiroId));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<MembroEquipe, 'id'>), id: snap.id };
}

/**
 * Atualiza dados do membro (ativo/inativo, comissão). Merge parcial.
 */
export async function upsertMembro(
  negocioId: string,
  barbeiroId: string,
  dados: Partial<Omit<MembroEquipe, 'id' | 'barbeiroId'>>,
): Promise<void> {
  await setDoc(
    doc(membrosRef(negocioId), barbeiroId),
    { id: barbeiroId, barbeiroId, ...dados, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Define/atualiza a comissão de um profissional.
 */
export async function definirComissao(
  negocioId: string,
  barbeiroId: string,
  tipo: TipoComissao,
  valor: number,
): Promise<void> {
  await upsertMembro(negocioId, barbeiroId, {
    comissaoTipo: tipo,
    comissaoPercentual: tipo === 'percentual' ? valor : undefined,
    comissaoFixaCentavos: tipo === 'fixo' ? valor : undefined,
  });
}

/**
 * Lista os profissionais (vitrine) que pertencem a um negócio.
 */
export async function listarProfissionaisDoNegocio(
  negocioId?: string | null,
): Promise<Barbeiro[]> {
  if (!negocioId) return [];
  return CacheService.getOrFetch(chaveProfissionaisDoNegocio(negocioId), TTL_PROFISSIONAIS_MS, async () => {
    const q = query(collection(db, 'barbeiros'), where('negocioId', '==', negocioId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as Omit<Barbeiro, 'id'>), id: d.id }));
  });
}

/**
 * Cria um novo profissional dentro do negócio (sem login próprio — Opção A).
 * O dono é quem preenche nome/especialidade; agenda e serviços são
 * configurados depois, nas telas de sempre, com `profissionalId` setado.
 */
export async function criarProfissional(
  negocioId: string,
  dados: { nome: string; especialidade?: string },
): Promise<Barbeiro> {
  const negocio = await getNegocio(negocioId);
  const novoDoc = doc(collection(db, 'barbeiros'));
  const barbeiro: Barbeiro = {
    id: novoDoc.id,
    nome: dados.nome,
    // Campos opcionais só entram quando definidos: o Firestore rejeita
    // `undefined` explícito em setDoc/addDoc.
    ...(dados.especialidade ? { especialidade: dados.especialidade } : {}),
    negocioId,
    ...(negocio?.nome ? { negocioNome: negocio.nome } : {}),
    ativo: true,
    // Doc novo, sem estado anterior — pode sortear direto (não tem fotoUrl
    // pra checar, diferente do fluxo de barbeiro solo em SetupBarbeiroScreen).
    fotoPadraoId: sortearFotoPadrao(),
  };
  // writeBatch seguro aqui (ao contrário de criarNegocio): a regra de
  // `membros/{novoId}` lê o membro do PRÓPRIO dono (já existe de antes, não
  // faz parte deste batch), não o documento sendo criado agora.
  const batch = writeBatch(db);
  batch.set(novoDoc, { ...barbeiro, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(membrosRef(negocioId), novoDoc.id), {
    id: novoDoc.id,
    barbeiroId: novoDoc.id,
    papel: 'profissional' as PapelEquipe,
    ativo: true,
    createdAt: serverTimestamp(),
  });
  await batch.commit();

  // Novo profissional deve aparecer na vitrine e na lista cacheada do
  // negócio sem esperar o TTL do cache.
  CacheService.invalidatePrefix(PREFIXO_LISTA_BARBEIROS);
  CacheService.invalidate(chaveProfissionaisDoNegocio(negocioId));

  return barbeiro;
}

/**
 * Ativa/desativa um profissional (some da vitrine, mas o histórico de
 * agendamentos é preservado — nunca apagamos o documento).
 */
export async function definirAtivoProfissional(
  negocioId: string,
  barbeiroId: string,
  ativo: boolean,
): Promise<void> {
  // As duas escritas (membro privado + doc público do barbeiro) entram num
  // writeBatch inline em vez de chamar upsertMembro/atualizarProfissional —
  // evita o risco de órfão entre as duas escritas (uma falhar e a outra
  // não). A invalidação de cache abaixo replica exatamente o que
  // atualizarProfissional faria sozinha, já que ela não é chamada aqui.
  const batch = writeBatch(db);
  batch.set(
    doc(membrosRef(negocioId), barbeiroId),
    { id: barbeiroId, barbeiroId, ativo, updatedAt: serverTimestamp() },
    { merge: true },
  );
  batch.set(
    doc(db, 'barbeiros', barbeiroId),
    { ativo, negocioId, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();

  // Mesma invalidação que atualizarProfissional faria sozinha (ver acima).
  CacheService.invalidate(`barbeiro:${barbeiroId}`);
  CacheService.invalidatePrefix(PREFIXO_LISTA_BARBEIROS);
  CacheService.invalidate(chaveProfissionaisDoNegocio(negocioId));
}
