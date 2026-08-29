/**
 * Exclusão de conta (LGPD art. 18, VI). O prejuízo aqui é duplo: jurídico,
 * porque o app afirmava ter apagado tudo e não apagava; e operacional,
 * porque os documentos órfãos ficavam sem ninguém autorizado a removê-los
 * (as regras autorizam pelo uid do titular, que deixa de existir).
 *
 * O que estes testes travam:
 *  - toda coleção com dado pessoal é varrida;
 *  - o horário é LIBERADO antes de o agendamento ser apagado (senão o slot
 *    fica preso e o profissional perde aquele horário para sempre);
 *  - a equipe do dono é removida junto (profissionais sem login próprio
 *    ficariam na vitrine sem ninguém que pudesse apagá-los);
 *  - o perfil é o ÚLTIMO, porque as regras leem `usuarios/{uid}` para
 *    autorizar as exclusões anteriores;
 *  - uma etapa que falha não impede as outras, e o erro é reportado — quem
 *    chama só encerra o login se `erros` vier vazio.
 */
import { getDocs, deleteDoc, where, collection } from 'firebase/firestore';
import { apagarDadosDoUsuario } from '../../src/services/ExclusaoContaService';
import { liberarSlotsDoAgendamento } from '../../src/services/OcupacaoService';
import { removerBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { deleteProfile } from '../../src/data/repositories/UsuarioRepository';
import {
  getNegocioPorDono,
  listarProfissionaisDoNegocio,
  listarMembros,
} from '../../src/data/repositories/NegocioRepository';

jest.mock('../../src/services/OcupacaoService', () => ({
  liberarSlotsDoAgendamento: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  removerBarbeiro: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/data/repositories/UsuarioRepository', () => ({
  deleteProfile: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/data/repositories/NegocioRepository', () => ({
  getNegocioPorDono: jest.fn(() => Promise.resolve(null)),
  listarProfissionaisDoNegocio: jest.fn(() => Promise.resolve([])),
  listarMembros: jest.fn(() => Promise.resolve([])),
}));

const mockedCollection = collection as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedWhere = where as jest.Mock;
const mockedLiberar = liberarSlotsDoAgendamento as jest.Mock;
const mockedRemoverBarbeiro = removerBarbeiro as jest.Mock;
const mockedDeleteProfile = deleteProfile as jest.Mock;
const mockedNegocioPorDono = getNegocioPorDono as jest.Mock;
const mockedProfissionais = listarProfissionaisDoNegocio as jest.Mock;
const mockedMembros = listarMembros as jest.Mock;

const docFalso = (id: string, dados: any = {}) => ({
  id,
  ref: { path: `qualquer/${id}` },
  data: () => dados,
});

const vazio = { docs: [], empty: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetDocs.mockResolvedValue(vazio);
  mockedDeleteDoc.mockResolvedValue(undefined);
  mockedLiberar.mockResolvedValue(undefined);
  mockedRemoverBarbeiro.mockResolvedValue(undefined);
  mockedDeleteProfile.mockResolvedValue(undefined);
  mockedNegocioPorDono.mockResolvedValue(null);
  mockedProfissionais.mockResolvedValue([]);
  mockedMembros.mockResolvedValue([]);
});

describe('apagarDadosDoUsuario — varredura completa', () => {
  it('varre todas as coleções com dado pessoal', async () => {
    const { removidos, erros } = await apagarDadosDoUsuario('uid1', 'cliente@ex.com');

    expect(erros).toEqual([]);
    // Cada chave é uma etapa que rodou até o fim.
    expect(Object.keys(removidos)).toEqual(
      expect.arrayContaining([
        'agendamentos (como cliente)',
        'agendamentos antigos (por email)',
        'agendamentos (como profissional)',
        'avaliações',
        'listaEspera',
        'recorrencias',
        'despesas',
        'agenda de clientes e banidos',
        'equipe',
        'vínculos',
        'vitrine',
        'perfil',
      ]),
    );
  });

  it('apaga a subcoleção de vínculos do próprio cliente (LGPD)', async () => {
    mockedCollection.mockImplementation((_db: any, ...partes: string[]) => ({
      path: partes.join('/'),
    }));
    mockedGetDocs.mockImplementation(async (ref: any) => {
      if (ref?.path === 'usuarios/uid1/vinculos') {
        return { docs: [docFalso('negocio_negocio1'), docFalso('profissional_b1')], empty: false };
      }
      return vazio;
    });

    const { removidos, erros } = await apagarDadosDoUsuario('uid1');

    expect(erros).toEqual([]);
    expect(removidos['vínculos']).toBe(2);
    expect(mockedDeleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'qualquer/negocio_negocio1' }));
    expect(mockedDeleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'qualquer/profissional_b1' }));
  });

  it('procura o cliente pelo uid E pelo email antigo', async () => {
    await apagarDadosDoUsuario('uid1', 'cliente@ex.com');

    expect(mockedWhere).toHaveBeenCalledWith('clienteUid', '==', 'uid1');
    expect(mockedWhere).toHaveBeenCalledWith('cliente', '==', 'cliente@ex.com');
    expect(mockedWhere).toHaveBeenCalledWith('barbeiroId', '==', 'uid1');
  });

  it('pula as etapas por email quando a conta não tem email', async () => {
    const { removidos } = await apagarDadosDoUsuario('uid1', null);

    expect(removidos['agendamentos antigos (por email)']).toBeUndefined();
    expect(removidos['avaliações']).toBeUndefined();
    expect(removidos.perfil).toBe(1);
  });

  it('busca lista de espera e recorrências nos DOIS papéis do usuário', async () => {
    await apagarDadosDoUsuario('uid1');

    // O mesmo uid pode ser cliente numa fila e profissional em outra.
    expect(mockedWhere).toHaveBeenCalledWith('clienteUid', '==', 'uid1');
    expect(mockedWhere).toHaveBeenCalledWith('barbeiroId', '==', 'uid1');
  });
});

describe('ordem das operações (as regras do Firestore dependem dela)', () => {
  it('libera o horário ANTES de apagar o agendamento', async () => {
    const ordem: string[] = [];
    mockedGetDocs.mockImplementation(async () => ({
      docs: [docFalso('ag1', { barbeiroId: 'b1', data: '2026-07-20', horario: '09:00' })],
      empty: false,
    }));
    mockedLiberar.mockImplementation(async () => {
      ordem.push('liberar');
    });
    mockedDeleteDoc.mockImplementation(async () => {
      ordem.push('apagar');
    });

    await apagarDadosDoUsuario('uid1');

    expect(ordem[0]).toBe('liberar');
    expect(ordem[1]).toBe('apagar');
  });

  it('passa o agendamento com id para a liberação encontrar todos os blocos', async () => {
    mockedGetDocs.mockResolvedValueOnce({
      docs: [docFalso('ag1', { barbeiroId: 'b1', data: '2026-07-20', horario: '09:00' })],
      empty: false,
    });

    await apagarDadosDoUsuario('uid1');

    expect(mockedLiberar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ag1', barbeiroId: 'b1', horario: '09:00' }),
    );
  });

  it('apaga o perfil por último — as regras anteriores leem usuarios/{uid}', async () => {
    const ordem: string[] = [];
    mockedRemoverBarbeiro.mockImplementation(async () => {
      ordem.push('vitrine');
    });
    mockedDeleteProfile.mockImplementation(async () => {
      ordem.push('perfil');
    });

    await apagarDadosDoUsuario('uid1');

    expect(ordem).toEqual(['vitrine', 'perfil']);
  });
});

describe('equipe do dono do negócio', () => {
  it('apaga profissionais sem login, membros e o próprio negócio', async () => {
    mockedNegocioPorDono.mockResolvedValue({ id: 'negocio1', donoUid: 'uid1' });
    mockedProfissionais.mockResolvedValue([{ id: 'prof1' }, { id: 'uid1' }]);
    mockedMembros.mockResolvedValue([{ id: 'membro1' }]);

    const { removidos, erros } = await apagarDadosDoUsuario('uid1');

    expect(erros).toEqual([]);
    // prof1 (1) + membro1 (1) + negócio (1). O dono (uid1) é pulado aqui:
    // a vitrine dele é apagada na etapa própria, logo depois.
    expect(removidos.equipe).toBe(3);
    expect(mockedWhere).toHaveBeenCalledWith('barbeiroId', '==', 'prof1');
  });

  it('não faz nada quando o usuário não é dono de negócio', async () => {
    mockedNegocioPorDono.mockResolvedValue(null);
    const { removidos } = await apagarDadosDoUsuario('uid1');
    expect(removidos.equipe).toBe(0);
    expect(mockedProfissionais).not.toHaveBeenCalled();
  });
});

describe('resiliência — uma coleção problemática não pode travar o resto', () => {
  it('reporta a falha e continua até o fim', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Só a PRIMEIRA consulta falha (agendamentos como cliente).
    mockedGetDocs.mockRejectedValueOnce(new Error('permission-denied'));

    const { removidos, erros } = await apagarDadosDoUsuario('uid1', 'cliente@ex.com');

    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain('agendamentos (como cliente)');
    expect(erros[0]).toContain('permission-denied');
    // As etapas seguintes rodaram normalmente.
    expect(removidos.perfil).toBe(1);
    expect(mockedDeleteProfile).toHaveBeenCalledWith('uid1');
    warn.mockRestore();
  });

  it('reporta erro na exclusão do perfil — sem isso o login não pode ser encerrado', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedDeleteProfile.mockRejectedValue(new Error('offline'));

    const { erros } = await apagarDadosDoUsuario('uid1');

    expect(erros.some((e) => e.startsWith('perfil:'))).toBe(true);
    warn.mockRestore();
  });

  it('nunca lança: quem chama decide o que fazer com a lista de erros', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedGetDocs.mockRejectedValue(new Error('tudo falhou'));
    mockedRemoverBarbeiro.mockRejectedValue(new Error('tudo falhou'));
    mockedDeleteProfile.mockRejectedValue(new Error('tudo falhou'));
    mockedNegocioPorDono.mockRejectedValue(new Error('tudo falhou'));

    const resultado = await apagarDadosDoUsuario('uid1', 'cliente@ex.com');

    expect(resultado.erros.length).toBeGreaterThan(5);
    warn.mockRestore();
  });
});
