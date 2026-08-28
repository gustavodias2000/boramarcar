/**
 * NotificationRepository — configuração de canais/eventos de notificação de
 * agendamento. Onda A (fundação): cobre compatibilidade com registros sem
 * config salva (padrões), leitura de config existente, gravação com
 * `updatedAt`/`updatedBy` corretos e a resolução de alvo autônomo vs. negócio
 * a partir de um `Barbeiro`.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getConfiguracaoNotificacoes,
  salvarConfiguracaoNotificacoes,
  resolverAlvoNotificacao,
} from '../../src/data/repositories/NotificationRepository';
import { CONFIGURACAO_NOTIFICACOES_PADRAO } from '../../src/types';
import type { Barbeiro } from '../../src/types';

const mockedDoc = doc as jest.Mock;
const mockedGetDoc = getDoc as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedDoc.mockImplementation((_db: unknown, ...p: string[]) => ({ path: p.join('/') }));
  mockedSetDoc.mockResolvedValue(undefined);
});

describe('resolverAlvoNotificacao', () => {
  it('resolve alvo "negocio" quando o Barbeiro tem negocioId (profissional de equipe)', () => {
    const barbeiro = { id: 'profissional-1', nome: 'Ana', negocioId: 'negocio-1' } as Barbeiro;
    expect(resolverAlvoNotificacao(barbeiro)).toEqual({ tipo: 'negocio', id: 'negocio-1' });
  });

  it('resolve alvo "autonomo" quando o Barbeiro NÃO tem negocioId', () => {
    const barbeiro = { id: 'barbeiro-1', nome: 'Bruno' } as Barbeiro;
    expect(resolverAlvoNotificacao(barbeiro)).toEqual({ tipo: 'autonomo', id: 'barbeiro-1' });
  });

  it('não consulta o Firestore — usa só o campo já denormalizado no Barbeiro em mãos', () => {
    resolverAlvoNotificacao({ id: 'x', nome: 'X', negocioId: 'negocio-1' } as Barbeiro);
    expect(mockedDoc).not.toHaveBeenCalled();
    expect(mockedGetDoc).not.toHaveBeenCalled();
  });
});

describe('getConfiguracaoNotificacoes', () => {
  it('devolve os valores PADRÃO quando o profissional autônomo ainda não tem config salva (compatibilidade)', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => false });

    const config = await getConfiguracaoNotificacoes({ tipo: 'autonomo', id: 'barbeiro-1' });

    expect(config).toEqual(CONFIGURACAO_NOTIFICACOES_PADRAO);
    expect(mockedDoc).toHaveBeenCalledWith({}, 'barbeiros', 'barbeiro-1', 'configuracoes', 'notificacoes');
  });

  it('devolve os valores PADRÃO quando o negócio ainda não tem config salva (compatibilidade)', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => false });

    const config = await getConfiguracaoNotificacoes({ tipo: 'negocio', id: 'negocio-1' });

    expect(config).toEqual(CONFIGURACAO_NOTIFICACOES_PADRAO);
    expect(mockedDoc).toHaveBeenCalledWith({}, 'negocios', 'negocio-1', 'configuracoes', 'notificacoes');
  });

  it('lê a config existente do profissional autônomo e mescla com os padrões (campos ausentes no doc não quebram)', async () => {
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        canais: { whatsapp: true, sms: true, push: false },
        eventos: { novoAgendamento: true, confirmacao: false, cancelamento: true, lembrete: true },
        updatedBy: 'barbeiro-1',
      }),
    });

    const config = await getConfiguracaoNotificacoes({ tipo: 'autonomo', id: 'barbeiro-1' });

    expect(config.canais).toEqual({ whatsapp: true, sms: true, push: false });
    expect(config.eventos.confirmacao).toBe(false);
    expect(config.retornoCliente).toEqual({ ativo: false, diasSemComparecer: 30, canal: 'push' });
    expect(config.updatedBy).toBe('barbeiro-1');
  });

  it('mescla a configuração de retorno parcialmente salva com o padrão seguro', async () => {
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ retornoCliente: { ativo: true, diasSemComparecer: 45 } }),
    });

    const config = await getConfiguracaoNotificacoes({ tipo: 'autonomo', id: 'barbeiro-1' });

    expect(config.retornoCliente).toEqual({ ativo: true, diasSemComparecer: 45, canal: 'push' });
  });

  it('lê a config existente do negócio (equipe)', async () => {
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        canais: { whatsapp: false, sms: false, push: true },
        eventos: { novoAgendamento: true, confirmacao: true, cancelamento: true, lembrete: false },
      }),
    });

    const config = await getConfiguracaoNotificacoes({ tipo: 'negocio', id: 'negocio-1' });

    expect(config.canais.whatsapp).toBe(false);
    expect(config.eventos.lembrete).toBe(false);
  });
});

describe('salvarConfiguracaoNotificacoes', () => {
  it('grava com merge e carimba updatedAt/updatedBy no servidor (autônomo)', async () => {
    await salvarConfiguracaoNotificacoes(
      { tipo: 'autonomo', id: 'barbeiro-1' },
      { canais: { whatsapp: true, sms: true, push: true } },
      'barbeiro-1',
    );

    expect(mockedDoc).toHaveBeenCalledWith({}, 'barbeiros', 'barbeiro-1', 'configuracoes', 'notificacoes');
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'barbeiros/barbeiro-1/configuracoes/notificacoes' }),
      expect.objectContaining({
        canais: { whatsapp: true, sms: true, push: true },
        updatedAt: { __serverTimestamp: true },
        updatedBy: 'barbeiro-1',
      }),
      { merge: true },
    );
  });

  it('grava com merge e carimba updatedAt/updatedBy no servidor (negócio) — updatedBy é o dono, não o membro', async () => {
    await salvarConfiguracaoNotificacoes(
      { tipo: 'negocio', id: 'negocio-1' },
      { eventos: { novoAgendamento: false, confirmacao: true, cancelamento: true, lembrete: true } },
      'dono-1',
    );

    expect(mockedDoc).toHaveBeenCalledWith({}, 'negocios', 'negocio-1', 'configuracoes', 'notificacoes');
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'negocios/negocio-1/configuracoes/notificacoes' }),
      expect.objectContaining({
        updatedAt: { __serverTimestamp: true },
        updatedBy: 'dono-1',
      }),
      { merge: true },
    );
  });

  it('usa setDoc com merge (não sobrescreve o doc inteiro) — permite salvar só canais OU só eventos', async () => {
    await salvarConfiguracaoNotificacoes(
      { tipo: 'autonomo', id: 'barbeiro-1' },
      { canais: { whatsapp: true, sms: false, push: true } },
      'barbeiro-1',
    );

    const [, , options] = mockedSetDoc.mock.calls[0];
    expect(options).toEqual({ merge: true });
  });
});
