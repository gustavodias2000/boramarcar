/**
 * O QR Code impresso na barbearia é a principal porta de entrada de cliente
 * novo. A auditoria mostrou que o link era gerado mas não abria nada. Estes
 * testes travam o contrato do link e o "link pendente" — o caso em que o
 * cliente escaneia o código sem ter conta ainda, que é justamente o mais
 * comum na porta da barbearia.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ESQUEMA,
  DOMINIO_APP_LINK,
  linkDeAgendamento,
  linkDeConvite,
  linkDeRelatorios,
  criarLinking,
  guardarAgendamentoPendente,
  consumirAgendamentoPendente,
  limparAgendamentoPendente,
  guardarConvitePendente,
  consumirConvitePendente,
  limparConvitePendente,
  guardarRelatorioPendente,
  consumirRelatorioPendente,
  limparRelatorioPendente,
} from '../../src/services/DeepLinkService';

const mockedGetItem = AsyncStorage.getItem as jest.Mock;
const mockedSetItem = AsyncStorage.setItem as jest.Mock;
const mockedRemoveItem = AsyncStorage.removeItem as jest.Mock;

const CHAVE = '@barbershop:deeplink-pendente';
const CHAVE_CONVITE = '@barbershop:convite-pendente';
const CHAVE_RELATORIO = '@barbershop:relatorio-pendente';
const UMA_HORA = 60 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
  mockedSetItem.mockResolvedValue(undefined);
  mockedRemoveItem.mockResolvedValue(undefined);
});

describe('linkDeAgendamento', () => {
  it('usa o esquema registrado no Android e no iOS', () => {
    expect(linkDeAgendamento('barbeiro123')).toBe('barbershop://agendar/barbeiro123');
    expect(ESQUEMA).toBe('barbershop');
  });
});

describe('linkDeConvite', () => {
  // App Link (https://), não mais o esquema próprio — só assim o link tem
  // fallback automático pra Play Store quando o app não está instalado
  // (ver public/.well-known/assetlinks.json e o intent-filter autoVerify no
  // AndroidManifest.xml).
  it('monta o link sem query quando a origem não é informada', () => {
    expect(linkDeConvite('ABCD1234')).toBe(`https://${DOMINIO_APP_LINK}/convite/ABCD1234`);
  });

  it('inclui ?origem=qr quando a origem é "qr"', () => {
    expect(linkDeConvite('ABCD1234', 'qr')).toBe(`https://${DOMINIO_APP_LINK}/convite/ABCD1234?origem=qr`);
  });

  it('inclui ?origem=link quando a origem é "link"', () => {
    expect(linkDeConvite('ABCD1234', 'link')).toBe(`https://${DOMINIO_APP_LINK}/convite/ABCD1234?origem=link`);
  });
});

describe('linkDeRelatorios', () => {
  it('usa App Link HTTPS para o botão do e-mail financeiro', () => {
    expect(linkDeRelatorios()).toBe(`https://${DOMINIO_APP_LINK}/relatorios`);
  });
});

describe('criarLinking', () => {
  it('mapeia agendar/:barbeiroId para a tela que resolve o profissional', () => {
    const linking = criarLinking('Cliente');
    // Os dois prefixos precisam continuar valendo: o esquema próprio (link de
    // agendamento e convites antigos já compartilhados) e o App Link novo.
    expect(linking.prefixes).toEqual(['barbershop://', `https://${DOMINIO_APP_LINK}`]);
    expect(linking.config?.screens).toMatchObject({
      AbrirAgendamento: 'agendar/:barbeiroId',
    });
  });

  it('mapeia convite/:codigo para a tela que resgata o convite', () => {
    const linking = criarLinking('Cliente');
    expect(linking.config?.screens).toMatchObject({
      AbrirConvite: 'convite/:codigo',
    });
  });

  it('mapeia relatorios para uma porta autenticada, nunca para a aba diretamente', () => {
    const linking = criarLinking('Login');
    expect(linking.config?.screens).toMatchObject({
      AbrirRelatorios: 'relatorios',
    });
  });

  it('mantém a rota da sessão embaixo, para o botão voltar não sair do app', () => {
    // Cliente logado que escaneia o QR: voltar tem que levar à área dele.
    expect(criarLinking('Cliente').config?.initialRouteName).toBe('Cliente');
    expect(criarLinking('Barbeiro').config?.initialRouteName).toBe('Barbeiro');
    expect(criarLinking('Login').config?.initialRouteName).toBe('Login');
  });
});

describe('link pendente (escaneou o QR sem estar logado)', () => {
  it('guarda o barbeiro com o horário do registro', async () => {
    await guardarAgendamentoPendente('barbeiro123');

    expect(mockedSetItem).toHaveBeenCalledTimes(1);
    const [chave, valor] = mockedSetItem.mock.calls[0];
    expect(chave).toBe(CHAVE);
    expect(JSON.parse(valor)).toMatchObject({ barbeiroId: 'barbeiro123' });
    expect(typeof JSON.parse(valor).em).toBe('number');
  });

  it('ignora barbeiroId vazio em vez de gravar lixo', async () => {
    await guardarAgendamentoPendente('');
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it('não quebra o app se o AsyncStorage falhar', async () => {
    mockedSetItem.mockRejectedValue(new Error('disco cheio'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(guardarAgendamentoPendente('barbeiro123')).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('devolve o barbeiro e APAGA o registro (só retoma uma vez)', async () => {
    mockedGetItem.mockResolvedValue(
      JSON.stringify({ barbeiroId: 'barbeiro123', em: Date.now() }),
    );

    await expect(consumirAgendamentoPendente()).resolves.toBe('barbeiro123');
    expect(mockedRemoveItem).toHaveBeenCalledWith(CHAVE);
  });

  it('descarta link com mais de 1 hora — o cliente não quer isso dias depois', async () => {
    mockedGetItem.mockResolvedValue(
      JSON.stringify({ barbeiroId: 'barbeiro123', em: Date.now() - UMA_HORA - 1000 }),
    );

    await expect(consumirAgendamentoPendente()).resolves.toBeNull();
    // Ainda assim limpa, para não ficar tentando de novo a cada login.
    expect(mockedRemoveItem).toHaveBeenCalledWith(CHAVE);
  });

  it('aceita link gravado há menos de 1 hora', async () => {
    mockedGetItem.mockResolvedValue(
      JSON.stringify({ barbeiroId: 'barbeiro123', em: Date.now() - UMA_HORA + 60_000 }),
    );
    await expect(consumirAgendamentoPendente()).resolves.toBe('barbeiro123');
  });

  it('devolve null quando não há nada guardado', async () => {
    mockedGetItem.mockResolvedValue(null);
    await expect(consumirAgendamentoPendente()).resolves.toBeNull();
    expect(mockedRemoveItem).not.toHaveBeenCalled();
  });

  it('devolve null (sem lançar) se o valor gravado estiver corrompido', async () => {
    mockedGetItem.mockResolvedValue('{isso nao e json');
    await expect(consumirAgendamentoPendente()).resolves.toBeNull();
  });

  it('devolve null se o registro não tiver barbeiroId', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ em: Date.now() }));
    await expect(consumirAgendamentoPendente()).resolves.toBeNull();
  });

  it('limpa o pendente no logout / exclusão de conta', async () => {
    await limparAgendamentoPendente();
    expect(mockedRemoveItem).toHaveBeenCalledWith(CHAVE);
  });

  it('limpeza é silenciosa mesmo se o AsyncStorage falhar', async () => {
    mockedRemoveItem.mockRejectedValue(new Error('offline'));
    await expect(limparAgendamentoPendente()).resolves.toBeUndefined();
  });
});

describe('convite pendente (abriu QR Code/link/código sem estar logado)', () => {
  it('guarda o código, a origem e o horário do registro', async () => {
    await guardarConvitePendente('ABCD1234', 'qr');

    expect(mockedSetItem).toHaveBeenCalledTimes(1);
    const [chave, valor] = mockedSetItem.mock.calls[0];
    expect(chave).toBe(CHAVE_CONVITE);
    expect(JSON.parse(valor)).toMatchObject({ codigo: 'ABCD1234', origem: 'qr' });
    expect(typeof JSON.parse(valor).em).toBe('number');
  });

  it('ignora código vazio em vez de gravar lixo', async () => {
    await guardarConvitePendente('', 'link');
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it('não quebra o app se o AsyncStorage falhar', async () => {
    mockedSetItem.mockRejectedValue(new Error('disco cheio'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(guardarConvitePendente('ABCD1234', 'qr')).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('devolve o código+origem e APAGA o registro (só retoma uma vez)', async () => {
    mockedGetItem.mockResolvedValue(
      JSON.stringify({ codigo: 'ABCD1234', origem: 'qr', em: Date.now() }),
    );

    await expect(consumirConvitePendente()).resolves.toEqual({ codigo: 'ABCD1234', origem: 'qr' });
    expect(mockedRemoveItem).toHaveBeenCalledWith(CHAVE_CONVITE);
  });

  it('descarta convite com mais de 1 hora — o cliente não quer isso dias depois', async () => {
    mockedGetItem.mockResolvedValue(
      JSON.stringify({ codigo: 'ABCD1234', origem: 'qr', em: Date.now() - UMA_HORA - 1000 }),
    );

    await expect(consumirConvitePendente()).resolves.toBeNull();
    // Ainda assim limpa, para não ficar tentando de novo a cada login.
    expect(mockedRemoveItem).toHaveBeenCalledWith(CHAVE_CONVITE);
  });

  it('aceita convite gravado há menos de 1 hora', async () => {
    mockedGetItem.mockResolvedValue(
      JSON.stringify({ codigo: 'ABCD1234', origem: 'qr', em: Date.now() - UMA_HORA + 60_000 }),
    );
    await expect(consumirConvitePendente()).resolves.toEqual({ codigo: 'ABCD1234', origem: 'qr' });
  });

  it('devolve null quando não há nada guardado', async () => {
    mockedGetItem.mockResolvedValue(null);
    await expect(consumirConvitePendente()).resolves.toBeNull();
    expect(mockedRemoveItem).not.toHaveBeenCalled();
  });

  it('devolve null (sem lançar) se o valor gravado estiver corrompido', async () => {
    mockedGetItem.mockResolvedValue('{isso nao e json');
    await expect(consumirConvitePendente()).resolves.toBeNull();
  });

  it('devolve null se o registro não tiver código', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ origem: 'qr', em: Date.now() }));
    await expect(consumirConvitePendente()).resolves.toBeNull();
  });

  it('limpa o pendente no logout / exclusão de conta', async () => {
    await limparConvitePendente();
    expect(mockedRemoveItem).toHaveBeenCalledWith(CHAVE_CONVITE);
  });

  it('limpeza é silenciosa mesmo se o AsyncStorage falhar', async () => {
    mockedRemoveItem.mockRejectedValue(new Error('offline'));
    await expect(limparConvitePendente()).resolves.toBeUndefined();
  });
});

describe('relatório pendente (abriu o e-mail antes de entrar)', () => {
  it('guarda somente a intenção e o horário, sem qualquer dado do negócio', async () => {
    await guardarRelatorioPendente();

    expect(mockedSetItem).toHaveBeenCalledWith(CHAVE_RELATORIO, expect.any(String));
    expect(JSON.parse(mockedSetItem.mock.calls[0][1])).toEqual({ em: expect.any(Number) });
  });

  it('consome a intenção válida uma única vez', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ em: Date.now() }));

    await expect(consumirRelatorioPendente()).resolves.toBe(true);
    expect(mockedRemoveItem).toHaveBeenCalledWith(CHAVE_RELATORIO);
  });

  it('descarta a intenção vencida ou corrompida', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ em: Date.now() - UMA_HORA - 1 }));
    await expect(consumirRelatorioPendente()).resolves.toBe(false);

    mockedGetItem.mockResolvedValue('{quebrado');
    await expect(consumirRelatorioPendente()).resolves.toBe(false);
  });

  it('limpa a intenção sem lançar erro', async () => {
    await expect(limparRelatorioPendente()).resolves.toBeUndefined();
    expect(mockedRemoveItem).toHaveBeenCalledWith(CHAVE_RELATORIO);
  });
});
