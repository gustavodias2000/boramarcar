import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import {
  reauthenticateWithCredential,
  deleteUser,
  updatePassword,
  sendEmailVerification,
  EmailAuthProvider,
} from 'firebase/auth';
import PerfilScreen from '../../src/screens/PerfilScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { encerrarSessao, esquecerSessao } from '../../src/services/SessaoService';
import { apagarDadosDoUsuario } from '../../src/services/ExclusaoContaService';
import { limparAgendamentoPendente, limparConvitePendente } from '../../src/services/DeepLinkService';
import { uploadFotoPerfil } from '../../src/services/FotoPerfilService';
import { getProfile, updateProfile } from '../../src/data/repositories/UsuarioRepository';
import { upsertBarbeiro, getBarbeiro } from '../../src/data/repositories/BarbeiroRepository';
import { launchImageLibrary } from 'react-native-image-picker';
import type { Usuario, Barbeiro } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────
// `firebase/auth` e `../../firebaseConfig` (auth.currentUser = { uid:
// 'test-uid', email: 'test@example.com' }) já vêm mockados globalmente por
// jest.setup.js — só importamos os jest.fn() já existentes para controlar
// resolve/reject por teste, sem reescrever o mock do módulo inteiro.

jest.mock('../../src/services/SessaoService', () => ({
  encerrarSessao: jest.fn(),
  esquecerSessao: jest.fn(),
}));

jest.mock('../../src/services/ExclusaoContaService', () => ({
  apagarDadosDoUsuario: jest.fn(),
}));

// CLEAN-002: a exclusão de conta limpa os dois pendentes de deep link
// (agendamento e convite) explicitamente, já que não passa por
// encerrarSessao() — ver PerfilScreen.tsx.
jest.mock('../../src/services/DeepLinkService', () => ({
  limparAgendamentoPendente: jest.fn(),
  limparConvitePendente: jest.fn(),
}));

jest.mock('../../src/services/FotoPerfilService', () => ({
  uploadFotoPerfil: jest.fn(),
}));

jest.mock('../../src/data/repositories/UsuarioRepository', () => ({
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.mock('../../src/data/repositories/BarbeiroRepository', () => ({
  upsertBarbeiro: jest.fn(),
  getBarbeiro: jest.fn(),
}));

jest.mock('../../src/services/GeocodingService', () => ({
  buscarSugestoesEndereco: jest.fn(() => Promise.resolve([])),
  buscarDetalhesEndereco: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

const mockedEncerrarSessao = encerrarSessao as jest.Mock;
const mockedEsquecerSessao = esquecerSessao as jest.Mock;
const mockedApagarDados = apagarDadosDoUsuario as jest.Mock;
const mockedLimparAgendamentoPendente = limparAgendamentoPendente as jest.Mock;
const mockedLimparConvitePendente = limparConvitePendente as jest.Mock;
const mockedUploadFotoPerfil = uploadFotoPerfil as jest.Mock;
const mockedGetProfile = getProfile as jest.Mock;
const mockedUpdateProfile = updateProfile as jest.Mock;
const mockedUpsertBarbeiro = upsertBarbeiro as jest.Mock;
const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedLaunchImageLibrary = launchImageLibrary as jest.Mock;
const mockedReauthenticate = reauthenticateWithCredential as jest.Mock;
const mockedDeleteUser = deleteUser as jest.Mock;
const mockedUpdatePassword = updatePassword as jest.Mock;
const mockedSendEmailVerification = sendEmailVerification as jest.Mock;
const mockedCredential = EmailAuthProvider.credential as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const mockNavigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() } as any;

const PERFIL_CLIENTE: Usuario = {
  uid: 'test-uid',
  nome: 'Cliente Teste',
  email: 'test@example.com',
  telefone: '5511988887777',
  tipo: 'cliente',
};

const PERFIL_BARBEIRO: Usuario = {
  uid: 'test-uid',
  nome: 'Barbeiro Teste',
  email: 'test@example.com',
  telefone: '5511988887777',
  tipo: 'barbeiro',
};

const BARBEIRO_DOC: Barbeiro = {
  id: 'test-uid',
  nome: 'Barbeiro Teste',
  telefone: '5511988887777',
  endereco: 'Rua Teste, 123',
} as Barbeiro;

const renderScreen = () =>
  renderWithTheme(<PerfilScreen navigation={mockNavigation} route={{} as any} />);

/** Aguarda a tela sair do loading inicial (nome do usuário visível). */
const aguardarCarregamento = async (utils: ReturnType<typeof renderScreen>) => {
  await waitFor(() => expect(mockedGetProfile).toHaveBeenCalled());
  await waitFor(() => expect(utils.queryByText('Carregando perfil...')).toBeNull());
};

/** Encontra, entre as chamadas de Alert.alert, a que tem o título dado. */
const chamadaDoAlert = (titulo: string) => {
  const chamada = mockedAlert.mock.calls.find((c) => c[0] === titulo);
  if (!chamada) throw new Error(`Alert "${titulo}" não foi chamado`);
  return chamada;
};

function criarPromiseControlavel<T>() {
  let resolver!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolve: resolver };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetProfile.mockResolvedValue(PERFIL_CLIENTE);
  mockedUpdateProfile.mockResolvedValue(undefined);
  mockedUpsertBarbeiro.mockResolvedValue(undefined);
  mockedGetBarbeiro.mockResolvedValue(BARBEIRO_DOC);
  mockedEncerrarSessao.mockResolvedValue(undefined);
  mockedEsquecerSessao.mockResolvedValue(undefined);
  mockedLimparAgendamentoPendente.mockResolvedValue(undefined);
  mockedApagarDados.mockResolvedValue({ removidos: {}, erros: [] });
  mockedReauthenticate.mockResolvedValue(undefined);
  mockedDeleteUser.mockResolvedValue(undefined);
  mockedUpdatePassword.mockResolvedValue(undefined);
  mockedSendEmailVerification.mockResolvedValue(undefined);
  mockedCredential.mockReturnValue({ providerId: 'password' });
  mockedUploadFotoPerfil.mockResolvedValue('https://exemplo.com/foto.jpg');
});

// ─── Estado de carregamento / carregamento do perfil ─────────────────────────

describe('PerfilScreen — carregamento do perfil', () => {
  it('mostra o indicador de carregamento antes do perfil chegar', async () => {
    const pendente = criarPromiseControlavel<Usuario | null>();
    mockedGetProfile.mockReturnValue(pendente.promise);

    const utils = renderScreen();
    expect(utils.getByText('Carregando perfil...')).toBeTruthy();

    await act(async () => {
      pendente.resolve(PERFIL_CLIENTE);
      await Promise.resolve();
    });
  });

  it('carrega nome, telefone e tipo do usuário no formulário', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(utils.getByLabelText('Nome completo').props.value).toBe('Cliente Teste');
    expect(utils.getByLabelText('Telefone ou WhatsApp').props.value).toBe('(11) 98888-7777');
    expect(utils.getByText('Cliente')).toBeTruthy();
    // Perfil antigo sem preferência salva: opt-in pendente, portanto desligado.
    expect(utils.getByLabelText('Receber notificações push de lembretes e novidades').props.value).toBe(false);
  });

  it('quando o usuário é barbeiro, também carrega o endereço e a foto da vitrine', async () => {
    mockedGetProfile.mockResolvedValue(PERFIL_BARBEIRO);
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(mockedGetBarbeiro).toHaveBeenCalledWith('test-uid');
    await waitFor(() => expect(utils.getByText('Barbeiro')).toBeTruthy());
    expect(utils.getByLabelText('Endereço do estabelecimento').props.value).toBe('Rua Teste, 123');
  });

  it('em caso de falha ao carregar o perfil, mostra alerta de erro', async () => {
    mockedGetProfile.mockRejectedValue(new Error('offline'));
    renderScreen();

    await waitFor(() => expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Não foi possível carregar o perfil.',
    ));
  });
});

// ─── Alteração de dados ───────────────────────────────────────────────────────

describe('PerfilScreen — alteração de dados do perfil', () => {
  it('valida nome curto e telefone inválido antes de salvar', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    fireEvent.changeText(utils.getByLabelText('Nome completo'), 'Jo');
    fireEvent.changeText(utils.getByLabelText('Telefone ou WhatsApp'), '123');
    fireEvent.press(utils.getByLabelText('Salvar alterações do perfil'));

    await waitFor(() => expect(utils.getByText('Nome deve ter pelo menos 3 caracteres')).toBeTruthy());
    expect(utils.getByText('Telefone inválido')).toBeTruthy();
    expect(mockedUpdateProfile).not.toHaveBeenCalled();
  });

  it('salva nome e telefone válidos com sucesso', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    fireEvent.changeText(utils.getByLabelText('Nome completo'), 'Cliente Editado');
    fireEvent.changeText(utils.getByLabelText('Telefone ou WhatsApp'), '11977776666');

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Salvar alterações do perfil'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedUpdateProfile).toHaveBeenCalledWith('test-uid', expect.objectContaining({
      nome: 'Cliente Editado',
    }));
    expect(mockedAlert).toHaveBeenCalledWith('Sucesso!', 'Perfil atualizado com sucesso.');
    // Cliente comum não mantém vitrine pública.
    expect(mockedUpsertBarbeiro).not.toHaveBeenCalled();
  });

  it('cliente pode aceitar push explicitamente; a decisão só é enviada após salvar', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    const escolha = utils.getByLabelText('Receber notificações push de lembretes e novidades');
    fireEvent(escolha, 'valueChange', true);
    expect(mockedUpdateProfile).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Salvar alterações do perfil'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedUpdateProfile).toHaveBeenCalledWith('test-uid', expect.objectContaining({
      consentimentoNotificacoesPush: true,
    }));
  });

  it('não exibe a preferência de campanhas para o perfil de barbeiro', async () => {
    mockedGetProfile.mockResolvedValue(PERFIL_BARBEIRO);
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    expect(utils.queryByLabelText('Receber notificações push de lembretes e novidades')).toBeNull();
  });

  it('quando o usuário é barbeiro, também sincroniza a vitrine (upsertBarbeiro)', async () => {
    mockedGetProfile.mockResolvedValue(PERFIL_BARBEIRO);
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Salvar alterações do perfil'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedUpsertBarbeiro).toHaveBeenCalledWith('test-uid', expect.objectContaining({
      nome: 'Barbeiro Teste',
    }));
  });

  it('protege contra vários cliques: o botão de salvar fica desabilitado durante o envio', async () => {
    const pendente = criarPromiseControlavel<void>();
    mockedUpdateProfile.mockReturnValue(pendente.promise);
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    fireEvent.press(utils.getByLabelText('Salvar alterações do perfil'));

    await waitFor(() => {
      const botao = utils.getByLabelText('Salvar alterações do perfil');
      expect(botao.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true, busy: true }));
    });
    expect(mockedUpdateProfile).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendente.resolve();
      await Promise.resolve();
    });
  });

  it('mostra mensagem de erro quando salvar falha', async () => {
    mockedUpdateProfile.mockRejectedValue(new Error('offline'));
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Salvar alterações do perfil'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível salvar as alterações.');
  });
});

// ─── Alterar senha ────────────────────────────────────────────────────────────

describe('PerfilScreen — alterar senha', () => {
  const abrirSecaoSenha = async (utils: ReturnType<typeof renderScreen>) => {
    await aguardarCarregamento(utils);
    fireEvent.press(utils.getByLabelText('Alterar senha'));
    await waitFor(() => expect(utils.getByLabelText('Senha atual')).toBeTruthy());
  };

  it('exige senha atual e nova senha com pelo menos 6 caracteres', async () => {
    const utils = renderScreen();
    await abrirSecaoSenha(utils);

    fireEvent.press(utils.getAllByLabelText('Alterar senha')[1]);
    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Informe sua senha atual.');
    expect(mockedUpdatePassword).not.toHaveBeenCalled();
  });

  it('mostra mensagem amigável quando a senha atual está incorreta', async () => {
    mockedReauthenticate.mockRejectedValue({ code: 'auth/wrong-password' });
    const utils = renderScreen();
    await abrirSecaoSenha(utils);

    fireEvent.changeText(utils.getByLabelText('Senha atual'), 'errada123');
    fireEvent.changeText(utils.getByLabelText('Nova senha'), 'novaSenha123');
    fireEvent.changeText(utils.getByLabelText('Confirmar nova senha'), 'novaSenha123');

    await act(async () => {
      fireEvent.press(utils.getAllByLabelText('Alterar senha')[1]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Senha atual incorreta.');
  });

  it('troca a senha com sucesso quando os dados são válidos', async () => {
    const utils = renderScreen();
    await abrirSecaoSenha(utils);

    fireEvent.changeText(utils.getByLabelText('Senha atual'), 'atual123');
    fireEvent.changeText(utils.getByLabelText('Nova senha'), 'novaSenha123');
    fireEvent.changeText(utils.getByLabelText('Confirmar nova senha'), 'novaSenha123');

    await act(async () => {
      fireEvent.press(utils.getAllByLabelText('Alterar senha')[1]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedUpdatePassword).toHaveBeenCalledWith(expect.anything(), 'novaSenha123');
    expect(mockedAlert).toHaveBeenCalledWith('Sucesso!', 'Senha alterada com sucesso.');
  });

  it('rejeita nova senha com menos de 6 caracteres', async () => {
    const utils = renderScreen();
    await abrirSecaoSenha(utils);

    fireEvent.changeText(utils.getByLabelText('Senha atual'), 'atual123');
    fireEvent.changeText(utils.getByLabelText('Nova senha'), '123');
    fireEvent.press(utils.getAllByLabelText('Alterar senha')[1]);

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Nova senha deve ter pelo menos 6 caracteres.');
    expect(mockedUpdatePassword).not.toHaveBeenCalled();
  });

  it('rejeita quando a confirmação não confere com a nova senha', async () => {
    const utils = renderScreen();
    await abrirSecaoSenha(utils);

    fireEvent.changeText(utils.getByLabelText('Senha atual'), 'atual123');
    fireEvent.changeText(utils.getByLabelText('Nova senha'), 'novaSenha123');
    fireEvent.changeText(utils.getByLabelText('Confirmar nova senha'), 'outraCoisa456');
    fireEvent.press(utils.getAllByLabelText('Alterar senha')[1]);

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Novas senhas não conferem.');
    expect(mockedUpdatePassword).not.toHaveBeenCalled();
  });
});

// ─── Reenvio de verificação de email ──────────────────────────────────────────

describe('PerfilScreen — verificação de email', () => {
  it('reenvia o email de verificação quando a conta ainda não foi verificada', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    await waitFor(() => expect(utils.getByText('Email não verificado')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Reenviar email de verificação'));
      await Promise.resolve();
    });

    expect(mockedSendEmailVerification).toHaveBeenCalled();
    expect(mockedAlert).toHaveBeenCalledWith(
      'Email enviado',
      expect.stringContaining('Verifique sua caixa de entrada'),
    );
  });

  it('mostra mensagem específica quando o reenvio é bloqueado por excesso de tentativas', async () => {
    mockedSendEmailVerification.mockRejectedValue({ code: 'auth/too-many-requests' });
    const utils = renderScreen();
    await aguardarCarregamento(utils);
    await waitFor(() => expect(utils.getByText('Email não verificado')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Reenviar email de verificação'));
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith(
      'Erro',
      'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    );
  });
});

// ─── Foto de perfil (só barbeiro) ─────────────────────────────────────────────

describe('PerfilScreen — foto de perfil', () => {
  beforeEach(() => {
    mockedGetProfile.mockResolvedValue(PERFIL_BARBEIRO);
  });

  it('envia a foto escolhida na galeria e atualiza o avatar', async () => {
    mockedLaunchImageLibrary.mockResolvedValue({
      didCancel: false,
      assets: [{ uri: 'file://foto-local.jpg' }],
    });
    const utils = renderScreen();
    await aguardarCarregamento(utils);
    await waitFor(() => expect(utils.getByLabelText('Trocar foto de perfil')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Trocar foto de perfil'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedUploadFotoPerfil).toHaveBeenCalledWith('test-uid', 'file://foto-local.jpg');
  });

  it('quando o usuário cancela a seleção da galeria, não envia nada', async () => {
    mockedLaunchImageLibrary.mockResolvedValue({ didCancel: true });
    const utils = renderScreen();
    await aguardarCarregamento(utils);
    await waitFor(() => expect(utils.getByLabelText('Trocar foto de perfil')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Trocar foto de perfil'));
      await Promise.resolve();
    });

    expect(mockedUploadFotoPerfil).not.toHaveBeenCalled();
  });

  it('quando a galeria retorna erro, mostra alerta e não tenta enviar', async () => {
    mockedLaunchImageLibrary.mockResolvedValue({ didCancel: false, errorCode: 'permission', errorMessage: 'Sem permissão' });
    const utils = renderScreen();
    await aguardarCarregamento(utils);
    await waitFor(() => expect(utils.getByLabelText('Trocar foto de perfil')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Trocar foto de perfil'));
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Sem permissão');
    expect(mockedUploadFotoPerfil).not.toHaveBeenCalled();
  });

  it('quando o envio da foto falha, mostra alerta genérico', async () => {
    mockedLaunchImageLibrary.mockResolvedValue({
      didCancel: false,
      assets: [{ uri: 'file://foto-local.jpg' }],
    });
    mockedUploadFotoPerfil.mockRejectedValue(new Error('falha de upload'));
    const utils = renderScreen();
    await aguardarCarregamento(utils);
    await waitFor(() => expect(utils.getByLabelText('Trocar foto de perfil')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Trocar foto de perfil'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível enviar a foto. Tente novamente.');
  });
});

// ─── Endereço do estabelecimento (autocomplete, só barbeiro) ─────────────────

describe('PerfilScreen — autocomplete de endereço', () => {
  const GeocodingService = jest.requireMock('../../src/services/GeocodingService') as {
    buscarSugestoesEndereco: jest.Mock;
    buscarDetalhesEndereco: jest.Mock;
  };

  beforeEach(() => {
    mockedGetProfile.mockResolvedValue(PERFIL_BARBEIRO);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('busca sugestões (com debounce) e permite escolher uma, preenchendo endereço e coordenadas', async () => {
    GeocodingService.buscarSugestoesEndereco.mockResolvedValue([
      { placeId: 'p1', description: 'Rua Teste, 123, São Paulo' },
    ]);
    GeocodingService.buscarDetalhesEndereco.mockResolvedValue({
      formattedAddress: 'Rua Teste, 123 - São Paulo, SP',
      latitude: -23.5,
      longitude: -46.6,
    });

    const utils = renderScreen();
    await aguardarCarregamento(utils);
    await waitFor(() => expect(utils.getByLabelText('Endereço do estabelecimento')).toBeTruthy());

    fireEvent.changeText(utils.getByLabelText('Endereço do estabelecimento'), 'Rua Teste');

    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(GeocodingService.buscarSugestoesEndereco).toHaveBeenCalledWith('Rua Teste');
    await waitFor(() => expect(utils.getByLabelText('Selecionar endereço Rua Teste, 123, São Paulo')).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Selecionar endereço Rua Teste, 123, São Paulo'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(GeocodingService.buscarDetalhesEndereco).toHaveBeenCalledWith('p1');
    expect(utils.getByLabelText('Endereço do estabelecimento').props.value).toBe(
      'Rua Teste, 123 - São Paulo, SP',
    );
    expect(utils.getByText('Endereço confirmado com localização no mapa.')).toBeTruthy();
  });

  it('digitar menos de 3 caracteres limpa as sugestões sem consultar o serviço', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);
    await waitFor(() => expect(utils.getByLabelText('Endereço do estabelecimento')).toBeTruthy());

    fireEvent.changeText(utils.getByLabelText('Endereço do estabelecimento'), 'Ru');

    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(GeocodingService.buscarSugestoesEndereco).not.toHaveBeenCalled();
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('PerfilScreen — logout', () => {
  it('pede confirmação antes de sair', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    fireEvent.press(utils.getByLabelText('Sair da conta'));

    expect(mockedAlert).toHaveBeenCalledWith(
      'Sair',
      'Deseja realmente sair?',
      expect.any(Array),
    );
    expect(mockedEncerrarSessao).not.toHaveBeenCalled();
  });

  it('ao confirmar, encerra a sessão e navega para o Login', async () => {
    const utils = renderScreen();
    await aguardarCarregamento(utils);

    fireEvent.press(utils.getByLabelText('Sair da conta'));
    const [, , botoes] = chamadaDoAlert('Sair');
    const botaoSair = botoes.find((b: any) => b.text === 'Sair');

    await act(async () => {
      await botaoSair.onPress();
    });

    expect(mockedEncerrarSessao).toHaveBeenCalled();
    expect(mockNavigation.replace).toHaveBeenCalledWith('Login');
  });
});

// ─── Exclusão de conta (LGPD) ─────────────────────────────────────────────────

describe('PerfilScreen — exclusão de conta (LGPD)', () => {
  const abrirSecaoExclusao = async (utils: ReturnType<typeof renderScreen>) => {
    await aguardarCarregamento(utils);
    fireEvent.press(utils.getByLabelText('Excluir minha conta e meus dados'));
    await waitFor(() => expect(utils.getByLabelText('Senha para confirmar exclusão da conta')).toBeTruthy());
  };

  it('exige a senha antes de abrir a confirmação de exclusão', async () => {
    const utils = renderScreen();
    await abrirSecaoExclusao(utils);

    fireEvent.press(utils.getByLabelText('Confirmar exclusão da conta'));

    expect(mockedAlert).toHaveBeenCalledWith(
      'Atenção',
      'Digite sua senha para confirmar a exclusão.',
    );
    expect(mockedApagarDados).not.toHaveBeenCalled();
  });

  it('pede confirmação (com opção de cancelar) antes de excluir', async () => {
    const utils = renderScreen();
    await abrirSecaoExclusao(utils);

    fireEvent.changeText(utils.getByLabelText('Senha para confirmar exclusão da conta'), 'minhaSenha123');
    fireEvent.press(utils.getByLabelText('Confirmar exclusão da conta'));

    const [titulo, , botoes] = chamadaDoAlert('Excluir conta');
    expect(titulo).toBe('Excluir conta');
    expect(botoes.map((b: any) => b.text)).toEqual(
      expect.arrayContaining(['Cancelar', 'Excluir definitivamente']),
    );
    expect(botoes.find((b: any) => b.text === 'Cancelar').style).toBe('cancel');

    // Cancelamento: nenhuma exclusão é executada quando só o Alert é exibido
    // e o botão destrutivo não é pressionado.
    expect(mockedApagarDados).not.toHaveBeenCalled();
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });

  it('sucesso: reautentica, apaga os dados, apaga a conta, limpa a sessão e navega para o Login', async () => {
    const utils = renderScreen();
    await abrirSecaoExclusao(utils);

    fireEvent.changeText(utils.getByLabelText('Senha para confirmar exclusão da conta'), 'minhaSenha123');
    fireEvent.press(utils.getByLabelText('Confirmar exclusão da conta'));

    const [, , botoes] = chamadaDoAlert('Excluir conta');
    const botaoExcluir = botoes.find((b: any) => b.text === 'Excluir definitivamente');

    await act(async () => {
      await botaoExcluir.onPress();
    });

    expect(mockedReauthenticate).toHaveBeenCalled();
    expect(mockedApagarDados).toHaveBeenCalledWith('test-uid', 'test@example.com');
    expect(mockedDeleteUser).toHaveBeenCalled();
    // Limpeza do que ficou gravado no aparelho.
    expect(mockedEsquecerSessao).toHaveBeenCalled();
    expect(mockedLimparAgendamentoPendente).toHaveBeenCalled();

    const [, , botoesSucesso] = chamadaDoAlert('Conta excluída');
    await act(async () => {
      botoesSucesso[0].onPress();
    });
    expect(mockNavigation.replace).toHaveBeenCalledWith('Login');
  });

  it('falha parcial: NÃO apaga a conta de autenticação nem limpa a sessão, e avisa para tentar de novo', async () => {
    mockedApagarDados.mockResolvedValue({ removidos: {}, erros: ['agendamentos: offline'] });
    const utils = renderScreen();
    await abrirSecaoExclusao(utils);

    fireEvent.changeText(utils.getByLabelText('Senha para confirmar exclusão da conta'), 'minhaSenha123');
    fireEvent.press(utils.getByLabelText('Confirmar exclusão da conta'));
    const [, , botoes] = chamadaDoAlert('Excluir conta');
    const botaoExcluir = botoes.find((b: any) => b.text === 'Excluir definitivamente');

    await act(async () => {
      await botaoExcluir.onPress();
    });

    expect(mockedDeleteUser).not.toHaveBeenCalled();
    expect(mockedEsquecerSessao).not.toHaveBeenCalled();
    expect(mockedLimparAgendamentoPendente).not.toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
    expect(mockedAlert).toHaveBeenCalledWith(
      'Exclusão incompleta',
      expect.stringContaining('Sua conta continua ativa'),
    );
  });

  it('senha incorreta na reautenticação: mostra mensagem amigável e não apaga nada', async () => {
    mockedReauthenticate.mockRejectedValue({ code: 'auth/invalid-credential' });
    const utils = renderScreen();
    await abrirSecaoExclusao(utils);

    fireEvent.changeText(utils.getByLabelText('Senha para confirmar exclusão da conta'), 'errada');
    fireEvent.press(utils.getByLabelText('Confirmar exclusão da conta'));
    const [, , botoes] = chamadaDoAlert('Excluir conta');
    const botaoExcluir = botoes.find((b: any) => b.text === 'Excluir definitivamente');

    await act(async () => {
      await botaoExcluir.onPress();
    });

    expect(mockedApagarDados).not.toHaveBeenCalled();
    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Senha incorreta.');
  });

  it('protege contra vários cliques: o botão de excluir fica com estado de carregamento durante o envio', async () => {
    const pendente = criarPromiseControlavel<void>();
    mockedReauthenticate.mockReturnValue(pendente.promise);
    const utils = renderScreen();
    await abrirSecaoExclusao(utils);

    fireEvent.changeText(utils.getByLabelText('Senha para confirmar exclusão da conta'), 'minhaSenha123');
    fireEvent.press(utils.getByLabelText('Confirmar exclusão da conta'));
    const [, , botoes] = chamadaDoAlert('Excluir conta');
    const botaoExcluir = botoes.find((b: any) => b.text === 'Excluir definitivamente');

    // Não aguardamos a Promise inteira de propósito: queremos inspecionar o
    // estado "em andamento" (deleting=true) ANTES da reautenticação resolver
    // — o mesmo instante em que um segundo toque físico aconteceria. Um
    // `act(async …)` com um microtask de folga é suficiente para o React
    // processar o `setDeleting(true)` síncrono (primeira linha do onPress,
    // antes de qualquer `await`) sem esperar a Promise pendente inteira.
    await act(async () => {
      botaoExcluir.onPress();
      await Promise.resolve();
    });

    const botao = utils.getByLabelText('Confirmar exclusão da conta');
    // O nó devolvido por `getByLabelText` é o host component por baixo do
    // TouchableOpacity: o prop bruto `disabled` não chega até ele, mas o RN
    // já o reflete em `accessibilityState.disabled` automaticamente — é essa
    // leitura que corresponde ao que o SO usaria para decidir se entrega ou
    // não um segundo toque físico ao componente.
    expect(botao.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(mockedReauthenticate).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendente.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('CLEAN-002 (corrigido): a exclusão de conta limpa os dois pendentes de deep link (agendamento e convite)', async () => {
    const utils = renderScreen();
    await abrirSecaoExclusao(utils);

    fireEvent.changeText(utils.getByLabelText('Senha para confirmar exclusão da conta'), 'minhaSenha123');
    fireEvent.press(utils.getByLabelText('Confirmar exclusão da conta'));
    const [, , botoes] = chamadaDoAlert('Excluir conta');
    const botaoExcluir = botoes.find((b: any) => b.text === 'Excluir definitivamente');

    await act(async () => {
      await botaoExcluir.onPress();
    });

    // A exclusão não passa por encerrarSessao() (não faz sentido chamar
    // signOut numa conta recém-apagada), então limpa os dois pendentes de
    // deep link explicitamente — ver PerfilScreen.tsx.
    expect(mockedLimparAgendamentoPendente).toHaveBeenCalled();
    expect(mockedLimparConvitePendente).toHaveBeenCalled();
  });
});
