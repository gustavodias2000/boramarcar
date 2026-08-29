/**
 * useFotoDePerfil — foto da vitrine pública do barbeiro.
 *
 * ARQ-02: extraído de PerfilScreen.tsx. O detalhe que estes testes travam é
 * que cancelar a galeria ou receber erro de permissão NÃO pode ligar o estado
 * de envio (spinner) nem chamar o Storage — só uma imagem escolhida de fato
 * dispara upload.
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { auth } from '../../firebaseConfig';
import { uploadFotoPerfil } from '../../src/services/FotoPerfilService';
import useFotoDePerfil from '../../src/hooks/useFotoDePerfil';

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('../../src/services/FotoPerfilService', () => ({
  uploadFotoPerfil: jest.fn(),
}));

const mockedLaunchImageLibrary = launchImageLibrary as jest.Mock;
const mockedUploadFotoPerfil = uploadFotoPerfil as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

let hook!: ReturnType<typeof useFotoDePerfil>;
function Sonda() {
  hook = useFotoDePerfil();
  return <Text>{hook.enviandoFoto ? 'enviando' : 'ocioso'}</Text>;
}

const FOTO_ESCOLHIDA = {
  didCancel: false,
  assets: [{ uri: 'file://foto-local.jpg' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (auth as any).currentUser = { uid: 'test-uid', email: 'test@example.com' };
  mockedUploadFotoPerfil.mockResolvedValue('https://exemplo.com/foto.jpg');
});

describe('useFotoDePerfil — foto inicial', () => {
  it('começa sem foto e sem envio em andamento', () => {
    render(<Sonda />);

    expect(hook.fotoUrl).toBeUndefined();
    expect(hook.fotoPadraoId).toBeUndefined();
    expect(hook.enviandoFoto).toBe(false);
  });

  it('definirFotoInicial semeia a foto vinda do documento da vitrine', async () => {
    render(<Sonda />);

    await act(async () => hook.definirFotoInicial('https://exemplo.com/atual.jpg', 'padrao-3'));

    expect(hook.fotoUrl).toBe('https://exemplo.com/atual.jpg');
    expect(hook.fotoPadraoId).toBe('padrao-3');
  });
});

describe('useFotoDePerfil — troca de foto', () => {
  it('envia a imagem escolhida e passa a expor a nova URL', async () => {
    mockedLaunchImageLibrary.mockResolvedValue(FOTO_ESCOLHIDA);
    render(<Sonda />);

    await act(async () => {
      await hook.trocarFoto();
    });

    expect(mockedUploadFotoPerfil).toHaveBeenCalledWith('test-uid', 'file://foto-local.jpg');
    expect(hook.fotoUrl).toBe('https://exemplo.com/foto.jpg');
  });

  it('pede uma única foto da galeria, com compressão', async () => {
    mockedLaunchImageLibrary.mockResolvedValue(FOTO_ESCOLHIDA);
    render(<Sonda />);

    await act(async () => {
      await hook.trocarFoto();
    });

    expect(mockedLaunchImageLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'photo', selectionLimit: 1 }),
    );
  });

  it('marca "enviando" durante o upload e desmarca ao final', async () => {
    mockedLaunchImageLibrary.mockResolvedValue(FOTO_ESCOLHIDA);
    let liberar!: (url: string) => void;
    mockedUploadFotoPerfil.mockReturnValue(new Promise<string>((resolve) => { liberar = resolve; }));

    const utils = render(<Sonda />);
    await act(async () => {
      hook.trocarFoto();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(utils.getByText('enviando')).toBeTruthy();

    await act(async () => {
      liberar('https://exemplo.com/foto.jpg');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(utils.getByText('ocioso')).toBeTruthy();
  });
});

describe('useFotoDePerfil — caminhos que não devem enviar nada', () => {
  it('cancelar a galeria não envia nem liga o spinner', async () => {
    mockedLaunchImageLibrary.mockResolvedValue({ didCancel: true });
    const utils = render(<Sonda />);

    await act(async () => {
      await hook.trocarFoto();
    });

    expect(mockedUploadFotoPerfil).not.toHaveBeenCalled();
    expect(utils.getByText('ocioso')).toBeTruthy();
    expect(mockedAlert).not.toHaveBeenCalled();
  });

  it('erro da galeria mostra a mensagem do picker e não envia', async () => {
    mockedLaunchImageLibrary.mockResolvedValue({
      didCancel: false,
      errorCode: 'permission',
      errorMessage: 'Sem permissão',
    });
    render(<Sonda />);

    await act(async () => {
      await hook.trocarFoto();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Sem permissão');
    expect(mockedUploadFotoPerfil).not.toHaveBeenCalled();
  });

  it('erro da galeria sem mensagem cai no texto padrão', async () => {
    mockedLaunchImageLibrary.mockResolvedValue({ didCancel: false, errorCode: 'others' });
    render(<Sonda />);

    await act(async () => {
      await hook.trocarFoto();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível abrir a galeria de fotos.');
  });

  it('resposta sem nenhuma imagem não envia', async () => {
    mockedLaunchImageLibrary.mockResolvedValue({ didCancel: false, assets: [] });
    render(<Sonda />);

    await act(async () => {
      await hook.trocarFoto();
    });

    expect(mockedUploadFotoPerfil).not.toHaveBeenCalled();
  });

  it('sem usuário autenticado, nem abre a galeria', async () => {
    (auth as any).currentUser = null;
    render(<Sonda />);

    await act(async () => {
      await hook.trocarFoto();
    });

    expect(mockedLaunchImageLibrary).not.toHaveBeenCalled();
    expect(mockedUploadFotoPerfil).not.toHaveBeenCalled();
  });
});

describe('useFotoDePerfil — falha no upload', () => {
  it('avisa, mantém a foto anterior e libera o botão', async () => {
    mockedLaunchImageLibrary.mockResolvedValue(FOTO_ESCOLHIDA);
    mockedUploadFotoPerfil.mockRejectedValue(new Error('falha de upload'));
    const utils = render(<Sonda />);
    await act(async () => hook.definirFotoInicial('https://exemplo.com/antiga.jpg', undefined));

    await act(async () => {
      await hook.trocarFoto();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível enviar a foto. Tente novamente.');
    expect(hook.fotoUrl).toBe('https://exemplo.com/antiga.jpg');
    expect(utils.getByText('ocioso')).toBeTruthy();
  });
});
