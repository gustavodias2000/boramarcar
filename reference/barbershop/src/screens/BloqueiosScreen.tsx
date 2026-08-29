/**
 * BloqueiosScreen — bloqueio de horário específico dentro de um dia
 * ("evento pessoal"), diferente de FolgasScreen (que bloqueia o dia
 * inteiro). Ex.: consulta médica das 14h às 15h numa terça — o resto do
 * dia continua disponível para os clientes agendarem.
 *
 * Os bloqueios são respeitados na geração de horários tanto do cliente
 * (AgendamentoScreen) quanto do agendamento manual do barbeiro
 * (AgendamentoManualScreen), via `filtrarBloqueiosHorario` em agendaSlots.ts.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { upsertBarbeiro, getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { atualizarProfissional } from '../data/repositories/NegocioRepository';
import {
  getMotivosBloqueio,
  upsertMotivoBloqueio,
  removerMotivoBloqueio,
} from '../data/repositories/BloqueioRepository';
import { contarNaFaixaBloqueada } from '../data/repositories/AgendamentoRepository';
import { toLocalDateString } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, BloqueioHorario } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Bloqueios'>;

/**
 * Shape usado só nesta tela para exibição: junta o bloqueio público
 * (`BloqueioHorario`) com o motivo privado (`BloqueioMotivo`), que vive na
 * subcoleção `bloqueiosPrivados` — nunca são gravados juntos no array
 * público (ver `salvarLista`).
 */
type BloqueioComMotivo = BloqueioHorario & { motivo?: string };

const DIAS_A_FRENTE = 60;

const HORAS = Array.from({ length: 24 }, (_, h) =>
  [`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`],
).flat();

function gerarProximosDias(qtd: number) {
  const result: Array<{ date: string; label: string }> = [];
  const hoje = new Date();
  for (let i = 0; i <= qtd; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    result.push({
      date: toLocalDateString(d),
      label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
    });
  }
  return result;
}

export default function BloqueiosScreen({ navigation: _navigation, route }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const { showToast } = useToast();

  const profissionalId = route.params?.profissionalId;
  const profissionalNome = route.params?.profissionalNome;
  const targetId = profissionalId || auth.currentUser?.uid;

  const [bloqueios, setBloqueios] = useState<BloqueioComMotivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dataEvento, setDataEvento] = useState<string | null>(null);
  const [horaInicio, setHoraInicio] = useState('14:00');
  const [horaFim, setHoraFim] = useState('15:00');
  const [motivo, setMotivo] = useState('');

  const dias = useMemo(() => gerarProximosDias(DIAS_A_FRENTE), []);

  useEffect(() => {
    load();
    // Carga única na montagem: `load` só lê o uid do usuário autenticado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      if (!targetId) return;
      // allSettled: uma falha ao buscar os motivos (privados) não pode
      // esconder a lista de bloqueios (pública) inteira do barbeiro.
      const [barbeiroResult, motivosResult] = await Promise.allSettled([
        getBarbeiro(targetId),
        getMotivosBloqueio(targetId),
      ]);
      const barbeiro = barbeiroResult.status === 'fulfilled' ? barbeiroResult.value : null;
      const motivos = motivosResult.status === 'fulfilled' ? motivosResult.value : {};
      if (motivosResult.status === 'rejected') {
        console.error('Erro ao carregar motivos dos bloqueios:', motivosResult.reason);
      }
      const lista = (barbeiro?.bloqueiosHorario ?? []).map((b) => ({
        ...b,
        motivo: motivos[b.id],
      }));
      setBloqueios(lista);
      if (dias.length > 0) setDataEvento(dias[0].date);
    } catch (error) {
      console.error('Erro ao carregar bloqueios:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * @returns true se salvou com sucesso — usado para só mostrar o toast quando a escrita realmente aconteceu.
   *
   * Grava no array público apenas os campos que a tela de agendamento do
   * cliente precisa (id/data/horaInicio/horaFim) — o `motivo` nunca entra
   * neste array (ver `handleAdicionar`, que grava o motivo à parte).
   */
  const salvarLista = async (novaLista: BloqueioComMotivo[]): Promise<boolean> => {
    setSaving(true);
    try {
      if (!targetId) return false;
      const listaPublica: BloqueioHorario[] = novaLista.map((b) => ({
        id: b.id,
        data: b.data,
        horaInicio: b.horaInicio,
        horaFim: b.horaFim,
      }));
      const dados = { bloqueiosHorario: listaPublica };
      if (profissionalId) {
        await atualizarProfissional(profissionalId, dados);
      } else {
        await upsertBarbeiro(targetId, dados);
      }
      setBloqueios(novaLista);
      return true;
    } catch (error) {
      console.error('Erro ao salvar bloqueios:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Grava de fato o bloqueio novo (array público) e, à parte, o motivo
   * privado. Separado de `handleAdicionar` porque o aviso do AG-03 precisa
   * poder adiar esta escrita até o barbeiro confirmar no diálogo.
   *
   * NÃO existe atualização otimista: `salvarLista` só mexe no estado da tela
   * depois que a escrita voltou. Enquanto o diálogo está aberto, a lista na
   * tela continua exatamente como estava.
   */
  const gravarBloqueio = async (lista: BloqueioComMotivo[], novo: BloqueioComMotivo, motivoTrim: string) => {
    const ok = await salvarLista(lista);
    if (ok) {
      if (motivoTrim && targetId) {
        try {
          await upsertMotivoBloqueio(targetId, novo.id, motivoTrim);
        } catch (error) {
          console.error('Erro ao salvar motivo do bloqueio:', error);
        }
      }
      showToast('Bloqueio adicionado.');
      setMotivo('');
    }
  };

  /**
   * AG-03: bloquear uma faixa de horário deixava de avisar que já havia
   * cliente marcado dentro dela. O agendamento não some nem quebra — a Cloud
   * Function `validarEPrepararSlots` recusa agendamentos NOVOS sobre o
   * bloqueio, mas o que já estava marcado continua ativo na agenda dos dois
   * lados. O barbeiro é que descobria quando o cliente batia na porta.
   *
   * A correção segue a MESMA disciplina do DOM-02 (`EquipeScreen.toggleAtivo`):
   * CONTAR e AVISAR, nunca cancelar em massa.
   *
   * ⚠️ NÃO acrescente cancelamento automático aqui — nem "só quando o
   * barbeiro pedir", nem atrás de um terceiro botão. `atualizarStatus` não
   * pode ser chamado deste fluxo, e há teste travando isso
   * (`__tests__/screens/BloqueiosScreen.test.tsx`). Três motivos:
   *  1. cancelar N agendamentos dispara N avisos a N clientes DIFERENTES, e
   *     o limitador do `notificationOrchestrator` é POR DESTINATÁRIO — nenhum
   *     dos N seria barrado;
   *  2. é irreversível, atrás de um toque só;
   *  3. quem bloqueia a tarde por consulta médica quase sempre quer REMARCAR
   *     aquelas pessoas, não fulminá-las.
   */
  const handleAdicionar = async () => {
    if (!dataEvento) {
      Alert.alert('Atenção', 'Selecione a data do evento.');
      return;
    }
    if (horaInicio >= horaFim) {
      Alert.alert('Atenção', 'O horário de início deve ser anterior ao de fim.');
      return;
    }
    const motivoTrim = motivo.trim();
    const novo: BloqueioComMotivo = {
      id: `${Date.now()}`,
      data: dataEvento,
      horaInicio,
      horaFim,
      motivo: motivoTrim || undefined,
    };
    const lista = [...bloqueios, novo].sort((a, b) => (a.data + a.horaInicio).localeCompare(b.data + b.horaInicio));

    // Falha na contagem NUNCA impede o bloqueio — no máximo o aviso sai sem o
    // número. Uma checagem que não conseguiu rodar não pode virar
    // indisponibilidade da função (mesma regra do DOM-02).
    let marcados: number | null = null;
    try {
      marcados = targetId
        ? await contarNaFaixaBloqueada(targetId, dataEvento, horaInicio, horaFim)
        : 0;
    } catch (error) {
      console.warn('Não foi possível contar os agendamentos da faixa bloqueada:', error);
      marcados = null;
    }

    // Faixa livre: grava direto. Um diálogo aqui seria puro atrito no caso
    // comum — o barbeiro bloqueando um horário onde não há ninguém.
    if (marcados === 0) {
      await gravarBloqueio(lista, novo, motivoTrim);
      return;
    }

    const plural = marcados !== null && marcados > 1 ? 's' : '';
    const mensagem =
      marcados === null
        ? `Não consegui conferir agora se você tem agendamentos entre ${horaInicio} e ${horaFim}. Bloquear impede novos agendamentos, mas não cancela os que já existem.`
        : `Você já tem ${marcados} agendamento${plural} marcado${plural} entre ${horaInicio} e ${horaFim}. Bloquear impede novos agendamentos, mas não cancela esse${plural} — ele${plural} continua${plural ? 'm' : ''} na sua agenda, e você precisa remarcar ou cancelar cada um.`;

    Alert.alert('Bloquear esse horário?', mensagem, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Bloquear mesmo assim', onPress: () => gravarBloqueio(lista, novo, motivoTrim) },
    ]);
  };

  /**
   * Remover NÃO leva diálogo, de propósito (AG-03): tirar um bloqueio só
   * devolve disponibilidade — não surpreende ninguém, não conflita com nada
   * e não precisa de contagem. Simétrico à decisão de "reativar profissional"
   * do DOM-02, que também passa direto.
   */
  const handleRemover = async (id: string) => {
    const ok = await salvarLista(bloqueios.filter((b) => b.id !== id));
    if (ok) {
      showToast('Bloqueio removido.', 'info');
      if (targetId) {
        removerMotivoBloqueio(targetId, id).catch((error) => {
          console.warn('Não foi possível remover o motivo do bloqueio:', error);
        });
      }
    }
  };

  const renderPickerRow = (label: string, options: string[], current: string, onChange: (v: string) => void) => (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[s.chip, current === opt && s.chipSelected]}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${opt}`}
            accessibilityState={{ selected: current === opt }}
          >
            <Text style={[s.chipText, current === opt && s.chipTextSelected]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

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
      <ScrollView contentContainerStyle={s.scroll}>
        {profissionalId && (
          <View style={s.profissionalBanner}>
            <Text style={s.profissionalBannerText}>
              Editando os bloqueios de {profissionalNome || 'um profissional da equipe'}
            </Text>
          </View>
        )}

        <View style={s.hintCard}>
          <Text style={s.hintText}>
            Bloqueie um horário específico dentro de um dia (ex.: consulta médica, compromisso pessoal) sem
            precisar tirar o dia inteiro de folga. O resto do dia continua disponível para agendamentos.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Novo bloqueio</Text>

          <Text style={s.fieldLabel}>Data</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.diasScroll}>
            {dias.map((d) => (
              <TouchableOpacity
                key={d.date}
                style={[s.chip, dataEvento === d.date && s.chipSelected]}
                onPress={() => setDataEvento(d.date)}
                accessibilityRole="button"
                accessibilityLabel={`Data ${d.label}`}
                accessibilityState={{ selected: dataEvento === d.date }}
              >
                <Text style={[s.chipText, dataEvento === d.date && s.chipTextSelected]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {renderPickerRow('Início', HORAS, horaInicio, setHoraInicio)}
          {renderPickerRow('Fim', HORAS.filter((h) => h > horaInicio), horaFim, setHoraFim)}

          <Text style={s.fieldLabel}>Motivo (opcional)</Text>
          <TextInput
            value={motivo}
            onChangeText={setMotivo}
            style={s.input}
            placeholder="Ex.: Consulta médica"
            placeholderTextColor={theme.colors.textMuted}
          />

          <TouchableOpacity
            style={[s.addButton, saving && s.buttonDisabled]}
            onPress={handleAdicionar}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Adicionar bloqueio"
          >
            {saving ? <ActivityIndicator color={theme.colors.textSobrePrimaria} /> : <Text style={s.addButtonText}>Adicionar bloqueio</Text>}
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>
            {bloqueios.length === 0 ? 'Nenhum bloqueio ativo' : `${bloqueios.length} bloqueio${bloqueios.length === 1 ? '' : 's'} ativo${bloqueios.length === 1 ? '' : 's'}`}
          </Text>
          {bloqueios.map((b) => (
            <View key={b.id} style={s.bloqueioRow}>
              <View style={s.flexContent}>
                <Text style={s.bloqueioData}>{b.data} · {b.horaInicio}–{b.horaFim}</Text>
                {b.motivo ? <Text style={s.bloqueioMotivo}>{b.motivo}</Text> : null}
              </View>
              <TouchableOpacity
                onPress={() => handleRemover(b.id)}
                accessibilityRole="button"
                accessibilityLabel="Remover bloqueio"
                accessibilityHint="Remove o bloqueio de agenda permanentemente"
                style={s.removerButton}
              >
                <Icone nome="excluir" tamanho={16} cor={theme.colors.textSecondary} decorativo />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    diasScroll: { marginBottom: 12 },
    flexContent: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 16, paddingBottom: 40 },
    profissionalBanner: {
      backgroundColor: theme.colors.primary + '20',
      borderRadius: raio.input,
      padding: 12,
      marginBottom: 16,
    },
    profissionalBannerText: { fontSize: tipografia.apoio.fontSize, fontWeight: '700', color: theme.colors.primary, textAlign: 'center' },
    hintCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
      padding: 14,
      marginBottom: 16,
    },
    hintText: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary, lineHeight: 18 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
      padding: 16,
      marginBottom: 16,
    },
    cardTitle: { fontSize: tipografia.corpo.fontSize, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
    fieldGroup: { marginBottom: 12 },
    fieldLabel: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary, marginBottom: 6, fontWeight: '600' },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: raio.modal,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceVariant,
      marginRight: 8,
    },
    chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    chipText: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary },
    // Texto sobre chip selecionado (fundo `primary` — âmbar).
    chipTextSelected: { color: theme.colors.textSobrePrimaria, fontWeight: '700' },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: raio.input,
      padding: 12,
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
      marginBottom: 16,
    },
    addButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: raio.input,
      paddingVertical: 14,
      alignItems: 'center',
      minHeight: 48,
      justifyContent: 'center',
    },
    // Texto sobre botão de adicionar (fundo `primary` — âmbar).
    addButtonText: { color: theme.colors.textSobrePrimaria, fontSize: tipografia.corpo.fontSize, fontWeight: '700' },
    buttonDisabled: { opacity: 0.6 },
    bloqueioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.borderLight,
    },
    bloqueioData: { fontSize: tipografia.apoio.fontSize, fontWeight: '600', color: theme.colors.text },
    bloqueioMotivo: { fontSize: tipografia.micro.fontSize, color: theme.colors.textSecondary, marginTop: 2 },
    removerButton: { paddingHorizontal: 8, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  });
