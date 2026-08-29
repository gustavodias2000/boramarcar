/**
 * Teste de regressão do bug corrigido no commit `663b1b3`: a importação de
 * contatos fazia UM ÚNICO `writeBatch`, e o Firestore aceita no máximo 500
 * operações por batch — listas maiores eram truncadas SILENCIOSAMENTE (sem
 * erro, sem aviso; o resto dos contatos simplesmente sumia). A correção
 * divide em lotes de 400 (margem de segurança) commitados em sequência.
 *
 * Este teste garante que N contatos resultam em `ceil(N / 400)` chamadas de
 * `commit()` — se alguém voltar a usar um único batch, o teste com 900
 * contatos falha.
 */
import {
  doc,
  writeBatch,
  collection,
  getDocs,
  getCountFromServer,
  query,
  orderBy,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import {
  importarClientesEmLote,
  adicionarClienteManual,
  atualizarCliente,
  removerCliente,
  listarClientesDoBarbeiro,
  contarClientes,
  contarClientesDesde,
  listarAniversariantesNaJanela,
  faixasDaJanelaDeAniversario,
} from '../../src/data/repositories/ClienteContatoRepository';
import { diasAteProximoAniversario } from '../../src/utils/dateUtils';
import CacheService from '../../src/services/CacheService';

const mockedDoc = doc as jest.Mock;
const mockedWriteBatch = writeBatch as jest.Mock;
const mockedCollection = collection as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedQuery = query as jest.Mock;
const mockedOrderBy = orderBy as jest.Mock;
const mockedAddDoc = addDoc as jest.Mock;
const mockedUpdateDoc = updateDoc as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedGetCount = getCountFromServer as jest.Mock;
const mockedWhere = where as jest.Mock;

function contatosFalsos(qtd: number) {
  return Array.from({ length: qtd }, (_, i) => ({ nome: `Cliente ${i}`, telefone: `1199999${String(i).padStart(4, '0')}` }));
}

describe('importarClientesEmLote — regressão do truncamento silencioso acima de 500', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCollection.mockReturnValue({ __ref: 'clientes-collection' });
    mockedDoc.mockReturnValue({ __ref: 'novo-doc' });
  });

  const criarBatchFalso = () => ({ set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) });

  it('não faz nenhuma chamada quando a lista está vazia', async () => {
    const total = await importarClientesEmLote('barbeiro-1', []);
    expect(total).toBe(0);
    expect(mockedWriteBatch).not.toHaveBeenCalled();
  });

  it('usa um único batch para até 400 contatos', async () => {
    const batch = criarBatchFalso();
    mockedWriteBatch.mockReturnValue(batch);

    const total = await importarClientesEmLote('barbeiro-1', contatosFalsos(400));

    expect(total).toBe(400);
    expect(mockedWriteBatch).toHaveBeenCalledTimes(1);
    expect(batch.set).toHaveBeenCalledTimes(400);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('divide em 2 lotes quando passa de 400 (ex.: 401 contatos)', async () => {
    const batches = [criarBatchFalso(), criarBatchFalso()];
    let call = 0;
    mockedWriteBatch.mockImplementation(() => batches[call++]);

    const total = await importarClientesEmLote('barbeiro-1', contatosFalsos(401));

    expect(total).toBe(401);
    expect(mockedWriteBatch).toHaveBeenCalledTimes(2);
    expect(batches[0].set).toHaveBeenCalledTimes(400);
    expect(batches[1].set).toHaveBeenCalledTimes(1);
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    expect(batches[1].commit).toHaveBeenCalledTimes(1);
  });

  it('divide 900 contatos em 3 lotes sequenciais (nenhum contato descartado)', async () => {
    const criados: Array<ReturnType<typeof criarBatchFalso>> = [];
    mockedWriteBatch.mockImplementation(() => {
      const b = criarBatchFalso();
      criados.push(b);
      return b;
    });

    const total = await importarClientesEmLote('barbeiro-1', contatosFalsos(900));

    expect(total).toBe(900);
    expect(mockedWriteBatch).toHaveBeenCalledTimes(3);
    const totalSetsChamados = criados.reduce((acc, b) => acc + b.set.mock.calls.length, 0);
    expect(totalSetsChamados).toBe(900); // nenhum contato foi descartado
    criados.forEach((b) => expect(b.commit).toHaveBeenCalledTimes(1));
  });

  it('grava o campo aniversario só quando presente (evita undefined explícito no Firestore)', async () => {
    const batch = criarBatchFalso();
    mockedWriteBatch.mockReturnValue(batch);

    await importarClientesEmLote('barbeiro-1', [
      { nome: 'Com aniversário', telefone: '11999990000', aniversario: '07-23' },
      { nome: 'Sem aniversário', telefone: '11999990001' },
    ]);

    const [, dadosComAniversario] = batch.set.mock.calls[0];
    const [, dadosSemAniversario] = batch.set.mock.calls[1];
    expect(dadosComAniversario.aniversario).toBe('07-23');
    expect(dadosSemAniversario).not.toHaveProperty('aniversario');
  });
});

describe('adicionarClienteManual', () => {
  it('grava telefone null quando não informado (nunca undefined)', async () => {
    const { addDoc: addDocLocal } = require('firebase/firestore');
    (addDocLocal as jest.Mock).mockResolvedValue({ id: 'novo-id' });
    mockedCollection.mockReturnValue({ __ref: 'clientes-collection' });

    const id = await adicionarClienteManual('barbeiro-1', { nome: 'Sem telefone' });

    expect(id).toBe('novo-id');
    const [, dados] = (addDocLocal as jest.Mock).mock.calls[0];
    expect(dados.telefone).toBeNull();
  });
});

/**
 * PERF — cache de 5 min na agenda de contatos.
 *
 * `listarClientesDoBarbeiro` é a única consulta desta camada SEM `limit`
 * (baixa a subcoleção inteira) e roda em 5 telas, 4 delas sob
 * `useFocusEffect`: o percurso Início → Aniversariantes → voltar → Clientes
 * lia a mesma lista 4 vezes seguidas.
 *
 * O que torna seguro cachear AQUI e em nenhum dos vizinhos (agendamentos,
 * ocupações, despesas, comissões): esta subcoleção só é escrita pelas quatro
 * funções deste arquivo — nenhuma Cloud Function toca em
 * `barbeiros/{id}/clientes` — e dado velho custa, no máximo, um contato novo
 * de OUTRO aparelho demorando alguns minutos para aparecer. Nunca horário
 * duplicado nem dinheiro errado.
 *
 * Por isso os testes abaixo cobrem UMA escrita por vez: se qualquer uma das
 * quatro esquecer de invalidar, o app passa a mostrar uma lista que o próprio
 * usuário acabou de mudar. Não há quinto escritor a cobrir.
 *
 * O CacheService não expõe get/set (CLAUDE.md §6) — o único observável é
 * "a próxima listagem foi ao Firestore ou não", medido em `getDocs`.
 */
describe('listarClientesDoBarbeiro — cache de 5 min', () => {
  const snapshotCom = (ids: string[]) => ({
    docs: ids.map((id) => ({ id, data: () => ({ nome: `Cliente ${id}`, origem: 'manual' }) })),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    CacheService.clear();
    mockedCollection.mockImplementation((_db: unknown, ...partes: string[]) => ({
      path: partes.join('/'),
    }));
    mockedDoc.mockReturnValue({ __ref: 'doc' });
    mockedQuery.mockImplementation((ref: unknown) => ref);
    mockedOrderBy.mockReturnValue({ __orderBy: 'createdAt' });
    mockedGetDocs.mockResolvedValue(snapshotCom(['c1', 'c2']));
    mockedAddDoc.mockResolvedValue({ id: 'novo-id' });
    mockedUpdateDoc.mockResolvedValue(undefined);
    mockedDeleteDoc.mockResolvedValue(undefined);
    mockedWriteBatch.mockReturnValue({
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('duas listagens seguidas fazem UMA leitura só — e devolvem a mesma lista', async () => {
    const primeira = await listarClientesDoBarbeiro('barbeiro-1');
    const segunda = await listarClientesDoBarbeiro('barbeiro-1');

    expect(mockedGetDocs).toHaveBeenCalledTimes(1);
    expect(segunda).toEqual(primeira);
    expect(primeira.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('sem barbeiroId não consulta nem cacheia nada', async () => {
    await expect(listarClientesDoBarbeiro(null)).resolves.toEqual([]);
    await expect(listarClientesDoBarbeiro(undefined)).resolves.toEqual([]);
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('adicionarClienteManual invalida — a próxima listagem vai ao Firestore', async () => {
    await listarClientesDoBarbeiro('barbeiro-1');
    await adicionarClienteManual('barbeiro-1', { nome: 'Novo' });
    await listarClientesDoBarbeiro('barbeiro-1');

    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });

  it('atualizarCliente invalida — a próxima listagem vai ao Firestore', async () => {
    await listarClientesDoBarbeiro('barbeiro-1');
    await atualizarCliente('barbeiro-1', 'c1', { nome: 'Nome corrigido' });
    await listarClientesDoBarbeiro('barbeiro-1');

    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });

  it('importarClientesEmLote invalida — a próxima listagem vai ao Firestore', async () => {
    await listarClientesDoBarbeiro('barbeiro-1');
    await importarClientesEmLote('barbeiro-1', [{ nome: 'Importado' }]);
    await listarClientesDoBarbeiro('barbeiro-1');

    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });

  it('removerCliente invalida — a próxima listagem vai ao Firestore', async () => {
    await listarClientesDoBarbeiro('barbeiro-1');
    await removerCliente('barbeiro-1', 'c1');
    await listarClientesDoBarbeiro('barbeiro-1');

    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });

  it('ignorarCache sempre consulta — E REPOVOA a chave para as outras telas', async () => {
    await listarClientesDoBarbeiro('barbeiro-1');
    expect(mockedGetDocs).toHaveBeenCalledTimes(1);

    // O pull-to-refresh: promete ir à rede e vai.
    await listarClientesDoBarbeiro('barbeiro-1', { ignorarCache: true });
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);

    // E o resultado fica no cache — a leitura forçada invalida ANTES de
    // buscar, em vez de furar por fora e deixar dado velho lá atrás.
    await listarClientesDoBarbeiro('barbeiro-1');
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });

  it('isolamento multi-tenant: dois barbeiros nunca compartilham a lista', async () => {
    mockedGetDocs
      .mockResolvedValueOnce(snapshotCom(['do-b1']))
      .mockResolvedValueOnce(snapshotCom(['do-b2']));

    const listaB1 = await listarClientesDoBarbeiro('barbeiro-1');
    const listaB2 = await listarClientesDoBarbeiro('barbeiro-2');

    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
    expect(listaB1.map((c) => c.id)).toEqual(['do-b1']);
    expect(listaB2.map((c) => c.id)).toEqual(['do-b2']);

    // E cada um continua servindo o SEU cache, sem contaminar o do outro.
    await expect(listarClientesDoBarbeiro('barbeiro-1')).resolves.toEqual(listaB1);
    await expect(listarClientesDoBarbeiro('barbeiro-2')).resolves.toEqual(listaB2);
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
  });

  it('invalidar um barbeiro não derruba o cache do outro', async () => {
    await listarClientesDoBarbeiro('barbeiro-1');
    await listarClientesDoBarbeiro('barbeiro-2');
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);

    await adicionarClienteManual('barbeiro-2', { nome: 'Novo do b2' });

    await listarClientesDoBarbeiro('barbeiro-1'); // ainda em cache
    expect(mockedGetDocs).toHaveBeenCalledTimes(2);

    await listarClientesDoBarbeiro('barbeiro-2'); // invalidado
    expect(mockedGetDocs).toHaveBeenCalledTimes(3);
  });
});


/**
 * P1 — o Início baixava ~280 documentos para mostrar TRÊS números: total de
 * clientes, novos no mês e aniversariantes da semana. As três funções abaixo
 * substituem essa leitura por duas contagens server-side e uma consulta por
 * faixa de "MM-DD".
 *
 * `listarClientesDoBarbeiro` (e o cache dela) não muda — os outros 4
 * consumidores, que realmente precisam da lista, continuam idênticos.
 *
 * O mock de `query` aqui GUARDA as constraints em vez de devolver a ref
 * crua, porque o objeto de risco destes testes não é o resultado: é o
 * RECORTE. Contagem e listagem que recortam conjuntos diferentes produzem
 * dois números para a mesma pergunta.
 */
describe('P1 — agregados de cliente sem baixar a subcoleção', () => {
  const comConstraints = (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints });

  beforeEach(() => {
    jest.clearAllMocks();
    CacheService.clear();
    mockedCollection.mockImplementation((_db: unknown, ...partes: string[]) => ({
      path: partes.join('/'),
    }));
    mockedQuery.mockImplementation(comConstraints);
    mockedOrderBy.mockImplementation((campo: string, direcao?: string) => ({
      __tipo: 'orderBy',
      campo,
      direcao,
    }));
    mockedWhere.mockImplementation((campo: string, op: string, valor: unknown) => ({
      __tipo: 'where',
      campo,
      op,
      valor,
    }));
    mockedGetDocs.mockResolvedValue({ docs: [] });
    mockedGetCount.mockResolvedValue({ data: () => ({ count: 280 }) });
  });

  describe('contarClientes', () => {
    /**
     * O teste que importa. `orderBy('createdAt')` EXCLUI documentos sem o
     * campo — então uma contagem sem ele contaria clientes legados que a
     * ClientesScreen não lista, e o Início anunciaria "312 na agenda" contra
     * as 280 da lista. Comparar as constraints das duas consultas é a única
     * forma de travar isso: qualquer divergência futura (alguém tirar o
     * orderBy da contagem "porque não serve para nada") quebra aqui.
     */
    it('conta com AS MESMAS constraints da listagem — os conjuntos não podem divergir', async () => {
      await listarClientesDoBarbeiro('barbeiro-1');
      await contarClientes('barbeiro-1');

      const queryDaLista = mockedGetDocs.mock.calls[0][0];
      const queryDoCount = mockedGetCount.mock.calls[0][0];

      expect(queryDoCount.constraints).toEqual(queryDaLista.constraints);
      expect(queryDoCount.ref).toEqual(queryDaLista.ref);
      // E o recorte é mesmo o `createdAt` desc — não um array vazio dos dois lados.
      expect(queryDoCount.constraints).toEqual([
        { __tipo: 'orderBy', campo: 'createdAt', direcao: 'desc' },
      ]);
    });

    it('devolve a contagem do servidor sem baixar documento nenhum', async () => {
      await expect(contarClientes('barbeiro-1')).resolves.toBe(280);
      expect(mockedGetDocs).not.toHaveBeenCalled();
    });

    it('sem barbeiroId devolve 0 e não consulta', async () => {
      await expect(contarClientes(null)).resolves.toBe(0);
      await expect(contarClientes(undefined)).resolves.toBe(0);
      expect(mockedGetCount).not.toHaveBeenCalled();
    });
  });

  describe('contarClientesDesde', () => {
    it('mantém as constraints da listagem e acrescenta o corte de data', async () => {
      const inicioMes = new Date(2026, 7, 1);
      mockedGetCount.mockResolvedValue({ data: () => ({ count: 12 }) });

      await expect(contarClientesDesde('barbeiro-1', inicioMes)).resolves.toBe(12);

      expect(mockedGetCount.mock.calls[0][0].constraints).toEqual([
        { __tipo: 'orderBy', campo: 'createdAt', direcao: 'desc' },
        { __tipo: 'where', campo: 'createdAt', op: '>=', valor: inicioMes },
      ]);
    });

    it('sem barbeiroId devolve 0 e não consulta', async () => {
      await expect(contarClientesDesde(null, new Date())).resolves.toBe(0);
      expect(mockedGetCount).not.toHaveBeenCalled();
    });
  });

  /**
   * A janela de aniversário — a parte com mais chance de errar em silêncio.
   *
   * O contrato é forte de propósito: o resultado da consulta por faixa tem
   * que ser IGUAL ao que a filtragem em memória sobre a base inteira daria.
   * Não parecido, igual. Por isso os testes abaixo comparam sempre contra
   * `diasAteProximoAniversario`, que é a regra que a tela já usava.
   */
  describe('listarAniversariantesNaJanela', () => {
    const BASE: Array<{ id: string; nome: string; aniversario?: string }> = [
      { id: 'a', nome: 'Ana', aniversario: '01-02' },
      { id: 'b', nome: 'Bruno', aniversario: '02-29' },
      { id: 'c', nome: 'Carla', aniversario: '03-08' },
      { id: 'd', nome: 'Davi', aniversario: '06-15' },
      { id: 'e', nome: 'Elis', aniversario: '12-28' },
      { id: 'f', nome: 'Fabio', aniversario: '12-31' },
      { id: 'g', nome: 'Gil' }, // sem aniversário: some no servidor, pela inequality
    ];

    /** Firestore de mentira que honra o intervalo `>=` / `<=` em `aniversario`. */
    const servirBase = () => {
      mockedGetDocs.mockImplementation(async (q: any) => {
        const wheres = q.constraints.filter((c: any) => c.__tipo === 'where');
        const min = wheres.find((c: any) => c.op === '>=').valor;
        const max = wheres.find((c: any) => c.op === '<=').valor;
        const docs = BASE.filter(
          (c) => !!c.aniversario && c.aniversario >= min && c.aniversario <= max,
        );
        return { docs: docs.map((c) => ({ id: c.id, data: () => ({ ...c }) })) };
      });
    };

    /** O que a filtragem em memória sobre a base INTEIRA devolveria. */
    const referenciaEmMemoria = (hoje: Date) =>
      BASE.filter((c) => !!c.aniversario && diasAteProximoAniversario(c.aniversario, hoje) <= 6)
        .map((c) => c.id)
        .sort();

    const idsDe = async (hoje: Date) =>
      (await listarAniversariantesNaJanela('barbeiro-1', hoje)).map((c) => c.id).sort();

    beforeEach(servirBase);

    it('uma faixa só quando a janela não vira o ano', async () => {
      const hoje = new Date(2026, 5, 12); // 12/jun/2026
      expect(faixasDaJanelaDeAniversario(hoje)).toEqual([['06-11', '06-19']]);

      expect(await idsDe(hoje)).toEqual(referenciaEmMemoria(hoje));
      expect(mockedGetDocs).toHaveBeenCalledTimes(1);
      expect(await idsDe(hoje)).toEqual(['d']);
    });

    it('cruzando 31/dez: DUAS consultas, e a união bate com o filtro em memória', async () => {
      const hoje = new Date(2026, 11, 28); // 28/dez/2026

      expect(faixasDaJanelaDeAniversario(hoje)).toEqual([
        ['12-27', '12-31'],
        ['01-01', '01-04'],
      ]);

      const resultado = await idsDe(hoje);

      expect(mockedGetDocs).toHaveBeenCalledTimes(2);
      expect(resultado).toEqual(referenciaEmMemoria(hoje));
      // Elis (12-28, hoje), Fabio (12-31) e Ana (01-02, já no ano que vem).
      expect(resultado).toEqual(['a', 'e', 'f']);
    });

    /**
     * 29/02 é o único valor gravável que não existe em ano comum: a tela
     * sempre tratou esse aniversário como 1º/mar (é o que `new Date` faz), e
     * a consulta por faixa precisa achar a pessoa mesmo com a string '02-29'
     * ficando ANTES de '03-01'. É exatamente por isso que a janela é
     * alargada em 1 dia para trás.
     */
    it('em 1º/mar de ano comum o cliente de 29/02 ESTÁ no resultado', async () => {
      const hoje = new Date(2027, 2, 1); // 01/mar/2027 — 2027 não é bissexto

      expect(diasAteProximoAniversario('02-29', hoje)).toBe(0);
      const resultado = await idsDe(hoje);

      expect(resultado).toContain('b');
      expect(resultado).toEqual(referenciaEmMemoria(hoje));
    });

    it('em 2/mar de ano comum ele NÃO está mais', async () => {
      const hoje = new Date(2027, 2, 2); // 02/mar/2027

      const resultado = await idsDe(hoje);

      expect(resultado).not.toContain('b');
      expect(resultado).toEqual(referenciaEmMemoria(hoje));
    });

    it('a janela alargada não deixa passar quem está fora dos 6 dias', async () => {
      // 21/fev/2027: a faixa vai até 01/mar, então '02-29' É BUSCADO — mas
      // faltam 8 dias para ele. Quem corta é o refiltro em memória.
      const hoje = new Date(2027, 1, 21);
      const resultado = await idsDe(hoje);

      expect(resultado).toEqual(referenciaEmMemoria(hoje));
      expect(resultado).toEqual([]);
    });

    it('sem barbeiroId devolve lista vazia e não consulta', async () => {
      await expect(listarAniversariantesNaJanela(null, new Date())).resolves.toEqual([]);
      expect(mockedGetDocs).not.toHaveBeenCalled();
    });
  });
});
