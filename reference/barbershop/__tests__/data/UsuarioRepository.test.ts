/**
 * UsuarioRepository — `usuarios/{uid}`. É o documento que as regras do
 * Firestore leem para decidir quem é cliente e quem é profissional, então
 * todo acesso é por ID (`doc(db, 'usuarios', uid)`), nunca por consulta.
 *
 * Dois comportamentos importam mais que o resto:
 *  - `tipo` nunca é sobrescrito por `updateProfile` (é o que define permissão);
 *  - salvar o token de push nunca pode derrubar o login — o app funciona sem
 *    notificação, mas não funciona sem entrar.
 */
import { Platform } from 'react-native';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  getProfile,
  createProfile,
  updateProfile,
  saveFcmToken,
  deleteProfile,
} from '../../src/data/repositories/UsuarioRepository';

const mockedDoc = doc as jest.Mock;
const mockedGetDoc = getDoc as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;
const mockedUpdateDoc = updateDoc as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedDoc.mockImplementation((_db: unknown, ...p: string[]) => ({ path: p.join('/') }));
  mockedSetDoc.mockResolvedValue(undefined);
  mockedUpdateDoc.mockResolvedValue(undefined);
  mockedDeleteDoc.mockResolvedValue(undefined);
  // Padrão: doc do token ainda não existe (1ª gravação daquele tokenId) —
  // testes específicos de `saveFcmToken` sobrescrevem quando quiserem
  // simular reregistro de um token já conhecido.
  mockedGetDoc.mockResolvedValue({ exists: () => false });
});

describe('getProfile', () => {
  it('busca sempre por ID — as regras não autorizam listar `usuarios`', async () => {
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ uid: 'uid1', nome: 'João', tipo: 'cliente' }),
    });

    await expect(getProfile('uid1')).resolves.toEqual({
      uid: 'uid1',
      nome: 'João',
      tipo: 'cliente',
    });
    expect(mockedDoc).toHaveBeenCalledWith({}, 'usuarios', 'uid1');
  });

  it('devolve null quando o perfil ainda não foi criado', async () => {
    mockedGetDoc.mockResolvedValue({ exists: () => false });
    await expect(getProfile('uid1')).resolves.toBeNull();
  });

  it('não chama o Firestore com uid vazio', async () => {
    // Acontece no primeiro render, antes de o auth restaurar a sessão.
    await expect(getProfile(null)).resolves.toBeNull();
    await expect(getProfile(undefined)).resolves.toBeNull();
    await expect(getProfile('')).resolves.toBeNull();
    expect(mockedGetDoc).not.toHaveBeenCalled();
  });
});

describe('createProfile', () => {
  it('grava o uid dentro do documento e carimba a criação no servidor', async () => {
    await createProfile('uid1', { nome: 'João', email: 'joao@ex.com', tipo: 'cliente' } as any);

    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'usuarios/uid1' }),
      expect.objectContaining({
        uid: 'uid1',
        nome: 'João',
        email: 'joao@ex.com',
        tipo: 'cliente',
        createdAt: { __serverTimestamp: true },
      }),
    );
  });

  describe('ARCH-003 — consentimentoEm é responsabilidade do repositório, não da tela', () => {
    it('grava consentimentoEm com o carimbo do SERVIDOR quando consentimentoLGPD: true é passado, mesmo sem a tela enviar nenhum timestamp', async () => {
      // RegisterScreen.tsx (chamador real) manda só `consentimentoLGPD: true`
      // — nenhum campo de timestamp. A prova de que RegisterScreen.tsx não
      // controla timestamps do banco é justamente este teste: mesmo sem
      // receber nada parecido com data/hora, o repositório grava
      // `consentimentoEm` sozinho.
      await createProfile('uid1', {
        nome: 'João',
        email: 'joao@ex.com',
        telefone: '11999999999',
        tipo: 'cliente',
        consentimentoLGPD: true,
      } as any);

      const [, dados] = mockedSetDoc.mock.calls[0];
      expect(dados.consentimentoEm).toEqual({ __serverTimestamp: true });
      expect(dados.consentimentoLGPD).toBe(true);
    });

    it('não grava consentimentoEm quando consentimentoLGPD não vem true (ausente ou false)', async () => {
      await createProfile('uid1', { nome: 'João', email: 'joao@ex.com', tipo: 'cliente' } as any);
      expect(mockedSetDoc.mock.calls[0][1]).not.toHaveProperty('consentimentoEm');

      jest.clearAllMocks();
      await createProfile('uid2', {
        nome: 'Ana',
        email: 'ana@ex.com',
        tipo: 'cliente',
        consentimentoLGPD: false,
      } as any);
      expect(mockedSetDoc.mock.calls[0][1]).not.toHaveProperty('consentimentoEm');
    });
  });
});

describe('updateProfile', () => {
  it('atualiza os campos pedidos e registra updatedAt', async () => {
    await updateProfile('uid1', { nome: 'João Silva' } as any);

    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'usuarios/uid1' }),
      expect.objectContaining({ nome: 'João Silva', updatedAt: { __serverTimestamp: true } }),
    );
  });

  it('usa updateDoc (não setDoc): campos não enviados permanecem intactos', async () => {
    await updateProfile('uid1', { telefone: '11999999999' } as any);

    expect(mockedSetDoc).not.toHaveBeenCalled();
    const [, dados] = mockedUpdateDoc.mock.calls[0];
    expect(dados.tipo).toBeUndefined();
  });

  it('carimba no servidor a escolha explícita de receber push, inclusive ao recusar', async () => {
    await updateProfile('uid1', { consentimentoNotificacoesPush: false });

    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'usuarios/uid1' }),
      expect.objectContaining({
        consentimentoNotificacoesPush: false,
        consentimentoNotificacoesPushEm: { __serverTimestamp: true },
        updatedAt: { __serverTimestamp: true },
      }),
    );
  });
});

describe('saveFcmToken — push é acessório, login não é (Onda C: grava em dois lugares numa única chamada)', () => {
  it('salva o token com a data da última renovação no campo LEGADO (usuarios/{uid}.fcmToken) — functions/index.js ainda lê só este campo', async () => {
    await saveFcmToken('uid1', 'token-abc');

    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'usuarios/uid1' }),
      { fcmToken: 'token-abc', fcmTokenAt: { __serverTimestamp: true } },
    );
  });

  it('grava TAMBÉM na subcoleção usuarios/{uid}/tokens/{token} (setDoc com merge) numa única chamada — tokenId é o próprio token', async () => {
    await saveFcmToken('uid1', 'token-abc');

    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'usuarios/uid1/tokens/token-abc' }),
      expect.objectContaining({
        token: 'token-abc',
        platform: Platform.OS,
        lastSeenAt: { __serverTimestamp: true },
      }),
      { merge: true },
    );
    // A gravação legada e a da subcoleção acontecem na MESMA chamada.
    expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockedSetDoc).toHaveBeenCalledTimes(1);
  });

  it('grava createdAt SÓ na criação (doc do token ainda não existe) — não gravado quando o token já existe (mero refresh)', async () => {
    mockedGetDoc.mockResolvedValueOnce({ exists: () => false });
    await saveFcmToken('uid1', 'token-novo');
    expect(mockedSetDoc.mock.calls[0][1]).toHaveProperty('createdAt', { __serverTimestamp: true });

    jest.clearAllMocks();
    mockedGetDoc.mockResolvedValueOnce({ exists: () => true });
    await saveFcmToken('uid1', 'token-ja-existente');
    expect(mockedSetDoc.mock.calls[0][1]).not.toHaveProperty('createdAt');
    // lastSeenAt é atualizado em TODA gravação, criação ou refresh.
    expect(mockedSetDoc.mock.calls[0][1]).toHaveProperty('lastSeenAt', { __serverTimestamp: true });
  });

  it('chamada repetida com o mesmo token NÃO cria segundo documento na subcoleção — sempre o mesmo path (tokenId == token)', async () => {
    await saveFcmToken('uid1', 'token-repetido');
    await saveFcmToken('uid1', 'token-repetido');

    expect(mockedSetDoc).toHaveBeenCalledTimes(2);
    const path1 = mockedSetDoc.mock.calls[0][0].path;
    const path2 = mockedSetDoc.mock.calls[1][0].path;
    expect(path1).toBe('usuarios/uid1/tokens/token-repetido');
    expect(path1).toBe(path2);
  });

  it('dois dispositivos (tokens diferentes) do mesmo usuário gravam DOIS documentos distintos, sem um sobrescrever o outro', async () => {
    await saveFcmToken('uid1', 'token-dispositivo-1');
    await saveFcmToken('uid1', 'token-dispositivo-2');

    expect(mockedSetDoc).toHaveBeenCalledTimes(2);
    const paths = mockedSetDoc.mock.calls.map((call) => call[0].path);
    expect(paths).toEqual([
      'usuarios/uid1/tokens/token-dispositivo-1',
      'usuarios/uid1/tokens/token-dispositivo-2',
    ]);
  });

  it('não faz nada sem uid ou sem token — nem no campo legado, nem na subcoleção', async () => {
    await saveFcmToken(null, 'token-abc');
    await saveFcmToken('uid1', null);
    await saveFcmToken('uid1', '');
    expect(mockedUpdateDoc).not.toHaveBeenCalled();
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it('engole o erro: uma falha no push não pode quebrar a entrada no app', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedUpdateDoc.mockRejectedValue(new Error('permission-denied'));

    await expect(saveFcmToken('uid1', 'token-abc')).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('ARCH-003 — RegisterScreen.tsx não importa firebase/firestore', () => {
  it('não importa nada de firebase/firestore no código-fonte (checagem estática)', () => {
    // Antes, RegisterScreen.tsx importava `serverTimestamp` de
    // 'firebase/firestore' só para carimbar `consentimentoEm` — agora esse
    // carimbo é responsabilidade do UsuarioRepository (ver createProfile
    // acima). Esta checagem lê o arquivo-fonte direto: se algum dia alguém
    // reintroduzir um import de firebase/firestore ali, este teste quebra.
    const fs = require('fs');
    const path = require('path');
    const codigo = fs.readFileSync(
      path.join(__dirname, '../../src/screens/RegisterScreen.tsx'),
      'utf8',
    );
    expect(codigo).not.toMatch(/from ['"]firebase\/firestore['"]/);
  });
});

describe('deleteProfile — LGPD', () => {
  it('apaga o documento do usuário', async () => {
    await deleteProfile('uid1');
    expect(mockedDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'usuarios/uid1' }),
    );
  });

  it('propaga o erro — quem chama precisa saber que o perfil ficou de pé', async () => {
    // Diferente do token de push: aqui o silêncio faria o app dizer "conta
    // apagada" com o perfil ainda no banco.
    mockedDeleteDoc.mockRejectedValue(new Error('permission-denied'));
    await expect(deleteProfile('uid1')).rejects.toThrow('permission-denied');
  });
});
