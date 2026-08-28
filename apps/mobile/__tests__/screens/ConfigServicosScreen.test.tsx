/**
 * ConfigServicosScreen — **DOM-01** (perda silenciosa de atualização), a
 * camada de TELA.
 *
 * O defeito: a tela carrega o array INTEIRO de serviços, deixa editar em
 * memória e reescreve o array inteiro. Dono com a mesma conta aberta no tablet
 * do balcão e no celular — o segundo a salvar apagava o trabalho do primeiro
 * sem avisar ninguém.
 *
 * A correção é concorrência otimista: a tela guarda a marca de versão do
 * documento no instante da CARGA e a repassa ao repositório, que recusa a
 * escrita se o documento tiver mudado. O repositório e a transação já estão
 * cobertos por `__tests__/data/BarbeiroRepository.test.ts`. O que faltava — e é
 * o que este arquivo trava — é o comportamento da tela:
 *
 *   1. a marca capturada na carga é a que viaja no salvamento (não uma
 *      releitura na hora de salvar, que tornaria a proteção decorativa);
 *   2. o conflito vira um aviso ESPECÍFICO, nunca o "não foi possível salvar"
 *      genérico — que faria o usuário tentar de novo e, aí sim, apagar o
 *      trabalho do outro aparelho;
 *   3. o conflito não descarta nada do que o usuário digitou;
 *   4. o erro genérico (rede/permissão) continua no caminho antigo, distinto
 *      do conflito;
 *   5. os DOIS atores gravam pela função certa: profissional de equipe por
 *      `atualizarProfissionalSeNaoMudou`, barbeiro solo por
 *      `upsertBarbeiroSeNaoMudou`.
 *
 * ─── Sobre os mocks (leia antes de mexer) ───────────────────────────────────
 *
 * `marcaDeVersaoBarbeiro` e `ehConflitoDeVersao` são REAIS aqui, de propósito.
 * São as duas funções que DECIDEM o comportamento observado nas asserções: a
 * primeira transforma o `updatedAt` do documento na marca, a segunda separa
 * conflito de erro genérico. Mocká-las (`ehConflitoDeVersao: jest.fn()`)
 * transformaria os testes de conflito em teatro — o mock responderia "sim, é
 * conflito" mesmo que a tela tivesse perdido a capacidade de reconhecê-lo.
 * Só a fronteira de I/O (`getBarbeiro` e as duas funções de escrita) é
 * substituída.
 *
 * Pelo mesmo motivo, este arquivo NUNCA assere "o Firestore não foi escrito" —
 * com o repositório mockado isso seria vacuamente verdadeiro. Ele assere o que
 * a TELA fez: qual função chamou, com quais argumentos, qual Alert abriu, se
 * navegou de volta. A garantia de "não gravou de fato" mora na transação, e é
 * o `BarbeiroRepository.test.ts` que a prova.
 *
 * Padrão de mock: `jest.mock` por arquivo — o `jest.setup.js` deste repo NÃO
 * mocka `react-native` globalmente, de propósito (CLAUDE.md §6) — e nunca
 * `restoreAllMocks()`, que derrubaria o spy de `Alert.alert` do setup global.
 *
 * ESCOPO DELIBERADAMENTE ESTREITO: só a carga da marca, o salvamento e os dois
 * caminhos de erro. Validação de nome/preço no modal, chips de duração, edição
 * de um serviço existente e o FAB continuam sem cobertura própria.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import '@testing-library/jest-native/extend-expect';
import ConfigServicosScreen from '../../src/screens/ConfigServicosScreen';
import { ThemeProvider } from '../../src/context/ThemeContext';
import {
  getBarbeiro,
  upsertBarbeiroSeNaoMudou,
  ConflitoDeVersaoError,
} from '../../src/data/repositories/BarbeiroRepository';
import { atualizarProfissionalSeNaoMudou } from '../../src/data/repositories/NegocioRepository';
import { formatMoney } from '../../src/utils/dateUtils';
import type { ServicoBarbeiro } from '../../src/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../src/data/repositories/BarbeiroRepository', () => {
  const real = jest.requireActual('../../src/data/repositories/BarbeiroRepository');
  return {
    // REAIS: são a lógica sob teste vista de fora, não encanamento.
    marcaDeVersaoBarbeiro: real.marcaDeVersaoBarbeiro,
    ehConflitoDeVersao: real.ehConflitoDeVersao,
    ConflitoDeVersaoError: real.ConflitoDeVersaoError,
    // MOCKADOS: a fronteira de I/O.
    getBarbeiro: jest.fn(),
    upsertBarbeiroSeNaoMudou: jest.fn(),
  };
});

// O módulo do negócio expõe aqui SOMENTE `atualizarProfissionalSeNaoMudou`.
// Se a tela voltasse a chamar a versão sem checagem de versão
// (`atualizarProfissional`), o teste do caminho de equipe quebraria com
// "is not a function" em vez de passar silenciosamente.
jest.mock('../../src/data/repositories/NegocioRepository', () => ({
  atualizarProfissionalSeNaoMudou: jest.fn(),
}));

const mockedGetBarbeiro = getBarbeiro as jest.Mock;
const mockedUpsertSeNaoMudou = upsertBarbeiroSeNaoMudou as jest.Mock;
const mockedAtualizarProfissional = atualizarProfissionalSeNaoMudou as jest.Mock;
const mockedAlert = Alert.alert as unknown as jest.Mock;

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * Carimbos no formato que o Firestore devolve numa LEITURA (`Timestamp`), com
 * segundos E nanossegundos. As strings esperadas são escritas na mão, e não
 * derivadas de `marcaDeVersaoBarbeiro(...)`: se a regra de formação mudar, o
 * teste tem que acusar, não acompanhar.
 */
const CARIMBO_CARGA = { seconds: 1756000000, nanoseconds: 123000000 };
const MARCA_CARGA = '1756000000.123000000';

/** Versão do documento DEPOIS do salvamento — o que a releitura devolve. */
const CARIMBO_RENOVADO = { seconds: 1756000099, nanoseconds: 7 };
const MARCA_RENOVADA = '1756000099.7';

const SERVICOS_SALVOS: ServicoBarbeiro[] = [
  { id: 'srv-corte', nome: 'Corte Degradê', duracaoMinutos: 30, precoEmCentavos: 4500 },
  { id: 'srv-barba', nome: 'Barba Completa', duracaoMinutos: 20, precoEmCentavos: 2500 },
];

/** O que o OUTRO aparelho gravou — só aparece depois de "Recarregar". */
const SERVICOS_DO_OUTRO_APARELHO: ServicoBarbeiro[] = [
  { id: 'srv-corte', nome: 'Corte Degradê', duracaoMinutos: 30, precoEmCentavos: 5500 },
];

const documentoBarbeiro = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-uid',
  nome: 'Barbeiro Teste',
  servicos: SERVICOS_SALVOS,
  updatedAt: CARIMBO_CARGA,
  ...overrides,
});

const PROFISSIONAL = { id: 'prof-9', nome: 'Carlos' };

// ─── Helpers ────────────────────────────────────────────────────────────────

const renderTela = (params: Record<string, unknown> = {}) => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
  const utils = render(
    <ThemeProvider>
      <ConfigServicosScreen navigation={navigation} route={{ params } as any} />
    </ThemeProvider>,
  );
  return { ...utils, navigation };
};

type Tela = ReturnType<typeof renderTela>;

/** Espera a carga inicial terminar (o spinner sai e a lista aparece). */
const aguardarCarga = async (utils: Tela) => {
  await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());
  await waitFor(() => expect(utils.getByText('Corte Degradê')).toBeTruthy());
};

const salvar = async (utils: Tela) => {
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Salvar serviços'));
    // O caminho feliz encadeia gravação + releitura da marca; as micro-tarefas
    // abaixo dão o giro necessário para o Alert final já ter sido aberto.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

type BotaoDeAlerta = { text?: string; onPress?: () => void; style?: string };

/**
 * Devolve os botões do Alert MAIS RECENTE com aquele título (falha se não
 * abriu). Tem que ser o mais recente: os callbacks de `Alert` capturam o valor
 * do item da vez, e pegar o primeiro faria a segunda exclusão repetir a ação
 * da primeira — um teste que parece exercitar um laço e não exercita nada.
 */
const botoesDoAlerta = (titulo: string): BotaoDeAlerta[] => {
  const chamada = [...mockedAlert.mock.calls].reverse().find((args) => args[0] === titulo);
  if (!chamada) {
    const abertos = mockedAlert.mock.calls.map((args) => args[0]).join(', ') || '(nenhum)';
    throw new Error(`O Alert "${titulo}" não foi aberto. Alerts abertos: ${abertos}`);
  }
  return (chamada[2] ?? []) as BotaoDeAlerta[];
};

const pressionarBotaoDoAlerta = async (titulo: string, texto: string) => {
  const botao = botoesDoAlerta(titulo).find((b) => b.text === texto);
  if (!botao) throw new Error(`O Alert "${titulo}" não tem botão "${texto}"`);
  await act(async () => {
    botao.onPress?.();
    await Promise.resolve();
    await Promise.resolve();
  });
};

/** Adiciona um serviço novo pelo modal — a "edição não salva" do usuário. */
const adicionarServicoNoModal = async (utils: Tela, nome: string, preco: string) => {
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Adicionar serviço'));
  });
  fireEvent.changeText(utils.getByPlaceholderText('Ex.: Corte degradê'), nome);
  fireEvent.changeText(utils.getByPlaceholderText('Ex.: 45,00'), preco);
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Adicionar novo serviço'));
  });
};

beforeEach(() => {
  // `clearAllMocks` (nunca `restoreAllMocks`): restaurar derrubaria o spy de
  // Alert.alert montado no jest.setup.js e usado em quase toda asserção aqui.
  jest.clearAllMocks();
  mockedGetBarbeiro.mockResolvedValue(documentoBarbeiro());
  mockedUpsertSeNaoMudou.mockResolvedValue(undefined);
  mockedAtualizarProfissional.mockResolvedValue(undefined);
});

// ─── 1. Caminho feliz: a marca da carga viaja no salvamento ─────────────────

describe('ConfigServicosScreen — DOM-01: salvamento com a marca de versão', () => {
  it('barbeiro solo: grava por upsertBarbeiroSeNaoMudou com a marca capturada na carga', async () => {
    const utils = renderTela();
    await aguardarCarga(utils);
    await salvar(utils);

    expect(mockedUpsertSeNaoMudou).toHaveBeenCalledTimes(1);
    expect(mockedUpsertSeNaoMudou).toHaveBeenCalledWith(
      'test-uid',
      { servicos: SERVICOS_SALVOS },
      MARCA_CARGA,
    );
    // O caminho do profissional de equipe não foi acionado por engano.
    expect(mockedAtualizarProfissional).not.toHaveBeenCalled();
    expect(mockedAlert).toHaveBeenCalledWith(
      'Sucesso!',
      'Serviços salvos com sucesso.',
      expect.any(Array),
    );
  });

  it('a edição feita no modal chega ao salvamento junto com os serviços já existentes', async () => {
    const utils = renderTela();
    await aguardarCarga(utils);
    await adicionarServicoNoModal(utils, 'Hidratação', '80,00');
    await salvar(utils);

    const [, campos] = mockedUpsertSeNaoMudou.mock.calls[0];
    expect(campos.servicos).toHaveLength(3);
    expect(campos.servicos).toEqual([
      ...SERVICOS_SALVOS,
      expect.objectContaining({
        nome: 'Hidratação',
        duracaoMinutos: 30,
        precoEmCentavos: 8000,
      }),
    ]);
  });

  it('no sucesso, o OK do Alert volta para a tela anterior', async () => {
    const utils = renderTela();
    await aguardarCarga(utils);
    await salvar(utils);

    expect(utils.navigation.goBack).not.toHaveBeenCalled();
    await pressionarBotaoDoAlerta('Sucesso!', 'OK');
    expect(utils.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('profissional de equipe: grava por atualizarProfissionalSeNaoMudou, com o id do profissional', async () => {
    const utils = renderTela({
      profissionalId: PROFISSIONAL.id,
      profissionalNome: PROFISSIONAL.nome,
    });
    await aguardarCarga(utils);
    // A tela carregou o documento DO PROFISSIONAL, não o do dono logado.
    expect(mockedGetBarbeiro).toHaveBeenCalledWith(PROFISSIONAL.id);
    expect(utils.getByText('Editando os serviços de Carlos')).toBeTruthy();

    await salvar(utils);

    expect(mockedAtualizarProfissional).toHaveBeenCalledTimes(1);
    expect(mockedAtualizarProfissional).toHaveBeenCalledWith(
      PROFISSIONAL.id,
      { servicos: SERVICOS_SALVOS },
      MARCA_CARGA,
    );
    // E o caminho solo NÃO foi usado — senão a escrita iria para o documento
    // do dono logado (`test-uid`), sobrescrevendo os serviços da pessoa errada.
    expect(mockedUpsertSeNaoMudou).not.toHaveBeenCalled();
  });

  it('lista vazia: avisa e não chama nenhuma das duas funções de gravação', async () => {
    const utils = renderTela();
    await aguardarCarga(utils);

    // Esvazia a lista pelos botões de excluir da própria tela.
    for (const servico of SERVICOS_SALVOS) {
      await act(async () => {
        fireEvent.press(utils.getByLabelText(`Excluir ${servico.nome}`));
      });
      await pressionarBotaoDoAlerta('Excluir serviço', 'Excluir');
    }
    await waitFor(() => expect(utils.getByText('Nenhum serviço cadastrado.')).toBeTruthy());

    await salvar(utils);

    expect(mockedAlert).toHaveBeenCalledWith('Atenção', 'Adicione ao menos um serviço.');
    expect(mockedUpsertSeNaoMudou).not.toHaveBeenCalled();
    expect(mockedAtualizarProfissional).not.toHaveBeenCalled();
  });
});

// ─── 2. A marca é a da CARGA, não uma releitura na hora de salvar ───────────

describe('ConfigServicosScreen — DOM-01: a marca é a da carga, não uma releitura', () => {
  it('mesmo com o documento já mudado no servidor, envia a marca do momento da carga', async () => {
    // Este teste existe para travar um erro fácil de introduzir depois:
    // reler o documento dentro de `handleSaveAll` e mandar a marca fresquinha.
    // Isso faria a comparação do repositório ser sempre verdadeira e a
    // proteção de DOM-01 viraria decoração — o segundo aparelho voltaria a
    // apagar o trabalho do primeiro, agora com um teste verde por cima.
    mockedGetBarbeiro.mockReset();
    mockedGetBarbeiro
      .mockResolvedValueOnce(documentoBarbeiro())
      .mockResolvedValue(documentoBarbeiro({ updatedAt: CARIMBO_RENOVADO }));

    const utils = renderTela();
    await aguardarCarga(utils);
    await salvar(utils);

    const marcaEnviada = mockedUpsertSeNaoMudou.mock.calls[0][2];
    expect(marcaEnviada).toBe(MARCA_CARGA);
    expect(marcaEnviada).not.toBe(MARCA_RENOVADA);
  });

  it('documento sem updatedAt (ou inexistente) vira marca null, e null é o que viaja', async () => {
    // `null` não é "sem proteção": é a marca de "não existia / nunca foi
    // escrito". Se outro aparelho criar o documento nesse meio-tempo, a marca
    // do servidor deixa de ser null e a transação recusa igual.
    mockedGetBarbeiro.mockResolvedValue(null);

    const utils = renderTela();
    await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());
    // Sem documento, a tela parte do catálogo sugerido.
    await waitFor(() => expect(utils.getByText('Corte')).toBeTruthy());

    await salvar(utils);

    expect(mockedUpsertSeNaoMudou.mock.calls[0][2]).toBeNull();
  });

  it('depois de gravar, a marca é renovada — o segundo Salvar não acusa conflito consigo mesmo', async () => {
    mockedGetBarbeiro.mockReset();
    mockedGetBarbeiro
      .mockResolvedValueOnce(documentoBarbeiro())
      .mockResolvedValue(documentoBarbeiro({ updatedAt: CARIMBO_RENOVADO }));

    const utils = renderTela();
    await aguardarCarga(utils);
    await salvar(utils);
    await salvar(utils);

    expect(mockedUpsertSeNaoMudou).toHaveBeenCalledTimes(2);
    expect(mockedUpsertSeNaoMudou.mock.calls[0][2]).toBe(MARCA_CARGA);
    // A segunda gravação usa a marca que a releitura pós-sucesso trouxe. Sem
    // isso, o próprio salvamento anterior viraria "conflito" no clique
    // seguinte — o `updatedAt` mudou porque foi ELE que mudou.
    expect(mockedUpsertSeNaoMudou.mock.calls[1][2]).toBe(MARCA_RENOVADA);
  });

  it('falha ao renovar a marca não vira Alert de erro — a gravação deu certo', async () => {
    mockedGetBarbeiro.mockReset();
    mockedGetBarbeiro
      .mockResolvedValueOnce(documentoBarbeiro())
      .mockRejectedValue(new Error('sem conexão na releitura'));

    const utils = renderTela();
    await aguardarCarga(utils);
    await salvar(utils);

    expect(mockedUpsertSeNaoMudou).toHaveBeenCalledTimes(1);
    expect(mockedAlert).toHaveBeenCalledWith(
      'Sucesso!',
      'Serviços salvos com sucesso.',
      expect.any(Array),
    );
    expect(mockedAlert).not.toHaveBeenCalledWith('Erro', expect.any(String));
  });
});

// ─── 3. Conflito: o aviso específico, e nunca o genérico ────────────────────

describe('ConfigServicosScreen — DOM-01: conflito de versão', () => {
  const conflitoSolo = () =>
    mockedUpsertSeNaoMudou.mockRejectedValue(new ConflitoDeVersaoError('barbeiros/test-uid'));

  it('barbeiro solo: mostra o aviso de "Alterado em outro aparelho", não o Erro genérico', async () => {
    conflitoSolo();
    const utils = renderTela();
    await aguardarCarga(utils);
    await salvar(utils);

    // A tela TENTOU gravar com a marca da carga — foi o repositório que
    // recusou. É por aqui que se sabe que a proteção está no circuito.
    expect(mockedUpsertSeNaoMudou).toHaveBeenCalledWith(
      'test-uid',
      { servicos: SERVICOS_SALVOS },
      MARCA_CARGA,
    );
    expect(mockedAlert).toHaveBeenCalledWith(
      'Alterado em outro aparelho',
      expect.stringContaining('alterados em outro aparelho'),
      expect.any(Array),
    );
    // Os dois caminhos precisam continuar distinguíveis: nada de "Erro".
    expect(mockedAlert).not.toHaveBeenCalledWith('Erro', expect.any(String));
    expect(mockedAlert).not.toHaveBeenCalledWith(
      'Sucesso!',
      expect.any(String),
      expect.any(Array),
    );
    expect(utils.navigation.goBack).not.toHaveBeenCalled();
  });

  it('o aviso de conflito oferece continuar editando OU recarregar', async () => {
    conflitoSolo();
    const utils = renderTela();
    await aguardarCarga(utils);
    await salvar(utils);

    const botoes = botoesDoAlerta('Alterado em outro aparelho');
    expect(botoes.map((b) => b.text)).toEqual(['Continuar editando', 'Recarregar']);
    // "Continuar editando" é cancelamento puro: não pode ter ação nenhuma
    // pendurada, senão o usuário perderia a edição ao dispensar o aviso.
    expect(botoes[0].onPress).toBeUndefined();
    expect(typeof botoes[1].onPress).toBe('function');
  });

  it('profissional de equipe: o conflito também vira o aviso específico', async () => {
    mockedAtualizarProfissional.mockRejectedValue(
      new ConflitoDeVersaoError(`barbeiros/${PROFISSIONAL.id}`),
    );
    const utils = renderTela({
      profissionalId: PROFISSIONAL.id,
      profissionalNome: PROFISSIONAL.nome,
    });
    await aguardarCarga(utils);
    await salvar(utils);

    expect(mockedAtualizarProfissional).toHaveBeenCalledWith(
      PROFISSIONAL.id,
      { servicos: SERVICOS_SALVOS },
      MARCA_CARGA,
    );
    expect(mockedAlert).toHaveBeenCalledWith(
      'Alterado em outro aparelho',
      expect.stringContaining('alterados em outro aparelho'),
      expect.any(Array),
    );
    expect(mockedAlert).not.toHaveBeenCalledWith('Erro', expect.any(String));
    expect(utils.navigation.goBack).not.toHaveBeenCalled();
  });

  it('erro re-embrulhado que só carrega o `name` também é reconhecido como conflito', async () => {
    // `ehConflitoDeVersao` cai no `name` quando o `instanceof` não sobrevive
    // (transpilação, serialização entre camadas). Se a tela passasse a testar
    // `instanceof` direto, este caso voltaria a cair no Alert genérico — que é
    // exatamente o caminho que DOM-01 fecha.
    mockedUpsertSeNaoMudou.mockRejectedValue({
      name: 'ConflitoDeVersaoError',
      message: 'documento alterado',
    });
    const utils = renderTela();
    await aguardarCarga(utils);
    await salvar(utils);

    expect(mockedAlert).toHaveBeenCalledWith(
      'Alterado em outro aparelho',
      expect.any(String),
      expect.any(Array),
    );
    expect(mockedAlert).not.toHaveBeenCalledWith('Erro', expect.any(String));
  });

  it('o conflito NÃO descarta o que o usuário digitou', async () => {
    // O ponto todo do aviso: o usuário fecha, anota o que mudou e decide. Se a
    // tela limpasse o estado (ou recarregasse sozinha), ela apagaria o
    // trabalho do usuário para "resolver" um problema de apagar trabalho.
    conflitoSolo();
    const utils = renderTela();
    await aguardarCarga(utils);
    await adicionarServicoNoModal(utils, 'Hidratação', '80,00');
    await salvar(utils);

    expect(mockedAlert).toHaveBeenCalledWith(
      'Alterado em outro aparelho',
      expect.any(String),
      expect.any(Array),
    );
    // O serviço novo continua na tela, com o preço que ele digitou...
    expect(utils.getByText('Hidratação')).toBeTruthy();
    expect(utils.getByText(formatMoney(8000))).toBeTruthy();
    // ...e os que já existiam também.
    expect(utils.getByText('Corte Degradê')).toBeTruthy();
    expect(utils.getByText('Barba Completa')).toBeTruthy();

    // Dispensar o aviso por "Continuar editando" também não apaga nada.
    await pressionarBotaoDoAlerta('Alterado em outro aparelho', 'Continuar editando');
    expect(utils.getByText('Hidratação')).toBeTruthy();

    // E o botão continua utilizável: o `saving` foi liberado no `finally`,
    // senão a tela ficaria travada em spinner depois de um conflito.
    mockedUpsertSeNaoMudou.mockClear();
    await salvar(utils);
    expect(mockedUpsertSeNaoMudou).toHaveBeenCalledTimes(1);
  });

  it('o conflito não relê a marca — só o sucesso renova', async () => {
    conflitoSolo();
    const utils = renderTela();
    await aguardarCarga(utils);
    mockedGetBarbeiro.mockClear();
    await salvar(utils);

    // Renovar aqui seria pior que inútil: adotaria a marca da versão do OUTRO
    // aparelho e o próximo "Salvar" passaria por cima do que ele gravou —
    // DOM-01 de volta, agora por um atalho.
    expect(mockedGetBarbeiro).not.toHaveBeenCalled();
  });

  it('"Recarregar" relê o documento e traz a versão que está no servidor', async () => {
    conflitoSolo();
    const utils = renderTela();
    await aguardarCarga(utils);
    await adicionarServicoNoModal(utils, 'Hidratação', '80,00');
    await salvar(utils);

    // A partir daqui o servidor devolve o que o outro aparelho gravou.
    mockedGetBarbeiro.mockClear();
    mockedGetBarbeiro.mockResolvedValue(
      documentoBarbeiro({
        servicos: SERVICOS_DO_OUTRO_APARELHO,
        updatedAt: CARIMBO_RENOVADO,
      }),
    );
    await pressionarBotaoDoAlerta('Alterado em outro aparelho', 'Recarregar');

    expect(mockedGetBarbeiro).toHaveBeenCalledWith('test-uid');
    await waitFor(() => expect(utils.queryByText('Hidratação')).toBeNull());
    expect(utils.getByText(formatMoney(5500))).toBeTruthy();
    expect(utils.queryByText('Barba Completa')).toBeNull();

    // E o salvamento seguinte já usa a marca nova, então passa.
    mockedUpsertSeNaoMudou.mockReset();
    mockedUpsertSeNaoMudou.mockResolvedValue(undefined);
    await salvar(utils);
    expect(mockedUpsertSeNaoMudou).toHaveBeenCalledWith(
      'test-uid',
      { servicos: SERVICOS_DO_OUTRO_APARELHO },
      MARCA_RENOVADA,
    );
  });
});

// ─── 4. Erro genérico: o caminho antigo continua vivo e separado ────────────

describe('ConfigServicosScreen — erro genérico continua distinto do conflito', () => {
  it('erro de rede cai no Alert antigo, não no aviso de conflito', async () => {
    mockedUpsertSeNaoMudou.mockRejectedValue(new Error('network request failed'));
    const utils = renderTela();
    await aguardarCarga(utils);
    await salvar(utils);

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível salvar. Tente novamente.');
    expect(mockedAlert).not.toHaveBeenCalledWith(
      'Alterado em outro aparelho',
      expect.any(String),
      expect.any(Array),
    );
    expect(utils.navigation.goBack).not.toHaveBeenCalled();
  });

  it('erro de permissão no caminho de equipe também é o genérico', async () => {
    mockedAtualizarProfissional.mockRejectedValue({
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    });
    const utils = renderTela({
      profissionalId: PROFISSIONAL.id,
      profissionalNome: PROFISSIONAL.nome,
    });
    await aguardarCarga(utils);
    await salvar(utils);

    expect(mockedAlert).toHaveBeenCalledWith('Erro', 'Não foi possível salvar. Tente novamente.');
    expect(mockedAlert).not.toHaveBeenCalledWith(
      'Alterado em outro aparelho',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('erro genérico também preserva a edição local e libera o botão', async () => {
    mockedUpsertSeNaoMudou.mockRejectedValue(new Error('network request failed'));
    const utils = renderTela();
    await aguardarCarga(utils);
    await adicionarServicoNoModal(utils, 'Hidratação', '80,00');
    await salvar(utils);

    expect(utils.getByText('Hidratação')).toBeTruthy();
    mockedUpsertSeNaoMudou.mockClear();
    await salvar(utils);
    expect(mockedUpsertSeNaoMudou).toHaveBeenCalledTimes(1);
  });
});

describe('ConfigServicosScreen — falha ao CARREGAR não pode ser silenciosa', () => {
  it('avisa o usuário quando a carga falha, em vez de mostrar lista vazia', async () => {
    // Antes, o catch do `loadServicos` só fazia console.error. Duas
    // consequências ruins: a lista vinha vazia (indistinguível de "nenhum
    // serviço cadastrado"), e o "Recarregar" oferecido no aviso de conflito
    // podia falhar de novo sem dizer nada — o usuário achava estar vendo a
    // versão do servidor e ficava preso num laço de conflito sem explicação.
    mockedGetBarbeiro.mockRejectedValue(new Error('network request failed'));
    const utils = renderTela();

    await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockedAlert).toHaveBeenCalledWith(
        'Não foi possível carregar',
        expect.stringContaining('não foram carregados'),
      ),
    );
    expect(utils).toBeTruthy();
  });

  it('a falha de carga é FECHADA: sem marca de versão, nada é gravado', async () => {
    // A proteção real do DOM-01 não depende do aviso acima. Sem marca, a
    // transação recusa a escrita — o aviso serve para o usuário entender,
    // não para impedir a perda de dado.
    mockedGetBarbeiro.mockRejectedValue(new Error('network request failed'));
    const utils = renderTela();
    await waitFor(() => expect(mockedGetBarbeiro).toHaveBeenCalled());

    expect(mockedUpsertSeNaoMudou).not.toHaveBeenCalled();
    expect(mockedAtualizarProfissional).not.toHaveBeenCalled();
    expect(utils).toBeTruthy();
  });
});
