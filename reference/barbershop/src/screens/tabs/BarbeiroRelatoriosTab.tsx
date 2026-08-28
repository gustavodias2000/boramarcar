/**
 * BarbeiroRelatoriosTab — painel financeiro e operacional do barbeiro.
 *
 * Redesenhada a partir da referência trazida pelo Gustavo (app Masters):
 * 3 cards no topo — Vendas, Compromissos e Despesas — cada um com um
 * resumo do mês corrente e um link "Relatório ›". O card Vendas abre o
 * detalhamento mês a mês (VendasRelatorioScreen); Despesas abre a tela de
 * gestão de despesas (DespesasScreen); Compromissos abre a própria aba
 * Agenda, que já lista/filtra os agendamentos por dia — não duplicamos
 * essa tela.
 *
 * Abaixo dos cards, mantido o dashboard de métricas que já existia
 * (AnalyticsDashboard: ticket médio, horários populares, avaliações etc.)
 * — nada foi removido, só reorganizado.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../../../firebaseConfig';
import { listarDoEscopoFinanceiroPorPeriodo } from '../../data/repositories/AgendamentoRepository';
import { listarPorBarbeiroEPeriodo as listarDespesasPorPeriodo } from '../../data/repositories/DespesaRepository';
import { getNegocioIdDoDono } from '../../data/repositories/NegocioRepository';
import { formatMoney, toLocalDateString } from '../../utils/dateUtils';
import { comFallback, mensagemErroConsulta } from '../../utils/consultaResiliente';
import { calcularResumoFinanceiro, MESES_NOME, type ResumoFinanceiro } from '../../utils/relatorioUtils';
import AnalyticsDashboard from '../../components/AnalyticsDashboard';
import { useTheme, type Theme } from '../../context/ThemeContext';
import { tipografia, raio } from '../../theme/escala';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Agendamento, Despesa } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<any, 'Analytics'>,
  NativeStackScreenProps<RootStackParamList>
>;

type Periodo = 'semana' | 'mes';

interface FaixaPeriodo {
  inicio: string;
  fim: string;
  inicioAnterior: string;
  fimAnterior: string;
  titulo: string;
}

function obterFaixaPeriodo(periodo: Periodo, referencia = new Date()): FaixaPeriodo {
  const hoje = new Date(referencia);
  hoje.setHours(0, 0, 0, 0);
  if (periodo === 'semana') {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);
    const inicioAnterior = new Date(inicio);
    inicioAnterior.setDate(inicio.getDate() - 7);
    const fimAnterior = new Date(inicio);
    fimAnterior.setDate(inicio.getDate() - 1);
    return { inicio: toLocalDateString(inicio), fim: toLocalDateString(fim), inicioAnterior: toLocalDateString(inicioAnterior), fimAnterior: toLocalDateString(fimAnterior), titulo: 'Esta semana' };
  }
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const inicioAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const fimAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
  return { inicio: toLocalDateString(inicio), fim: toLocalDateString(fim), inicioAnterior: toLocalDateString(inicioAnterior), fimAnterior: toLocalDateString(fimAnterior), titulo: MESES_NOME[hoje.getMonth()] };
}

function percentualDeVariacao(atual: number, anterior: number): string | null {
  if (anterior === 0) return null;
  const percentual = Math.round(((atual - anterior) / Math.abs(anterior)) * 100);
  return `${percentual > 0 ? '+' : ''}${percentual}% versus o período anterior`;
}

export default function BarbeiroRelatoriosTab({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const uid = auth.currentUser?.uid ?? '';

  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [loading, setLoading] = useState(true);
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [resumoAnterior, setResumoAnterior] = useState<ResumoFinanceiro | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregar(periodo);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodo]),
  );

  /**
   * Carrega o resumo do mês. As duas consultas são independentes e cada
   * uma degrada sozinha: se a de despesas falhar (ex.: índice composto
   * ainda em construção logo após um deploy), os relatórios continuam
   * aparecendo com Despesas = R$ 0,00 e um aviso no topo, em vez de a
   * tela inteira ficar presa no spinner.
   *
   * ARQ-01: o dono de uma equipe fatura pela equipe inteira. A receita vem
   * de `listarDoEscopoFinanceiroPorPeriodo`, que resolve sozinha os dois
   * casos (com e sem negócio) e deduplica o agendamento do próprio dono,
   * que aparece nas duas fontes.
   */
  const carregar = async (periodoSelecionado: Periodo) => {
    if (!uid) {
      setResumo(calcularResumoFinanceiro([], []));
      setResumoAnterior(calcularResumoFinanceiro([], []));
      setLoading(false);
      return;
    }
    const faixa = obterFaixaPeriodo(periodoSelecionado);

    let erro: unknown = null;
    const guardarErro = (e: unknown) => {
      erro = erro ?? e;
    };

    // PERF (Onda 4): só o ID — esta tela nunca usou outro campo do negócio, e
    // o ID já vem denormalizado no doc do barbeiro (cacheado). Evita a leitura
    // de `negocios/{id}` (mais as access calls que a regra dela dispara) no
    // caminho crítico, em série antes do Promise.all abaixo.
    //
    // Falha ao resolver o negócio degrada para o escopo próprio (sub-reporta)
    // em vez de derrubar a tela — mesmo critério do Início.
    const negocioId = await comFallback(getNegocioIdDoDono(uid), null, 'Relatórios/negócio');

    const [ags, desp, agsAnteriores, despesasAnteriores] = await Promise.all([
      comFallback<Agendamento[]>(
        listarDoEscopoFinanceiroPorPeriodo(uid, negocioId, faixa.inicio, faixa.fim),
        [],
        'Relatórios/agendamentos',
        guardarErro,
      ),
      // Despesas continuam no escopo do `uid` DE PROPÓSITO: a regra
      // `firestore.rules` exige `barbeiroId == request.auth.uid` no create e
      // DespesasScreen é o único escritor, então só o dono lança despesa —
      // profissionais de equipe não têm conta no Auth. Toda despesa do
      // negócio já é despesa do dono; trocar por escopo de negócio não
      // acharia nenhum documento a mais.
      comFallback<Despesa[]>(
        listarDespesasPorPeriodo(uid, faixa.inicio, faixa.fim),
        [],
        'Relatórios/despesas',
        guardarErro,
      ),
      comFallback<Agendamento[]>(
        listarDoEscopoFinanceiroPorPeriodo(uid, negocioId, faixa.inicioAnterior, faixa.fimAnterior),
        [],
        'Relatórios/agendamentos anteriores',
        guardarErro,
      ),
      comFallback<Despesa[]>(
        listarDespesasPorPeriodo(uid, faixa.inicioAnterior, faixa.fimAnterior),
        [],
        'Relatórios/despesas anteriores',
        guardarErro,
      ),
    ]);

    setAviso(erro ? mensagemErroConsulta(erro) : null);
    setResumo(calcularResumoFinanceiro(ags, desp));
    setResumoAnterior(calcularResumoFinanceiro(agsAnteriores, despesasAnteriores));
    setLoading(false);
  };

  const trocarPeriodo = (proximo: Periodo) => {
    if (proximo === periodo) return;
    setPeriodo(proximo);
    setLoading(true);
  };

  if (loading || !resumo || !resumoAnterior) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const faixa = obterFaixaPeriodo(periodo);
  const resultado = resumo.real.somaCentavos - resumo.despesas.somaCentavos;
  const resultadoAnterior = resumoAnterior.real.somaCentavos - resumoAnterior.despesas.somaCentavos;
  const variacao = percentualDeVariacao(resultado, resultadoAnterior);
  const ticketMedio = resumo.real.count > 0 ? Math.round(resumo.real.somaCentavos / resumo.real.count) : 0;
  const baseGrafico = resumo.real.somaCentavos + resumo.projetado.somaCentavos + resumo.despesas.somaCentavos || 1;
  const totalCompromissos = resumo.real.count + resumo.projetado.count;
  const baseCompromissos = totalCompromissos + resumo.cancelados.count || 1;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Relatórios</Text>
        <Text style={s.headerSubtitle}>Resultado, recebimentos e operação da sua barbearia.</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.periodoControle} accessibilityRole="tablist">
          <TouchableOpacity
            style={[s.periodoBotao, periodo === 'semana' && s.periodoBotaoAtivo]}
            onPress={() => trocarPeriodo('semana')}
            accessibilityRole="tab"
            accessibilityLabel="Ver relatório da semana"
            accessibilityState={{ selected: periodo === 'semana' }}
          >
            <Text style={[s.periodoTexto, periodo === 'semana' && s.periodoTextoAtivo]}>Semana</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.periodoBotao, periodo === 'mes' && s.periodoBotaoAtivo]}
            onPress={() => trocarPeriodo('mes')}
            accessibilityRole="tab"
            accessibilityLabel="Ver relatório do mês"
            accessibilityState={{ selected: periodo === 'mes' }}
          >
            <Text style={[s.periodoTexto, periodo === 'mes' && s.periodoTextoAtivo]}>Mês</Text>
          </TouchableOpacity>
        </View>
        {aviso && (
          <View style={s.aviso}>
            <Text style={s.avisoTexto}>{aviso}</Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                carregar(periodo);
              }}
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar os relatórios novamente"
            >
              <Text style={s.avisoAcao}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.secaoTitulo}>Visão geral</Text>
        <TouchableOpacity
          style={s.card}
          onPress={() => navigation.navigate('VendasRelatorio')}
          accessibilityRole="button"
          accessibilityLabel="Ver relatório de vendas"
        >
          <View style={s.cardHeader}>
            <Text style={s.cardMes}>{faixa.titulo}</Text>
            <Text style={s.cardLink}>Relatório ›</Text>
          </View>
          <Text style={s.cardTitulo}>Resultado realizado</Text>
          <Text style={s.cardValorGrande}>{formatMoney(resultado)}</Text>
          <Text style={s.cardSubtitulo}>Recebido menos despesas registradas</Text>
          <Text style={s.cardComparacao}>{variacao ?? 'Sem base suficiente para comparar o período anterior'}</Text>

          <View style={s.barraProgresso}>
            <View style={{ flex: resumo.real.somaCentavos / baseGrafico, backgroundColor: theme.colors.success }} />
            <View style={{ flex: resumo.projetado.somaCentavos / baseGrafico, backgroundColor: theme.colors.borderLight }} />
            <View style={{ flex: resumo.despesas.somaCentavos / baseGrafico, backgroundColor: theme.colors.info }} />
          </View>

          <View style={s.legendaRow}>
            <View style={s.legendaItem}>
              <View style={[s.legendaDot, { backgroundColor: theme.colors.success }]} />
              <Text style={s.legendaLabel}>Recebido</Text>
              <Text style={s.legendaValor}>{formatMoney(resumo.real.somaCentavos)}</Text>
            </View>
            <View style={s.legendaItem}>
              <View style={[s.legendaDot, { backgroundColor: theme.colors.textMuted }]} />
              <Text style={s.legendaLabel}>A receber</Text>
              <Text style={s.legendaValor}>{formatMoney(resumo.projetado.somaCentavos)}</Text>
            </View>
            <View style={s.legendaItem}>
              <View style={[s.legendaDot, { backgroundColor: theme.colors.info }]} />
              <Text style={s.legendaLabel}>Despesas</Text>
              <Text style={s.legendaValor}>{formatMoney(resumo.despesas.somaCentavos)}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <Text style={s.secaoTitulo}>Operação do período</Text>
        <TouchableOpacity
          style={s.card}
          onPress={() => navigation.navigate('Agenda' as any)}
          accessibilityRole="button"
          accessibilityLabel="Ver agenda"
        >
          <View style={s.cardHeader}>
            <Text style={s.cardMes}>{faixa.titulo}</Text>
            <Text style={s.cardLink}>Ver agenda ›</Text>
          </View>
          <Text style={s.cardTitulo}>Atendimentos e agenda</Text>
          <Text style={s.cardValorGrande}>{totalCompromissos}</Text>
          <Text style={s.cardSubtitulo}>atendimentos concluídos ou previstos</Text>

          <View style={s.miniStatsRow}>
            <View style={s.miniStat}>
              <Text style={s.miniStatLabel}>Concluídos</Text>
              <Text style={[s.miniStatValor, { color: theme.colors.success }]}>{resumo.real.count}</Text>
              <Text style={s.miniStatPct}>{Math.round((resumo.real.count / baseCompromissos) * 100)}%</Text>
            </View>
            <View style={s.miniStat}>
              <Text style={s.miniStatLabel}>Previstos</Text>
              <Text style={s.miniStatValor}>{resumo.projetado.count}</Text>
              <Text style={s.miniStatPct}>{Math.round((resumo.projetado.count / baseCompromissos) * 100)}%</Text>
            </View>
            <View style={s.miniStat}>
              <Text style={s.miniStatLabel}>Cancelamentos</Text>
              <Text style={[s.miniStatValor, { color: theme.colors.error }]}>{resumo.cancelados.count}</Text>
              <Text style={s.miniStatPct}>{Math.round((resumo.cancelados.count / baseCompromissos) * 100)}%</Text>
            </View>
          </View>
        </TouchableOpacity>

        <Text style={s.secaoTitulo}>Indicadores financeiros</Text>
        <TouchableOpacity
          style={s.card}
          onPress={() => navigation.navigate('Despesas')}
          accessibilityRole="button"
          accessibilityLabel="Gerenciar despesas"
        >
          <View style={s.cardHeader}>
            <Text style={s.cardMes}>{faixa.titulo}</Text>
            <Text style={s.cardLink}>Gerenciar ›</Text>
          </View>
          <Text style={s.cardTitulo}>Despesas</Text>
          <Text style={[s.cardValorGrande, { color: theme.colors.error }]}>
            {formatMoney(resumo.despesas.somaCentavos)}
          </Text>
          <Text style={s.cardSubtitulo}>
            {resumo.despesas.count} lançamento{resumo.despesas.count === 1 ? '' : 's'} no período
          </Text>
          <View style={s.ticketLinha}>
            <Text style={s.ticketLabel}>Ticket médio</Text>
            <Text style={s.ticketValor}>{formatMoney(ticketMedio)}</Text>
          </View>
        </TouchableOpacity>

        {/* ARQ-01: os cards acima somam a equipe inteira quando há negócio;
            o AnalyticsDashboard abaixo fica no escopo do `uid` DE PROPÓSITO,
            e isso não é dívida — é a leitura correta do que ele mostra:

            - avaliações pertencem a QUEM atendeu. Somar as notas da equipe
              num número só não seria "escopo maior", seria número errado —
              esconde o profissional mal avaliado atrás da média dos outros;
            - horários populares são acionáveis por pessoa (cada um tem o
              seu pico), não pela barbearia inteira;
            - o único indicador aqui que pede escopo de negócio é o ticket
              médio, e esse já aparece somado nos cards acima.

            Por isso o rótulo é explícito: a tela mostra duas coisas
            diferentes de propósito, e diz qual é qual. Se um dia alguém
            quiser métricas por profissional DENTRO da equipe, o caminho é
            um seletor de profissional — não trocar o escopo deste bloco. */}
        <Text style={s.divisor}>Mais métricas do seu atendimento</Text>
      </ScrollView>

      <View style={s.analyticsContainer}>
        <AnalyticsDashboard barbeiroId={uid} />
      </View>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: tipografia.titulo.fontSize, fontWeight: '800', color: theme.colors.text },
    headerSubtitle: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary, marginTop: 4 },
    scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
    periodoControle: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceVariant, padding: 4, borderRadius: raio.input, marginBottom: 16 },
    periodoBotao: { minWidth: 88, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: raio.chip },
    periodoBotaoAtivo: { backgroundColor: theme.colors.surface },
    periodoTexto: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.textSecondary },
    periodoTextoAtivo: { color: theme.colors.primary },
    secaoTitulo: { fontSize: tipografia.corpoForte.fontSize, fontWeight: '800', color: theme.colors.text, marginTop: 4, marginBottom: 10 },

    aviso: {
      backgroundColor: theme.colors.surfaceVariant,
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.warning,
      borderRadius: raio.input,
      padding: 14,
      marginBottom: 14,
    },
    avisoTexto: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary, lineHeight: 19 },
    avisoAcao: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.primary, marginTop: 8 },

    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
      padding: 18,
      marginBottom: 14,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    cardMes: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.textSecondary },
    cardLink: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.primary },
    cardTitulo: { fontSize: tipografia.corpoForte.fontSize, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
    cardValorGrande: { fontSize: tipografia.titulo.fontSize, fontWeight: '800', color: theme.colors.text },
    cardSubtitulo: { fontSize: tipografia.micro.fontSize, color: theme.colors.textSecondary, marginBottom: 14 },
    cardComparacao: { fontSize: tipografia.micro.fontSize, fontWeight: '700', color: theme.colors.primary, marginTop: -8, marginBottom: 14 },

    barraProgresso: {
      flexDirection: 'row',
      height: 10,
      borderRadius: raio.chip,
      overflow: 'hidden',
      backgroundColor: theme.colors.borderLight,
      marginBottom: 12,
    },
    legendaRow: { flexDirection: 'row', justifyContent: 'space-between' },
    legendaItem: { alignItems: 'flex-start' },
    legendaDot: { width: 8, height: 8, borderRadius: raio.chip, marginBottom: 4 },
    legendaLabel: { fontSize: tipografia.micro.fontSize, color: theme.colors.textSecondary },
    legendaValor: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.text },

    miniStatsRow: { flexDirection: 'row', gap: 10 },
    miniStat: {
      flex: 1,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: raio.input,
      paddingVertical: 10,
      alignItems: 'center',
    },
    miniStatLabel: { fontSize: tipografia.micro.fontSize, color: theme.colors.textSecondary, marginBottom: 4 },
    miniStatValor: { fontSize: tipografia.subtitulo.fontSize, fontWeight: '800', color: theme.colors.text },
    miniStatPct: { fontSize: tipografia.micro.fontSize, color: theme.colors.textMuted, marginTop: 2 },
    ticketLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.surfaceVariant, borderRadius: raio.input, paddingHorizontal: 12, paddingVertical: 10, marginTop: 2 },
    ticketLabel: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.textSecondary },
    ticketValor: { fontSize: tipografia.corpoForte.fontSize, fontWeight: '800', color: theme.colors.info },

    divisor: {
      fontSize: tipografia.micro.fontSize,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 4,
      marginBottom: 4,
    },
    analyticsContainer: { flex: 1 },
  });
