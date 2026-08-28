import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { auth } from '../../firebaseConfig';
import Icone from '../components/Icone';
import NotificationService from '../services/NotificationService';
import { listarDoCliente, contarDoCliente } from '../data/repositories/AgendamentoRepository';
import useUserProfile from '../hooks/useUserProfile';
import useBarbeariasVinculadas from '../hooks/useBarbeariasVinculadas';
import { useTheme, type Theme } from '../context/ThemeContext';
import { getStatusColor, getStatusText } from '../utils/statusUtils';
import { comFallback } from '../utils/consultaResiliente';
import { SkeletonList } from '../components/Skeleton';
import AvatarIlustrado from '../components/AvatarIlustrado';
import ScrimEscurecimento from '../components/ScrimEscurecimento';
import FiltroChips from '../components/FiltroChips';
import BadgeContagemServicos from '../components/BadgeContagemServicos';
import DisponibilidadeChip from '../components/DisponibilidadeChip';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONBOARDING_KEY } from './OnboardingScreen';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Barbeiro, Agendamento } from '../types';

/**
 * Quantos agendamentos a prévia da home mostra. Busca-se UM a mais do que
 * isso: esse documento extra é o que permite saber que "existe mais" mesmo
 * quando a contagem agregada falha — sem ele, o degradê esconderia o botão.
 */
const PREVIA_AGENDAMENTOS = 3;

type Props = CompositeScreenProps<
  BottomTabScreenProps<any, 'Barbeiros'>,
  NativeStackScreenProps<RootStackParamList>
>;

interface GrupoVitrine {
  negocioId: string | null; // null = profissional solo (comportamento de sempre)
  negocioNome?: string;
  profissionais: Barbeiro[];
}

/**
 * Agrupa profissionais da mesma equipe (mesmo `negocioId`) sob um único
 * card, mantendo profissionais solo exatamente como antes (1 card cada).
 * Esconde profissionais desativados pelo dono (`ativo === false`).
 */
function agruparPorNegocio(barbeiros: Barbeiro[]): GrupoVitrine[] {
  const visiveis = barbeiros.filter((b) => b.ativo !== false);
  const grupos: GrupoVitrine[] = [];
  const indexPorNegocio = new Map<string, number>();

  for (const b of visiveis) {
    if (!b.negocioId) {
      grupos.push({ negocioId: null, profissionais: [b] });
      continue;
    }
    const idx = indexPorNegocio.get(b.negocioId);
    if (idx === undefined) {
      indexPorNegocio.set(b.negocioId, grupos.length);
      grupos.push({ negocioId: b.negocioId, negocioNome: b.negocioNome, profissionais: [b] });
    } else {
      grupos[idx].profissionais.push(b);
    }
  }
  return grupos;
}

/** Palavra-chave buscada no nome do serviço para cada chip de filtro. */
const PALAVRA_CHAVE_POR_CHIP: Record<string, string> = {
  Corte: 'corte',
  Barba: 'barba',
  Combos: 'combo',
};

/**
 * Filtra profissionais pelo chip selecionado, comparando o nome dos
 * serviços oferecidos (`ServicoBarbeiro.nome`) com a palavra-chave do chip.
 *
 * Heurística, não regra de negócio: `ServicoBarbeiro` não tem um campo de
 * categoria estruturado hoje, então "Corte"/"Barba"/"Combos" são inferidos
 * pelo texto do nome do serviço (case-insensitive). Se isso virar algo
 * crítico, o ideal é adicionar um campo `categoria` ao tipo.
 */
function filtrarPorChip(barbeiros: Barbeiro[], chip: string): Barbeiro[] {
  if (chip === 'Todos') return barbeiros;
  const palavraChave = PALAVRA_CHAVE_POR_CHIP[chip];
  if (!palavraChave) return barbeiros;
  return barbeiros.filter((b) =>
    (b.servicos ?? []).some((servico) => servico.nome?.toLowerCase().includes(palavraChave)),
  );
}

export default function ClienteHome({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const { profile: userProfile } = useUserProfile();
  const {
    barbeiros,
    loading: carregandoBarbeiros,
    refresh: refreshBarbeiros,
  } = useBarbeariasVinculadas(auth.currentUser?.uid);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  /**
   * `null` = a contagem não chegou (falhou ou ainda não rodou). Não é `0`: um
   * zero silencioso esconderia o botão "Ver todos" de quem tem agendamentos.
   */
  const [totalAgendamentos, setTotalAgendamentos] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroAtivo, setFiltroAtivo] = useState<string>('Todos');

  useEffect(() => {
    checkOnboarding();
    // Solicita permissão de push APÓS o login, no contexto correto da jornada
    NotificationService.init();
    // Carga única na montagem: as duas funções só leem `auth.currentUser`,
    // que não muda enquanto esta tela estiver montada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useFocusEffect (não useEffect simples): esta tela é uma aba, então fica
  // montada o tempo todo — sem isso, adicionar uma barbearia (QR/link/código)
  // e voltar para cá mostraria a lista velha (vazia) até o app reiniciar,
  // porque o fetch original só rodava uma vez, na primeira montagem.
  useFocusEffect(
    useCallback(() => {
      fetchAll();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const checkOnboarding = async () => {
    try {
      const visto = await AsyncStorage.getItem(ONBOARDING_KEY.cliente);
      if (!visto) {
        navigation.navigate('Onboarding', { tipo: 'cliente' });
      }
    } catch (_) {
      // ignora falha no storage
    }
  };

  const fetchAll = async () => {
    try {
      await Promise.all([refreshBarbeiros(), fetchAgendamentos()]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      Alert.alert('Erro', 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAgendamentos = async () => {
    try {
      // Item 9.3: identidade por uid (imutável), não mais por email
      const uid = auth.currentUser?.uid;

      // A prévia mostra 3. Buscava 20 — 17 documentos lidos e descartados a
      // cada foco — e ainda anunciava "Ver todos (20)" para quem tinha 47,
      // porque `length` de lista limitada não é total. O total agora vem de
      // uma contagem agregada (1 leitura, sem baixar nada).
      const [lista, total] = await Promise.all([
        listarDoCliente(uid, { max: PREVIA_AGENDAMENTOS + 1 }),
        // A contagem degrada sozinha: se ela falhar, a lista NÃO pode cair
        // junto — é ela que o cliente veio ver.
        comFallback(contarDoCliente(uid), null as number | null, 'ClienteHome/total de agendamentos'),
      ]);

      setAgendamentos(lista);
      setTotalAgendamentos(total);
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshBarbeiros(), fetchAgendamentos()]);
    } catch (error) {
      console.error('Erro ao atualizar:', error);
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * O total que o botão anuncia. Com a contagem no ar é o número REAL; sem
   * ela, cai para o tamanho da lista buscada (que tem um item a mais que a
   * prévia justamente para este caso) — subestima, mas nunca esconde o botão
   * de quem tem mais do que cabe na prévia.
   */
  const totalExibido = totalAgendamentos ?? agendamentos.length;

  /**
   * CRÍTICO 1 da auditoria (parte 2): o link "Ver todos" — único caminho até
   * `HistoricoScreen`, onde mora a ação "Avaliar" — só aparecia quando havia
   * mais de `PREVIA_AGENDAMENTOS` (3) no total. Um cliente com poucos
   * agendamentos (1, 2 ou 3) podia ter um deles 'concluido' e nunca ver o
   * botão, ficando sem caminho algum até avaliar o atendimento.
   *
   * Quando o total é <= PREVIA_AGENDAMENTOS + 1 (o `max` da busca em
   * `fetchAgendamentos`), `agendamentos` já contém TODOS os agendamentos do
   * cliente — não só a prévia — então dá para checar o status de cada um
   * direto aqui, sem nova consulta. Quando o total é maior, o primeiro
   * termo do `||` abaixo já garante o link.
   */
  const temAgendamentoConcluido = agendamentos.some(
    (item) => item.status === 'concluido' || item.status === 'avaliado',
  );

  const barbeirosFiltrados = useMemo(
    () => filtrarPorChip(barbeiros, filtroAtivo),
    [barbeiros, filtroAtivo],
  );
  const grupos = useMemo(() => agruparPorNegocio(barbeirosFiltrados), [barbeirosFiltrados]);

  // Cada profissional tem o próprio card em destaque, mesmo quando faz parte
  // de uma equipe — não existe mais um card compacto agrupando vários
  // profissionais (pedido explícito do usuário, com referência visual: cada
  // barbeiro é um card grande, igual ao app de referência Navalha). O nome
  // da barbearia continua aparecendo, como um badge sobre a foto de cada
  // profissional dela (`heroNegocioRow` dentro de renderProfissionalHero) —
  // "a barbearia aparece uma vez" (não duplicar o VÍNCULO) é uma regra
  // diferente de "os profissionais aparecem juntos num card só", e só a
  // primeira é o requisito real.
  const itensVitrine = useMemo(
    () =>
      grupos.flatMap((grupo) =>
        grupo.profissionais.map((profissional) => ({ profissional, negocioNome: grupo.negocioNome })),
      ),
    [grupos],
  );

  // Profissional solo: card "hero" com a foto ocupando o card inteiro
  // (modelo do app de referência Navalha), degradê escurecendo o rodapé e o
  // texto (badge + nome + descrição + link) sobreposto à foto, colado na
  // base — não é mais foto pequena + bloco de texto separado abaixo dela.
  const renderProfissionalHero = (item: Barbeiro, negocioNome?: string) => {
    const nome = item.nome || 'Barbeiro';
    const especialidade = item.especialidade || 'Corte e barba';
    const qtdServicos = item.servicos?.length;
    // Calculado de hora em hora pela Cloud Function `calcularDisponibilidade`
    // — o componente já decide sozinho se mostra "Hoje"/"Disponível amanhã"/nada.
    const statusDisponibilidade: 'hoje' | 'amanha' | null = item.disponivelHoje
      ? 'hoje'
      : item.disponivelAmanha
        ? 'amanha'
        : null;
    return (
      <View testID="barbeiro-card" style={s.heroCard}>
        <AvatarIlustrado
          id={item.id}
          nome={nome}
          fotoUrl={item.fotoUrl}
          fotoPadraoId={item.fotoPadraoId}
          variant="capa"
        />

        {/* ── "Gradiente" sem dependência nova, sem degrau visível — mesmo
            componente usado em WelcomeScreen.tsx ── */}
        <ScrimEscurecimento corBase="10,10,10" opacidadeMaxima={0.9} estilo={StyleSheet.absoluteFill} />

        <View style={s.heroContent}>
          {/* accessible=true funde nome/serviços/especialidade num só
              anúncio; fica fora do CTA de propósito — um accessible=true que
              englobasse o link o esconderia do leitor de tela. */}
          <View
            accessible
            accessibilityLabel={`${negocioNome ? `${negocioNome}, ` : ''}${nome}, ${
              qtdServicos ? `${qtdServicos} serviços, ` : ''
            }${especialidade}`}
          >
            {negocioNome ? (
              <View style={s.heroNegocioRow}>
                <View style={s.negocioIcon}>
                  <Icone nome="barbearia" tamanho={16} cor="#FCD34D" decorativo />
                </View>
                <Text style={s.heroNegocioNome}>{negocioNome}</Text>
              </View>
            ) : null}
            <View style={s.heroBadgesRow}>
              <BadgeContagemServicos count={qtdServicos} sobreFoto />
              <DisponibilidadeChip status={statusDisponibilidade} />
            </View>
            <Text style={s.heroNome}>{nome}</Text>
            <Text style={s.heroEspecialidade}>{especialidade}</Text>
          </View>
          <TouchableOpacity
            testID="ver-perfil-button"
            style={[s.verPerfilLink, s.heroButtonSpacing]}
            accessibilityRole="button"
            accessibilityLabel={`Ver perfil de ${nome}`}
            onPress={() => navigation.navigate('PerfilProfissional', { barbeiro: item })}
          >
            <Text style={s.heroVerPerfilText}>Ver perfil →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderAgendamento = ({ item }: { item: Agendamento }) => (
    <View style={s.agendamentoCard}>
      <View style={s.agendamentoHeader}>
        <Text style={s.agendamentoBarbeiro}>{item.barbeiroNome}</Text>
        <View
          style={[s.statusBadge, { backgroundColor: getStatusColor(item.status) }]}
          accessibilityLabel={`Status: ${getStatusText(item.status)}`}
        >
          <Text style={s.statusText}>{getStatusText(item.status)}</Text>
        </View>
      </View>
      <View style={s.agendamentoDataRow}>
        <Icone nome="calendario" tamanho={16} cor={theme.colors.textSecondary} decorativo />
        <Text style={s.agendamentoData}>
          {item.data} às {item.horario}
        </Text>
      </View>
    </View>
  );

  if (loading || carregandoBarbeiros) {
    // Skeleton loading (item 17): fantasmas do conteúdo em vez de spinner
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <SkeletonList count={4} />
      </SafeAreaView>
    );
  }

  const nomeExibido = userProfile?.nome
    ? userProfile.nome.split(' ')[0]
    : auth.currentUser?.email?.split('@')[0] || 'Cliente';

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Olá, {nomeExibido}!</Text>
          <Text style={s.title}>Barbeiros Disponíveis</Text>
        </View>
      </View>

      <FiltroChips ativo={filtroAtivo} onSelecionar={setFiltroAtivo} />

      <FlatList
        data={itensVitrine}
        keyExtractor={(item) => item.profissional.id}
        renderItem={({ item }) => renderProfissionalHero(item.profissional, item.negocioNome)}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <View style={s.emptyIcon}>
              <Icone nome="barbearia" tamanho={32} cor={theme.colors.textMuted} decorativo />
            </View>
            <Text style={s.emptyText}>Você ainda não adicionou uma barbearia</Text>
            <Text style={s.emptySubtext}>
              Escaneie o QR Code da barbearia, abra o link de convite que ela te
              enviou ou digite o código manualmente para começar a agendar.
            </Text>
            <TouchableOpacity
              style={s.emptyButton}
              onPress={() => navigation.navigate('AdicionarCodigo')}
              accessibilityRole="button"
              accessibilityLabel="Adicionar barbearia por código"
            >
              <Text style={s.emptyButtonText}>Adicionar por código</Text>
            </TouchableOpacity>
            <Text style={s.emptyHint}>
              Dica: abrir um link ou ler um QR Code de convite adiciona a
              barbearia automaticamente — sem precisar digitar nada.
            </Text>
          </View>
        }
        ListHeaderComponent={
          agendamentos.length > 0 ? (
            <View style={s.agendamentosSection}>
              <Text style={s.sectionTitle}>Meus Agendamentos</Text>
              {agendamentos.slice(0, PREVIA_AGENDAMENTOS).map((item) => (
                <View key={item.id}>{renderAgendamento({ item })}</View>
              ))}
              {(totalExibido > PREVIA_AGENDAMENTOS || temAgendamentoConcluido) && (
                <TouchableOpacity
                  style={s.verMaisButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver todos os ${totalExibido} agendamentos`}
                  onPress={() => navigation.navigate('Historico')}
                >
                  <Text style={s.verMaisText}>
                    Ver todos ({totalExibido})
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  greeting: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  agendamentosSection: {
    backgroundColor: theme.colors.surface,
    margin: 16,
    padding: 16,
    borderRadius: 14,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  negocioIcon: {
    marginRight: 6,
  },
  verPerfilLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  // Texto do card hero: sempre sobre o scrim escuro fixo (rgba preto), nunca
  // sobre theme.colors.surface — por isso usa cores fixas em vez de
  // theme.colors.text/textSecondary, que ficam escuras no tema claro e
  // perderiam contraste contra o scrim.
  heroNegocioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroNegocioNome: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FCD34D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroNome: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  heroEspecialidade: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 2,
  },
  heroVerPerfilText: {
    // Cor fixa (não theme.colors.primary/secondary): mesmo raciocínio de
    // heroNome/heroEspecialidade acima — este texto sempre fica sobre o
    // scrim escuro fixo, independente do tema claro/escuro do app.
    color: '#FCD34D',
    fontSize: 16,
    fontWeight: '700',
  },
  // Card "hero" (profissional solo): altura fixa, foto ocupando 100% do
  // card (via AvatarIlustrado variant="capa"), degradê + texto sobrepostos.
  // HERO_CARD_HEIGHT também é usado por SkeletonCard (variant="solo") em
  // Skeleton.tsx — mantenha os dois números em sincronia se este mudar.
  heroCard: {
    height: 250,
    backgroundColor: theme.colors.surfaceVariant,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.sombra,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  heroContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
  },
  heroButtonSpacing: {
    marginTop: 12,
  },
  agendamentoCard: {
    backgroundColor: theme.colors.surfaceVariant,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  agendamentoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  agendamentoBarbeiro: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    // Texto sobre badge de status com cor dinâmica (`getStatusColor`) — todas
    // as cores de STATUS_MAP são saturadas o bastante para texto branco
    // (nenhuma é o âmbar de `primary`/`secondary`).
    color: theme.colors.textSobreDestaque,
    fontSize: 12,
    fontWeight: '600',
  },
  agendamentoDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  agendamentoData: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  verMaisButton: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  verMaisText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 48,
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyButtonText: {
    // Texto sobre botão de fundo `primary` (âmbar).
    color: theme.colors.textSobrePrimaria,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: '90%',
  },
});
