/**
 * `calcularResumoFinanceiro` alimenta 3 lugares ao mesmo tempo: o card
 * "Relatórios" do Início, os cards Vendas/Compromissos/Despesas da aba
 * Relatórios, e a tabela mês a mês de VendasRelatorioScreen. Um erro de
 * classificação de status aqui (ex.: "avaliado" não contar como Real)
 * aparece silenciosamente em 3 telas ao mesmo tempo — daí o teste
 * detalhado por status.
 */
import { calcularResumoFinanceiro, calcularResumoPorMes } from '../../src/utils/relatorioUtils';
import type { Agendamento, Despesa } from '../../src/types';

const ag = (overrides: Partial<Agendamento>): Agendamento => ({
  id: overrides.id || Math.random().toString(36),
  barbeiroId: 'uid1',
  barbeiroNome: 'Barbeiro',
  cliente: 'cliente@x.com',
  clienteUid: 'cliente-uid',
  clienteNome: 'Cliente',
  status: 'pendente',
  data: '2026-07-10',
  horario: '10:00',
  precoEmCentavos: 5000,
  ...overrides,
});

const despesa = (overrides: Partial<Despesa>): Despesa => ({
  id: overrides.id || Math.random().toString(36),
  barbeiroId: 'uid1',
  descricao: 'Despesa',
  valorEmCentavos: 1000,
  data: '2026-07-10',
  ...overrides,
});

describe('calcularResumoFinanceiro', () => {
  it('classifica concluído e avaliado como Real (dinheiro já em caixa)', () => {
    const resumo = calcularResumoFinanceiro(
      [ag({ status: 'concluido', precoEmCentavos: 3000 }), ag({ status: 'avaliado', precoEmCentavos: 4000 })],
      [],
    );
    expect(resumo.real).toEqual({ count: 2, somaCentavos: 7000 });
  });

  it('classifica pendente e confirmado como Projetado', () => {
    const resumo = calcularResumoFinanceiro(
      [ag({ status: 'pendente', precoEmCentavos: 2000 }), ag({ status: 'confirmado', precoEmCentavos: 3000 })],
      [],
    );
    expect(resumo.projetado).toEqual({ count: 2, somaCentavos: 5000 });
  });

  it('conta cancelados à parte, sem somar em Real nem Projetado', () => {
    const resumo = calcularResumoFinanceiro([ag({ status: 'cancelado', precoEmCentavos: 9000 })], []);
    expect(resumo.cancelados).toEqual({ count: 1 });
    expect(resumo.real.somaCentavos).toBe(0);
    expect(resumo.projetado.somaCentavos).toBe(0);
  });

  it('soma as despesas do período', () => {
    const resumo = calcularResumoFinanceiro([], [despesa({ valorEmCentavos: 8000 }), despesa({ valorEmCentavos: 2000 })]);
    expect(resumo.despesas).toEqual({ count: 2, somaCentavos: 10000 });
  });

  it('depósitos sempre zerados (recurso ainda não existe no app)', () => {
    const resumo = calcularResumoFinanceiro([ag({ status: 'concluido' })], [despesa({})]);
    expect(resumo.depositos).toEqual({ count: 0, somaCentavos: 0 });
  });

  it('total = projetado + real - despesas', () => {
    const resumo = calcularResumoFinanceiro(
      [
        ag({ status: 'concluido', precoEmCentavos: 60000 }), // real
        ag({ status: 'pendente', precoEmCentavos: 20000 }), // projetado
      ],
      [despesa({ valorEmCentavos: 8000 })],
    );
    expect(resumo.totalCentavos).toBe(20000 + 60000 - 8000);
  });

  it('trata agendamentos sem precoEmCentavos como R$ 0,00 em vez de quebrar', () => {
    const resumo = calcularResumoFinanceiro([ag({ status: 'concluido', precoEmCentavos: undefined })], []);
    expect(resumo.real).toEqual({ count: 1, somaCentavos: 0 });
  });

  it('listas vazias resultam em resumo zerado', () => {
    const resumo = calcularResumoFinanceiro([], []);
    expect(resumo.totalCentavos).toBe(0);
    expect(resumo.real.count).toBe(0);
    expect(resumo.projetado.count).toBe(0);
    expect(resumo.despesas.count).toBe(0);
  });
});

describe('calcularResumoPorMes', () => {
  it('agrupa agendamentos e despesas de um ano em 12 baldes por mês (índice 0 = Janeiro)', () => {
    const resumos = calcularResumoPorMes(
      [
        ag({ data: '2026-01-15', status: 'concluido', precoEmCentavos: 1000 }),
        ag({ data: '2026-07-20', status: 'concluido', precoEmCentavos: 2000 }),
      ],
      [despesa({ data: '2026-07-05', valorEmCentavos: 500 })],
    );

    expect(resumos).toHaveLength(12);
    expect(resumos[0].real.somaCentavos).toBe(1000); // Janeiro
    expect(resumos[6].real.somaCentavos).toBe(2000); // Julho
    expect(resumos[6].despesas.somaCentavos).toBe(500);
    expect(resumos[1].real.count).toBe(0); // Fevereiro, sem dados
  });
});
