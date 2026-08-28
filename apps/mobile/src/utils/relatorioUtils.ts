/**
 * relatorioUtils — cálculos financeiros puros compartilhados pelo card
 * "Relatórios" do Início e pela aba Relatórios (cards Vendas/Compromissos
 * e o detalhamento de Vendas).
 *
 * Convenção adotada (inspirada no app Masters, adaptada ao que o
 * BarbershopApp modela hoje):
 *  - "Real"      = dinheiro já em caixa → agendamentos concluídos
 *                  (status 'concluido' ou 'avaliado', que é concluído +
 *                  avaliação do cliente).
 *  - "Projetado" = dinheiro esperado, ainda não realizado → agendamentos
 *                  pendentes ou confirmados dentro do período.
 *  - "Cancelados" = contados à parte, não entram em Real nem Projetado.
 *  - "Despesas"   = soma dos lançamentos manuais do barbeiro (ver
 *                  `DespesaRepository`).
 *  - "Depósitos"  = sempre zero — o app não tem esse recurso ainda (ver
 *                  roadmap #8 em ANALISE-COMPETITIVA-MASTERS.md).
 *  - "Total"      = Projetado + Real − Despesas.
 */
import type { Agendamento, Despesa } from '../types';

export interface ResumoFinanceiro {
  projetado: { count: number; somaCentavos: number };
  real: { count: number; somaCentavos: number };
  cancelados: { count: number };
  despesas: { count: number; somaCentavos: number };
  depositos: { count: number; somaCentavos: number };
  totalCentavos: number;
}

const somarPrecos = (lista: Agendamento[]): number =>
  lista.reduce((acc, ag) => acc + (ag.precoEmCentavos || 0), 0);

export function calcularResumoFinanceiro(
  agendamentosDoPeriodo: Agendamento[],
  despesasDoPeriodo: Despesa[],
): ResumoFinanceiro {
  const real = agendamentosDoPeriodo.filter(
    (ag) => ag.status === 'concluido' || ag.status === 'avaliado',
  );
  const projetado = agendamentosDoPeriodo.filter(
    (ag) => ag.status === 'pendente' || ag.status === 'confirmado',
  );
  const cancelados = agendamentosDoPeriodo.filter((ag) => ag.status === 'cancelado');

  const somaReal = somarPrecos(real);
  const somaProjetado = somarPrecos(projetado);
  const somaDespesas = despesasDoPeriodo.reduce(
    (acc, d) => acc + (d.valorEmCentavos || 0),
    0,
  );

  return {
    projetado: { count: projetado.length, somaCentavos: somaProjetado },
    real: { count: real.length, somaCentavos: somaReal },
    cancelados: { count: cancelados.length },
    despesas: { count: despesasDoPeriodo.length, somaCentavos: somaDespesas },
    depositos: { count: 0, somaCentavos: 0 },
    totalCentavos: somaProjetado + somaReal - somaDespesas,
  };
}

/** Nomes dos meses (índice 0 = Janeiro), usados no gráfico anual de Vendas. */
export const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];
export const MESES_NOME = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Agrupa agendamentos e despesas de um ano inteiro em um resumo por mês
 * (índice 0-11) — base do gráfico e da tabela da aba "Resumo" de Vendas.
 */
export function calcularResumoPorMes(
  agendamentosDoAno: Agendamento[],
  despesasDoAno: Despesa[],
): ResumoFinanceiro[] {
  return Array.from({ length: 12 }, (_, mes) => {
    const mesStr = String(mes + 1).padStart(2, '0');
    const ags = agendamentosDoAno.filter((ag) => ag.data?.slice(5, 7) === mesStr);
    const desp = despesasDoAno.filter((d) => d.data?.slice(5, 7) === mesStr);
    return calcularResumoFinanceiro(ags, desp);
  });
}
