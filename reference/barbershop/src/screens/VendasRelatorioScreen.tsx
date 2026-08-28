/**
 * VendasRelatorioScreen — detalhamento de vendas do ano corrente,
 * aberto a partir do card "Vendas" da aba Relatórios.
 *
 * Duas abas: Resumo (gráfico + tabela mês a mês) e Serviços (vendas
 * agrupadas pelos serviços já cadastrados). O app de referência (Masters)
 * também tem abas de Produtos e Forma de Pagamento — não replicadas aqui
 * porque o BarbershopApp não vende produtos nem registra forma de
 * pagamento por atendimento hoje (decisão tomada com o Gustavo).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { listarDoEscopoFinanceiroPorPeriodo } from '../data/repositories/AgendamentoRepository';
import { listarPorBarbeiroEPeriodo as listarDespesasPorPeriodo } from '../data/repositories/DespesaRepository';
import { getNegocioIdDoDono } from '../data/repositories/NegocioRepository';
import { formatMoney } from '../utils/dateUtils';
import { comFallback, mensagemErroConsulta } from '../utils/consultaResiliente';
import { calcularResumoFinanceiro, calcularResumoPorMes, MESES_ABREV } from '../utils/relatorioUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Agendamento, Despesa } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'VendasRelatorio'>;

type Aba = 'resumo' | 'servicos';

const ALTURA_GRAFICO = 140;

const getBarraServicoStyle = (flex: number, backgroundColor: string) => ({ flex, backgroundColor });

export default function VendasRelatorioScreen({ navigation: _navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const uid = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Aba>('resumo');
  const [agendamentosAno, setAgendamentosAno] = useState<Agendamento[]>([]);
  const [despesasAno, setDespesasAno] = useState<Despesa[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const ano = new Date().getFullYear();
  const mesAtual = new Date().getMonth();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * As duas consultas degradam isoladamente: se a de despesas falhar
   * (ex.: índice composto ainda em construção), o relatório de vendas
   * continua abrindo com Despesas = R$ 0,00 e um aviso no topo.
   *
   * ARQ-01: as vendas do ano são as do NEGÓCIO quando o barbeiro tem
   * equipe — este relatório abre a partir do card "Vendas" da aba
   * Relatórios e precisa fechar com o número mostrado lá.
   */
  const load = async () => {
    if (!uid) {
      setLoading(false);
      return;
    }
    let erro: unknown = null;
    const guardarErro = (e: unknown) => {
      erro = erro ?? e;
    };

    // PERF (Onda 4): só o ID — o relatório nunca usou outro campo do negócio,
    // e o ID já vem denormalizado no doc do barbeiro (cacheado), evitando a
    // leitura de `negocios/{id}` em série antes do Promise.all.
    //
    // Resolver o negócio não pode derrubar o relatório: degrada para o
    // escopo próprio (sub-reporta) em vez de falhar a tela inteira.
    const negocioId = await comFallback(getNegocioIdDoDono(uid), null, 'Vendas/negócio');

    const [ags, desp] = await Promise.all([
      comFallback<Agendamento[]>(
        listarDoEscopoFinanceiroPorPeriodo(uid, negocioId, `${ano}-01-01`, `${ano}-12-31`),
        [],
        'Vendas/agendamentos',
        guardarErro,
      ),
      // Despesas ficam no escopo do `uid` DE PROPÓSITO — ver a mesma nota em
      // BarbeiroRelatoriosTab: a regra do Firestore só deixa o próprio dono
      // criar despesa (`barbeiroId == request.auth.uid`), então despesa do
      // negócio já é, por construção, despesa do dono.
      comFallback<Despesa[]>(
        listarDespesasPorPeriodo(uid, `${ano}-01-01`, `${ano}-12-31`),
        [],
        'Vendas/despesas',
        guardarErro,
      ),
    ]);

    setAgendamentosAno(ags);
    setDespesasAno(desp);
    setAviso(erro ? mensagemErroConsulta(erro) : null);
    setLoading(false);
  };

  const resumoPorMes = useMemo(
    () => calcularResumoPorMes(agendamentosAno, despesasAno),
    [agendamentosAno, despesasAno],
  );

  const mesesComAtividade = useMemo(
    () =>
      resumoPorMes
        .map((r, i) => ({ mes: i, resumo: r }))
        .filter(({ resumo }) => resumo.real.somaCentavos > 0 || resumo.projetado.somaCentavos > 0 || resumo.despesas.somaCentavos > 0),
    [resumoPorMes],
  );

  const totaisAno = useMemo(() => calcularResumoFinanceiro(agendamentosAno, despesasAno), [agendamentosAno, despesasAno]);

  const maxReal = Math.max(1, ...resumoPorMes.map((r) => r.real.somaCentavos));

  const vendasPorServico = useMemo(() => {
    const realDoAno = agendamentosAno.filter((ag) => ag.status === 'concluido' || ag.status === 'avaliado');
    const grupos: Record<string, { qtd: number; somaCentavos: number }> = {};
    realDoAno.forEach((ag) => {
      const nome = ag.servico?.trim() || 'Sem serviço definido';
      if (!grupos[nome]) grupos[nome] = { qtd: 0, somaCentavos: 0 };
      grupos[nome].qtd += 1;
      grupos[nome].somaCentavos += ag.precoEmCentavos || 0;
    });
    return Object.entries(grupos)
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.somaCentavos - a.somaCentavos);
  }, [agendamentosAno]);

  const totalServicosCentavos = vendasPorServico.reduce((acc, v) => acc + v.somaCentavos, 0);
  const CORES_SERVICO = [
    theme.colors.info,
    theme.colors.primary,
    theme.colors.success,
    theme.colors.graficoRoxo,
    theme.colors.graficoRosa,
    theme.colors.graficoVerdeAgua,
  ];

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tab, aba === 'resumo' && s.tabAtiva]}
          onPress={() => setAba('resumo')}
          accessibilityRole="button"
          accessibilityLabel="Ver resumo de vendas"
          accessibilityState={{ selected: aba === 'resumo' }}
        >
          <Text style={[s.tabText, aba === 'resumo' && s.tabTextAtiva]}>RESUMO</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, aba === 'servicos' && s.tabAtiva]}
          onPress={() => setAba('servicos')}
          accessibilityRole="button"
          accessibilityLabel="Ver vendas por serviço"
          accessibilityState={{ selected: aba === 'servicos' }}
        >
          <Text style={[s.tabText, aba === 'servicos' && s.tabTextAtiva]}>SERVIÇOS</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {aviso && (
          <View style={s.aviso}>
            <Text style={s.avisoTexto}>{aviso}</Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                load();
              }}
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar o relatório novamente"
            >
              <Text style={s.avisoAcao}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.anoTitulo}>{ano}</Text>

        {aba === 'resumo' ? (
          <>
            {/* Gráfico: vendas realizadas (Real) por mês. Fase 4 (design): o
                mês atual ganha preenchimento em gradiente (via react-native-svg,
                já instalado desde a Fase 1) em vez da cor sólida — só ele, pra
                não tirar o destaque visual que a barra do mês atual já tinha. */}
            <View style={s.grafico}>
              {resumoPorMes.map((r, i) => {
                const alturaBarra = Math.max(2, (r.real.somaCentavos / maxReal) * ALTURA_GRAFICO);
                const mesDestacado = i === mesAtual;
                return (
                  <View key={i} style={s.barraColuna}>
                    <View style={s.barraTrilha}>
                      {mesDestacado ? (
                        <Svg width={16} height={alturaBarra}>
                          <Defs>
                            <LinearGradient id={`gradienteBarraMes${i}`} x1="0" y1="0" x2="0" y2="1">
                              <Stop offset="0" stopColor={theme.colors.success} stopOpacity={1} />
                              <Stop offset="1" stopColor={theme.colors.success} stopOpacity={0.35} />
                            </LinearGradient>
                          </Defs>
                          <Rect
                            width={16}
                            height={alturaBarra}
                            rx={raio.chip}
                            fill={`url(#gradienteBarraMes${i})`}
                          />
                        </Svg>
                      ) : (
                        <View
                          style={[
                            s.barra,
                            { height: alturaBarra, backgroundColor: theme.colors.borderLight },
                          ]}
                        />
                      )}
                    </View>
                    <Text style={s.barraLabel}>{MESES_ABREV[i]}</Text>
                  </View>
                );
              })}
            </View>

            {/* Tabela mês a mês */}
            <View style={s.tabela}>
              <View style={s.tabelaHeader}>
                <Text style={[s.th, s.colMes]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>MÊS</Text>
                <Text style={[s.th, s.colValor]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>PROJ.</Text>
                <Text style={[s.th, s.colValor]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>REAL</Text>
                <Text style={[s.th, s.colValor]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>DESP.</Text>
                <Text style={[s.th, s.colValor]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>TOTAL</Text>
              </View>
              {mesesComAtividade.length === 0 ? (
                <Text style={s.semDados}>Nenhuma venda registrada em {ano} ainda.</Text>
              ) : (
                mesesComAtividade.map(({ mes, resumo }) => (
                  <View key={mes} style={s.tabelaRow}>
                    <Text style={[s.td, s.colMes, s.tdMes]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {MESES_ABREV[mes]}
                    </Text>
                    <Text style={[s.td, s.colValor]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {formatMoney(resumo.projetado.somaCentavos)}
                    </Text>
                    <Text style={[s.td, s.colValor]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {formatMoney(resumo.real.somaCentavos)}
                    </Text>
                    <Text style={[s.td, s.colValor]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {formatMoney(resumo.despesas.somaCentavos)}
                    </Text>
                    <Text style={[s.td, s.colValor, s.tdForte]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {formatMoney(resumo.totalCentavos)}
                    </Text>
                  </View>
                ))
              )}
              <View style={[s.tabelaRow, s.tabelaTotalRow]}>
                <Text style={[s.td, s.colMes, s.tdForte]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  TOTAL:
                </Text>
                <Text style={[s.td, s.colValor, s.tdForte]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatMoney(totaisAno.projetado.somaCentavos)}
                </Text>
                <Text style={[s.td, s.colValor, s.tdForte]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatMoney(totaisAno.real.somaCentavos)}
                </Text>
                <Text style={[s.td, s.colValor, s.tdForte]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatMoney(totaisAno.despesas.somaCentavos)}
                </Text>
                <Text style={[s.td, s.colValor, s.tdForte]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatMoney(totaisAno.totalCentavos)}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            {vendasPorServico.length === 0 ? (
              <Text style={s.semDados}>Nenhum serviço vendido em {ano} ainda.</Text>
            ) : (
              <>
                {/* Barra proporcional por serviço (substitui o donut da referência —
                    sem lib de gráficos no projeto, uma barra segmentada é mais simples
                    de manter e cumpre o mesmo papel visual). */}
                <View style={s.barraServicos}>
                  {vendasPorServico.map((v, i) => (
                    <View
                      key={v.nome}
                      style={getBarraServicoStyle(
                        v.somaCentavos / (totalServicosCentavos || 1),
                        CORES_SERVICO[i % CORES_SERVICO.length],
                      )}
                    />
                  ))}
                </View>
                <View style={s.legendaServicos}>
                  {vendasPorServico.map((v, i) => (
                    <View key={v.nome} style={s.legendaItem}>
                      <View style={[s.legendaDot, { backgroundColor: CORES_SERVICO[i % CORES_SERVICO.length] }]} />
                      <Text style={s.legendaTexto} numberOfLines={1}>{v.nome}</Text>
                      <Text style={s.legendaValor}>{formatMoney(v.somaCentavos)}</Text>
                    </View>
                  ))}
                </View>

                <View style={s.tabela}>
                  <View style={s.tabelaHeader}>
                    <Text style={[s.th, s.colServico]} numberOfLines={1}>SERVIÇO</Text>
                    <Text style={[s.th, s.colValor]} numberOfLines={1}>QTD</Text>
                    <Text style={[s.th, s.colValor]} numberOfLines={1}>TOTAL</Text>
                  </View>
                  {vendasPorServico.map((v) => (
                    <View key={v.nome} style={s.tabelaRow}>
                      <Text style={[s.td, s.colServico]} numberOfLines={1}>{v.nome}</Text>
                      <Text style={[s.td, s.colValor]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {v.qtd}
                      </Text>
                      <Text style={[s.td, s.colValor]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {formatMoney(v.somaCentavos)}
                      </Text>
                    </View>
                  ))}
                  <View style={[s.tabelaRow, s.tabelaTotalRow]}>
                    <Text style={[s.td, s.colServico, s.tdForte]} numberOfLines={1}>TOTAL:</Text>
                    <Text style={[s.td, s.colValor, s.tdForte]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {vendasPorServico.reduce((acc, v) => acc + v.qtd, 0)}
                    </Text>
                    <Text style={[s.td, s.colValor, s.tdForte]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {formatMoney(totalServicosCentavos)}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabAtiva: { borderBottomColor: theme.colors.primary },
    tabText: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.5 },
    tabTextAtiva: { color: theme.colors.primary },
    scroll: { padding: 16, paddingBottom: 40 },
    anoTitulo: { fontSize: tipografia.titulo.fontSize, fontWeight: '800', color: theme.colors.text, marginBottom: 16 },

    aviso: {
      backgroundColor: theme.colors.surfaceVariant,
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.warning,
      borderRadius: raio.input,
      padding: 14,
      marginBottom: 16,
    },
    avisoTexto: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary, lineHeight: 19 },
    avisoAcao: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.primary, marginTop: 8 },

    grafico: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: ALTURA_GRAFICO + 24,
      marginBottom: 20,
    },
    barraColuna: { flex: 1, alignItems: 'center' },
    barraTrilha: { height: ALTURA_GRAFICO, justifyContent: 'flex-end' },
    barra: { width: 16, borderRadius: raio.chip },
    barraLabel: { fontSize: tipografia.micro.fontSize, color: theme.colors.textSecondary, marginTop: 6 },

    tabela: {
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tabelaHeader: {
      flexDirection: 'row',
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      marginBottom: 4,
      gap: 6,
    },
    th: { fontSize: tipografia.micro.fontSize, fontWeight: '700', color: theme.colors.textSecondary },
    colServico: { flex: 2 },
    // Nomes de mês agora abreviados ("Ago", ver MESES_ABREV) — não precisam
    // mais de tanto espaço quanto um valor monetário formatado.
    colMes: { flex: 0.8 },
    colValor: { flex: 1, textAlign: 'right' },
    tabelaRow: {
      flexDirection: 'row',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderLight,
      gap: 6,
    },
    td: { fontSize: tipografia.apoio.fontSize, color: theme.colors.text },
    tdMes: { fontWeight: '600', color: theme.colors.primary },
    tdForte: { fontWeight: '800' },
    tabelaTotalRow: { borderBottomWidth: 0, marginTop: 2 },
    semDados: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary, textAlign: 'center', paddingVertical: 24 },

    barraServicos: {
      flexDirection: 'row',
      height: 20,
      borderRadius: raio.input,
      overflow: 'hidden',
      marginBottom: 16,
    },
    legendaServicos: { marginBottom: 16 },
    legendaItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    legendaDot: { width: 10, height: 10, borderRadius: raio.chip, marginRight: 8 },
    legendaTexto: { flex: 1, fontSize: tipografia.apoio.fontSize, color: theme.colors.text },
    legendaValor: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.text },
  });
