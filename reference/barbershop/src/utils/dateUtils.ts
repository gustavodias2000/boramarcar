/**
 * Utilitários de formatação de data e moeda compartilhados entre telas.
 */
import type { Timestamp, FieldValue } from 'firebase/firestore';

/** Valor de data aceito pelos formatadores: Timestamp do Firestore, Date ou string */
type DateLike = Timestamp | FieldValue | Date | string | number | null | undefined;

interface ComPreco {
  precoEmCentavos?: number;
  preco?: string;
}

// ─── Moeda ────────────────────────────────────────────────────────────────────

/** Valor exibido quando não há preço utilizável: R$ 25,00. */
const PRECO_PADRAO_EM_CENTAVOS = 2500;

/**
 * Converte preço legado (string "25,00") ou número (reais) para centavos inteiros.
 *
 * O campo legado `preco` foi digitado à mão por profissionais ao longo do
 * tempo, então chegam variações como "R$ 60,00", "60.00" e "60 reais". A
 * versão anterior fazia só `replace(',', '.')` e `parseFloat`, o que devolvia
 * NaN em qualquer string com prefixo — e o NaN ia até a tela, onde o cliente
 * lia "R$ NaN" no resumo do agendamento. Agora só os dígitos e o separador
 * decimal são considerados, e qualquer resultado inválido cai no padrão.
 */
export const precoParaCentavos = (preco?: string | number | null): number => {
  if (typeof preco === 'number') {
    return Number.isFinite(preco) ? Math.round(preco * 100) : PRECO_PADRAO_EM_CENTAVOS;
  }
  if (typeof preco === 'string') {
    // Mantém dígitos, vírgula e ponto; descarta "R$", espaços e texto solto.
    const somenteNumero = preco.replace(/[^\d.,]/g, '').replace(',', '.');
    const valor = parseFloat(somenteNumero);
    if (!Number.isFinite(valor)) return PRECO_PADRAO_EM_CENTAVOS;
    return Math.round(valor * 100);
  }
  return PRECO_PADRAO_EM_CENTAVOS;
};

/**
 * Formata centavos para exibição em BRL.
 * Ex.: formatMoney(2500) → "R$ 25,00"
 */
export const formatMoney = (centavos?: number | null): string => {
  const value = typeof centavos === 'number' ? centavos / 100 : 0;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

/**
 * Retorna o preço formatado de um documento barbeiro/agendamento.
 * Aceita tanto o campo novo (precoEmCentavos: int) quanto o legado (preco: string).
 */
export const formatPreco = (doc?: ComPreco | null): string => {
  if (doc?.precoEmCentavos != null) return formatMoney(doc.precoEmCentavos);
  if (doc?.preco) return `R$ ${doc.preco}`;
  return 'R$ 25,00';
};

// ─── Datas ────────────────────────────────────────────────────────────────────

export const toDateObj = (date: DateLike): Date | null => {
  if (!date) return null;
  try {
    const dateObj =
      typeof (date as Timestamp).toDate === 'function'
        ? (date as Timestamp).toDate()
        : new Date(date as string | number | Date);
    return isNaN(dateObj.getTime()) ? null : dateObj;
  } catch {
    return null;
  }
};

/**
 * Formata uma data com hora: dd/mm/aaaa às HH:mm
 */
export const formatDateTime = (date: DateLike): string => {
  const dateObj = toDateObj(date);
  if (!dateObj) return date ? 'Data inválida' : 'Data não disponível';
  const datePart = dateObj.toLocaleDateString('pt-BR');
  const timePart = dateObj.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} às ${timePart}`;
};

/**
 * Formata uma Date em YYYY-MM-DD usando a data LOCAL (não UTC).
 * Evita o bug de timezone onde toISOString() pode retornar o dia anterior
 * em fusos negativos (ex.: BRT = UTC-3).
 */
export const toLocalDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// ─── Telefone ─────────────────────────────────────────────────────────────────

/**
 * Formata número de telefone para padrão internacional brasileiro
 * @returns Telefone no formato 5511999999999
 */
export const formatPhoneToE164 = (phone?: string | null): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) return `55${digits}`;
  return digits;
};

/**
 * Máscara visual de telefone: (11) 99999-9999
 */
export const maskPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

/**
 * Remove o código do país "55" (Brasil) de um telefone em E.164, quando ele
 * de fato estiver presente — e só nesse caso.
 *
 * Números locais (DDD + número) têm no máximo 11 dígitos (DDD com 2 +
 * celular com 9). Um "55" no início de uma string de até 11 dígitos é
 * necessariamente o DDD (existe DDD 55, de Caxias do Sul/RS), nunca o
 * código do país — só uma string com 12+ dígitos pode ter os dois. Checar
 * só o prefixo "55" sem o comprimento (como esta função fazia antes)
 * cortaria o DDD real de um cliente de lá por engano.
 */
export const removerCodigoPaisBrasil = (telefone?: string | null): string => {
  const digits = (telefone || '').replace(/\D/g, '');
  return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
};

/**
 * Formata um telefone armazenado (idealmente em E.164, via
 * `formatPhoneToE164`) para exibição amigável, ex.: "+55 (64) 99285-490".
 * Usa `removerCodigoPaisBrasil` para nunca confundir o código do país com
 * um DDD igual a "55".
 */
export const formatPhoneDisplay = (telefone?: string | null): string => {
  if (!telefone) return '';
  const digits = telefone.replace(/\D/g, '');
  const local = removerCodigoPaisBrasil(telefone);
  const tinhaCodigoPais = local.length < digits.length;
  const mascarado = maskPhone(local);
  return tinhaCodigoPais ? `+55 ${mascarado}` : mascarado;
};

// ─── Data completa (dia/mês/ano) ───────────────────────────────────────────────
// Usado no formulário de despesas, onde o barbeiro pode lançar um gasto de
// uma data passada — diferente do aniversário (sem ano) abaixo.

/**
 * Máscara visual de entrada: DD/MM/AAAA (ex.: "23/07/2026").
 */
export const maskDataCompleta = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/**
 * Converte a entrada mascarada "DD/MM/AAAA" para o formato de
 * armazenamento "AAAA-MM-DD" (mesmo formato de `Agendamento.data`).
 * Retorna undefined se a data for inválida ou incompleta.
 */
export const dataCompletaParaISO = (value: string): string | undefined => {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return undefined;
  const dia = parseInt(digits.slice(0, 2), 10);
  const mes = parseInt(digits.slice(2, 4), 10);
  const ano = parseInt(digits.slice(4, 8), 10);
  if (mes < 1 || mes > 12) return undefined;
  const diasNoMes = new Date(ano, mes, 0).getDate();
  if (dia < 1 || dia > diasNoMes) return undefined;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};

/**
 * Converte "AAAA-MM-DD" (armazenamento) para "DD/MM/AAAA" (exibição).
 */
export const isoParaDataCompleta = (iso: string): string => {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

// ─── Aniversário (dia/mês, sem ano) ────────────────────────────────────────────
// Armazenado como "MM-DD" (mês 1-indexado) — mesmo formato usado pelo
// `Birthday` de `react-native-contacts`. Exibido ao usuário como "DD/MM".

/**
 * Máscara visual de entrada: DD/MM (ex.: "23/07").
 */
export const maskDiaMes = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

/**
 * Converte a entrada mascarada "DD/MM" para o formato de armazenamento
 * "MM-DD". Retorna undefined se a data for inválida ou incompleta.
 */
export const diaMesParaAniversario = (value: string): string | undefined => {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 4) return undefined;
  const dia = parseInt(digits.slice(0, 2), 10);
  const mes = parseInt(digits.slice(2, 4), 10);
  if (mes < 1 || mes > 12) return undefined;
  const diasNoMes = new Date(2024, mes, 0).getDate(); // 2024 = ano bissexto (cobre 29/02)
  if (dia < 1 || dia > diasNoMes) return undefined;
  return `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};

/**
 * Converte "MM-DD" (armazenamento) para "DD/MM" (exibição).
 */
export const aniversarioParaExibicao = (aniversario: string): string => {
  const [mes, dia] = aniversario.split('-');
  return `${dia}/${mes}`;
};

/**
 * Monta o valor "MM-DD" a partir do `Birthday` de `react-native-contacts`
 * (`{ day, month }`, mês 1-indexado). Retorna undefined se ausente/inválido.
 */
export const birthdayParaAniversario = (
  birthday?: { day?: number; month?: number } | null,
): string | undefined => {
  if (!birthday?.day || !birthday?.month) return undefined;
  if (birthday.month < 1 || birthday.month > 12) return undefined;
  return `${String(birthday.month).padStart(2, '0')}-${String(birthday.day).padStart(2, '0')}`;
};

/**
 * Quantos dias faltam para o próximo aniversário (0 = hoje), a partir de
 * "MM-DD". Usado para ordenar a lista de aniversariantes.
 */
export const diasAteProximoAniversario = (aniversario: string, hoje: Date = new Date()): number => {
  const [mes, dia] = aniversario.split('-').map((n) => parseInt(n, 10));
  const anoAtual = hoje.getFullYear();
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  let proxima = new Date(anoAtual, mes - 1, dia);
  if (proxima < hojeSemHora) {
    proxima = new Date(anoAtual + 1, mes - 1, dia);
  }
  const msPorDia = 1000 * 60 * 60 * 24;
  return Math.round((proxima.getTime() - hojeSemHora.getTime()) / msPorDia);
};
