/**
 * ComissoesScreen — o dono configura a comissão de cada profissional da
 * equipe (percentual ou valor fixo) e vê o relatório de fechamento por
 * período (soma de comissão e faturamento por profissional, a partir dos
 * agendamentos concluídos).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../../firebaseConfig';
import {
  getNegocioIdDoDono,
  listarMembros,
  listarProfissionaisDoNegocio,
  definirComissao,
} from '../data/repositories/NegocioRepository';
import { listarConcluidosPorNegocio } from '../data/repositories/AgendamentoRepository';
import { formatMoney, toLocalDateString } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Barbeiro, MembroEquipe, TipoComissao } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Comissoes'>;

interface LinhaComissao {
  barbeiro: Barbeiro;
  tipo: TipoComissao;
  valorStr: string; // percentual (0-100) ou reais, como string editável
}

type Periodo = '7dias' | '30dias' | 'mes';

/**
 * Agregado CRU vindo do Firestore: soma por `barbeiroId`, sem nome nem
 * qualquer coisa que dependa de `linhas`. É de propósito — ver a nota do
 * `useMemo` de `relatorio` mais abaixo.
 */
type TotaisPorBarbeiro = Record<
  string,
  { qtd: number; faturamentoCentavos: number; comissaoCentavos: number }
>;

function inicioDoPeriodo(periodo: Periodo): Date {
  const hoje = new Date();
  if (periodo === 'mes') {
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  }
  const dias = periodo === '7dias' ? 7 : 30;
  const d = new Date(hoje);
  d.setDate(hoje.getDate() - dias);
  return d;
}

export default function ComissoesScreen({ navigation: _navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const uid = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaComissao[]>([]);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);
  const [totaisPorBarbeiro, setTotaisPorBarbeiro] = useState<TotaisPorBarbeiro>({});

  const carregar = useCallback(async () => {
    if (!uid) return;
    try {
      // PERF (Onda 4): só o ID — esta tela nunca usou outro campo do negócio.
      // O ID já vem denormalizado no doc do barbeiro (cacheado), então a
      // leitura de `negocios/{id}` era pura perda antes do Promise.all.
      const negocioIdDoDono = await getNegocioIdDoDono(uid);
      if (!negocioIdDoDono) {
        setNegocioId(null);
        setLoading(false);
        return;
      }
      setNegocioId(negocioIdDoDono);
      const [barbeiros, membros] = await Promise.all([
        listarProfissionaisDoNegocio(negocioIdDoDono),
        listarMembros(negocioIdDoDono),
      ]);
      const membrosPorId = new Map<string, MembroEquipe>(membros.map((m) => [m.barbeiroId, m]));
      const linhasProfissionais = barbeiros
        .filter((b) => membrosPorId.get(b.id)?.papel !== 'dono')
        .map((b) => {
          const m = membrosPorId.get(b.id);
          const tipo: TipoComissao = m?.comissaoTipo || 'percentual';
          const valor = tipo === 'percentual' ? m?.comissaoPercentual : (m?.comissaoFixaCentavos ?? 0) / 100;
          return {
            barbeiro: b,
            tipo,
            valorStr: valor ? String(valor).replace('.', ',') : '',
          };
        });
      setLinhas(linhasProfissionais);
    } catch (error) {
      console.error('Erro ao carregar comissões:', error);
      Alert.alert('Erro', 'Não foi possível carregar os dados de comissão.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  /**
   * PERF: esta função grava SÓ o agregado cru, e por isso depende apenas de
   * `[negocioId, periodo]`.
   *
   * Antes ela também fazia o join com `linhas` (para pegar o nome do
   * profissional) e tinha `linhas` nas dependências. Como `atualizarLinha`
   * recria o array a cada tecla digitada no campo de valor, `carregarRelatorio`
   * mudava de identidade, o callback do `useFocusEffect` mudava junto e o
   * efeito re-executava — uma consulta COMPLETA de `listarConcluidosPorNegocio`
   * por tecla, além do spinner piscando no meio da digitação. O guard
   * `linhas.length > 0` não protegia: o `.length` continuava igual, mas a
   * identidade da função não.
   */
  const carregarRelatorio = useCallback(async () => {
    if (!negocioId) return;
    setCarregandoRelatorio(true);
    try {
      const dataInicio = toLocalDateString(inicioDoPeriodo(periodo));
      const dataFim = toLocalDateString(new Date());
      const concluidos = await listarConcluidosPorNegocio(negocioId, dataInicio, dataFim);

      const totais: TotaisPorBarbeiro = {};
      for (const ag of concluidos) {
        const atual = totais[ag.barbeiroId] || { qtd: 0, faturamentoCentavos: 0, comissaoCentavos: 0 };
        atual.qtd += 1;
        atual.faturamentoCentavos += ag.precoEmCentavos || 0;
        atual.comissaoCentavos += ag.comissaoCentavos || 0;
        totais[ag.barbeiroId] = atual;
      }

      setTotaisPorBarbeiro(totais);
    } catch (error) {
      console.error('Erro ao carregar relatório:', error);
      Alert.alert('Erro', 'Não foi possível carregar o relatório. Verifique sua conexão e tente novamente.');
    } finally {
      setCarregandoRelatorio(false);
    }
  }, [negocioId, periodo]);

  // `temLinhas` (booleano) em vez de `linhas.length`: o efeito só precisa
  // reagir a "tem alguém na equipe ou não", nunca ao conteúdo das linhas.
  const temLinhas = linhas.length > 0;

  useFocusEffect(
    useCallback(() => {
      if (temLinhas) carregarRelatorio();
    }, [carregarRelatorio, temLinhas]),
  );

  /**
   * O join que antes acontecia dentro do fetch. Derivado, e não em estado:
   * quando o dono renomeia/reordena nada é refeito na rede, e o relatório
   * acompanha `linhas` sem novo `listarConcluidosPorNegocio`.
   *
   * `carregandoRelatorio` continua controlando o render mais abaixo — sem
   * ele, este derivado renderizaria lista vazia por um frame antes de
   * `totaisPorBarbeiro` chegar.
   */
  const relatorio = useMemo(
    () =>
      linhas
        .map((l) => {
          const dados = totaisPorBarbeiro[l.barbeiro.id];
          if (!dados) return null;
          return { barbeiro: l.barbeiro, ...dados };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.comissaoCentavos - a.comissaoCentavos),
    [linhas, totaisPorBarbeiro],
  );

  const totalComissao = useMemo(
    () => relatorio.reduce((sum, r) => sum + r.comissaoCentavos, 0),
    [relatorio],
  );

  const atualizarLinha = (barbeiroId: string, patch: Partial<LinhaComissao>) => {
    setLinhas((prev) => prev.map((l) => (l.barbeiro.id === barbeiroId ? { ...l, ...patch } : l)));
  };

  const salvarComissao = async (linha: LinhaComissao) => {
    if (!negocioId) return;
    const valorNum = parseFloat(linha.valorStr.replace(',', '.'));
    if (!valorNum || valorNum <= 0) {
      Alert.alert('Atenção', 'Informe um valor válido.');
      return;
    }
    setSalvandoId(linha.barbeiro.id);
    try {
      const valorParaSalvar = linha.tipo === 'percentual' ? valorNum : Math.round(valorNum * 100);
      await definirComissao(negocioId, linha.barbeiro.id, linha.tipo, valorParaSalvar);
      Alert.alert('Sucesso!', `Comissão de ${linha.barbeiro.nome} atualizada.`);
    } catch (error) {
      console.error('Erro ao salvar comissão:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvandoId(null);
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

  if (!negocioId) {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <View style={s.centered}>
          <Text style={s.emptyText}>
            Comissões ficam disponíveis depois que você criar sua equipe em "Minha Equipe".
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.sectionTitle}>Comissão por profissional</Text>
        {linhas.length === 0 ? (
          <Text style={s.emptyText}>Cadastre profissionais em "Minha Equipe" primeiro.</Text>
        ) : (
          linhas.map((linha) => (
            <View key={linha.barbeiro.id} style={s.linhaCard}>
              <Text style={s.linhaNome}>{linha.barbeiro.nome}</Text>
              <View style={s.tipoRow}>
                <TouchableOpacity
                  style={[s.tipoChip, linha.tipo === 'percentual' && s.tipoChipSelected]}
                  onPress={() => atualizarLinha(linha.barbeiro.id, { tipo: 'percentual' })}
                  accessibilityRole="button"
                  accessibilityLabel={`Comissão de ${linha.barbeiro.nome} em percentual`}
                  accessibilityState={{ selected: linha.tipo === 'percentual' }}
                >
                  <Text style={[s.tipoChipText, linha.tipo === 'percentual' && s.tipoChipTextSelected]}>
                    Percentual (%)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.tipoChip, linha.tipo === 'fixo' && s.tipoChipSelected]}
                  onPress={() => atualizarLinha(linha.barbeiro.id, { tipo: 'fixo' })}
                  accessibilityRole="button"
                  accessibilityLabel={`Comissão de ${linha.barbeiro.nome} em valor fixo`}
                  accessibilityState={{ selected: linha.tipo === 'fixo' }}
                >
                  <Text style={[s.tipoChipText, linha.tipo === 'fixo' && s.tipoChipTextSelected]}>
                    Valor fixo (R$)
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={s.valorRow}>
                <TextInput
                  value={linha.valorStr}
                  onChangeText={(v) => atualizarLinha(linha.barbeiro.id, { valorStr: v })}
                  style={s.valorInput}
                  placeholder={linha.tipo === 'percentual' ? 'Ex.: 40' : 'Ex.: 15,00'}
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={[s.salvarButton, salvandoId === linha.barbeiro.id && s.buttonDisabled]}
                  onPress={() => salvarComissao(linha)}
                  disabled={salvandoId === linha.barbeiro.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Salvar comissão de ${linha.barbeiro.nome}`}
                >
                  {salvandoId === linha.barbeiro.id ? (
                    <ActivityIndicator color={theme.colors.textSobrePrimaria} size="small" />
                  ) : (
                    <Text style={s.salvarButtonText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <Text style={[s.sectionTitle, s.sectionTitleSpaced]}>Relatório de fechamento</Text>
        <View style={s.periodoRow}>
          {([
            { key: '7dias', label: '7 dias' },
            { key: '30dias', label: '30 dias' },
            { key: 'mes', label: 'Mês atual' },
          ] as { key: Periodo; label: string }[]).map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[s.tipoChip, periodo === opt.key && s.tipoChipSelected]}
              onPress={() => setPeriodo(opt.key)}
              accessibilityRole="button"
              accessibilityLabel={`Período ${opt.label}`}
              accessibilityState={{ selected: periodo === opt.key }}
            >
              <Text style={[s.tipoChipText, periodo === opt.key && s.tipoChipTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {carregandoRelatorio ? (
          <ActivityIndicator color={theme.colors.primary} style={s.loadingIndicator} />
        ) : relatorio.length === 0 ? (
          <Text style={s.emptyText}>Nenhum atendimento concluído nesse período.</Text>
        ) : (
          <>
            <View style={s.group}>
              {relatorio.map((r, i) => (
                <View key={r.barbeiro.id} style={[s.relatorioItem, i === relatorio.length - 1 && s.itemLast]}>
                  <View style={s.flexContent}>
                    <Text style={s.linhaNome}>{r.barbeiro.nome}</Text>
                    <Text style={s.relatorioMeta}>
                      {r.qtd} {r.qtd === 1 ? 'atendimento' : 'atendimentos'} · faturamento {formatMoney(r.faturamentoCentavos)}
                    </Text>
                  </View>
                  <Text style={s.relatorioComissao}>{formatMoney(r.comissaoCentavos)}</Text>
                </View>
              ))}
            </View>
            <View style={s.totalCard}>
              <Text style={s.totalLabel}>Total de comissões no período</Text>
              <Text style={s.totalValor}>{formatMoney(totalComissao)}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flexContent: { flex: 1 },
  loadingIndicator: { marginTop: 16 },
  sectionTitleSpaced: { marginTop: 24 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scroll: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: tipografia.subtitulo.fontSize, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  emptyText: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  linhaCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: raio.card,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  linhaNome: { fontSize: tipografia.corpo.fontSize, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  tipoRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tipoChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: raio.modal,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceVariant,
  },
  tipoChipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tipoChipText: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary },
  // Texto sobre chip selecionado (fundo `primary` — âmbar).
  tipoChipTextSelected: { color: theme.colors.textSobrePrimaria, fontWeight: '700' },
  valorRow: { flexDirection: 'row', gap: 10 },
  valorInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: raio.input,
    padding: 10,
    fontSize: tipografia.corpo.fontSize,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  salvarButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: raio.input,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDisabled: { opacity: 0.6 },
  // Texto sobre botão salvar (fundo `primary` — âmbar).
  salvarButtonText: { color: theme.colors.textSobrePrimaria, fontSize: tipografia.apoio.fontSize, fontWeight: '700' },
  periodoRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  group: {
    borderRadius: raio.card,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  relatorioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  itemLast: { borderBottomWidth: 0 },
  relatorioMeta: { fontSize: tipografia.micro.fontSize, color: theme.colors.textSecondary, marginTop: 2 },
  relatorioComissao: { fontSize: tipografia.corpo.fontSize, fontWeight: '800', color: theme.colors.success },
  totalCard: {
    backgroundColor: theme.colors.primary + '15',
    borderRadius: raio.card,
    padding: 16,
    marginTop: 12,
    alignItems: 'center',
  },
  totalLabel: { fontSize: tipografia.apoio.fontSize, color: theme.colors.textSecondary, marginBottom: 4 },
  totalValor: { fontSize: tipografia.titulo.fontSize, fontWeight: '800', color: theme.colors.primary },
});
