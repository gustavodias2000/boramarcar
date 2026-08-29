/**
 * PerfilProfissionalScreen — perfil público do profissional, acessado a
 * partir do link "Ver perfil →" na vitrine (ClienteHome).
 *
 * Mostra foto grande, nome, descrição (`especialidade`) e a lista de
 * serviços oferecidos. O cliente escolhe um serviço aqui e segue direto
 * para `AgendamentoScreen`, que pula a etapa de seleção de serviço quando
 * recebe `servicoId` (ver `route.params.servicoId` em AgendamentoScreen).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import { registrarErro } from '../services/ObservabilityService';
import { formatMoney } from '../utils/dateUtils';
import Icone from '../components/Icone';
import AvatarIlustrado from '../components/AvatarIlustrado';
import ScrimEscurecimento from '../components/ScrimEscurecimento';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Barbeiro } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PerfilProfissional'>;

// Hero em tela cheia (padrão "capa" — ver AvatarIlustrado/ClienteHome). Mais
// alto que o card da vitrine (250) por ser uma tela inteira, não um item de
// lista — mesma proporção do hero do Navalha (~380px numa tela de altura
// maior; 340 aqui fica no meio da faixa 320-360 pedida).
const HERO_HEIGHT = 340;

export default function PerfilProfissionalScreen({ route, navigation }: Props) {
  const { barbeiro: barbeiroRota } = route.params;
  // `useWindowDimensions()`, não `Dimensions.get('window')` direto no corpo
  // do módulo: `Dimensions.get()` chamado no import (fora do componente) foi
  // testado ao vivo no aparelho e devolveu uma largura menor que a real —
  // provável leitura antes do bridge nativo reportar as métricas definitivas
  // da janela. O hook lê o valor atual a cada render, sem esse risco.
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { theme } = useTheme();
  const s = getStyles(theme);

  // Fallback: mostra os dados já disponíveis da vitrine enquanto busca dados
  // frescos (mesmo padrão de AgendamentoScreen.loadBarbeiroDados).
  const [profissional, setProfissional] = useState<Barbeiro>(barbeiroRota);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const dados = await getBarbeiro(barbeiroRota.id);
        if (!cancelado && dados) setProfissional(dados);
      } catch (error) {
        registrarErro(error, { area: 'perfil-profissional', operacao: 'carregar-profissional' }).catch(() => {});
      }
    })();
    return () => {
      cancelado = true;
    };
    // Carga única na montagem: lê apenas `barbeiroRota.id`, que não muda
    // durante a vida da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nome = profissional.nome || 'Profissional';
  const especialidade = profissional.especialidade;
  const servicos = profissional.servicos ?? [];

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']} testID="perfil-profissional-screen">
      <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
        <View style={[s.hero, { width: SCREEN_WIDTH }]}>
          <AvatarIlustrado
            id={profissional.id}
            nome={nome}
            fotoUrl={profissional.fotoUrl}
            fotoPadraoId={profissional.fotoPadraoId}
            variant="capa"
            largura={SCREEN_WIDTH}
            altura={HERO_HEIGHT}
          />

          {/* Degradê sem dependência nova, sem degrau visível — mesmo
              componente e mesma cor-base usados no card hero de
              ClienteHome.tsx, para consistência visual entre as duas
              telas. */}
          <ScrimEscurecimento corBase="10,10,10" opacidadeMaxima={0.9} estilo={StyleSheet.absoluteFill} />

          <TouchableOpacity
            style={s.backButton}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={s.backButtonText}>‹</Text>
          </TouchableOpacity>

          {/* Nome + descrição sobrepostos na base da foto (padrão Navalha),
              em vez do bloco "info" separado abaixo do hero de antes. */}
          <View style={s.heroContent}>
            <Text style={s.nome}>{nome}</Text>
            {!!especialidade && <Text style={s.especialidade}>{especialidade}</Text>}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Serviços</Text>

          {servicos.length === 0 ? (
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
          ) : (
            servicos.map((sv) => (
              <TouchableOpacity
                key={sv.id}
                style={s.servicoCard}
                accessibilityRole="button"
                accessibilityLabel={`Agendar ${sv.nome}, ${sv.duracaoMinutos} minutos, ${formatMoney(sv.precoEmCentavos)}`}
                onPress={() => navigation.navigate('Agendamento', { barbeiro: profissional, servicoId: sv.id })}
              >
                <View style={s.servicoInfo}>
                  <Text style={s.servicoNome}>{sv.nome}</Text>
                  <View style={s.servicoMetaRow}>
                    <Icone nome="horario" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                    <Text style={s.servicoMeta}>{sv.duracaoMinutos} min</Text>
                  </View>
                </View>
                <View style={s.servicoRight}>
                  <Text style={s.servicoPreco}>{formatMoney(sv.precoEmCentavos)}</Text>
                  <View style={s.servicoCta}>
                    <Text style={s.servicoCtaText}>Reservar →</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
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
    hero: {
      height: HERO_HEIGHT,
      backgroundColor: theme.colors.surfaceVariant,
      overflow: 'hidden',
    },
    heroContent: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: 20,
    },
    backButton: {
      position: 'absolute',
      top: 12,
      left: 12,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 3,
    },
    backButtonText: {
      fontSize: 24,
      lineHeight: 24,
      color: theme.colors.text,
      fontWeight: '700',
    },
    // Nome/descrição ficam sobrepostos ao degradê escuro do hero — cores
    // FIXAS claras (não `theme.colors.*`), já que o fundo ali é sempre o
    // scrim escuro, independente do tema claro/escuro do app (mesmo
    // raciocínio de `heroNome`/`heroEspecialidade` em ClienteHome.tsx).
    nome: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#FFFFFF',
      marginBottom: 4,
    },
    especialidade: {
      fontSize: 16,
      color: 'rgba(255,255,255,0.82)',
    },
    section: {
      backgroundColor: theme.colors.surface,
      margin: 16,
      padding: 16,
      borderRadius: 14,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 3,
      elevation: 2,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 12,
    },
    servicoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceVariant,
      marginBottom: 10,
      gap: 12,
    },
    servicoInfo: {
      flex: 1,
    },
    servicoNome: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    servicoMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 8,
    },
    servicoMeta: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    // Preço + CTA "Reservar" empilhados à direita, igual à referência
    // (Navalha): o preço deixa de ser só um número solto e ganha um botão
    // explícito, em vez do cartão inteiro ser o único alvo de toque óbvio.
    servicoRight: {
      alignItems: 'flex-end',
      gap: 8,
    },
    servicoPreco: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    servicoCta: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    servicoCtaText: {
      // Texto sobre CTA de fundo `primary` (âmbar) — token consolidado na
      // Fase 1 (mesmo valor preto que já estava aqui, agora via token).
      color: theme.colors.textSobrePrimaria,
      fontSize: 12,
      fontWeight: '700',
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
