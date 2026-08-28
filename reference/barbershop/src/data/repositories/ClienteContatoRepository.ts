/**
 * ClienteContatoRepository — agenda de clientes do barbeiro
 * (`barbeiros/{barbeiroId}/clientes/{id}`), cadastrados manualmente ou
 * importados da agenda de contatos do telefone.
 *
 * Independente da coleção `usuarios`: não exige que o cliente tenha conta
 * no app. Serve de base para uma futura tela de "agendamento manual pelo
 * barbeiro" e para ativação rápida de base de clientes já existente.
 */
import { db } from '../../../firebaseConfig';
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  getCountFromServer,
  addDoc,
  doc,
  writeBatch,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import CacheService from '../../services/CacheService';
import { diasAteProximoAniversario } from '../../utils/dateUtils';
import type { ClienteContato } from '../../types';

const clientesRef = (barbeiroId: string) =>
  collection(db, 'barbeiros', barbeiroId, 'clientes');

/**
 * As constraints que DEFINEM o conjunto "clientes do barbeiro". Existe como
 * função (e não como constante de módulo) para as contagens agregadas
 * herdarem o mesmo recorte de `listarClientesDoBarbeiro` POR CONSTRUÇÃO, em
 * vez de por cópia.
 *
 * O `orderBy` aqui não é decoração: no Firestore, ordenar por um campo
 * EXCLUI os documentos que não o têm. Uma contagem sem este `orderBy`
 * incluiria clientes legados gravados antes de `createdAt` existir, e o
 * Início passaria a anunciar "312 na agenda" enquanto `ClientesScreen`
 * lista 280 — dois números para a mesma pergunta, sem ninguém saber qual
 * está certo. Os dois conjuntos precisam ser o mesmo conjunto.
 */
const constraintsDaLista = () => [orderBy('createdAt', 'desc')];

/**
 * TTL curto de propósito. O ganho real do cache está DENTRO de uma rajada de
 * navegação (Início → Aniversariantes → voltar → Clientes lê a mesma lista
 * inteira 4 vezes); esticar o TTL não compraria mais leituras economizadas,
 * só ampliaria a janela em que dois aparelhos do mesmo dono divergem.
 */
const TTL_CLIENTES_MS = 5 * 60 * 1000;

/**
 * Prefixo PRÓPRIO — nunca `barbeiro:`. Se esta chave morasse debaixo do
 * prefixo da vitrine, um `invalidatePrefix('barbeiro:')` futuro (feito por
 * qualquer escrita em `barbeiros/{id}`) derrubaria a agenda de contatos
 * junto, sem ninguém perceber.
 */
const chaveClientes = (barbeiroId: string) => `clientes:${barbeiroId}`;

/**
 * Lista os clientes cadastrados pelo barbeiro, mais recentes primeiro.
 *
 * Cacheado em memória (5 min). É a única consulta desta tela sem `limit`, e
 * roda em 5 lugares — 4 deles sob `useFocusEffect`. É seguro cachear porque
 * a agenda de contatos só é escrita pelo próprio app, pelas 4 funções deste
 * arquivo (nenhuma Cloud Function toca em `barbeiros/{id}/clientes`), e as 4
 * invalidam a chave. E porque dado velho aqui não é dinheiro nem agenda: no
 * pior caso um contato recém-criado em OUTRO aparelho aparece alguns minutos
 * depois.
 *
 * `ignorarCache: true` invalida ANTES de buscar, em vez de furar o cache por
 * fora: assim a leitura forçada (pull-to-refresh) REPOVOA a chave para as
 * outras telas, em vez de deixar o dado velho lá atrás.
 */
export async function listarClientesDoBarbeiro(
  barbeiroId?: string | null,
  opcoes?: { ignorarCache?: boolean },
): Promise<ClienteContato[]> {
  if (!barbeiroId) return [];
  const chave = chaveClientes(barbeiroId);
  if (opcoes?.ignorarCache) CacheService.invalidate(chave);
  return CacheService.getOrFetch(chave, TTL_CLIENTES_MS, async () => {
    const snap = await getDocs(query(clientesRef(barbeiroId), ...constraintsDaLista()));
    return snap.docs.map((d) => ({ ...(d.data() as Omit<ClienteContato, 'id'>), id: d.id }));
  });
}

/**
 * Conta os clientes da agenda SEM baixar os documentos (agregação no
 * servidor: 1 leitura cobrada em vez de N).
 *
 * O Início só usava `listarClientesDoBarbeiro` para exibir este número —
 * ~280 documentos trafegados a cada foco para renderizar um inteiro.
 *
 * Reusa `constraintsDaLista()` de propósito: ver a nota lá em cima sobre os
 * dois conjuntos precisarem ser idênticos.
 */
export async function contarClientes(barbeiroId?: string | null): Promise<number> {
  if (!barbeiroId) return 0;
  const snap = await getCountFromServer(
    query(clientesRef(barbeiroId), ...constraintsDaLista()),
  );
  return snap.data().count;
}

/**
 * Conta os clientes cadastrados a partir de `desde` — o "novos este mês" do
 * Início. Mesma agregação server-side de `contarClientes`.
 *
 * `desde` é um `Date` local (a tela passa o dia 1 do mês corrente); o SDK
 * converte para `Timestamp` na comparação, como já faz o AnalyticsDashboard.
 *
 * Índice: campo único em `createdAt`, criado automaticamente pelo Firestore
 * (o projeto não tem `fieldOverrides` desativando isso).
 */
export async function contarClientesDesde(
  barbeiroId: string | null | undefined,
  desde: Date,
): Promise<number> {
  if (!barbeiroId) return 0;
  const snap = await getCountFromServer(
    query(clientesRef(barbeiroId), ...constraintsDaLista(), where('createdAt', '>=', desde)),
  );
  return snap.data().count;
}

/** Janela de aniversário do Início: "essa semana" = próximos 6 dias (0 = hoje). */
const JANELA_ANIVERSARIO_DIAS = 6;

/** Converte um `Date` para o formato de armazenamento "MM-DD" (ver `types.ts`). */
const paraMMDD = (d: Date): string =>
  `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * As faixas "MM-DD" que cobrem a janela de aniversário — exportada só para o
 * teste conseguir afirmar quantas consultas a virada de ano provoca.
 *
 * Duas decisões moram aqui:
 *
 * 1. **Por que dá para consultar por faixa.** `aniversario` é "MM-DD", sem
 *    ano (`types.ts`), e em "MM-DD" a ordem lexicográfica É a ordem do
 *    calendário — então `>=` / `<=` de string recorta o intervalo certo.
 *
 * 2. **Por que a janela é alargada em 1 dia de cada lado.** `'02-29'` é o
 *    único valor gravável que não existe em ano comum: `diaMesParaAniversario`
 *    valida contra 2024 (bissexto), e `new Date(2027, 1, 29)` rola para 1º de
 *    março. Ou seja, o aniversário EFETIVO de quem nasceu em 29/02 cai um dia
 *    depois da string guardada. Buscar exatamente [hoje, hoje+6] perderia essa
 *    pessoa em 1º/mar. Alargar e depois REFILTRAR com a mesma
 *    `diasAteProximoAniversario` que a tela já usava mantém o resultado
 *    idêntico ao da filtragem em memória — não aproximado.
 *
 * Quando a janela vira o ano, `inicio > fim` em ordem lexicográfica e uma
 * faixa só não cobre nada: aí viram duas, ['MM-DD','12-31'] e ['01-01','MM-DD'].
 */
export function faixasDaJanelaDeAniversario(hoje: Date): Array<[string, string]> {
  const deslocado = (dias: number) =>
    paraMMDD(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias));

  const inicio = deslocado(-1);
  const fim = deslocado(JANELA_ANIVERSARIO_DIAS + 1);

  return inicio <= fim
    ? [[inicio, fim]]
    : [
        [inicio, '12-31'],
        ['01-01', fim],
      ];
}

/**
 * Lista só os clientes que fazem aniversário nos próximos 6 dias.
 *
 * Substitui o "baixa os ~280 e filtra em memória" que o Início fazia. A
 * inequality em `aniversario` já descarta, no servidor, quem não tem a data
 * preenchida — que hoje é a maioria da base.
 *
 * O filtro final em memória usa `diasAteProximoAniversario`, A MESMA função
 * que a tela usava: a consulta só estreita o universo, quem decide continua
 * sendo a regra de sempre.
 */
export async function listarAniversariantesNaJanela(
  barbeiroId?: string | null,
  hoje: Date = new Date(),
): Promise<ClienteContato[]> {
  if (!barbeiroId) return [];

  const snaps = await Promise.all(
    faixasDaJanelaDeAniversario(hoje).map(([inicio, fim]) =>
      getDocs(
        query(
          clientesRef(barbeiroId),
          where('aniversario', '>=', inicio),
          where('aniversario', '<=', fim),
        ),
      ),
    ),
  );

  // As faixas são disjuntas por construção, mas deduplicar por id é barato e
  // deixa o resultado imune a qualquer mudança futura no recorte.
  const porId = new Map<string, ClienteContato>();
  snaps.forEach((snap) =>
    snap.docs.forEach((d) =>
      porId.set(d.id, { ...(d.data() as Omit<ClienteContato, 'id'>), id: d.id }),
    ),
  );

  return Array.from(porId.values()).filter(
    (c) => !!c.aniversario && diasAteProximoAniversario(c.aniversario, hoje) <= JANELA_ANIVERSARIO_DIAS,
  );
}

/**
 * Cadastra um cliente manualmente.
 */
export async function adicionarClienteManual(
  barbeiroId: string,
  dados: { nome: string; telefone?: string; aniversario?: string },
): Promise<string> {
  const docRef = await addDoc(clientesRef(barbeiroId), {
    nome: dados.nome,
    telefone: dados.telefone || null,
    origem: 'manual',
    createdAt: serverTimestamp(),
    ...(dados.aniversario ? { aniversario: dados.aniversario } : {}),
  });
  CacheService.invalidate(chaveClientes(barbeiroId));
  return docRef.id;
}

/**
 * Atualiza campos de um cliente já cadastrado (ex.: adicionar/corrigir o
 * aniversário de um contato importado sem essa informação).
 */
export async function atualizarCliente(
  barbeiroId: string,
  clienteId: string,
  dados: { nome?: string; telefone?: string; aniversario?: string },
): Promise<void> {
  const docRef = doc(db, 'barbeiros', barbeiroId, 'clientes', clienteId);
  await updateDoc(docRef, {
    ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
    ...(dados.telefone !== undefined ? { telefone: dados.telefone || null } : {}),
    ...(dados.aniversario !== undefined ? { aniversario: dados.aniversario || null } : {}),
  });
  CacheService.invalidate(chaveClientes(barbeiroId));
}

/**
 * Importa vários contatos de uma vez (ex.: da agenda do telefone).
 * Usa batch writes para evitar N round-trips ao Firestore — mas o
 * Firestore só aceita até 500 operações por batch, então listas maiores
 * são divididas em lotes de 400 (margem de segurança) e commitadas em
 * sequência. Antes disso, tudo além do primeiro lote era descartado
 * silenciosamente; agora nenhum contato fica de fora.
 */
export async function importarClientesEmLote(
  barbeiroId: string,
  contatos: Array<{ nome: string; telefone?: string; aniversario?: string }>,
): Promise<number> {
  if (contatos.length === 0) return 0;

  const TAMANHO_LOTE = 400;
  let importados = 0;

  for (let i = 0; i < contatos.length; i += TAMANHO_LOTE) {
    const lote = contatos.slice(i, i + TAMANHO_LOTE);
    const batch = writeBatch(db);

    for (const contato of lote) {
      const novoDoc = doc(clientesRef(barbeiroId));
      batch.set(novoDoc, {
        nome: contato.nome,
        telefone: contato.telefone || null,
        origem: 'contatos',
        createdAt: serverTimestamp(),
        ...(contato.aniversario ? { aniversario: contato.aniversario } : {}),
      });
    }

    await batch.commit();
    importados += lote.length;
  }

  CacheService.invalidate(chaveClientes(barbeiroId));
  return importados;
}

/**
 * Remove um cliente da agenda do barbeiro.
 */
export async function removerCliente(barbeiroId: string, clienteId: string): Promise<void> {
  await deleteDoc(doc(db, 'barbeiros', barbeiroId, 'clientes', clienteId));
  CacheService.invalidate(chaveClientes(barbeiroId));
}
