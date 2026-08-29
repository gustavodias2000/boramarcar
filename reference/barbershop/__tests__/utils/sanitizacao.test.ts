import { sanitizarProfundo, textoSanitizado, MARCADOR_REDIGIDO } from '../../src/utils/sanitizacao';

describe('textoSanitizado', () => {
  it('redige email e telefone embutidos numa string livre', () => {
    const resultado = textoSanitizado('contate joao@exemplo.com ou (11) 99999-8888');
    expect(resultado).not.toContain('joao@exemplo.com');
    expect(resultado).not.toContain('99999-8888');
    expect(resultado).toContain(MARCADOR_REDIGIDO);
  });

  it('usa a mensagem de um Error e ignora a stack', () => {
    const erro = new Error('falha ao salvar cliente@exemplo.com');
    const resultado = textoSanitizado(erro);
    expect(resultado).not.toContain('cliente@exemplo.com');
    expect(resultado).toContain(MARCADOR_REDIGIDO);
    expect(resultado).not.toContain('.ts:'); // nada de linha de stack vazou
  });

  it('trunca textos maiores que 240 caracteres', () => {
    // Palavras curtas separadas por espaço — evita casar com o padrão de
    // API key (sequência única de 20+ caracteres sem espaço).
    const resultado = textoSanitizado('abc de '.repeat(80));
    expect(resultado.length).toBe(240);
  });

  it('redige um token Bearer', () => {
    const resultado = textoSanitizado('chamada falhou com Authorization: Bearer abc123.def456-ghi789');
    expect(resultado).not.toContain('abc123.def456-ghi789');
    expect(resultado).toContain(MARCADOR_REDIGIDO);
  });

  it('redige uma string opaca de alta entropia (padrão de API key)', () => {
    const resultado = textoSanitizado('key=AIzaSyA4phVWJPifqkoUhlo_oJbCiJ9A0FtS2Bo falhou');
    expect(resultado).not.toContain('AIzaSyA4phVWJPifqkoUhlo_oJbCiJ9A0FtS2Bo');
  });

  it('redige "senha: valor" e "refresh_token: valor" em texto livre', () => {
    const resultado = textoSanitizado('login falhou, senha: minhaSenha123 refresh_token: xyz987');
    expect(resultado).not.toContain('minhaSenha123');
    expect(resultado).not.toContain('xyz987');
  });

  it('mantém texto legítimo misturado com o trecho redigido', () => {
    const resultado = textoSanitizado('Erro ao processar pagamento do cliente joao@exemplo.com, tente novamente');
    expect(resultado).toContain('Erro ao processar pagamento do cliente');
    expect(resultado).toContain('tente novamente');
    expect(resultado).not.toContain('joao@exemplo.com');
  });
});

describe('sanitizarProfundo — chaves sensíveis', () => {
  it('descarta um campo de nível superior com nome sensível (na chave)', () => {
    const resultado = sanitizarProfundo({ area: 'agenda', email: 'a@b.com' }) as Record<string, unknown>;
    expect(resultado).toEqual({ area: 'agenda' });
  });

  it('descarta um campo sensível dentro de um objeto aninhado', () => {
    const resultado = sanitizarProfundo({
      area: 'agenda',
      detalhe: { email: 'a@b.com', nota: 'ok' },
    }) as Record<string, unknown>;
    expect(resultado.detalhe).toEqual({ nota: 'ok' });
  });

  it('preserva area/operacao/codigo mesmo quando testados junto de campos sensíveis', () => {
    const resultado = sanitizarProfundo({
      area: 'agenda',
      operacao: 'criarAgendamento',
      codigo: 'permission-denied',
      token: 'segredo',
    }) as Record<string, unknown>;
    expect(resultado).toEqual({
      area: 'agenda',
      operacao: 'criarAgendamento',
      codigo: 'permission-denied',
    });
  });
});

/**
 * Isenção de valor técnico.
 *
 * O padrão de alta entropia apagava todo id do Firestore (20 chars) e todo
 * UID do Auth (28), porque são indistinguíveis de um token opaco. A isenção
 * exige DUAS condições: chave em lista fechada E valor casando por inteiro o
 * formato daquela classe. Os testes de "não vira buraco" (segundo bloco) são
 * os que sustentam a decisão — se algum deles ficar vermelho, a isenção
 * virou canal de vazamento e deve ser revertida, não afrouxada.
 *
 * ESPELHO: o mesmo conjunto de casos existe em
 * `functions/sanitizacaoEvento.test.js`. Espelho manual — o app é TypeScript
 * e a Function é CommonJS; não há import cruzado. Mudou um lado, mude o outro.
 */
describe('sanitizarProfundo — isenção de valor técnico (preservação)', () => {
  const ID_FIRESTORE = 'aBcDeFgHiJkLmNoPqRsT'; // 20 chars, id automático
  const UID_AUTH = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ12'; // 28 chars, UID do Auth

  it('preserva id do Firestore (20 chars) sob agendamentoId', () => {
    const resultado = sanitizarProfundo({
      area: 'ocupacao',
      agendamentoId: ID_FIRESTORE,
    }) as Record<string, unknown>;
    expect(resultado.agendamentoId).toBe(ID_FIRESTORE);
  });

  it('preserva UID do Auth (28 chars) sob barbeiroId', () => {
    const resultado = sanitizarProfundo({
      area: 'ocupacao',
      barbeiroId: UID_AUTH,
    }) as Record<string, unknown>;
    expect(resultado.barbeiroId).toBe(UID_AUTH);
  });

  it('preserva negocioId e slotId', () => {
    const resultado = sanitizarProfundo({
      negocioId: ID_FIRESTORE,
      slotId: UID_AUTH,
    }) as Record<string, unknown>;
    expect(resultado).toEqual({ negocioId: ID_FIRESTORE, slotId: UID_AUTH });
  });

  it('preserva o valor de operacao com 20+ chars (regressão do evento cego)', () => {
    // 'liberar-slots-do-agendamento' tem 28 caracteres: era redigido, e com
    // ele sumia a identificação da operação que falhou.
    const resultado = sanitizarProfundo({
      area: 'ocupacao',
      operacao: 'liberar-slots-do-agendamento',
      codigo: 'functions/permission-denied',
    }) as Record<string, unknown>;
    expect(resultado.operacao).toBe('liberar-slots-do-agendamento');
    expect(resultado.codigo).toBe('functions/permission-denied');
  });

  it('reconstrói o evento de slot órfão inteiro, correlacionável', () => {
    const resultado = sanitizarProfundo({
      area: 'ocupacao',
      operacao: 'liberar-slots-do-agendamento',
      agendamentoId: ID_FIRESTORE,
      barbeiroId: UID_AUTH,
      data: '2030-01-15',
      horario: '09:00',
    });
    expect(resultado).toEqual({
      area: 'ocupacao',
      operacao: 'liberar-slots-do-agendamento',
      agendamentoId: ID_FIRESTORE,
      barbeiroId: UID_AUTH,
      data: '2030-01-15',
      horario: '09:00',
    });
  });
});

describe('sanitizarProfundo — a isenção NÃO vira buraco', () => {
  // Cada caso é um segredo real colocado DENTRO de uma chave permitida.
  // Nenhum casa o formato ancorado, então todos continuam redigidos.
  const segredos: Array<[string, string]> = [
    ['chave de API do Google', 'AIzaSyA4phVWJPifqkoUhlo_oJbCiJ9A0FtS2Bo'],
    ['corpo de JWT', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'],
    ['token do GitHub', 'ghp_K172abcdefghijklmnopqrst'],
    ['token da OpenAI', 'sk-proj-abcdefghijklmnopqrstuvwxyz0123'],
    ['token do Slack', 'xoxb-1234567890-abcdefghijklm'],
    ['hash/segredo hex de 40', 'a3f5b9c1d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2'],
    ['string opaca de 40 chars', 'QWERTYUIOPASDFGHJKLZXCVBNM1234567890qwer'],
  ];

  // A propriedade que importa é "o segredo não sai INTEIRO". Alguns valores
  // não viram exatamente `[redigido]`: um segredo com uma corrida longa de
  // dígitos é quebrado antes pelo padrão de telefone/CPF, e sobra um
  // fragmento curto (`xoxb-[redigido]-abcdefghijklm`). Isso é comportamento
  // dos padrões já existentes em HEAD — verificado, idêntico antes e depois
  // desta mudança — e não algo que a isenção introduziu.
  it.each(segredos)('redige %s mesmo sob a chave permitida agendamentoId', (_rotulo, segredo) => {
    const resultado = sanitizarProfundo({
      area: 'ocupacao',
      agendamentoId: segredo,
    }) as Record<string, unknown>;
    expect(resultado.agendamentoId).not.toContain(segredo);
    expect(resultado.agendamentoId).toContain(MARCADOR_REDIGIDO);
  });

  it.each(segredos)('redige %s mesmo sob a chave permitida operacao', (_rotulo, segredo) => {
    const resultado = sanitizarProfundo({
      area: 'ocupacao',
      operacao: segredo,
    }) as Record<string, unknown>;
    expect(resultado.operacao).not.toContain(segredo);
  });

  it('não isenta um valor de 20 dígitos — o padrão de CPF/número longo continua valendo', () => {
    // Sem o lookahead de "ao menos uma letra", isto casaria o formato de id.
    const resultado = sanitizarProfundo({
      agendamentoId: '12345678901234567890',
    }) as Record<string, unknown>;
    expect(resultado.agendamentoId).not.toBe('12345678901234567890');
    expect(resultado.agendamentoId).toContain(MARCADOR_REDIGIDO);
  });

  it('não isenta um CPF como segmento de rótulo', () => {
    const resultado = sanitizarProfundo({ codigo: 'erro/12345678901' }) as Record<string, unknown>;
    expect(resultado.codigo).not.toContain('12345678901');
  });

  it('não isenta id técnico sob chave NÃO listada (clienteUid segue redigido)', () => {
    const resultado = sanitizarProfundo({
      area: 'ocupacao',
      clienteUid: 'aBcDeFgHiJkLmNoPqRsTuVwXyZ12',
      usuarioId: 'aBcDeFgHiJkLmNoPqRsT',
      sessionId: 'aBcDeFgHiJkLmNoPqRsT',
      apiKeyId: 'aBcDeFgHiJkLmNoPqRsT',
    }) as Record<string, unknown>;
    // Nenhuma delas está na lista fechada — é exatamente o furo que a
    // heurística "termina em Id" abriria.
    expect(resultado.clienteUid).toBe(MARCADOR_REDIGIDO);
    expect(resultado.usuarioId).toBe(MARCADOR_REDIGIDO);
    expect(resultado.sessionId).toBe(MARCADOR_REDIGIDO);
    expect(resultado.apiKeyId).toBe(MARCADOR_REDIGIDO);
  });

  it('descarta tokenId inteiro (chave sensível) antes mesmo da isenção', () => {
    const resultado = sanitizarProfundo({
      area: 'x',
      tokenId: 'aBcDeFgHiJkLmNoPqRsT',
    }) as Record<string, unknown>;
    expect(resultado).toEqual({ area: 'x' });
  });

  it('não isenta id técnico embutido em texto livre sob chave permitida', () => {
    // A regex é ancorada: o valor precisa ser o id INTEIRO, não conter um.
    const resultado = sanitizarProfundo({
      agendamentoId: 'falhou ao ler aBcDeFgHiJkLmNoPqRsT no servidor',
    }) as Record<string, unknown>;
    expect(resultado.agendamentoId).not.toContain('aBcDeFgHiJkLmNoPqRsT');
  });

  it('mantém a mensagem de erro livre sem nenhuma isenção', () => {
    // textoSanitizado não conhece chave — comportamento idêntico ao anterior.
    const comToken = textoSanitizado('GET /v1?key=AIzaSyA4phVWJPifqkoUhlo_oJbCiJ9A0FtS2Bo falhou');
    expect(comToken).not.toContain('AIzaSyA4phVWJPifqkoUhlo_oJbCiJ9A0FtS2Bo');
    const comId = textoSanitizado('falhou para aBcDeFgHiJkLmNoPqRsT');
    expect(comId).not.toContain('aBcDeFgHiJkLmNoPqRsT');
  });

  it('mantém email/telefone/CPF redigidos sob chaves permitidas', () => {
    const resultado = sanitizarProfundo({
      operacao: 'contato joao@exemplo.com',
      codigo: '(11) 99999-8888',
      agendamentoId: '12345678901',
    }) as Record<string, unknown>;
    expect(resultado.operacao).not.toContain('joao@exemplo.com');
    expect(resultado.codigo).not.toContain('99999-8888');
    expect(resultado.agendamentoId).not.toContain('12345678901');
  });
});

describe('sanitizarProfundo — conteúdo dentro de estruturas aninhadas', () => {
  it('redige PII dentro de um array de strings', () => {
    const resultado = sanitizarProfundo({
      area: 'notificacao',
      falhas: ['erro para joao@exemplo.com', 'erro para maria@exemplo.com'],
    }) as Record<string, unknown>;
    const falhas = resultado.falhas as string[];
    expect(falhas[0]).not.toContain('joao@exemplo.com');
    expect(falhas[1]).not.toContain('maria@exemplo.com');
    expect(falhas[0]).toContain(MARCADOR_REDIGIDO);
  });

  it('redige PII dentro de objetos aninhados em um array', () => {
    const resultado = sanitizarProfundo({
      area: 'notificacao',
      itens: [{ mensagem: 'oi joao@exemplo.com', codigo: 'ok' }],
    }) as { itens: Array<Record<string, unknown>> };
    // "mensagem" é chave sensível — some inteira; "codigo" sobrevive.
    expect(resultado.itens[0]).toEqual({ codigo: 'ok' });
  });

  it('sanitiza a mensagem de um Error usado como valor de contexto', () => {
    const resultado = sanitizarProfundo({
      area: 'pagamento',
      falha: new Error('cartão recusado para joao@exemplo.com'),
    }) as Record<string, unknown>;
    expect(resultado.falha).not.toContain('joao@exemplo.com');
  });
});

describe('sanitizarProfundo — limites de profundidade, campos e ciclos', () => {
  // `unknown` é o tipo de retorno correto de `sanitizarProfundo` (a forma do
  // resultado depende do input em runtime). Este helper navega uma cadeia
  // de chaves com um único cast local, em vez de espalhar `as any` pelos
  // testes que precisam ler valores em profundidade arbitrária.
  const navegar = (valor: unknown, ...chaves: string[]): unknown => chaves
    .reduce((atual, chave) => (atual as Record<string, unknown> | undefined)?.[chave], valor);

  it('trunca com marcador ao ultrapassar a profundidade máxima (4 níveis)', () => {
    const profundo = { a: { b: { c: { d: { e: 'muito fundo' } } } } };
    const resultado = sanitizarProfundo(profundo);
    expect(navegar(resultado, 'a', 'b', 'c', 'd')).toBe('[profundidade máxima excedida]');
  });

  it('mantém uma estrutura dentro do limite de profundidade intacta', () => {
    const raso = { a: { b: { c: 'ok' } } };
    const resultado = sanitizarProfundo(raso);
    expect(navegar(resultado, 'a', 'b', 'c')).toBe('ok');
  });

  it('descarta campos excedentes (mais de 20) e registra um marcador', () => {
    const muitosCampos: Record<string, string> = {};
    for (let i = 0; i < 25; i += 1) muitosCampos[`campo${i}`] = 'valor';
    const resultado = sanitizarProfundo(muitosCampos) as Record<string, unknown>;
    expect(Object.keys(resultado).filter((c) => c.startsWith('campo')).length).toBe(20);
    expect(resultado._omitido).toBeDefined();
  });

  it('não trava com referência circular e substitui por um marcador', () => {
    const objetoCircular: Record<string, unknown> = { area: 'teste' };
    objetoCircular.proprio = objetoCircular;
    const resultado = sanitizarProfundo(objetoCircular) as Record<string, unknown>;
    expect(resultado.proprio).toBe('[referência circular]');
  });

  it('não trava com um ciclo dentro de um array', () => {
    const item: Record<string, unknown> = { nome: 'x' };
    const lista: unknown[] = [item];
    item.listaQueOContem = lista;
    expect(() => sanitizarProfundo({ lista })).not.toThrow();
  });
});

describe('sanitizarProfundo — tipos simples', () => {
  it('mantém number e boolean sem alteração', () => {
    const resultado = sanitizarProfundo({ area: 'x', total: 42, ativo: true }) as Record<string, unknown>;
    expect(resultado.total).toBe(42);
    expect(resultado.ativo).toBe(true);
  });

  it('descarta null/undefined em vez de propagá-los', () => {
    const resultado = sanitizarProfundo({ area: 'x', nulo: null, indefinido: undefined }) as Record<string, unknown>;
    expect(resultado).toEqual({ area: 'x' });
  });
});
