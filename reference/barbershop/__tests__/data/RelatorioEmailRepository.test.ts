import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getConfiguracaoRelatorioEmail,
  resolverAlvoRelatorioEmail,
  salvarConfiguracaoRelatorioEmail,
} from '../../src/data/repositories/RelatorioEmailRepository';
import { CONFIGURACAO_RELATORIO_EMAIL_PADRAO } from '../../src/types';
import type { Barbeiro } from '../../src/types';

const mockedDoc = doc as jest.Mock;
const mockedGetDoc = getDoc as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedDoc.mockImplementation((_db: unknown, ...partes: string[]) => ({ path: partes.join('/') }));
  mockedSetDoc.mockResolvedValue(undefined);
});

describe('RelatorioEmailRepository', () => {
  it('mantém semanal ativo para registros anteriores sem preferência salva', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => false });

    await expect(getConfiguracaoRelatorioEmail({ tipo: 'autonomo', id: 'barbeiro-1' }))
      .resolves.toEqual(CONFIGURACAO_RELATORIO_EMAIL_PADRAO);
    expect(mockedDoc).toHaveBeenCalledWith({}, 'barbeiros', 'barbeiro-1', 'configuracoes', 'notificacoes');
  });

  it('mescla uma preferência parcial já existente com o padrão seguro', async () => {
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ relatorioEmail: { mensal: true, emailDestino: 'financeiro@barbearia.com' } }),
    });

    await expect(getConfiguracaoRelatorioEmail({ tipo: 'negocio', id: 'negocio-1' }))
      .resolves.toEqual({ semanal: true, mensal: true, emailDestino: 'financeiro@barbearia.com' });
  });

  it('usa o escopo consolidado do negócio para uma equipe', () => {
    expect(resolverAlvoRelatorioEmail({ id: 'dono-1', nome: 'Dono', negocioId: 'negocio-1' } as Barbeiro))
      .toEqual({ tipo: 'negocio', id: 'negocio-1' });
  });

  it('salva apenas o mapa relatorioEmail com merge, preservando notificações', async () => {
    await salvarConfiguracaoRelatorioEmail(
      { tipo: 'autonomo', id: 'barbeiro-1' },
      { semanal: false, mensal: true, emailDestino: 'dono@barbearia.com' },
      'barbeiro-1',
    );

    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'barbeiros/barbeiro-1/configuracoes/notificacoes' }),
      expect.objectContaining({
        relatorioEmail: { semanal: false, mensal: true, emailDestino: 'dono@barbearia.com' },
        updatedAt: { __serverTimestamp: true },
        updatedBy: 'barbeiro-1',
      }),
      { merge: true },
    );
  });
});
