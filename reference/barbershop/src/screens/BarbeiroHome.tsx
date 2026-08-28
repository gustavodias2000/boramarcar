/**
 * BarbeiroHome — aba "Agenda" do Bottom Tab Navigator do barbeiro.
 * Exibe os agendamentos do dia, stats e ações (confirmar/cancelar/concluir).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, functions } from '../../firebaseConfig';
import NotificationService from '../services/NotificationService';
import {
  listarDoEscopoFinanceiroPorPeriodo,
  listarPendentesDoEscopo,
  listarConfirmadosHojeDoEscopo,
  atualizarStatus,
} from '../data/repositories/AgendamentoRepository';
import { getNegocioIdDoDono } from '../data/repositories/NegocioRepository';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { migrarBanidosLegado } from '../data/repositories/BanimentoRepository';
import { liberarSlotsDoAgendamento, getOcupacoesPorPeriodo } from '../services/OcupacaoService';
import { httpsCallable } from '../services/CloudFunctionsClient';
import { registrarErro, registrarAviso } from '../services/ObservabilityService';
import useUserProfile from '../hooks/useUserProfile';
import { formatDateTime, formatPreco, toLocalDateString } from '../utils/dateUtils';
import { contarSubSlotsDoDia } from '../utils/agendaSlots';
import { useTheme, type Theme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { getStatusColor, getStatusText } from '../utils/statusUtils';
import { SkeletonList } from '../components/Skeleton';
import CalendarioMensal, { type StatusDia } from '../components/CalendarioMensal';
import AvatarIlustrado from '../components/AvatarIlustrado';
import Icone from '../components/Icone';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Agendamento, ConfiguracaoAgenda } from '../types';

const CONFIG_PADRAO_CALENDARIO: ConfiguracaoAgenda = {
  horaInicio: '09:00',
  horaFim: '18:00',
  almocoInicio: '12:00',
  almocoFim: '13:00',
  antecedenciaMinutos: 30,
  antecedenciaMaximaDias: 30,
  diasAtendimento: [1, 2, 3, 4, 5, 6],
};

/**
 * Primeiro e último dia (YYYY-MM-DD, hora local) do mês exibido no
 * calendário — a JANELA que a Agenda busca.
 *
 * Por que "o mês selecionado" e não "hoje" ou "os últimos 50 criados":
 * cobre o caso comum (barbeiro abre a Agenda para ver hoje/esta
 * semana/este mês, todos dentro do mês corrente por definição) sem virar
 * "buscar todo o histórico". Compartilhada entre `carregarCalendario` e
 * `fetchAgendamentos` para as duas nunca divergirem sobre qual mês está em
 * tela (CRÍTICO 2 da auditoria).
 */
const intervaloDoMes = (mes: number, ano: number): { dataInicio: string; dataFim: string } => {
  const inicioMes = new Date(ano, mes, 1);
  const fimMes = new Date(ano, mes + 1, 0);
  return { dataInicio: toLocalDateString(inicioMes), dataFim: toLocalDateString(fimMes) };
};

/**
 * Janela da LISTA de agendamentos — o mês exibido, com 7 dias de transbordo
 * quando esse mês é o corrente.
 *
 * Por que o transbordo: com a janela colada no fim do mês, no dia 31/08 um
 * agendamento marcado para 01/09 não aparecia — o barbeiro precisava
 * navegar de mês para enxergar o amanhã. O último dia do mês é exatamente
 * quando ele mais olha o dia seguinte, então a janela fechada trocava um
 * defeito (agenda truncada por `createdAt`) por outro menor na virada.
 *
 * O transbordo NÃO vale para meses passados/futuros navegados no
 * calendário: ali o barbeiro pediu um mês específico, e vazar a semana
 * seguinte só confundiria a leitura. E não vale para `carregarCalendario`,
 * que pinta exatamente os dias do mês exibido.
 */
const intervaloDaLista = (mes: number, ano: number): { dataInicio: string; dataFim: string } => {
  const { dataInicio, dataFim } = intervaloDoMes(mes, ano);
  const hoje = new Date();
  const ehMesCorrente = mes === hoje.getMonth() && ano === hoje.getFullYear();
  if (!ehMesCorrente) return { dataInicio, dataFim };

  const fimComTransbordo = new Date(ano, mes + 1, 0);
  fimComTransbordo.setDate(fimComTransbordo.getDate() + 7);
  return { dataInicio, dataFim: toLocalDateString(fimComTransbordo) };
};

/**
 * `listarDoEscopoFinanceiroPorPeriodo` documenta que devolve os agendamentos
 * SEM ordenação (todo consumidor até aqui só agregava). A Agenda é o
 * primeiro consumidor que EXIBE a lista crua — por isso ordena aqui, mais
 * antigo primeiro dentro do mês, para o barbeiro rolar a tela em ordem
 * cronológica. `data` e `horario` são strings de largura fixa
 * ('YYYY-MM-DD' / 'HH:MM'), então a comparação lexicográfica já ordena
 * corretamente (mesma premissa usada em `contarNaFaixaBloqueada`).
 */
const compararPorDataEHorario = (a: Agendamento, b: Agendamento): number => {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  const horaA = a.horario ?? '';
  const horaB = b.horario ?? '';
  if (horaA === horaB) return 0;
  return horaA < horaB ? -1 : 1;
};

/**
 * Contexto de telemetria de um agendamento — a ÚNICA forma de mandar um
 * agendamento para `eventosOperacionais` a partir desta tela.
 *
 * `Agendamento` carrega `clienteNome`, `cliente` (email), `clienteTelefone` e
 * `barbeiroNome`; nada disso pode sair do app. Esta função existe justamente
 * para que os pontos de chamada não tenham a chance de espalhar `...ag`: ela
 * devolve só ids opacos, data e horário. Campo novo entra AQUI, num lugar só,
 * coberto por teste.
 */
const contextoDoAgendamento = (ag: Agendamento) => ({
  agendamentoId: ag.id,
  barbeiroId: ag.barbeiroId,
  negocioId: ag.negocioId,
  data: ag.data,
  horario: ag.horario,
});

// Pode ser chamado tanto de um tab navigator quanto do stack diretamente
type Props = CompositeScreenProps<
  BottomTabScreenProps<any, 'Agenda'>,
  NativeStackScreenProps<RootStackParamList>
>;

type FiltroRapido = 'pendentes' | 'confirmados' | null;

export default function BarbeiroHome({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const { profile: userProfile, refresh: refreshProfile } = useUserProfile();
  const { showToast } = useToast();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [agendamentosPendentes, setAgendamentosPendentes] = useState<Agendamento[]>([]);
  const [agendamentosConfirmadosHoje, setAgendamentosConfirmadosHoje] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ pendentes: 0, confirmados: 0, total: 0 });
  // Presente quando o usuário logado é dono de uma equipe — nesse caso a
  // agenda mostra os agendamentos de TODOS os profissionais do negócio.
  const [negocioId, setNegocioId] = useState<string | null>(null);

  // ─── Calendário com código de cor (verde=livre, cinza=lotado) ────────────
  const hoje = new Date();
  const [showCalendario, setShowCalendario] = useState(true);
  const [calMes, setCalMes] = useState(hoje.getMonth());
  const [calAno, setCalAno] = useState(hoje.getFullYear());
  const [diasStatus, setDiasStatus] = useState<Record<string, StatusDia>>({});
  const [calendarioLoading, setCalendarioLoading] = useState(false);
  const [dataFiltro, setDataFiltro] = useState<string | null>(null);
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>(null);

  useEffect(() => {
    // Tira a lista de banidos de dentro do documento público da vitrine, se
    // ainda estiver lá (formato antigo). Roda uma vez só: depois de migrar,
    // o campo deixa de existir e a função retorna de imediato.
    const uid = auth.currentUser?.uid;
    if (uid) migrarBanidosLegado(uid);
    // Solicita permissão de push APÓS o login, mesmo padrão de ClienteHome.tsx.
    NotificationService.init();
  }, []);

  // useFocusEffect (não useEffect simples): esta tela é uma aba, então fica
  // montada o tempo todo — sem isso, criar um agendamento manual em outra
  // tela e voltar para "Agenda" mostraria a lista velha até um
  // pull-to-refresh manual, porque o fetch original só rodava uma vez, na
  // primeira montagem (mesmo padrão de ClienteHome.tsx).
  // Deps [calMes, calAno] (não []): sem isso, o closure memoizado guardava
  // para sempre o mês da PRIMEIRA renderização — navegar o calendário e
  // depois trocar de aba e voltar refazia a busca com a janela antiga
  // (CRÍTICO 2, item 5). Com a dependência certa, o próprio
  // `useFocusEffect` já refaz a busca também quando o mês muda enquanto a
  // aba está em foco (mesmo mecanismo do efeito de `carregarCalendario`
  // abaixo, que já dependia de calMes/calAno).
  useFocusEffect(
    useCallback(() => {
      fetchAgendamentos().finally(() => setLoading(false));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calMes, calAno]),
  );

  useEffect(() => {
    if (showCalendario) carregarCalendario();
    // `carregarCalendario` só depende de `calMes`/`calAno`, que já estão na
    // lista — incluir a função aqui a recriaria a cada render sem ganho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCalendario, calMes, calAno]);

  const carregarCalendario = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setCalendarioLoading(true);
    try {
      const dados = await getBarbeiro(uid);
      const config = dados?.configuracaoAgenda ?? CONFIG_PADRAO_CALENDARIO;
      const datasBloqueadas = new Set(dados?.datasBloqueadas ?? []);
      const totalSubSlots = contarSubSlotsDoDia(config);

      const { dataInicio, dataFim } = intervaloDoMes(calMes, calAno);

      const ocupacoesPorDia = await getOcupacoesPorPeriodo(uid, dataInicio, dataFim);

      const status: Record<string, StatusDia> = {};
      const totalDias = new Date(calAno, calMes + 1, 0).getDate();
      for (let dia = 1; dia <= totalDias; dia++) {
        const d = new Date(calAno, calMes, dia);
        const dateStr = toLocalDateString(d);
        const diaSemana = d.getDay();

        if (!config.diasAtendimento.includes(diaSemana) || datasBloqueadas.has(dateStr) || totalSubSlots === 0) {
          status[dateStr] = 'indisponivel';
          continue;
        }
        const ocupados = ocupacoesPorDia[dateStr]?.length ?? 0;
        status[dateStr] = ocupados >= totalSubSlots ? 'lotado' : 'livre';
      }
      setDiasStatus(status);
    } catch (error) {
      console.error('Erro ao carregar calendário:', error);
    } finally {
      setCalendarioLoading(false);
    }
  };

  const handleChangeMonth = (delta: number) => {
    let novoMes = calMes + delta;
    let novoAno = calAno;
    if (novoMes < 0) { novoMes = 11; novoAno -= 1; }
    if (novoMes > 11) { novoMes = 0; novoAno += 1; }
    setCalMes(novoMes);
    setCalAno(novoAno);
  };

  const handleSelectDate = (date: string) => {
    setFiltroRapido(null);
    setDataFiltro((prev) => (prev === date ? null : date));
    // Ao tocar numa data, a lista já fica filtrada para aquele dia (mesmo
    // mecanismo usado para "hoje") — some com o calendário em seguida para
    // dar mais espaço à lista de agendamentos filtrada.
    setShowCalendario(false);
  };

  const handleFiltroRapido = (filtro: Exclude<FiltroRapido, null>) => {
    setFiltroRapido((atual) => (atual === filtro ? null : filtro));
    setDataFiltro(null);
    setShowCalendario(false);
  };

  const fetchAgendamentos = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const negocioIdDoDono = await getNegocioIdDoDono(uid);
      setNegocioId(negocioIdDoDono);
      // CRÍTICO 2 (auditoria): antes buscava as 50 marcações mais
      // recentemente CRIADAS (`orderBy('createdAt','desc') + limit(50)`,
      // em `listarDoBarbeiro`/`listarPorNegocio`) e filtrava por `data` só
      // no cliente. Uma equipe com volume esgota 50 marcações em pouco mais
      // de um dia — um agendamento marcado há semanas para amanhã fica fora
      // da janela das últimas 50 criadas e some da Agenda, mesmo válido e no
      // futuro. A correção busca por INTERVALO DE DATA (mês exibido no
      // calendário), a mesma peça que `listarDoEscopoFinanceiroPorPeriodo`
      // já usa nos relatórios financeiros (InicioScreen) — ela já bifurca
      // solo/equipe e já deduplica o agendamento do dono que aparece nas
      // duas fontes, então a Agenda não reimplementa essa lógica.
      const { dataInicio, dataFim } = intervaloDaLista(calMes, calAno);
      const [data, pendentes, confirmadosHoje] = await Promise.all([
        listarDoEscopoFinanceiroPorPeriodo(uid, negocioIdDoDono, dataInicio, dataFim),
        listarPendentesDoEscopo(uid, negocioIdDoDono),
        listarConfirmadosHojeDoEscopo(uid, negocioIdDoDono, toLocalDateString(new Date())),
      ]);
      // A função devolve sem ordenação (documentado nela: os outros
      // consumidores só agregam). A Agenda é o primeiro que EXIBE a lista
      // crua, por isso ordena aqui — mais antigo primeiro dentro do mês.
      data.sort(compararPorDataEHorario);
      pendentes.sort(compararPorDataEHorario);
      confirmadosHoje.sort(compararPorDataEHorario);
      setAgendamentos(data);
      setAgendamentosPendentes(pendentes);
      setAgendamentosConfirmadosHoje(confirmadosHoje);
      setStats({
        pendentes: pendentes.length,
        confirmados: confirmadosHoje.length,
        total: data.length,
      });
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
      Alert.alert('Erro', 'Não foi possível carregar os agendamentos.');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshProfile(), fetchAgendamentos()]);
    } catch (error) {
      console.error('Erro ao atualizar:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const confirmar = async (ag: Agendamento) => {
    Alert.alert('Confirmar', `Confirmar agendamento de ${ag.clienteNome}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          try {
            await atualizarStatus(ag.id, 'confirmado');
            // O aviso ao cliente agora é responsabilidade do trigger reativo
            // `notificarMudancaStatusAgendamento` (functions/index.js),
            // disparado automaticamente na transição pendente→confirmado —
            // mandar o WhatsApp também daqui duplicaria a notificação.
            showToast('Agendamento confirmado.');
            await fetchAgendamentos();
          } catch (erro) {
            // NÍVEL 'warning', o mais brando dos três desta tela: falhar aqui
            // não perde nada e não deixa nada divergente — o agendamento
            // continua 'pendente', que é exatamente o que o cliente vê do
            // outro lado. O barbeiro recebe um Alert honesto e repete o
            // toque, sem custo. O valor de registrar é a TENDÊNCIA
            // ("confirmações vêm falhando desde terça"), não o alarme: como
            // 'error' uma sequência de toques num momento de rede ruim
            // dispararia o email de `alertarFalhasOperacionais` (5 eventos
            // error/fatal em 15 min) sem que nada estivesse em risco.
            registrarAviso(erro, {
              area: 'agenda-barbeiro',
              operacao: 'confirmar',
              ...contextoDoAgendamento(ag),
            }).catch(() => {});
            Alert.alert('Erro', 'Não foi possível confirmar.');
          }
        },
      },
    ]);
  };

  const cancelar = async (ag: Agendamento) => {
    Alert.alert('Cancelar', `Cancelar agendamento de ${ag.clienteNome}?`, [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            await atualizarStatus(ag.id, 'cancelado', { cancelledBy: 'barbeiro' });
            await liberarSlotsDoAgendamento(ag);
            // O aviso ao cliente agora é responsabilidade do trigger reativo
            // `notificarMudancaStatusAgendamento` (functions/index.js),
            // disparado automaticamente na transição para "cancelado" —
            // mandar o WhatsApp também daqui duplicaria a notificação.
            showToast('Agendamento cancelado.', 'info');
            await fetchAgendamentos();
          } catch (erro) {
            // NÍVEL 'error': quem falha aqui é `atualizarStatus` —
            // `liberarSlotsDoAgendamento` engole o próprio erro e nunca
            // rejeita. Ou seja, cair neste catch significa que o agendamento
            // que o barbeiro decidiu cancelar continua ATIVO: o horário segue
            // bloqueado e o cliente segue achando que tem hora marcada. Se o
            // barbeiro não repetir o toque, alguém aparece na barbearia para
            // um atendimento que não existe mais. É a diferença para
            // 'confirmar' logo acima: ali nada diverge, aqui as duas pontas
            // ficam com versões diferentes da realidade.
            registrarErro(erro, {
              area: 'agenda-barbeiro',
              operacao: 'cancelar',
              ...contextoDoAgendamento(ag),
            }).catch(() => {});
            Alert.alert('Erro', 'Não foi possível cancelar.');
          }
        },
      },
    ]);
  };

  const concluir = async (ag: Agendamento) => {
    Alert.alert('Concluir', `Marcar atendimento de ${ag.clienteNome} como concluído?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Concluir',
        onPress: async () => {
          try {
            // DB-09: status:'concluido' e comissaoCentavos só podem ser
            // gravados pela Cloud Function concluirAgendamentoSeguro —
            // firestore.rules bloqueia essa escrita direta pelo barbeiro/dono
            // (naoTransicionaParaConcluido() + comissaoInalterada()), então
            // uma escrita direta via atualizarStatus ficaria travada assim que
            // as regras forem implantadas. O cálculo de comissão (busca do
            // membro da equipe,
            // ComissaoService) agora é 100% responsabilidade do servidor —
            // a tela só dispara a chamada e reage ao resultado.
            await httpsCallable<{ agendamentoId: string }, { sucesso: boolean }>(
              functions,
              'concluirAgendamentoSeguro',
            )({ agendamentoId: ag.id });
            showToast('Atendimento concluído.');
            await fetchAgendamentos();
          } catch (erro) {
            // NÍVEL 'error', o mais grave dos três desta tela: o atendimento
            // foi PRESTADO e a conclusão não entrou. Sem ela não há
            // `concludedAt`, o servidor não calcula a comissão e o
            // faturamento não aparece no relatório. Se o barbeiro não repetir
            // o toque, o dinheiro some do relatório sem deixar rastro — é a
            // única das seis falhas desta missão em que o prejuízo é direto.
            //
            // Por que NÃO 'fatal': 'fatal' não é usado em lugar nenhum do app
            // hoje, é o nível reservado para dano irreversível. Aqui nada foi
            // corrompido (a Function é transacional do lado do servidor) e a
            // operação é integralmente repetível. Gastar 'fatal' numa falha
            // retentável esvaziaria o único nível que ainda significa "pare
            // tudo agora".
            //
            // `codigo` é o campo que separa "a regra negou"
            // (functions/permission-denied) de "a rede caiu"
            // (functions/unavailable) — o `code` do erro não aparece na
            // mensagem, e sem ele o evento não diz o que fazer. É campo de
            // primeira classe de `ContextoObservabilidade` e está protegido
            // contra descarte em `utils/sanitizacao.ts`.
            const codigo = typeof (erro as { code?: unknown })?.code === 'string'
              ? (erro as { code: string }).code
              : undefined;
            registrarErro(erro, {
              area: 'agenda-barbeiro',
              operacao: 'concluir',
              codigo,
              ...contextoDoAgendamento(ag),
            }).catch(() => {});
            Alert.alert('Erro', 'Não foi possível concluir.');
          }
        },
      },
    ]);
  };

  const barbeiroUid = auth.currentUser?.uid ?? '';

  const renderAgendamento = ({ item }: { item: Agendamento }) => (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.clienteInfo}>
          <View style={s.avatarWrap}>
            <AvatarIlustrado id={item.id} nome={item.clienteNome || 'Cliente'} size={40} />
          </View>
          <View style={s.clienteDetails}>
            <Text style={s.clienteNome}>{item.clienteNome || 'Cliente'}</Text>
            <Text style={s.clienteEmail}>{item.cliente}</Text>
          </View>
        </View>
        <View
          style={[s.statusBadge, { backgroundColor: getStatusColor(item.status) }]}
          accessibilityLabel={`Status: ${getStatusText(item.status)}`}
        >
          <Text style={s.statusText}>{getStatusText(item.status)}</Text>
        </View>
      </View>

      <View style={s.cardBody}>
        {negocioId && item.barbeiroNome && (
          <View style={s.infoRow}>
            <Icone nome="barbearia" tamanho={16} cor={theme.colors.primary} decorativo />
            <Text style={s.infoProfissional}>{item.barbeiroNome}</Text>
          </View>
        )}
        <View style={s.infoRow}>
          <Icone nome="calendario" tamanho={16} cor={theme.colors.text} decorativo />
          <Text style={s.infoData}>{item.data} às {item.horario}</Text>
        </View>
        <View style={s.infoRow}>
          <Icone nome="tesoura" tamanho={16} cor={theme.colors.textSecondary} decorativo />
          <Text style={s.infoServico}>{item.servico || 'Corte e barba'} · {formatPreco(item)}</Text>
        </View>
        <Text style={s.infoCreated}>Solicitado em: {formatDateTime(item.createdAt)}</Text>
        {item.clienteUid ? (
          <TouchableOpacity
            style={s.verHistoricoRow}
            onPress={() =>
              navigation.navigate('HistoricoCliente', {
                clienteUid: item.clienteUid,
                clienteNome: item.clienteNome,
                barbeiroId: item.barbeiroId || barbeiroUid,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Ver histórico de ${item.clienteNome || 'cliente'}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icone nome="lista" tamanho={16} cor={theme.colors.primary} decorativo />
            <Text style={s.verHistorico}>Ver histórico do cliente</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {item.status === 'pendente' && (
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btn, s.btnConfirmar]}
            onPress={() => confirmar(item)}
            accessibilityRole="button"
            accessibilityLabel={`Confirmar agendamento de ${item.clienteNome || 'cliente'}`}
            accessibilityHint="Envia uma notificação ao cliente"
          >
            <Text style={s.btnText}>Confirmar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.btnCancelar]}
            onPress={() => cancelar(item)}
            accessibilityRole="button"
            accessibilityLabel={`Cancelar agendamento de ${item.clienteNome || 'cliente'}`}
            accessibilityHint="Libera o horário e avisa o cliente, não pode ser desfeito"
          >
            <Text style={s.btnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.status === 'confirmado' && (
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btn, s.btnConcluir]}
            onPress={() => concluir(item)}
            accessibilityRole="button"
            accessibilityLabel={`Marcar atendimento de ${item.clienteNome || 'cliente'} como concluído`}
          >
            <Text style={s.btnText}>Marcar Concluído</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.btnCancelar]}
            onPress={() => cancelar(item)}
            accessibilityRole="button"
            accessibilityLabel={`Cancelar agendamento de ${item.clienteNome || 'cliente'}`}
            accessibilityHint="Libera o horário e avisa o cliente, não pode ser desfeito"
          >
            <Text style={s.btnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <SkeletonList count={4} />
      </SafeAreaView>
    );
  }

  const barbeiroNome = userProfile?.nome
    ? userProfile.nome.split(' ')[0]
    : 'Barbeiro';

  const agendamentosExibidos = filtroRapido === 'pendentes'
    ? agendamentosPendentes
    : filtroRapido === 'confirmados'
      ? agendamentosConfirmadosHoje
      : dataFiltro
        ? agendamentos.filter((ag) => ag.data === dataFiltro)
        : agendamentos;

  const textoDoFiltro = filtroRapido === 'pendentes'
    ? 'Mostrando todos os pendentes'
    : filtroRapido === 'confirmados'
      ? 'Mostrando confirmados de hoje'
      : dataFiltro
        ? `Mostrando ${dataFiltro} · toque para limpar filtro`
        : null;

  const tituloVazio = filtroRapido === 'pendentes'
    ? 'Nenhum agendamento pendente'
    : filtroRapido === 'confirmados'
      ? 'Nenhum agendamento confirmado para hoje'
      : dataFiltro
        ? 'Nenhum agendamento nesse dia'
        : 'Nenhum agendamento';

  const descricaoVazia = filtroRapido || dataFiltro
    ? 'Toque no chip acima para ver todos os agendamentos.'
    : 'Os agendamentos dos clientes aparecerão aqui.\nConfigure seus serviços na aba Configurações.';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header simples — sem botões de navegação (movidos para tabs) */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Olá, {barbeiroNome}!</Text>
          <Text style={s.title}>Agenda</Text>
        </View>
        <TouchableOpacity
          style={s.novoAgendamentoButton}
          onPress={() => navigation.navigate('AgendamentoManual')}
          accessibilityRole="button"
          accessibilityLabel="Novo agendamento manual"
        >
          {/* '＋' é caractere tipográfico (fullwidth plus sign), não emoji —
              fora do escopo do mapa de substituição; não há ícone "adicionar"
              no MAPA_ICONES para trocar sem inventar nome novo. */}
          <Text style={s.novoAgendamentoButtonText}>＋ Agendar</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={s.stats}>
        <TouchableOpacity
          style={[s.statCard, filtroRapido === 'pendentes' && s.statCardSelected]}
          onPress={() => handleFiltroRapido('pendentes')}
          accessibilityRole="button"
          accessibilityLabel="Filtrar agendamentos pendentes"
          accessibilityState={{ selected: filtroRapido === 'pendentes' }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.statNumber}>{stats.pendentes}</Text>
          <Text style={s.statLabel}>Pendentes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.statCard, filtroRapido === 'confirmados' && s.statCardSelected]}
          onPress={() => handleFiltroRapido('confirmados')}
          accessibilityRole="button"
          accessibilityLabel="Filtrar agendamentos confirmados de hoje"
          accessibilityState={{ selected: filtroRapido === 'confirmados' }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.statNumber}>{stats.confirmados}</Text>
          <Text style={s.statLabel}>Confirmados</Text>
        </TouchableOpacity>
        <View style={s.statCard}>
          <Text style={s.statNumber}>{stats.total}</Text>
          <Text style={s.statLabel}>Total</Text>
        </View>
      </View>

      <TouchableOpacity
        style={s.toggleCalendario}
        onPress={() => setShowCalendario((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={showCalendario ? 'Ocultar calendário' : 'Ver calendário'}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icone nome="calendario" tamanho={16} cor={theme.colors.primary} decorativo />
        <Text style={s.toggleCalendarioText}>
          {showCalendario ? 'Ocultar calendário' : 'Ver calendário'}
        </Text>
      </TouchableOpacity>

      {showCalendario && (
        <CalendarioMensal
          mes={calMes}
          ano={calAno}
          diasStatus={diasStatus}
          selectedDate={dataFiltro}
          onSelectDate={handleSelectDate}
          onChangeMonth={handleChangeMonth}
          loading={calendarioLoading}
        />
      )}

      {textoDoFiltro && (
        <TouchableOpacity
          style={s.filtroChip}
          onPress={() => {
            setDataFiltro(null);
            setFiltroRapido(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Limpar filtro de agendamentos"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.filtroChipText}>
            {textoDoFiltro}
          </Text>
          <Icone nome="fechar" tamanho={16} cor={theme.colors.primary} decorativo />
        </TouchableOpacity>
      )}

      <FlatList
        data={agendamentosExibidos}
        keyExtractor={(item) => item.id}
        renderItem={renderAgendamento}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Icone nome="lista" tamanho={32} cor={theme.colors.textMuted} decorativo />
            </View>
            <Text style={s.emptyTitle}>
              {tituloVazio}
            </Text>
            <Text style={s.emptyDesc}>
              {descricaoVazia}
            </Text>
          </View>
        }
        contentContainerStyle={agendamentosExibidos.length === 0 && s.emptyContainer}
      />
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  greeting: { fontSize: 14, color: theme.colors.textSecondary },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  novoAgendamentoButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  // Texto sobre fundo `primary` saturado — token consolidado na Fase 1
  // (preto, não branco: contraste medido em ThemeContext.tsx).
  novoAgendamentoButtonText: {
    color: theme.colors.textSobrePrimaria,
    fontSize: 14,
    fontWeight: '700',
  },
  toggleCalendario: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  toggleCalendarioText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  filtroChip: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary + '20',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  filtroChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  stats: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    elevation: 2,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  statCardSelected: {
    backgroundColor: theme.colors.surfaceVariant,
    borderColor: theme.colors.primary,
  },
  statNumber: { fontSize: 24, fontWeight: '800', color: theme.colors.primary },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clienteInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarWrap: { marginRight: 12 },
  clienteDetails: { flex: 1 },
  clienteNome: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  clienteEmail: { fontSize: 14, color: theme.colors.textSecondary },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  // Texto sobre badge de status com cor dinâmica (`getStatusColor`) — todas
  // as cores de STATUS_MAP são saturadas o bastante para texto branco
  // (nenhuma é o âmbar de `primary`/`secondary`), por isso usa o mesmo token
  // de destaque.
  statusText: { color: theme.colors.textSobreDestaque, fontSize: 12, fontWeight: '700' },
  cardBody: { marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  infoProfissional: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  infoData: { fontSize: 16, color: theme.colors.text },
  infoServico: { fontSize: 14, color: theme.colors.textSecondary },
  infoCreated: { fontSize: 12, color: theme.colors.textMuted },
  verHistoricoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  verHistorico: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  btnConfirmar: { backgroundColor: theme.colors.success },
  btnCancelar: { backgroundColor: theme.colors.error },
  // '#8e44ad' (roxo) sem token equivalente no tema (só há
  // primary/secondary/success/warning/error/info) — cor distintiva
  // proposital para a ação "Concluir", documentada no relatório da Fase 1.
  btnConcluir: { backgroundColor: '#8e44ad' },
  // Texto sobre success/error/roxo decorativo — todos saturados o bastante
  // para texto branco, por isso usa o token de destaque.
  btnText: { color: theme.colors.textSobreDestaque, fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  emptyDesc: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
});
