/**
 * InicioScreen — aba "Início" do barbeiro: painel-resumo do dia e da semana,
 * agora a tela de entrada no lugar da Agenda (que virou uma aba própria).
 *
 * Inspirado no dashboard do app Masters (referência trazida pelo Gustavo).
 * O card "Relatórios" replica o mini-resumo financeiro do mês corrente que
 * a referência mostra na tela inicial (Projetado/Real/Depósitos/Despesas),
 * usando `calcularResumoFinanceiro` — a mesma função usada na aba
 * Relatórios, para os dois lugares nunca ficarem com números diferentes.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../../firebaseConfig';
import {
  listarDoEscopoFinanceiroPorPeriodo,
  contarPendentesDoBarbeiro,
} from '../data/repositories/AgendamentoRepository';
import { listarPorBarbeiroEPeriodo as listarDespesasPorPeriodo } from '../data/repositories/DespesaRepository';
import { getNegocioIdDoDono } from '../data/repositories/NegocioRepository';
import {
  contarClientes,
  contarClientesDesde,
  listarAniversariantesNaJanela,
} from '../data/repositories/ClienteContatoRepository';
import { contarFilaDoBarbeiro } from '../data/repositories/ListaEsperaRepository';
import useUserProfile from '../hooks/useUserProfile';
import { toLocalDateString, formatMoney } from '../utils/dateUtils';
import { comFallback } from '../utils/consultaResiliente';
import { calcularResumoFinanceiro, MESES_NOME, type ResumoFinanceiro } from '../utils/relatorioUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import { ONBOARDING_KEY } from './OnboardingScreen';
import Icone, { type NomeIcone } from '../components/Icone';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, ClienteContato, Agendamento } from '../types';

// Pode ser chamado tanto de um tab navigator quanto do stack diretamente
type Props = CompositeScreenProps<
  BottomTabScreenProps<any, 'Inicio'>,
  NativeStackScreenProps<RootStackParamList>
>;

interface DiaSemana {
  data: string;
  label: string;
  diaMes: string;
  compromissos: number;
  somaCentavos: number;
  hoje: boolean;
}

interface Aviso {
  icon: NomeIcone;
  texto: string;
  onPress: () => void;
}

/**
 * Status que entram na soma de dinheiro da faixa da semana — e, por tabela, no
 * hero "previsto hoje": o que já está confirmado mais o que já foi feito.
 *
 * `'avaliado'` é `'concluido'` + avaliação do cliente, e por isso PRECISA
 * estar aqui. Sem ele, o valor caía sozinho no instante em que o cliente
 * avaliava o atendimento: o dono via o faturamento do dia encolher sem nada
 * ter acontecido. É a mesma dupla "realizada" de `calcularResumoFinanceiro`
 * (`src/utils/relatorioUtils.ts`), que sempre tratou 'concluido' e 'avaliado'
 * como um caso só.
 */
const CONTAM_NA_SOMA_DO_DIA: ReadonlyArray<Agendamento['status']> = [
  'confirmado',
  'concluido',
  'avaliado',
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const capitalizar = (texto: string): string =>
  texto.length > 0 ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;

export default function InicioScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const { profile } = useUserProfile();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [semana, setSemana] = useState<DiaSemana[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [filaEspera, setFilaEspera] = useState(0);
  const [totalClientes, setTotalClientes] = useState(0);
  const [novosClientesMes, setNovosClientesMes] = useState(0);
  const [aniversariantesSemana, setAniversariantesSemana] = useState<ClienteContato[]>([]);
  const [resumoMes, setResumoMes] = useState<ResumoFinanceiro | null>(null);

  useEffect(() => {
    checkOnboarding();
    // Verificação única na montagem: `checkOnboarding` só lê AsyncStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, []),
  );

  const checkOnboarding = async () => {
    try {
      const visto = await AsyncStorage.getItem(ONBOARDING_KEY.barbeiro);
      if (!visto) {
        navigation.navigate('Onboarding', { tipo: 'barbeiro' });
      }
    } catch (_) {}
  };

  /**
   * O parâmetro `forcar` (que propagava `ignorarCache` para
   * `listarClientesDoBarbeiro`) saiu junto com a própria chamada: as
   * consultas que restaram nesta tela — agendamentos, despesas e as três
   * agregadas de cliente — não passam por cache nenhum, então o
   * pull-to-refresh já vai à rede por natureza. Não há mais nada para forçar.
   */
  const carregar = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const hoje = new Date();
      const hojeStr = toLocalDateString(hoje);
      const domingo = new Date(hoje);
      domingo.setDate(hoje.getDate() - hoje.getDay());
      const sabado = new Date(domingo);
      sabado.setDate(domingo.getDate() + 6);
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

      // ARQ-01: o escopo financeiro do dono de uma equipe é o negócio
      // inteiro. Resolvido UMA vez aqui, antes do Promise.all — as duas
      // consultas de agendamento (semana e mês) usam o mesmo valor, e um
      // `getNegocioIdDoDono` por consulta seria leitura duplicada à toa.
      //
      // PERF (Onda 4): `getNegocioIdDoDono` (e não `getNegocioPorDono`) —
      // esta tela nunca usou nada além do id, e o id já vem denormalizado no
      // doc do barbeiro, que o cache de `getBarbeiro` costuma ter quente.
      // Some assim uma leitura (mais as access calls da regra de `negocios`)
      // do caminho crítico do primeiro paint.
      //
      // `comFallback` continua porque uma falha aqui derrubaria o painel
      // inteiro: degradar para o escopo próprio sub-reporta, que é o lado
      // aceitável de errar numa tela de resumo.
      const negocioId = await comFallback(getNegocioIdDoDono(uid), null, 'Início/negócio');

      // Cada consulta degrada isoladamente (ver utils/consultaResiliente):
      // um erro pontual numa delas — índice do Firestore ainda em
      // construção, regra recém-publicada, rede instável — não pode
      // derrubar o painel inteiro, como acontecia com o Promise.all cru.
      const [
        agendamentosSemana,
        agendamentosMes,
        despesasMes,
        totalPendentes,
        totalNaFila,
        clientesNaAgenda,
        clientesNovos,
        aniversariantes,
      ] = await Promise.all([
          comFallback(
            listarDoEscopoFinanceiroPorPeriodo(
              uid,
              negocioId,
              toLocalDateString(domingo),
              toLocalDateString(sabado),
            ),
            [],
            'Início/agendamentos da semana',
          ),
          comFallback(
            listarDoEscopoFinanceiroPorPeriodo(
              uid,
              negocioId,
              toLocalDateString(inicioMes),
              toLocalDateString(fimMes),
            ),
            [],
            'Início/agendamentos do mês',
          ),
          // Despesas continuam no escopo do `uid` DE PROPÓSITO: a regra do
          // Firestore só permite criar despesa com
          // `barbeiroId == request.auth.uid`, e DespesasScreen é o único
          // escritor — profissionais de equipe não têm conta no Auth. Logo
          // toda despesa do negócio já é despesa do dono.
          comFallback(
            listarDespesasPorPeriodo(uid, toLocalDateString(inicioMes), toLocalDateString(fimMes)),
            [],
            'Início/despesas do mês',
          ),
          comFallback(contarPendentesDoBarbeiro(uid), 0, 'Início/pendentes'),
          comFallback(contarFilaDoBarbeiro(uid), 0, 'Início/lista de espera'),
          // PERF: este painel lia a subcoleção INTEIRA de clientes (~280 docs
          // a cada foco) só para produzir três agregados. Agora são duas
          // contagens server-side (1 leitura cobrada cada) e uma consulta por
          // faixa de "MM-DD", que traz só os aniversariantes da semana.
          // `listarClientesDoBarbeiro` continua existindo, intacta, para os
          // 4 consumidores que realmente precisam da lista.
          comFallback(contarClientes(uid), 0, 'Início/total de clientes'),
          comFallback(contarClientesDesde(uid, inicioMes), 0, 'Início/clientes novos'),
          comFallback(listarAniversariantesNaJanela(uid, hoje), [], 'Início/aniversariantes'),
        ]);

      setResumoMes(calcularResumoFinanceiro(agendamentosMes, despesasMes));

      const dias: DiaSemana[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(domingo);
        d.setDate(domingo.getDate() + i);
        const dataStr = toLocalDateString(d);
        const doDia = agendamentosSemana.filter(
          (ag) => ag.data === dataStr && ag.status !== 'cancelado',
        );
        const somaCentavos = doDia
          .filter((ag) => CONTAM_NA_SOMA_DO_DIA.includes(ag.status))
          .reduce((acc, ag) => acc + (ag.precoEmCentavos || 0), 0);
        return {
          data: dataStr,
          label: DIAS_SEMANA[i],
          diaMes: String(d.getDate()),
          compromissos: doDia.length,
          somaCentavos,
          hoje: dataStr === hojeStr,
        };
      });

      setSemana(dias);
      setPendentes(totalPendentes);
      setFilaEspera(totalNaFila);
      setTotalClientes(clientesNaAgenda);
      setNovosClientesMes(clientesNovos);
      // Mesma regra da AniversariantesScreen: "essa semana" = próximos 6 dias
      // (0 = hoje), sem contar quem já passou (volta pro ano seguinte). Quem
      // aplica a regra continua sendo `diasAteProximoAniversario` — agora
      // dentro de `listarAniversariantesNaJanela`, sobre um universo bem
      // menor de documentos.
      setAniversariantesSemana(aniversariantes);
    } catch (error) {
      console.error('Erro ao carregar painel inicial:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await carregar();
    setRefreshing(false);
  };

  const hojeInfo = semana.find((d) => d.hoje);
  const dataExtenso = capitalizar(
    new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
  );
  const primeiroNome = (profile?.nome || 'Barbeiro').split(' ')[0];

  const avisos: Aviso[] = [];
  if (pendentes > 0) {
    avisos.push({
      icon: 'notificacao',
      texto: `${pendentes} agendamento${pendentes === 1 ? '' : 's'} aguardando confirmação`,
      onPress: () => navigation.navigate('Agenda' as any),
    });
  }
  if (filaEspera > 0) {
    avisos.push({
      // Emoji original "ampulheta" não está no mapa de substituição — sem
      // ícone de espera disponível em Icone.tsx; `horario` (Clock) é o
      // mais próximo semanticamente (mesma decisão usada em
      // BarbeiroConfigTab.tsx).
      icon: 'horario',
      texto: `${filaEspera} cliente${filaEspera === 1 ? '' : 's'} na lista de espera`,
      onPress: () => navigation.navigate('ListaEspera'),
    });
  }
  if (aniversariantesSemana.length > 0) {
    avisos.push({
      icon: 'aniversario',
      texto: `${aniversariantesSemana.length} aniversariante${aniversariantesSemana.length === 1 ? '' : 's'} essa semana`,
      onPress: () => navigation.navigate('Aniversariantes'),
    });
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        <Text style={s.saudacao}>Olá, {primeiroNome}</Text>
        <Text style={s.data}>{dataExtenso}</Text>

        {/* Hoje */}
        <View style={s.heroCard}>
          <View style={s.heroRow}>
            <View style={s.heroMetric}>
              <Text style={s.heroValue}>{hojeInfo?.compromissos ?? 0}</Text>
              <Text style={s.heroLabel}>
                compromisso{(hojeInfo?.compromissos ?? 0) === 1 ? '' : 's'} hoje
              </Text>
            </View>
            <View style={s.heroDivider} />
            <View style={s.heroMetric}>
              <Text style={s.heroValue}>{formatMoney(hojeInfo?.somaCentavos ?? 0)}</Text>
              <Text style={s.heroLabel}>previsto hoje</Text>
            </View>
          </View>
          <View style={s.heroActions}>
            <TouchableOpacity
              style={s.heroButtonPrimary}
              onPress={() => navigation.navigate('AgendamentoManual')}
              accessibilityRole="button"
              accessibilityLabel="Criar novo agendamento"
            >
              {/* '＋' é caractere tipográfico, não emoji — ver mesma nota em
                  BarbeiroHome.tsx (fora do escopo, sem ícone equivalente). */}
              <Text style={s.heroButtonPrimaryText}>＋ Agendar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.heroButtonSecondary}
              onPress={() => navigation.navigate('Agenda' as any)}
              accessibilityRole="button"
              accessibilityLabel="Ver agenda completa"
            >
              <Text style={s.heroButtonSecondaryText}>Ver agenda</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Avisos */}
        {avisos.length > 0 ? (
          <View style={s.card}>
            {avisos.map((aviso, i) => (
              <TouchableOpacity
                key={aviso.texto}
                style={[s.avisoRow, i === avisos.length - 1 && s.rowLast]}
                onPress={aviso.onPress}
                accessibilityRole="button"
                accessibilityLabel={aviso.texto}
              >
                <View style={s.avisoIcon}>
                  <Icone nome={aviso.icon} tamanho={20} cor={theme.colors.primary} decorativo />
                </View>
                <Text style={s.avisoTexto}>{aviso.texto}</Text>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={[s.card, s.tudoEmDiaCard]}>
            <Text style={s.tudoEmDia}>Tudo em dia por aqui</Text>
          </View>
        )}

        {/* Esta semana */}
        <Text style={s.sectionTitle}>Esta semana</Text>
        <View style={s.card}>
          {semana.map((dia, i) => (
            <View
              key={dia.data}
              style={[s.semanaRow, i === semana.length - 1 && s.rowLast, dia.hoje && s.semanaRowHoje]}
            >
              <Text style={[s.semanaDia, dia.hoje && s.semanaDiaHoje]}>
                {dia.label} {dia.diaMes}
              </Text>
              <Text style={s.semanaCompromissos}>
                {dia.compromissos} comprom.
              </Text>
              <Text style={s.semanaSoma}>{formatMoney(dia.somaCentavos)}</Text>
            </View>
          ))}
        </View>

        {/* Clientes */}
        <Text style={s.sectionTitle}>Clientes</Text>
        <TouchableOpacity
          style={s.card}
          onPress={() => navigation.navigate('Clientes')}
          accessibilityRole="button"
          accessibilityLabel="Ver clientes"
        >
          <View style={s.clientesRow}>
            <View style={s.clientesMetric}>
              <Text style={s.clientesValor}>{totalClientes}</Text>
              <Text style={s.clientesLabel}>na agenda</Text>
            </View>
            <View style={s.clientesMetric}>
              <Text style={s.clientesValor}>{novosClientesMes}</Text>
              <Text style={s.clientesLabel}>novos este mês</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Relatórios */}
        <TouchableOpacity
          style={s.card}
          onPress={() => navigation.navigate('Analytics' as any)}
          accessibilityRole="button"
          accessibilityLabel="Ver relatórios completos"
        >
          <View style={s.relatorioHeader}>
            <View style={s.relatorioTituloRow}>
              <Icone nome="relatorio" tamanho={20} cor={theme.colors.text} decorativo />
              <Text style={s.relatorioTitulo}>Relatórios</Text>
            </View>
            <Text style={s.relatorioVer}>VER</Text>
          </View>

          <View style={s.relatorioColHeaderRow}>
            <Text style={s.relatorioMesLabel}>{MESES_NOME[new Date().getMonth()]}:</Text>
            <Text style={s.relatorioColHeader}>compromissos</Text>
            <Text style={[s.relatorioColHeader, s.relatorioColHeaderValor]}>soma</Text>
          </View>

          {resumoMes && (
            <>
              <RelatorioLinha icon="tendencia" label="Projetado" count={resumoMes.projetado.count} somaCentavos={resumoMes.projetado.somaCentavos} theme={theme} s={s} />
              <RelatorioLinha icon="cartao" label="Real" count={resumoMes.real.count} somaCentavos={resumoMes.real.somaCentavos} theme={theme} s={s} />
              {/* Emoji original "pessoas de mãos dadas" não está no mapa de
                  substituição — sem ícone de "depósito" disponível em
                  Icone.tsx; `comissao` (Handshake) é o mais próximo
                  semanticamente (acordo/valor combinado). */}
              <RelatorioLinha icon="comissao" label="Depósitos" count={resumoMes.depositos.count} somaCentavos={resumoMes.depositos.somaCentavos} theme={theme} s={s} />
              <RelatorioLinha icon="dinheiro" label="Despesas" count={resumoMes.despesas.count} somaCentavos={resumoMes.despesas.somaCentavos} theme={theme} s={s} last />

              <View style={s.relatorioTotalRow}>
                <Text style={s.relatorioTotalLabel}>Total:</Text>
                <Text style={s.relatorioTotalValor}>{formatMoney(resumoMes.totalCentavos)}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

interface RelatorioLinhaProps {
  icon: NomeIcone;
  label: string;
  count: number;
  somaCentavos: number;
  theme: Theme;
  s: ReturnType<typeof getStyles>;
  last?: boolean;
}

function RelatorioLinha({ icon, label, count, somaCentavos, theme, s, last }: RelatorioLinhaProps) {
  return (
    <View style={[s.relatorioRow, last && s.rowLast]}>
      <View style={s.relatorioRowLabelWrap}>
        <Icone nome={icon} tamanho={16} cor={theme.colors.textSecondary} decorativo />
        <Text style={s.relatorioRowLabel}>{label}</Text>
      </View>
      <Text style={s.relatorioRowCount}>{count}</Text>
      <Text style={s.relatorioRowSoma}>{formatMoney(somaCentavos)}</Text>
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  saudacao: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  data: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 2, marginBottom: 16 },

  heroCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroMetric: { flex: 1 },
  heroValue: { fontSize: 32, fontWeight: '800', color: theme.colors.textSobrePrimaria },
  heroLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  heroDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 12,
  },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  heroButtonPrimary: {
    flex: 1,
    // '#FFFFFF' é o preenchimento (fundo) do botão, não texto/ícone sobre
    // fundo saturado — fica fora do escopo dos tokens textSobrePrimaria/
    // textSobreDestaque, que cobrem só o primeiro plano.
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  heroButtonPrimaryText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  heroButtonSecondary: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  heroButtonSecondaryText: { color: theme.colors.textSobrePrimaria, fontWeight: '700', fontSize: 14 },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },

  avisoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  rowLast: { borderBottomWidth: 0 },
  avisoIcon: { marginRight: 12 },
  avisoTexto: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  chevron: { fontSize: 24, color: theme.colors.textMuted, marginLeft: 8 },

  tudoEmDiaCard: { paddingVertical: 20, alignItems: 'center' },
  tudoEmDia: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: '600' },

  semanaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  semanaRowHoje: { backgroundColor: theme.colors.primary + '15' },
  semanaDia: { flex: 1.1, fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
  semanaDiaHoje: { color: theme.colors.primary, fontWeight: '800' },
  semanaCompromissos: { flex: 1, fontSize: 14, color: theme.colors.text, textAlign: 'center' },
  semanaSoma: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text, textAlign: 'right' },

  clientesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  clientesMetric: { flex: 1 },
  clientesValor: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  clientesLabel: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },

  relatorioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  relatorioTituloRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  relatorioTitulo: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  relatorioVer: { fontSize: 12, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.5 },
  relatorioColHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  relatorioMesLabel: { flex: 1.2, fontSize: 12, fontWeight: '700', color: theme.colors.text },
  relatorioColHeader: { flex: 1, fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' },
  relatorioColHeaderValor: { textAlign: 'right' },
  relatorioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  relatorioRowLabelWrap: { flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 6 },
  relatorioRowLabel: { fontSize: 14, color: theme.colors.textSecondary },
  relatorioRowCount: { flex: 1, fontSize: 14, color: theme.colors.text, textAlign: 'center' },
  relatorioRowSoma: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text, textAlign: 'right' },
  relatorioTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  relatorioTotalLabel: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  relatorioTotalValor: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
});
