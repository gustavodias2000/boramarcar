/**
 * AgendamentoScreen — cliente agenda um horário com o barbeiro.
 *
 * Melhorias implementadas (competitivo InBarber):
 *  - Seletor de serviço: mostra lista de ServicoBarbeiro do barbeiro
 *  - Agendamento inteligente: slots gerados com base na duração do serviço
 *  - Respeita: intervalo de almoço, antecedência mínima/máxima, dias de atendimento
 *  - Verifica se o cliente está banido pelo barbeiro antes de permitir agendamento
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { registrarErro } from '../services/ObservabilityService';
import Icone from '../components/Icone';
import PaymentModal from '../components/PaymentModal';
import IndicadorPasso from '../components/agendamento/IndicadorPasso';
import GradeHorarios from '../components/agendamento/GradeHorarios';
import BotaoComEscala from '../components/BotaoComEscala';
import { getHorariosOcupados, liberarSlotsDoAgendamento } from '../services/OcupacaoService';
import { criarAgendamento, atualizarStatus } from '../data/repositories/AgendamentoRepository';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { estaBanido } from '../data/repositories/BanimentoRepository';
import { entrarNaFila, jaEstaNaFila } from '../data/repositories/ListaEsperaRepository';
import useUserProfile from '../hooks/useUserProfile';
import { formatMoney, toLocalDateString } from '../utils/dateUtils';
import {
  gerarSlots,
  getDatesDisponiveis,
  filtrarBloqueiosHorario,
  isTimeInPast as isTimeInPastUtil,
  timeToMinutes,
  minutesToTime,
} from '../utils/agendaSlots';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  RootStackParamList,
  NovoAgendamento,
  ServicoBarbeiro,
  ConfiguracaoAgenda,
  BloqueioHorario,
} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Agendamento'>;

// ─── Componente ──────────────────────────────────────────────────────────────

const CONFIG_PADRAO: ConfiguracaoAgenda = {
  horaInicio: '09:00',
  horaFim: '18:00',
  almocoInicio: '12:00',
  almocoFim: '13:00',
  antecedenciaMinutos: 30,
  antecedenciaMaximaDias: 30,
  diasAtendimento: [1, 2, 3, 4, 5, 6],
};

export default function AgendamentoScreen({ route, navigation }: Props) {
  const { barbeiro, servicoId } = route.params;
  const { theme } = useTheme();
  const s = getStyles(theme);

  const { profile: userProfile } = useUserProfile();
  const scrollRef = useRef<ScrollView>(null);
  // Identifica a requisição de horários "atual" — evita que uma resposta
  // fora de ordem (o usuário trocou de data/serviço rápido demais) sobrescreva
  // a lista com horários de um filtro que não é mais o selecionado.
  const requisicaoHorariosRef = useRef(0);

  const [config, setConfig] = useState<ConfiguracaoAgenda>(CONFIG_PADRAO);
  const [servicos, setServicos] = useState<ServicoBarbeiro[]>([]);
  const [servicoSelecionado, setServicoSelecionado] = useState<ServicoBarbeiro | null>(null);
  // true quando o serviço já veio escolhido do PerfilProfissionalScreen (um
  // `servicoId` da rota que bate com um serviço real do barbeiro) — nesse
  // caso a etapa "Selecione o Serviço" é pulada. Reagendamento e o deep link
  // de QR Code nunca passam `servicoId`, então continuam mostrando a etapa.
  const [servicoPreSelecionado, setServicoPreSelecionado] = useState(false);
  const [datesDisponiveis, setDatesDisponiveis] = useState<Array<{ date: string; display: string }>>([]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [createdAgendamento, setCreatedAgendamento] = useState<(NovoAgendamento & { id?: string }) | null>(null);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [mensagemPosAgendamento, setMensagemPosAgendamento] = useState<string | null>(null);
  const [bloqueiosHorario, setBloqueiosHorario] = useState<BloqueioHorario[]>([]);
  const [banner, setBanner] = useState<{ texto: string; ativo: boolean } | null>(null);

  const todayStr = toLocalDateString(new Date());

  // ─── Carrega configuração e serviços do barbeiro ──────────────────────────

  useEffect(() => {
    loadBarbeiroDados();
    // Carga única na montagem: lê apenas `barbeiro.id` (parâmetro da rota) e o
    // usuário logado — nada que mude durante a vida da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBarbeiroDados = async () => {
    try {
      const uid = auth.currentUser?.uid;
      // `getBarbeiro` e `estaBanido` não dependem um do outro — só o
      // fallback legado (`dados?.clientesBanidos`) depende de `dados`.
      // Dispara as duas leituras em paralelo em vez de sequenciais.
      const [dados, banidoDireto] = await Promise.all([
        getBarbeiro(barbeiro.id),
        estaBanido(barbeiro.id, uid),
      ]);

      // Verifica se o cliente está banido.
      // Lê a subcoleção privada (só o próprio uid é legível) e, enquanto o
      // profissional não abriu a tela que dispara a migração, ainda respeita
      // o array legado que possa restar no documento.
      const banido =
        banidoDireto || !!(uid && dados?.clientesBanidos?.some((b) => b.uid === uid));
      if (banido) {
        Alert.alert(
          'Acesso bloqueado',
          'Você não pode agendar com este barbeiro.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
        return;
      }

      const cfg = dados?.configuracaoAgenda ?? CONFIG_PADRAO;
      setConfig(cfg);

      const svcs = dados?.servicos ?? [];
      setServicos(svcs);
      if (svcs.length > 0) {
        const preSelecionado = servicoId ? svcs.find((sv) => sv.id === servicoId) : undefined;
        setServicoSelecionado(preSelecionado ?? svcs[0]);
        setServicoPreSelecionado(!!preSelecionado);
      }

      setMensagemPosAgendamento(dados?.mensagemPosAgendamento ?? null);
      setBloqueiosHorario(dados?.bloqueiosHorario ?? []);
      setBanner(dados?.bannerPromocional?.ativo && dados?.bannerPromocional?.texto ? dados.bannerPromocional : null);

      const dates = getDatesDisponiveis(cfg, dados?.datasBloqueadas ?? []);
      setDatesDisponiveis(dates);
      if (dates.length > 0) setSelectedDate(dates[0].date);
    } catch (error) {
      registrarErro(error, { area: 'agendamento', operacao: 'carregar-profissional' }).catch(() => {});
      // Fallback gracioso: usa defaults
      const dates = getDatesDisponiveis(CONFIG_PADRAO);
      setDatesDisponiveis(dates);
      if (dates.length > 0) setSelectedDate(dates[0].date);
    } finally {
      setLoading(false);
    }
  };

  // ─── Atualiza horários quando muda data ou serviço ───────────────────────

  useEffect(() => {
    if (selectedDate && servicoSelecionado) {
      setWaitlistJoined(false);
      fetchHorariosDisponiveis();
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 260, animated: true });
      }, 150);
    }
    // `fetchHorariosDisponiveis` lê `config` e `bloqueios`, gravados por
    // `loadBarbeiroDados` no mesmo lote de render que `selectedDate` — quando
    // este efeito roda a função já enxerga os valores atualizados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, servicoSelecionado]);

  /**
   * Verifica se um horário já passou, considerando a antecedência mínima do barbeiro.
   */
  const isTimeInPast = (horario: string): boolean =>
    isTimeInPastUtil(horario, selectedDate ?? '', todayStr, config.antecedenciaMinutos);

  const fetchHorariosDisponiveis = async () => {
    if (!servicoSelecionado || !selectedDate) return;
    const minhaRequisicao = ++requisicaoHorariosRef.current;
    setLoadingHorarios(true);
    try {
      let todosOsSlots = gerarSlots(config, servicoSelecionado.duracaoMinutos);
      todosOsSlots = filtrarBloqueiosHorario(
        todosOsSlots,
        servicoSelecionado.duracaoMinutos,
        selectedDate,
        bloqueiosHorario,
      );
      const ocupados = await getHorariosOcupados(barbeiro.id, selectedDate);
      // Resposta obsoleta (usuário trocou de data/serviço enquanto esta
      // requisição estava em andamento): descarta, quem manda é a mais recente.
      if (minhaRequisicao !== requisicaoHorariosRef.current) return;

      // Um slot está ocupado se qualquer sub-slot de 30 min dentro dele está bloqueado
      const slotsLivres = todosOsSlots.filter((slot) => {
        if (isTimeInPast(slot)) return false;
        // Verifica se o slot (ou os sub-slots cobertos por ele) está ocupado
        const slotMin = timeToMinutes(slot);
        for (let i = 0; i < servicoSelecionado.duracaoMinutos; i += 30) {
          const subSlot = minutesToTime(slotMin + i);
          if (ocupados.includes(subSlot)) return false;
        }
        return true;
      });

      setAvailableTimes(slotsLivres);
      setSelectedTime(null);
    } catch (error) {
      if (minhaRequisicao !== requisicaoHorariosRef.current) return;
      registrarErro(error, { area: 'agendamento', operacao: 'buscar-horarios' }).catch(() => {});
      setAvailableTimes([]);
    } finally {
      if (minhaRequisicao === requisicaoHorariosRef.current) {
        setLoadingHorarios(false);
      }
    }
  };

  // ─── Lista de espera ─────────────────────────────────────────────────────

  const handleEntrarFila = async () => {
    if (!selectedDate || !servicoSelecionado) {
      Alert.alert('Atenção', 'Selecione uma data e um serviço antes de entrar na lista.');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Erro', 'Usuário não autenticado.');
      return;
    }
    try {
      const jaEsta = await jaEstaNaFila(barbeiro.id, uid, selectedDate);
      if (jaEsta) {
        Alert.alert('Aviso', 'Você já está na lista de espera para esta data.');
        setWaitlistJoined(true);
        return;
      }
      const userEmail = auth.currentUser?.email || '';
      const clienteNome = userProfile?.nome || userEmail.split('@')[0];
      await entrarNaFila({
        barbeiroId: barbeiro.id,
        clienteUid: uid,
        clienteNome,
        clienteEmail: userEmail,
        clienteTelefone: userProfile?.telefone,
        data: selectedDate,
        servicoId: servicoSelecionado.id,
        servicoNome: servicoSelecionado.nome,
      });
      setWaitlistJoined(true);
      Alert.alert(
        'Lista de espera!',
        `Você foi adicionado à lista de espera para ${selectedDate}. ${barbeiro.nome} irá te notificar quando abrir um horário.`,
      );
    } catch (error) {
      registrarErro(error, { area: 'agendamento', operacao: 'entrar-lista-espera' }).catch(() => {});
      Alert.alert('Erro', 'Não foi possível entrar na lista de espera. Tente novamente.');
    }
  };

  // ─── Confirmação do agendamento ───────────────────────────────────────────

  const confirmarAgendamento = async () => {
    if (!selectedDate || !selectedTime) {
      Alert.alert('Atenção', 'Selecione uma data e um horário.');
      return;
    }
    if (!servicoSelecionado) {
      Alert.alert('Atenção', 'Selecione um serviço.');
      return;
    }

    setLoading(true);
    try {
      const userEmail = auth.currentUser?.email;
      if (!userEmail) {
        Alert.alert('Erro', 'Usuário não autenticado.');
        return;
      }

      const clienteNome = userProfile?.nome || userEmail.split('@')[0];
      const clienteTelefone = userProfile?.telefone || '';
      const barbeiroTelefone = barbeiro.telefone || '';

      const novoAgendamento: NovoAgendamento = {
        barbeiroId: barbeiro.id,
        barbeiroNome: barbeiro.nome,
        barbeiroTelefone,
        // Denormalizado (só quando existir) para permitir ao dono da equipe
        // ver e gerenciar este agendamento, e para o relatório de comissões.
        // Evita gravar `negocioId: undefined` explicitamente no Firestore.
        ...(barbeiro.negocioId ? { negocioId: barbeiro.negocioId } : {}),
        cliente: userEmail,
        clienteUid: auth.currentUser?.uid || '',
        clienteNome,
        clienteTelefone,
        status: 'pendente',
        data: selectedDate,
        horario: selectedTime,
        servico: servicoSelecionado.nome,
        servicoId: servicoSelecionado.id,
        preco: (servicoSelecionado.precoEmCentavos / 100).toFixed(2).replace('.', ','),
        precoEmCentavos: servicoSelecionado.precoEmCentavos,
      };

      const novoId = await criarAgendamento(novoAgendamento);

      // Reagendamento: o agendamento antigo só é cancelado DEPOIS que o novo
      // já foi criado com sucesso — nunca antes, para o cliente nunca ficar
      // sem nenhum agendamento se algo falhar no meio do caminho. Falha aqui
      // não desfaz o novo agendamento (que já é válido); só loga.
      const agendamentoParaSubstituir = route.params?.agendamentoParaSubstituir;
      if (agendamentoParaSubstituir) {
        try {
          await atualizarStatus(agendamentoParaSubstituir.id, 'cancelado', { cancelledBy: 'cliente' });
          await liberarSlotsDoAgendamento(agendamentoParaSubstituir);
        } catch (erroCancelamentoAntigo) {
          registrarErro(erroCancelamentoAntigo, { area: 'agendamento', operacao: 'cancelar-antigo-no-reagendamento' }).catch(() => {});
        }
      }

      setCreatedAgendamento({ ...novoAgendamento, id: novoId } as NovoAgendamento & { id: string });
      setShowPaymentModal(true);
    } catch (error) {
      if ((error as { code?: string })?.code === 'functions/already-exists') {
        setSelectedTime('');
        await fetchHorariosDisponiveis();
        Alert.alert(
          'Horário já ocupado',
          'Alguém confirmou este horário enquanto você escolhia. Selecione outro, por favor.',
        );
        return;
      }
      registrarErro(error, { area: 'agendamento', operacao: 'criar-reserva' }).catch(() => {});
      Alert.alert('Erro', 'Não foi possível realizar o agendamento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async () => {
    if (!createdAgendamento) return;
    const agendamentoFeito = createdAgendamento;

    // O aviso ao profissional (e ao dono, quando é equipe) agora é
    // responsabilidade do trigger reativo `notificarAgendamentoCriado`
    // (functions/index.js), disparado automaticamente na criação do
    // agendamento — mandar o WhatsApp também daqui duplicaria a notificação.
    navigation.replace('AgendamentoConfirmado', {
      agendamento: agendamentoFeito,
      barbeiro,
      whatsappEnviado: false,
      mensagemPosAgendamento,
    });
  };

  // ─── Indicador de passo (Fase 2 — design) ─────────────────────────────────
  // Serviço e Data já chegam com um valor padrão assim que os dados carregam
  // (primeiro serviço/primeira data disponível) — o único passo realmente
  // pendente até o cliente agir é o Horário, depois a Confirmação. Por isso o
  // passo "atual" é derivado só de `selectedTime`, não precisa de estado novo.
  const PASSOS_CHAVE = servicoPreSelecionado
    ? (['data', 'horario', 'confirmacao'] as const)
    : (['servico', 'data', 'horario', 'confirmacao'] as const);
  const ROTULO_PASSO: Record<string, string> = {
    servico: 'Serviço',
    data: 'Data',
    horario: 'Horário',
    confirmacao: 'Confirmação',
  };
  const passoAtual = PASSOS_CHAVE.indexOf(selectedTime ? 'confirmacao' : 'horario');

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
      <ScrollView ref={scrollRef} style={s.container}>
        {/* Cabeçalho do barbeiro */}
        <View style={s.header}>
          <Text style={s.title}>Agendar com {barbeiro.nome}</Text>
          <Text style={s.subtitle}>
            {servicoPreSelecionado && servicoSelecionado
              ? servicoSelecionado.nome
              : barbeiro.especialidade || 'Barbearia'}
          </Text>
        </View>

        {servicos.length > 0 && (
          <IndicadorPasso
            passos={PASSOS_CHAVE.map((chave) => ROTULO_PASSO[chave])}
            passoAtual={passoAtual}
          />
        )}

        {/* Banner promocional configurado pelo barbeiro */}
        {banner && (
          <View style={s.promoBanner}>
            <View style={s.promoBannerIcon}>
              <Icone nome="preco" tamanho={20} cor={theme.colors.textSobrePrimaria} decorativo />
            </View>
            <Text style={s.promoBannerText}>{banner.texto}</Text>
          </View>
        )}

        {/* Aviso quando barbeiro não tem serviços cadastrados */}
        {servicos.length === 0 && !loading && (
          <View style={s.alertBanner}>
            <View style={s.alertBannerIcon}>
              <Icone nome="aviso" tamanho={20} cor={theme.colors.bannerWarningText} decorativo />
            </View>
            <View style={s.alertBannerText}>
              <Text style={s.alertBannerTitle}>Serviços não configurados</Text>
              <Text style={s.alertBannerDesc}>
                Este barbeiro ainda não cadastrou os serviços disponíveis. Tente novamente mais tarde ou entre em contato.
              </Text>
            </View>
          </View>
        )}

        {/* Seleção de serviço — pulada quando o cliente já escolheu o serviço
            em PerfilProfissionalScreen (servicoPreSelecionado) */}
        {servicos.length > 0 && !servicoPreSelecionado && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Selecione o Serviço</Text>
            {servicos.map((sv) => (
              <TouchableOpacity
                key={sv.id}
                style={[
                  s.servicoCard,
                  servicoSelecionado?.id === sv.id && s.servicoCardSelected,
                ]}
                onPress={() => {
                  setServicoSelecionado(sv);
                  setSelectedTime(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Serviço ${sv.nome}, ${sv.duracaoMinutos} minutos, ${formatMoney(sv.precoEmCentavos)}`}
                accessibilityState={{ selected: servicoSelecionado?.id === sv.id }}
              >
                <View style={s.servicoInfo}>
                  <Text
                    style={[
                      s.servicoNome,
                      servicoSelecionado?.id === sv.id && s.servicoNomeSelected,
                    ]}
                  >
                    {sv.nome}
                  </Text>
                  <Text
                    style={[
                      s.servicoMeta,
                      servicoSelecionado?.id === sv.id && s.servicoMetaSelected,
                    ]}
                  >
                    ⏱ {sv.duracaoMinutos} min
                  </Text>
                </View>
                <Text
                  style={[
                    s.servicoPreco,
                    servicoSelecionado?.id === sv.id && s.servicoPrecoSelected,
                  ]}
                >
                  {formatMoney(sv.precoEmCentavos)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Seleção de data */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Selecione a Data</Text>
          {datesDisponiveis.length === 0 ? (
            <Text style={s.noDatesText}>
              Nenhuma data disponível. O barbeiro ainda não configurou a agenda.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dateScroll}>
              {datesDisponiveis.map((day) => (
              <TouchableOpacity
                key={day.date}
                testID="date-button"
                  style={[
                    s.dateButton,
                    selectedDate === day.date && s.selectedDateButton,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Data ${day.display}`}
                  accessibilityState={{ selected: selectedDate === day.date }}
                  onPress={() => setSelectedDate(day.date)}
                >
                  <Text
                    style={[
                      s.dateButtonText,
                      selectedDate === day.date && s.selectedDateButtonText,
                    ]}
                  >
                    {day.display}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Seleção de horário */}
        {selectedDate && (
          <GradeHorarios
            availableTimes={availableTimes}
            selectedTime={selectedTime}
            loadingHorarios={loadingHorarios}
            selectedDate={selectedDate}
            todayStr={todayStr}
            waitlistJoined={waitlistJoined}
            onSelectTime={setSelectedTime}
            onEntrarFila={handleEntrarFila}
          />
        )}

        {/* Modal de pagamento */}
        <PaymentModal
          visible={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setCreatedAgendamento(null);
          }}
          agendamento={createdAgendamento}
          onPaymentSuccess={handlePaymentSuccess}
        />

        {/* Resumo e botão confirmar */}
        {selectedDate && selectedTime && servicoSelecionado ? (
          <View style={s.confirmSection}>
            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>Resumo do Agendamento</Text>
              {[
                { label: 'Barbeiro', value: barbeiro.nome },
                { label: 'Serviço', value: servicoSelecionado.nome },
                { label: 'Duração', value: `${servicoSelecionado.duracaoMinutos} min` },
                { label: 'Data', value: selectedDate },
                { label: 'Horário', value: selectedTime },
              ].map((row) => (
                <View key={row.label} style={s.summaryRow}>
                  <Text style={s.summaryLabel}>{row.label}:</Text>
                  <Text style={s.summaryValue}>{row.value}</Text>
                </View>
              ))}
              <View style={[s.summaryRow, s.summaryTotal]}>
                <Text style={s.summaryTotalLabel}>Total:</Text>
                <Text style={s.summaryPrice}>
                  {formatMoney(servicoSelecionado.precoEmCentavos)}
                </Text>
              </View>
            </View>

            <BotaoComEscala
              testID="confirm-button"
              style={[s.confirmButton, loading && s.confirmButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Confirmar agendamento"
              accessibilityHint="Reserva o horário, o pagamento é combinado presencialmente"
              accessibilityState={{ disabled: loading }}
              onPress={confirmarAgendamento}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.textSobreDestaque} />
              ) : (
                <Text style={s.confirmButtonText}>Confirmar Agendamento</Text>
              )}
            </BotaoComEscala>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      backgroundColor: theme.colors.surface,
      padding: 20,
      borderBottomWidth: 1,
      // UI-002: `theme.colors.border` genérico tem baixo contraste contra
      // `surface` (1.48:1 claro / 1.27:1 escuro) — `headerBorder` é o token
      // dedicado a essa separação, com contraste >=3:1 nos dois temas.
      borderBottomColor: theme.colors.headerBorder,
      alignItems: 'center',
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 4,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textSecondary,
    },
    section: {
      backgroundColor: theme.colors.surface,
      margin: 16,
      padding: 16,
      borderRadius: 14,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 12,
    },
    // Serviços
    servicoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceVariant,
      marginBottom: 8,
    },
    servicoCardSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary + '15',
    },
    servicoInfo: {
      flex: 1,
    },
    servicoNome: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 2,
    },
    servicoNomeSelected: {
      color: theme.colors.primary,
    },
    servicoMeta: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    servicoMetaSelected: {
      color: theme.colors.primary,
    },
    servicoPreco: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.success,
    },
    servicoPrecoSelected: {
      color: theme.colors.primary,
    },
    // Datas
    dateScroll: {
      flexDirection: 'row',
    },
    dateButton: {
      backgroundColor: theme.colors.surfaceVariant,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      marginRight: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minHeight: 44,
      justifyContent: 'center',
    },
    selectedDateButton: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    dateButtonText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    selectedDateButtonText: {
      // Texto sobre botão de data selecionada (fundo `primary` — âmbar).
      color: theme.colors.textSobrePrimaria,
      fontWeight: 'bold',
    },
    noDatesText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 12,
    },
    // Resumo
    confirmSection: {
      margin: 16,
      marginBottom: 32,
    },
    summaryCard: {
      backgroundColor: theme.colors.surface,
      padding: 16,
      borderRadius: 14,
      marginBottom: 16,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    summaryTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 12,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    summaryLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    summaryValue: {
      fontSize: 14,
      color: theme.colors.text,
      fontWeight: '500',
      flex: 1,
      textAlign: 'right',
      marginLeft: 8,
    },
    summaryTotal: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    summaryTotalLabel: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    summaryPrice: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.success,
    },
    confirmButton: {
      backgroundColor: theme.colors.success,
      paddingVertical: 16,
      borderRadius: 10,
      alignItems: 'center',
      minHeight: 52,
      justifyContent: 'center',
    },
    confirmButtonDisabled: {
      backgroundColor: theme.colors.textMuted,
    },
    confirmButtonText: {
      // Texto sobre botão de confirmação (fundo `success`).
      color: theme.colors.textSobreDestaque,
      fontSize: 16,
      fontWeight: 'bold',
    },
    // Banner promocional (configurado pelo barbeiro)
    promoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
      borderRadius: 10,
      padding: 14,
      margin: 16,
      marginBottom: 0,
    },
    promoBannerIcon: {
      marginRight: 10,
    },
    promoBannerText: {
      // Texto sobre banner promocional (fundo `primary` — âmbar).
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textSobrePrimaria,
      lineHeight: 19,
    },
    // Banner de aviso quando barbeiro não tem serviços cadastrados
    alertBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.colors.bannerWarningBackground,
      borderColor: theme.colors.bannerWarningBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: 14,
      margin: 16,
      marginBottom: 0,
    },
    alertBannerIcon: {
      marginRight: 10,
      marginTop: 1,
    },
    alertBannerText: {
      flex: 1,
    },
    alertBannerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.bannerWarningText,
      marginBottom: 3,
    },
    alertBannerDesc: {
      fontSize: 14,
      color: theme.colors.bannerWarningText,
      lineHeight: 18,
    },
  });
