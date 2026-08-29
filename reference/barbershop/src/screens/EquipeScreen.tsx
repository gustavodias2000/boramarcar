/**
 * EquipeScreen — painel do dono para gerenciar o negócio multi-profissional.
 *
 * Sem equipe ainda: mostra um CTA para "transformar" o perfil atual em um
 * negócio com equipe (não é destrutivo — o próprio dono vira o primeiro
 * membro, papel 'dono', igual funcionava antes).
 * Com equipe: lista os profissionais, permite ativar/desativar e adicionar
 * novos (que não precisam de login próprio — ver NegocioRepository).
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../../firebaseConfig';
import {
  getNegocioPorDono,
  listarMembros,
  listarProfissionaisDoNegocio,
  criarNegocio,
  definirAtivoProfissional,
} from '../data/repositories/NegocioRepository';
import { contarFuturosDoProfissional } from '../data/repositories/AgendamentoRepository';
import { toLocalDateString } from '../utils/dateUtils';
import { useTheme, type Theme } from '../context/ThemeContext';
import AvatarIlustrado from '../components/AvatarIlustrado';
import Icone from '../components/Icone';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Barbeiro, MembroEquipe, Negocio } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Equipe'>;

interface ProfissionalComPapel {
  barbeiro: Barbeiro;
  membro?: MembroEquipe;
}

export default function EquipeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const uid = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [profissionais, setProfissionais] = useState<ProfissionalComPapel[]>([]);

  // Criação do negócio
  const [nomeNegocio, setNomeNegocio] = useState('');
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    if (!uid) return;
    try {
      const meuNegocio = await getNegocioPorDono(uid);
      setNegocio(meuNegocio);
      if (meuNegocio) {
        const [barbeiros, membros] = await Promise.all([
          listarProfissionaisDoNegocio(meuNegocio.id),
          listarMembros(meuNegocio.id),
        ]);
        const membrosPorId = new Map(membros.map((m) => [m.barbeiroId, m]));
        const combinados = barbeiros
          .map((b) => ({ barbeiro: b, membro: membrosPorId.get(b.id) }))
          .sort((a, b) => {
            if (a.membro?.papel === 'dono') return -1;
            if (b.membro?.papel === 'dono') return 1;
            return (a.barbeiro.nome || '').localeCompare(b.barbeiro.nome || '');
          });
        setProfissionais(combinados);
      } else {
        setProfissionais([]);
      }
    } catch (error) {
      console.error('Erro ao carregar equipe:', error);
      Alert.alert('Erro', 'Não foi possível carregar sua equipe.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  const handleCriarNegocio = async () => {
    if (!uid) return;
    if (!nomeNegocio.trim() || nomeNegocio.trim().length < 2) {
      Alert.alert('Atenção', 'Digite o nome da sua barbearia/negócio.');
      return;
    }
    setCriando(true);
    try {
      const novo = await criarNegocio(uid, nomeNegocio.trim());
      setNegocio(novo);
      await carregar();
    } catch (error) {
      console.error('Erro ao criar negócio:', error);
      Alert.alert('Erro', 'Não foi possível criar sua equipe. Tente novamente.');
    } finally {
      setCriando(false);
    }
  };

  /**
   * Grava a mudança de ativo/inativo e reflete na lista.
   *
   * O estado da tela só muda DEPOIS que a escrita volta — nada de
   * atualização otimista. O Switch é controlado por `p.barbeiro.ativo`, então
   * desistir do diálogo já o deixa exatamente como estava, sem precisar de
   * estado local nem de rollback.
   */
  const aplicarAtivo = async (barbeiroId: string, novoAtivo: boolean) => {
    if (!negocio) return;
    try {
      await definirAtivoProfissional(negocio.id, barbeiroId, novoAtivo);
      setProfissionais((prev) =>
        prev.map((p) =>
          p.barbeiro.id === barbeiroId
            ? { ...p, barbeiro: { ...p.barbeiro, ativo: novoAtivo }, membro: p.membro ? { ...p.membro, ativo: novoAtivo } : p.membro }
            : p,
        ),
      );
    } catch (error) {
      console.error('Erro ao atualizar profissional:', error);
      Alert.alert('Erro', 'Não foi possível atualizar. Tente novamente.');
    }
  };

  /**
   * DOM-02 — desativar um profissional não quebra os agendamentos que ele já
   * tem: `validarEPrepararSlots` (Cloud Function) recusa agendamentos NOVOS
   * para profissional inativo, mas os existentes continuam na agenda, o
   * cliente continua vendo e podendo cancelar, e o dono continua podendo
   * confirmar, concluir ou cancelar cada um.
   *
   * O problema real é de GESTÃO: o dono desativa alguém e não faz ideia de
   * quantos compromissos acabou de herdar. Então o fluxo aqui CONTA e AVISA.
   *
   * DELIBERADAMENTE não cancela nada em massa. Além de ser irreversível com
   * um toque de Switch, cada cancelamento avisa um cliente DIFERENTE, e o
   * limitador de envio (`notificationOrchestrator`) é por destinatário —
   * nenhum dos N avisos seria barrado. `atualizarStatus` NÃO pode ser
   * chamado deste fluxo, nem uma vez: quem cancela é o dono, agendamento por
   * agendamento, na tela de agenda.
   *
   * Reativar não abre diálogo nem consulta agendamentos — só torna a agenda
   * do profissional visível de novo.
   */
  const toggleAtivo = async (barbeiroId: string, ativoAtual: boolean, nome: string) => {
    if (!negocio) return;

    if (!ativoAtual) {
      await aplicarAtivo(barbeiroId, true);
      return;
    }

    // Falha na contagem nunca impede a desativação — no máximo o aviso sai
    // sem o número.
    let futuros: number | null = null;
    try {
      futuros = await contarFuturosDoProfissional(
        negocio.id,
        barbeiroId,
        // Data LOCAL: `new Date().toISOString()` viraria o dia às 21h no
        // horário de Brasília e esconderia os agendamentos de hoje.
        toLocalDateString(new Date()),
      );
    } catch (error) {
      console.warn('Não foi possível contar agendamentos futuros do profissional:', error);
      futuros = null;
    }

    if (futuros === 0) {
      await aplicarAtivo(barbeiroId, false);
      return;
    }

    const plural = futuros !== null && futuros > 1 ? 's' : '';
    const mensagem =
      futuros === null
        ? `Não consegui conferir agora se ${nome} tem agendamentos futuros. Desativar impede novos agendamentos e não cancela os que já existem.`
        : `${nome} tem ${futuros} agendamento${plural} já marcado${plural} a partir de hoje. Desativar impede novos agendamentos, mas não cancela esses — eles continuam na sua agenda, e você segue podendo confirmar, concluir ou cancelar cada um.`;

    Alert.alert(`Desativar ${nome}?`, mensagem, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desativar mesmo assim', onPress: () => aplicarAtivo(barbeiroId, false) },
    ]);
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

  if (!negocio) {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.introCard}>
            <View style={s.introIcon}>
              <Icone nome="equipe" tamanho={32} cor={theme.colors.primary} decorativo />
            </View>
            <Text style={s.introTitle}>Transforme seu perfil em uma equipe</Text>
            <Text style={s.introText}>
              Cadastre outros profissionais da sua barbearia — cada um com a
              própria agenda e serviços — sem que precisem instalar o app ou
              ter uma senha. Você continua com o mesmo login de sempre.
            </Text>
          </View>

          <View style={s.formCard}>
            <Text style={s.label}>Nome da barbearia/negócio</Text>
            <TextInput
              value={nomeNegocio}
              onChangeText={setNomeNegocio}
              style={s.input}
              placeholder="Ex.: Barbearia do Zé"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="words"
            />
            <TouchableOpacity
              style={[s.primaryButton, criando && s.buttonDisabled]}
              onPress={handleCriarNegocio}
              disabled={criando}
              accessibilityRole="button"
              accessibilityLabel="Criar equipe"
            >
              {criando ? (
                <ActivityIndicator color={theme.colors.textSobrePrimaria} />
              ) : (
                <Text style={s.primaryButtonText}>Criar equipe</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.negocioNome}>{negocio.nome}</Text>

        <View style={s.group}>
          {profissionais.map((p, i) => {
            const isDono = p.membro?.papel === 'dono';
            const ativo = p.barbeiro.ativo !== false;
            return (
              <TouchableOpacity
                key={p.barbeiro.id}
                style={[
                  s.item,
                  i === profissionais.length - 1 && s.itemLast,
                  !isDono && !ativo && s.itemInativo,
                ]}
                onPress={() => navigation.navigate('EditarProfissional', { profissionalId: p.barbeiro.id })}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${p.barbeiro.nome}${!isDono && !ativo ? ', inativo' : ''}`}
              >
                <View style={s.avatarWrap}>
                  <AvatarIlustrado
                    id={p.barbeiro.id}
                    nome={p.barbeiro.nome || 'Sem nome'}
                    fotoUrl={p.barbeiro.fotoUrl}
                    fotoPadraoId={p.barbeiro.fotoPadraoId}
                    size={40}
                  />
                </View>
                <View style={s.itemText}>
                  <View style={s.itemNomeRow}>
                    <Text style={s.itemNome}>{p.barbeiro.nome || 'Sem nome'}</Text>
                    {!isDono && !ativo && (
                      <View style={s.badgeInativo}>
                        <Text style={s.badgeInativoText}>Inativo</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.itemDesc}>
                    {isDono ? 'Dono da barbearia' : (p.barbeiro.especialidade || 'Profissional')}
                  </Text>
                </View>
                {!isDono && (
                  <Switch
                    value={ativo}
                    onValueChange={() => toggleAtivo(p.barbeiro.id, ativo, p.barbeiro.nome || 'este profissional')}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                    accessibilityLabel={`${ativo ? 'Desativar' : 'Ativar'} ${p.barbeiro.nome}`}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={s.addButton}
          onPress={() => navigation.navigate('EditarProfissional', undefined)}
          accessibilityRole="button"
          accessibilityLabel="Adicionar profissional"
        >
          <Text style={s.addButtonText}>+ Adicionar profissional</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.linkCard}
          onPress={() => navigation.navigate('Comissoes')}
          accessibilityRole="button"
          accessibilityLabel="Comissões e fechamento"
        >
          <View style={s.linkIcon}>
            <Icone nome="carteira" tamanho={24} cor={theme.colors.primary} decorativo />
          </View>
          <View style={s.itemText}>
            <Text style={s.itemNome}>Comissões e fechamento</Text>
            <Text style={s.itemDesc}>Configure a comissão de cada profissional e veja o relatório</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },
  introCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  introIcon: { marginBottom: 12 },
  introTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  // Texto sobre fundo `primary` saturado — token consolidado na Fase 1.
  primaryButtonText: { color: theme.colors.textSobrePrimaria, fontSize: 16, fontWeight: '700' },
  negocioNome: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 16,
  },
  group: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  itemLast: { borderBottomWidth: 0 },
  itemInativo: { opacity: 0.55 },
  avatarWrap: { marginRight: 12 },
  itemText: { flex: 1 },
  itemNomeRow: { flexDirection: 'row', alignItems: 'center' },
  itemNome: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  itemDesc: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  badgeInativo: {
    marginLeft: 8,
    backgroundColor: theme.colors.error,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  // Texto sobre badge com fundo `error` saturado — token consolidado na
  // Fase 1.
  badgeInativoText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSobreDestaque },
  addButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  addButtonText: { color: theme.colors.primary, fontSize: 16, fontWeight: '700' },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  linkIcon: { marginRight: 14 },
  chevron: { fontSize: 24, color: theme.colors.textMuted, marginLeft: 8 },
});
