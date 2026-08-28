import {
  formatMoney,
  precoParaCentavos,
  formatPreco,
  toLocalDateString,
  maskPhone,
  formatPhoneToE164,
  removerCodigoPaisBrasil,
  formatPhoneDisplay,
  maskDiaMes,
  diaMesParaAniversario,
  aniversarioParaExibicao,
  birthdayParaAniversario,
  diasAteProximoAniversario,
  maskDataCompleta,
  dataCompletaParaISO,
  isoParaDataCompleta,
} from '../../src/utils/dateUtils';

describe('dinheiro', () => {
  it('formata centavos em BRL', () => {
    expect(formatMoney(2500)).toContain('25,00');
  });

  it('converte preço legado (string) para centavos', () => {
    expect(precoParaCentavos('25,00')).toBe(2500);
    expect(precoParaCentavos('45,90')).toBe(4590);
  });

  it('aceita o "R$" que o profissional digitou junto do valor', () => {
    // Regressão real: o campo legado era texto livre e alguns cadastros
    // guardaram "R$ 60,00". O parse antigo devolvia NaN e a tela mostrava
    // "R$ NaN" no resumo, segundos antes do cliente confirmar o horário.
    expect(precoParaCentavos('R$ 60,00')).toBe(6000);
    expect(precoParaCentavos('60 reais')).toBe(6000);
    expect(precoParaCentavos('60.00')).toBe(6000);
  });

  it('cai no padrão de R$ 25,00 quando o texto não tem número nenhum', () => {
    expect(precoParaCentavos('combinar')).toBe(2500);
    expect(precoParaCentavos('')).toBe(2500);
    expect(precoParaCentavos(undefined)).toBe(2500);
    expect(precoParaCentavos(null)).toBe(2500);
  });

  it('aceita número em reais e arredonda para centavos inteiros', () => {
    expect(precoParaCentavos(45)).toBe(4500);
    expect(precoParaCentavos(19.99)).toBe(1999);
    expect(precoParaCentavos(NaN)).toBe(2500);
  });

  it('prioriza precoEmCentavos sobre o campo legado preco', () => {
    expect(formatPreco({ precoEmCentavos: 4500, preco: '99,00' })).toContain('45,00');
  });
});

describe('toLocalDateString', () => {
  it('formata como YYYY-MM-DD usando a data local (não UTC)', () => {
    const d = new Date(2026, 6, 23); // 23/07/2026 (mês 0-indexado)
    expect(toLocalDateString(d)).toBe('2026-07-23');
  });
});

describe('telefone', () => {
  it('aplica a máscara (11) 99999-9999 progressivamente', () => {
    expect(maskPhone('11999999999')).toBe('(11) 99999-9999');
    expect(maskPhone('119999')).toBe('(11) 9999');
  });

  it('formata para E.164 brasileiro (55 + DDD + número)', () => {
    expect(formatPhoneToE164('(11) 99999-9999')).toBe('5511999999999');
    expect(formatPhoneToE164('5511999999999')).toBe('5511999999999');
  });
});

describe('removerCodigoPaisBrasil — regressão do bug de DDD 55 confundido com código do país', () => {
  it('remove o código do país "55" de um E.164 completo (DDD comum)', () => {
    expect(removerCodigoPaisBrasil('5564999285490')).toBe('64999285490');
  });

  it('NÃO corta o DDD 55 (Caxias do Sul/RS) quando o número já vem sem código do país', () => {
    // 11 dígitos = DDD (2) + celular (9), sem código de país — mesmo
    // começando com "55", esses dois primeiros dígitos são o DDD, não o
    // Brasil. Cortar aqui apagaria o DDD real do cliente.
    expect(removerCodigoPaisBrasil('55991234567')).toBe('55991234567');
  });

  it('remove o código do país mesmo quando o DDD também é 55 (13 dígitos = país + DDD 55 + celular)', () => {
    expect(removerCodigoPaisBrasil('5555991234567')).toBe('55991234567');
  });

  it('retorna string vazia para telefone ausente', () => {
    expect(removerCodigoPaisBrasil(undefined)).toBe('');
    expect(removerCodigoPaisBrasil(null)).toBe('');
  });
});

describe('formatPhoneDisplay', () => {
  it('formata um E.164 com DDD comum como "+55 (DD) XXXXX-XXXX"', () => {
    expect(formatPhoneDisplay('5564999285490')).toBe('+55 (64) 99928-5490');
  });

  it('formata corretamente mesmo quando o DDD é 55', () => {
    expect(formatPhoneDisplay('5555991234567')).toBe('+55 (55) 99123-4567');
  });

  it('não inventa um "+55" quando o número já veio sem código do país', () => {
    expect(formatPhoneDisplay('55991234567')).toBe('(55) 99123-4567');
  });

  it('retorna string vazia para telefone ausente', () => {
    expect(formatPhoneDisplay(undefined)).toBe('');
    expect(formatPhoneDisplay(null)).toBe('');
  });
});

describe('aniversário (dia/mês) — usado em Aniversariantes e importação de contatos', () => {
  it('máscara DD/MM a partir de dígitos', () => {
    expect(maskDiaMes('2307')).toBe('23/07');
    expect(maskDiaMes('23')).toBe('23');
  });

  it('converte DD/MM digitado para o formato de armazenamento MM-DD', () => {
    expect(diaMesParaAniversario('23/07')).toBe('07-23');
  });

  it('rejeita mês inválido', () => {
    expect(diaMesParaAniversario('01/13')).toBeUndefined();
  });

  it('rejeita dia inválido para o mês (30/02 não existe mesmo em ano bissexto)', () => {
    expect(diaMesParaAniversario('30/02')).toBeUndefined();
  });

  it('aceita 29/02 (ano bissexto de referência)', () => {
    expect(diaMesParaAniversario('29/02')).toBe('02-29');
  });

  it('rejeita entrada incompleta', () => {
    expect(diaMesParaAniversario('2/7')).toBeUndefined();
  });

  it('converte de volta para exibição DD/MM', () => {
    expect(aniversarioParaExibicao('07-23')).toBe('23/07');
  });

  it('converte o Birthday do react-native-contacts', () => {
    expect(birthdayParaAniversario({ day: 23, month: 7 })).toBe('07-23');
    expect(birthdayParaAniversario({ day: undefined, month: 7 })).toBeUndefined();
    expect(birthdayParaAniversario(null)).toBeUndefined();
  });

  it('calcula dias até o próximo aniversário — hoje mesmo', () => {
    const hoje = new Date(2026, 6, 23);
    expect(diasAteProximoAniversario('07-23', hoje)).toBe(0);
  });

  it('calcula dias até o próximo aniversário — já passou este ano, pula pro ano seguinte', () => {
    const hoje = new Date(2026, 6, 23); // 23/07/2026
    // Aniversário em 01/01: já passou em 2026, deve calcular pra 01/01/2027
    const dias = diasAteProximoAniversario('01-01', hoje);
    expect(dias).toBeGreaterThan(150);
    expect(dias).toBeLessThan(200);
  });

  it('calcula dias até o próximo aniversário — ainda não chegou este ano', () => {
    const hoje = new Date(2026, 0, 1); // 01/01/2026
    const dias = diasAteProximoAniversario('01-15', hoje);
    expect(dias).toBe(14);
  });
});

describe('data completa (DD/MM/AAAA) — usada no formulário de despesas', () => {
  it('máscara vai inserindo as barras conforme os dígitos digitados', () => {
    expect(maskDataCompleta('24')).toBe('24');
    expect(maskDataCompleta('2407')).toBe('24/07');
    expect(maskDataCompleta('24072026')).toBe('24/07/2026');
  });

  it('ignora dígitos além do 8º (DD MM AAAA)', () => {
    expect(maskDataCompleta('240720269999')).toBe('24/07/2026');
  });

  it('converte "DD/MM/AAAA" para "AAAA-MM-DD" quando a data é válida', () => {
    expect(dataCompletaParaISO('24/07/2026')).toBe('2026-07-24');
  });

  it('rejeita mês inválido', () => {
    expect(dataCompletaParaISO('24/13/2026')).toBeUndefined();
  });

  it('rejeita dia inválido para o mês (ex.: 31 de abril)', () => {
    expect(dataCompletaParaISO('31/04/2026')).toBeUndefined();
  });

  it('aceita 29 de fevereiro em ano bissexto e rejeita em ano não-bissexto', () => {
    expect(dataCompletaParaISO('29/02/2024')).toBe('2024-02-29'); // 2024 é bissexto
    expect(dataCompletaParaISO('29/02/2026')).toBeUndefined(); // 2026 não é
  });

  it('rejeita entrada incompleta', () => {
    expect(dataCompletaParaISO('24/07')).toBeUndefined();
    expect(dataCompletaParaISO('')).toBeUndefined();
  });

  it('isoParaDataCompleta converte "AAAA-MM-DD" de volta para "DD/MM/AAAA"', () => {
    expect(isoParaDataCompleta('2026-07-24')).toBe('24/07/2026');
  });
});
