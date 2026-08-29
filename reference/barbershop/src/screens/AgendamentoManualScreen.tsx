/**
 * AgendamentoManualScreen — o próprio barbeiro cria um agendamento em nome
 * de um cliente (walk-in, telefonema, cliente sem o app) — gap competitivo
 * com o Masters: "hoje só o cliente inicia o agendamento".
 *
 * Reaproveita a mesma lógica de geração de slots do fluxo do cliente
 * (src/utils/agendaSlots.ts), incluindo bloqueios de horário e ocupação —
 * a agenda nunca sai de sincronia entre os dois fluxos.
 *
 * O agendamento é criado já como "confirmado": é o próprio barbeiro que
 * está decidindo o horário, não faz sentido pedir confirmação de si mesmo.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { listarClientesDoBarbeiro } from '../data/repositories/ClienteContatoRepository';
import { criarAgendamento } from '../data/repositories/AgendamentoRepository';
import { getHorariosOcupados } from '../services/OcupacaoService';
import useUserProfile from '../hooks/useUserProfile';
import {
  gerarSlots,
  getDatesDisponiveis,
  filtrarBloqueiosHorario,
  isTimeInPast,
  timeToMinutes,
  minutesToTime,
} from '../utils/agendaSlots';
import {
  maskPhone,
  formatPhoneToE164,
  formatPhoneDisplay,
  removerCodigoPaisBrasil,
  formatMoney,
  toLocalDateString,
} from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  RootStackParamList,
  ConfiguracaoAgenda,
  ServicoBarbeiro,
  BloqueioHorario,
  ClienteContato,
  NovoAgendamento,
} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AgendamentoManual'>;

const CONFIG_PADRAO: ConfiguracaoAgenda = {
  horaInicio: '09:00',
  horaFim: '18:00',
  almocoInicio: '12:00',
  almocoFim: '13:00',
  antecedenciaMinutos: 0,
  antecedenciaMaximaDias: 90,
  diasAtendimento: [0, 1, 2, 3, 4, 5, 6],
};

export default function AgendamentoManualScreen({ route, navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const { profile: userProfile } = useUserProfile();
  const { showToast } = useToast();

  const [config, setConfig] = useState<ConfiguracaoAgenda>(CONFIG_PADRAO);
  const [servicos, setServicos] = useState<ServicoBarbeiro[]>([]);
  const [bloqueios, setBloqueios] = useState<BloqueioHorario[]>([]);
  const [clientes, setClientes] = useState<ClienteContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Cliente
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteContato | null>(null);
  const [novoClienteNome, setNovoClienteNome] = useState('');
  const [novoClienteTelefone, setNovoClienteTelefone] = useState('');
  const [modoNovoCliente, setModoNovoCliente] = useState(false);

  // Serviço / data / horário
  const [servicoSelecionado, setServicoSelecionado] = useState<ServicoBarbeiro | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [datesDisponiveis, setDatesDisponiveis] = useState<Array<{ date: string; display: string }>>([]);

  const todayStr = toLocalDateString(new Date());
  const uid = auth.currentUser?.uid;
  // Identifica a requisição de horários "atual" — evita que uma resposta
  // fora de ordem (o barbeiro trocou de data/serviço rápido demais)
  // sobrescreva a lista com horários de um filtro que não é mais o selecionado.
  const requisicaoHorariosRef = useRef(0);

  useEffect(() => {
    carregarDados();
    // Carga única na montagem: `carregarDados` lê apenas `uid` e `route.params`,
    // que não mudam enquanto a tela está aberta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregarDados = async () => {
    try {
      if (!uid) return;
      const [dados, listaClientes] = await Promise.all([
        getBarbeiro(uid),
        listarClientesDoBarbeiro(uid),
      ]);
      const cfg = dados?.configuracaoAgenda ?? CONFIG_PADRAO;
      setConfig(cfg);
      setBloqueios(dados?.bloqueiosHorario ?? []);
      const svcs = dados?.servicos ?? [];
      setServicos(svcs);
      if (svcs.length > 0) setServicoSelecionado(svcs[0]);
      setClientes(listaClientes);

      const dates = getDatesDisponiveis(cfg, dados?.datasBloqueadas ?? []);
      setDatesDisponiveis(dates);
      if (dates.length > 0) setSelectedDate(dates[0].date);

      // Pré-preenche cliente vindo de ClientesScreen (ação "Agendar")
      if (route.params?.clienteId) {
        const preSelecionado = listaClientes.find((c) => c.id === route.params?.clienteId);
        if (preSelecionado) setClienteSelecionado(preSelecionado);
      } else if (route.params?.clienteNome) {
        setModoNovoCliente(true);
        setNovoClienteNome(route.params.clienteNome);
        if (route.params.clienteTelefone) {
          setNovoClienteTelefone(maskPhone(removerCodigoPaisBrasil(route.params.clienteTelefone)));
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados para agendamento manual:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDate && servicoSelecionado) fetchHorarios();
    // `config` e `bloqueios` são gravados por `carregarDados` no mesmo lote de
    // `selectedDate`, então a função já enxerga os valores novos quando roda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, servicoSelecionado]);

  const fetchHorarios = async () => {
    if (!uid || !servicoSelecionado || !selectedDate) return;
    const minhaRequisicao = ++requisicaoHorariosRef.current;
    setLoadingHorarios(true);
    try {
      let slots = gerarSlots(config, servicoSelecionado.duracaoMinutos);
      slots = filtrarBloqueiosHorario(slots, servicoSelecionado.duracaoMinutos, selectedDate, bloqueios);
      const ocupados = await getHorariosOcupados(uid, selectedDate);
      // Resposta obsoleta (o barbeiro trocou de data/serviço enquanto esta
      // requisição estava em andamento): descarta, quem manda é a mais recente.
      if (minhaRequisicao !== requisicaoHorariosRef.current) return;

      const livres = slots.filter((slot) => {
        if (isTimeInPast(slot, selectedDate, todayStr, config.antecedenciaMinutos)) return false;
        const slotMin = timeToMinutes(slot);
        for (let i = 0; i < servicoSelecionado.duracaoMinutos; i += 30) {
          if (ocupados.includes(minutesToTime(slotMin + i))) return false;
        }
        return true;
      });
      setAvailableTimes(livres);
      setSelectedTime(null);
    } catch (error) {
      if (minhaRequisicao !== requisicaoHorariosRef.current) return;
      console.error('Erro ao buscar horários:', error);
      setAvailableTimes([]);
    } finally {
      if (minhaRequisicao === requisicaoHorariosRef.current) {
        setLoadingHorarios(false);
      }
    }
  };

  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente.trim()) return clientes;
    const termo = buscaCliente.trim().toLowerCase();
    return clientes.filter((c) => c.nome.toLowerCase().includes(termo));
  }, [clientes, buscaCliente]);

  const handleConfirmar = async () => {
    if (!uid || !servicoSelecionado || !selectedDate || !selectedTime) {
      Alert.alert('Atenção', 'Selecione o serviço, a data e o horário.');
      return;
    }
    const nomeCliente = modoNovoCliente ? novoClienteNome.trim() : clienteSelecionado?.nome;
    if (!nomeCliente) {
      Alert.alert('Atenção', 'Selecione um cliente da lista ou informe o nome.');
      return;
    }
    const telefoneCliente = modoNovoCliente
      ? (novoClienteTelefone ? formatPhoneToE164(novoClienteTelefone) : undefined)
      : clienteSelecionado?.telefone;

    setSalvando(true);
    try {
      const dados = await getBarbeiro(uid);
      const barbeiroNome = userProfile?.nome || dados?.nome || 'Barbeiro';

      const novoAgendamento: NovoAgendamento = {
        barbeiroId: uid,
        barbeiroNome,
        barbeiroTelefone: dados?.telefone || '',
        ...(dados?.negocioId ? { negocioId: dados.negocioId } : {}),
        cliente: '',
        clienteUid: '',
        clienteNome: nomeCliente,
        ...(telefoneCliente ? { clienteTelefone: telefoneCliente } : {}),
        status: 'confirmado',
        data: selectedDate,
        horario: selectedTime,
        servico: servicoSelecionado.nome,
        servicoId: servicoSelecionado.id,
        preco: (servicoSelecionado.precoEmCentavos / 100).toFixed(2).replace('.', ','),
        precoEmCentavos: servicoSelecionado.precoEmCentavos,
        origem: 'manual',
      };

      // A reserva do horário agora acontece DENTRO da Cloud Function
      // `criarAgendamentoManualSeguro` (mesma transação que cria o
      // agendamento) — mesma cirurgia já feita em AgendamentoScreen.tsx
      // (fluxo do cliente) na Onda 1. Não há mais um passo separado de
      // `reservarSlots`/compensação por `removerAgendamento`: se o horário
      // colidir, a Function nem chega a criar o agendamento.
      await criarAgendamento(novoAgendamento);

      // O aviso ao cliente agora é responsabilidade do trigger reativo
      // `notificarAgendamentoCriado` (functions/index.js), que dispara o
      // evento `agendamento_confirmado` quando detecta um agendamento
      // manual (`origem === 'manual'`) já nascendo `confirmado` — fecha a
      // exceção que existia aqui (Onda E do sistema multicanal). Mandar o
      // WhatsApp também daqui duplicaria a notificação.
      showToast(`Agendado: ${nomeCliente} — ${selectedDate} às ${selectedTime}.`);
      navigation.goBack();
    } catch (error) {
      if ((error as { code?: string })?.code === 'functions/already-exists') {
        setSelectedTime(null);
        await fetchHorarios();
        Alert.alert(
          'Horário já ocupado',
          'Esse horário acabou de ser preenchido. Escolha outro horário, por favor.',
        );
        return;
      }
      console.error('Erro ao criar agendamento manual:', error);
      Alert.alert('Erro', 'Não foi possível criar o agendamento. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

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
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Cliente */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Cliente</Text>
          <View style={s.modoToggle}>
            <TouchableOpacity
              style={[s.modoButton, !modoNovoCliente && s.modoButtonSelected]}
              onPress={() => setModoNovoCliente(false)}
              accessibilityRole="button"
              accessibilityLabel="Selecionar cliente da minha agenda"
              accessibilityState={{ selected: !modoNovoCliente }}
            >
              <Text style={[s.modoButtonText, !modoNovoCliente && s.modoButtonTextSelected]}>Da minha agenda</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modoButton, modoNovoCliente && s.modoButtonSelected]}
              onPress={() => setModoNovoCliente(true)}
              accessibilityRole="button"
              accessibilityLabel="Cadastrar novo cliente para este agendamento"
              accessibilityState={{ selected: modoNovoCliente }}
            >
              <Text style={[s.modoButtonText, modoNovoCliente && s.modoButtonTextSelected]}>Novo cliente</Text>
            </TouchableOpacity>
          </View>

          {modoNovoCliente ? (
            <>
              <TextInput
                value={novoClienteNome}
                onChangeText={setNovoClienteNome}
                style={s.input}
                placeholder="Nome do cliente"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="words"
              />
              <TextInput
                value={novoClienteTelefone}
                onChangeText={(t) => setNovoClienteTelefone(maskPhone(t))}
                style={s.input}
                placeholder="Telefone (opcional, para avisar por WhatsApp)"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="phone-pad"
                maxLength={15}
              />
            </>
          ) : (
            <>
              <TextInput
                value={buscaCliente}
                onChangeText={setBuscaCliente}
                style={s.input}
                placeholder="Buscar cliente pelo nome..."
                placeholderTextColor={theme.colors.textMuted}
              />
              {clientesFiltrados.length === 0 ? (
                <Text style={s.hint}>
                  Nenhum cliente encontrado. Cadastre em "Clientes" ou use "Novo cliente" acima.
                </Text>
              ) : (
                <FlatList
                  data={clientesFiltrados.slice(0, 8)}
                  keyExtractor={(c) => c.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[s.clienteRow, clienteSelecionado?.id === item.id && s.clienteRowSelected]}
                      onPress={() => setClienteSelecionado(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Selecionar cliente ${item.nome}`}
                      accessibilityState={{ selected: clienteSelecionado?.id === item.id }}
                    >
                      <Text style={[s.clienteRowNome, clienteSelecionado?.id === item.id && s.clienteRowNomeSelected]}>
                        {item.nome}
                      </Text>
                      {item.telefone ? <Text style={s.clienteRowTelefone}>{formatPhoneDisplay(item.telefone)}</Text> : null}
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          )}
        </View>

        {/* Serviço */}
        {servicos.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Serviço</Text>
            {servicos.map((sv) => (
              <TouchableOpacity
                key={sv.id}
                style={[s.servicoCard, servicoSelecionado?.id === sv.id && s.servicoCardSelected]}
                onPress={() => { setServicoSelecionado(sv); setSelectedTime(null); }}
                accessibilityRole="button"
                accessibilityLabel={`Serviço ${sv.nome}, ${sv.duracaoMinutos} minutos, ${formatMoney(sv.precoEmCentavos)}`}
                accessibilityState={{ selected: servicoSelecionado?.id === sv.id }}
              >
                <View style={s.flexContent}>
                  <Text style={s.servicoNome}>{sv.nome}</Text>
                  <View style={s.servicoMetaRow}>
                    <Icone nome="horario" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                    <Text style={s.servicoMeta}>{sv.duracaoMinutos} min</Text>
                  </View>
                </View>
                <Text style={s.servicoPreco}>{formatMoney(sv.precoEmCentavos)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Data */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Data</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {datesDisponiveis.map((day) => (
              <TouchableOpacity
                key={day.date}
                style={[s.dateButton, selectedDate === day.date && s.dateButtonSelected]}
                onPress={() => setSelectedDate(day.date)}
                accessibilityRole="button"
                accessibilityLabel={`Data ${day.display}`}
                accessibilityState={{ selected: selectedDate === day.date }}
              >
                <Text style={[s.dateButtonText, selectedDate === day.date && s.dateButtonTextSelected]}>
                  {day.display}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Horário */}
        {selectedDate && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Horário</Text>
            {loadingHorarios ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : availableTimes.length > 0 ? (
              <View style={s.timeGrid}>
                {availableTimes.map((time) => (
                  <TouchableOpacity
                    key={time}
                    style={[s.timeButton, selectedTime === time && s.timeButtonSelected]}
                    onPress={() => setSelectedTime(time)}
                    accessibilityRole="button"
                    accessibilityLabel={`Horário ${time}`}
                    accessibilityState={{ selected: selectedTime === time }}
                  >
                    <Text style={[s.timeButtonText, selectedTime === time && s.timeButtonTextSelected]}>
                      {time}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={s.hint}>Não há horários livres nessa data.</Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[s.confirmButton, salvando && s.buttonDisabled]}
          onPress={handleConfirmar}
          disabled={salvando}
          accessibilityRole="button"
          accessibilityLabel="Criar agendamento"
        >
          {salvando ? <ActivityIndicator color={theme.colors.textSobreDestaque} /> : <Text style={s.confirmButtonText}>Criar Agendamento</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flexContent: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: raio.card,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: tipografia.corpo.fontSize, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  modoToggle: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modoButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: raio.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  modoButtonSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  modoButtonText: { fontSize: tipografia.apoio.fontSize, fontWeight: '600', color: theme.colors.textSecondary },
  modoButtonTextSelected: { color: theme.colors.textSobrePrimaria },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: raio.input,
    padding: 12,
    fontSize: tipografia.corpo.fontSize,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    marginBottom: 10,
  },
  hint: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textMuted, lineHeight: 18 },
  clienteRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: raio.input,
    marginBottom: 6,
    backgroundColor: theme.colors.surfaceVariant,
  },
  clienteRowSelected: { backgroundColor: theme.colors.primary + '20', borderWidth: 1, borderColor: theme.colors.primary },
  clienteRowNome: { fontSize: tipografia.apoio.fontSize, fontWeight: '600', color: theme.colors.text },
  clienteRowNomeSelected: { color: theme.colors.primary },
  clienteRowTelefone: { fontSize: tipografia.micro.fontSize, color: theme.colors.textSecondary, marginTop: 2 },
  servicoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: raio.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceVariant,
    marginBottom: 8,
  },
  servicoCardSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '15' },
  servicoNome: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.text },
  servicoMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  servicoMeta: { fontSize: tipografia.micro.fontSize, color: theme.colors.textSecondary },
  servicoPreco: { fontSize: tipografia.corpo.fontSize, fontWeight: '700', color: theme.colors.success },
  dateButton: {
    backgroundColor: theme.colors.surfaceVariant,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: raio.input,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  dateButtonSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  dateButtonText: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary },
  dateButtonTextSelected: { color: theme.colors.textSobrePrimaria, fontWeight: '700' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeButton: {
    backgroundColor: theme.colors.surfaceVariant,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: raio.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 70,
    minHeight: 44,
    justifyContent: 'center',
  },
  timeButtonSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  timeButtonText: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary, textAlign: 'center' },
  timeButtonTextSelected: { color: theme.colors.textSobrePrimaria, fontWeight: '700' },
  confirmButton: {
    backgroundColor: theme.colors.success,
    paddingVertical: 16,
    borderRadius: raio.input,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  confirmButtonText: { color: theme.colors.textSobreDestaque, fontSize: tipografia.corpo.fontSize, fontWeight: '700' },
  buttonDisabled: { opacity: 0.6 },
});
