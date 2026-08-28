/**
 * Regressão do bug de 24/07/2026: a aba Relatórios ficava presa num
 * spinner infinito quando a consulta de despesas falhava porque o índice
 * composto do Firestore ainda estava sendo construído. O `Promise.all` das
 * telas rejeitava inteiro (fail-fast) e o estado nunca era preenchido.
 */
import {
  comFallback,
  ehIndiceIndisponivel,
  ehPermissaoNegada,
  mensagemErroConsulta,
} from '../../src/utils/consultaResiliente';

const erroIndiceEmConstrucao = Object.assign(
  new Error(
    'The query requires an index. That index is currently building and cannot be used yet.',
  ),
  { code: 'failed-precondition' },
);

describe('comFallback', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devolve o resultado normalmente quando a consulta funciona', async () => {
    await expect(comFallback(Promise.resolve([1, 2]), [], 'teste')).resolves.toEqual([1, 2]);
  });

  it('devolve o fallback em vez de propagar o erro', async () => {
    await expect(
      comFallback(Promise.reject(erroIndiceEmConstrucao), [], 'teste'),
    ).resolves.toEqual([]);
  });

  it('avisa a tela do erro sem deixar de entregar o fallback', async () => {
    const onErro = jest.fn();
    const resultado = await comFallback(Promise.reject(erroIndiceEmConstrucao), 0, 'teste', onErro);
    expect(resultado).toBe(0);
    expect(onErro).toHaveBeenCalledWith(erroIndiceEmConstrucao);
  });

  it('não derruba o Promise.all das telas quando uma das consultas falha', async () => {
    const [ags, desp] = await Promise.all([
      comFallback(Promise.resolve(['ag1']), [] as string[], 'agendamentos'),
      comFallback(Promise.reject(erroIndiceEmConstrucao), [] as string[], 'despesas'),
    ]);
    expect(ags).toEqual(['ag1']);
    expect(desp).toEqual([]);
  });
});

describe('classificação de erros do Firestore', () => {
  it('reconhece o índice ainda em construção', () => {
    expect(ehIndiceIndisponivel(erroIndiceEmConstrucao)).toBe(true);
    expect(ehIndiceIndisponivel(new Error('The query requires an index.'))).toBe(true);
  });

  it('reconhece permissão negada', () => {
    expect(ehPermissaoNegada(new Error('Missing or insufficient permissions.'))).toBe(true);
    expect(ehPermissaoNegada({ code: 'permission-denied' })).toBe(true);
  });

  it('não confunde os dois nem quebra com valores estranhos', () => {
    expect(ehIndiceIndisponivel(new Error('Missing or insufficient permissions.'))).toBe(false);
    expect(ehPermissaoNegada(erroIndiceEmConstrucao)).toBe(false);
    expect(ehIndiceIndisponivel(null)).toBe(false);
    expect(ehIndiceIndisponivel(undefined)).toBe(false);
    expect(ehIndiceIndisponivel({})).toBe(false);
  });
});

describe('mensagemErroConsulta', () => {
  it('explica a espera do índice sem jargão técnico do Firebase', () => {
    const msg = mensagemErroConsulta(erroIndiceEmConstrucao);
    expect(msg).toContain('alguns minutos');
    expect(msg).not.toMatch(/index|firestore|firebase/i);
  });

  it('orienta a reautenticar quando é permissão', () => {
    expect(mensagemErroConsulta(new Error('Missing or insufficient permissions.'))).toContain(
      'permissão',
    );
  });

  it('cai numa mensagem genérica de conexão para erros desconhecidos', () => {
    expect(mensagemErroConsulta(new Error('network request failed'))).toContain('conexão');
  });
});
