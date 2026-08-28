/**
 * sanitizacao — sanitização RECURSIVA de dados antes de saírem do app rumo
 * à telemetria (ver ObservabilityService.ts). Substitui a varredura
 * anterior, que só cobria STRINGS de nível superior: um objeto de contexto
 * aninhado (ex.: `{ detalhe: { email: '...' } }`) ou um array
 * (`{ itens: [{ telefone: '...' }] }`) passava batido.
 *
 * Reimplementada em JS puro (sem importar este arquivo) do lado das Cloud
 * Functions, em `functions/index.js` — uma Function em Node/CommonJS não
 * importa TypeScript do app diretamente. Mantenha os dois algoritmos em
 * paridade ao alterar um dos lados.
 */

export const MARCADOR_REDIGIDO = '[redigido]';

const TAMANHO_MAXIMO_TEXTO = 240;
const PROFUNDIDADE_MAXIMA = 4;
const MAXIMO_CAMPOS_POR_OBJETO = 20;

/** Chaves cujo VALOR nunca deve sair do app, seja qual for o conteúdo. */
const CHAVES_SENSIVEIS = /email|mail|telefone|phone|token|senha|password|mensagem|message|endereco|address/i;

/**
 * Chaves técnicas que nunca podem ser descartadas por casarem (por engano
 * ou coincidência de nome) com `CHAVES_SENSIVEIS` — são metadados úteis
 * para depuração, não dados pessoais.
 */
const CHAVES_PROTEGIDAS = new Set(['area', 'operacao', 'codigo']);

/**
 * ————— Exceção de preservação de valor técnico —————
 *
 * PROBLEMA. O padrão de alta entropia (`/\b[A-Za-z0-9_-]{20,}\b/g`, abaixo)
 * não sabe distinguir um token opaco de um id automático do Firestore: os
 * dois são exatamente a mesma coisa — uma sequência alfanumérica sem
 * separador. Resultado: id do Firestore (20 chars) e UID do Auth (28 chars)
 * viravam `[redigido]`, e a telemetria passou a dizer "uma liberação de slot
 * falhou" sem dizer QUAL. O mesmo padrão também apagava o valor de
 * `operacao` quando o nome da operação passava de 20 caracteres
 * (`liberar-slots-do-agendamento` tem 28) — ou seja, o evento perdia até a
 * identificação da operação que falhou.
 *
 * POR QUE NÃO HEURÍSTICA DE SUFIXO. A saída óbvia seria "libere o padrão em
 * chaves terminadas em `Id`". Isso é uma regra ABERTA: `sessionId`,
 * `tokenId`, `apiKeyId`, `deviceId`, `installationId`, `clientId` também
 * terminam em `Id`, e qualquer campo futuro ganha a isenção sozinho, sem
 * ninguém revisar. Vira default-allow para um namespace inteiro. As listas
 * abaixo são FECHADAS: incluir uma chave nova exige editar esta constante,
 * e isso aparece no diff de revisão. Default-deny continua sendo o padrão.
 *
 * POR QUE A ISENÇÃO NÃO VIRA BURACO. A chave conhecida é condição
 * NECESSÁRIA, não suficiente. O valor ainda precisa casar, POR INTEIRO
 * (regex ancorada em `^...$`), com o formato exato esperado para aquela
 * classe de chave. Não é "pule a varredura nesta chave" — é "preserve
 * apenas se o valor for exatamente um id/rótulo técnico". Um token colocado
 * (por bug ou por cliente comprometido) dentro de `agendamentoId` NÃO casa
 * o formato e continua sendo redigido normalmente.
 *
 * ESCOPO DA ISENÇÃO. Vale só para o VALOR de uma chave conhecida. Texto
 * livre — `mensagem` de erro, que é onde token de verdade aparece (URL com
 * query string, header ecoado) — nunca recebe isenção: `textoSeguro` segue
 * idêntico ao que era antes desta mudança.
 */

/**
 * Formato EXATO de identificador técnico do Firebase:
 *  - id automático do Firestore: 20 caracteres de [A-Za-z0-9];
 *  - UID do Firebase Auth: 28 caracteres de [A-Za-z0-9].
 *
 * O lookahead exige AO MENOS UMA LETRA. Sem ele, um valor de 20 dígitos
 * (`12345678901234567890`) casaria e escaparia do padrão de CPF/número
 * longo (`/\b\d{11,}\b/`) — a isenção não pode abrir porta para nenhum dos
 * padrões já existentes.
 *
 * Repare no que este formato REJEITA, e é exatamente o ponto: chave de API
 * do Google (`AIza...`, 39 chars com `-`), JWT (tem `.`), token do GitHub
 * (`ghp_`, tem `_`), token da OpenAI (`sk-proj-`, tem `-`), hash hex de 40.
 * Nenhum tem 20 ou 28 caracteres estritamente alfanuméricos.
 */
const FORMATO_ID_TECNICO = /^(?=[A-Za-z0-9]*[A-Za-z])(?:[A-Za-z0-9]{20}|[A-Za-z0-9]{28})$/;

/**
 * Chaves cujo valor é um id técnico opaco e pode ser preservado quando casa
 * `FORMATO_ID_TECNICO`. Lista fechada — veja o bloco acima antes de crescer.
 *
 * FORA daqui, de propósito: `clienteUid`, `clienteId`, `usuarioId`, `uid`.
 * O UID de um CLIENTE é dado pessoal pseudonimizado de um TERCEIRO e, para
 * o propósito desta telemetria (correlacionar falha ↔ slot órfão), não tem
 * nenhum valor diagnóstico: quem correlaciona precisa saber QUAL slot, não
 * QUEM era o cliente. Minimização (LGPD art. 6º, III) manda deixar de fora.
 * Também mantém `eventosOperacionais` fora do alcance da rotina de exclusão
 * de conta — se o UID do cliente entrasse aqui, a exclusão passaria a estar
 * incompleta enquanto não varresse esta coleção também.
 *
 * `barbeiroId`/`negocioId` são o próprio operador do app (que já se
 * identifica ao logar, e é o controlador dos dados, não um terceiro);
 * `agendamentoId`/`slotId` são ponteiros para documentos do próprio
 * negócio. Todos são o mínimo necessário para a finalidade declarada.
 */
const CHAVES_ID_TECNICO = new Set(['agendamentoId', 'barbeiroId', 'negocioId', 'slotId']);

/**
 * Formato de RÓTULO técnico (`area`/`operacao`/`codigo`): kebab-case
 * minúsculo, opcionalmente com `/` (padrão dos códigos do Firebase, ex.:
 * `functions/permission-denied`). Cada segmento COMEÇA COM LETRA e tem no
 * máximo 14 caracteres.
 *
 * Os dois limites são o que separa um rótulo de um segredo: palavra real é
 * curta, segredo é uma corrida longa e ininterrupta de caracteres. Um hash
 * hex de 40 (`a3f5...`) é minúsculo e casaria um "kebab genérico" — mas tem
 * um segmento de 40 e é rejeitado. Exigir que o segmento comece com letra
 * impede que um CPF de 11 dígitos entre como segmento (`erro/12345678901`).
 *
 * Só minúsculas de propósito: é a convenção real de todos os rótulos do
 * repositório. Um `operacao` camelCase com menos de 20 caracteres já
 * sobrevive pelo caminho normal, sem precisar de isenção nenhuma. Se algum
 * dia existir um camelCase com 20+, renomeie para kebab-case em vez de
 * alargar esta regra.
 */
const FORMATO_ROTULO_TECNICO = /^[a-z][a-z0-9]{0,13}(?:[-/][a-z][a-z0-9]{0,13})*$/;

const TAMANHO_MAXIMO_VALOR_TECNICO = 48;

/**
 * Devolve o valor VERBATIM quando ele é comprovadamente um identificador ou
 * rótulo técnico sob uma chave conhecida; `undefined` quando não é — e aí o
 * chamador segue com a sanitização normal, sem nenhuma folga.
 *
 * Como os dois formatos são ancorados e restritos, o valor preservado não
 * tem como conter email (`@`), telefone/CPF (dígito no início de segmento),
 * `Bearer ` (espaço) nem `senha: x` (`:`/espaço). Ou seja: a isenção não
 * consegue burlar nenhum dos outros padrões — não só na intenção, mas por
 * construção do alfabeto permitido.
 */
function valorTecnicoPreservado(chave: string, valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  if (valor.length > TAMANHO_MAXIMO_VALOR_TECNICO) return undefined;
  if (CHAVES_ID_TECNICO.has(chave) && FORMATO_ID_TECNICO.test(valor)) return valor;
  if (CHAVES_PROTEGIDAS.has(chave) && FORMATO_ROTULO_TECNICO.test(valor)) return valor;
  return undefined;
}

// A checagem de CHAVES_SENSIVEIS acima só protege quando o dado sensível
// está isolado num campo próprio. Uma mensagem de erro de texto livre (ex.:
// `new Error('falha ao notificar ' + cliente.email)`) passaria batido por
// ela — por isso o CONTEÚDO em si também é varrido, em qualquer string,
// esteja ela num campo de nome inofensivo ou dentro de um array/objeto
// aninhado.
const PADROES_SENSIVEIS: RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, // email
  /(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g, // telefone BR
  /\b\d{11,}\b/g, // CPF/token/telefone sem formatação
  /Bearer\s+[A-Za-z0-9._-]+/g, // token de autorização
  /\b(?:senha|password|refresh[_-]?token|access[_-]?token)\s*[:=]\s*\S+/gi, // segredo em "chave: valor"
  /\b[A-Za-z0-9_-]{20,}\b/g, // API key / token opaco de alta entropia (>20 chars sem espaço)
];

function redigirConteudo(texto: string): string {
  return PADROES_SENSIVEIS.reduce((acc, padrao) => acc.replace(padrao, MARCADOR_REDIGIDO), texto);
}

/** Redige por conteúdo e trunca no tamanho máximo — mesmo comportamento de sempre. */
function textoSeguro(valor: unknown): string {
  const bruto = String(valor ?? 'erro desconhecido').replace(/[\r\n]+/g, ' ');
  return redigirConteudo(bruto).slice(0, TAMANHO_MAXIMO_TEXTO);
}

/**
 * Sanitiza qualquer valor recursivamente:
 *  - strings são redigidas por conteúdo e truncadas;
 *  - `Error` vira sua `.message` sanitizada (stack e demais propriedades da
 *    instância são ignoradas — se uma stack precisa ser reportada, o
 *    chamador deve passá-la explicitamente como string num campo de
 *    contexto, onde ela é sanitizada como qualquer outra string);
 *  - `number`/`boolean` passam direto;
 *  - `null`/`undefined` são descartados (não aparecem no resultado);
 *  - arrays são percorridos elemento a elemento;
 *  - objetos são percorridos campo a campo — campos cujo NOME bate com
 *    `CHAVES_SENSIVEIS` são descartados inteiramente (exceto os protegidos
 *    em `CHAVES_PROTEGIDAS`), e o valor dos demais é sanitizado
 *    recursivamente, salvo o valor que `valorTecnicoPreservado` reconhece
 *    como id/rótulo técnico sob chave conhecida (ver o bloco de comentário
 *    daquela função);
 *  - profundidade acima de `PROFUNDIDADE_MAXIMA` é truncada com um marcador
 *    em vez de continuar recursando;
 *  - objetos com mais de `MAXIMO_CAMPOS_POR_OBJETO` campos descartam o
 *    excedente e registram um marcador (`_omitido`) informando quantos
 *    campos foram descartados;
 *  - referências circulares são detectadas via `WeakSet` do caminho atual
 *    de recursão e substituídas por um marcador, sem travar.
 */
export function sanitizarProfundo(
  valor: unknown,
  profundidade = 0,
  caminhoAtual: WeakSet<object> = new WeakSet(),
): unknown {
  if (valor === null || valor === undefined) return undefined;

  if (valor instanceof Error) {
    return textoSeguro(valor.message);
  }

  if (typeof valor === 'string') return textoSeguro(valor);
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
  if (typeof valor !== 'object') return undefined; // função, symbol etc. — descarta

  if (profundidade >= PROFUNDIDADE_MAXIMA) return '[profundidade máxima excedida]';

  if (caminhoAtual.has(valor as object)) return '[referência circular]';
  caminhoAtual.add(valor as object);

  try {
    if (Array.isArray(valor)) {
      return valor.map((item) => sanitizarProfundo(item, profundidade + 1, caminhoAtual));
    }

    const entradas = Object.entries(valor as Record<string, unknown>);
    const resultado: Record<string, unknown> = {};

    entradas.slice(0, MAXIMO_CAMPOS_POR_OBJETO).forEach(([chave, item]) => {
      if (!CHAVES_PROTEGIDAS.has(chave) && CHAVES_SENSIVEIS.test(chave)) return;
      // A isenção vem DEPOIS do descarte por nome de chave: uma chave como
      // `tokenId` casa CHAVES_SENSIVEIS e some antes de chegar aqui.
      const preservado = valorTecnicoPreservado(chave, item);
      const sanitizado = preservado !== undefined
        ? preservado
        : sanitizarProfundo(item, profundidade + 1, caminhoAtual);
      if (sanitizado !== undefined) resultado[chave] = sanitizado;
    });

    if (entradas.length > MAXIMO_CAMPOS_POR_OBJETO) {
      resultado._omitido = `${entradas.length - MAXIMO_CAMPOS_POR_OBJETO} campo(s) descartado(s) (limite de ${MAXIMO_CAMPOS_POR_OBJETO})`;
    }

    return resultado;
  } finally {
    caminhoAtual.delete(valor as object);
  }
}

/** Atalho para o caso mais comum: sanitizar uma mensagem de erro/texto solta. */
export function textoSanitizado(valor: unknown): string {
  return textoSeguro(valor instanceof Error ? valor.message : valor);
}
