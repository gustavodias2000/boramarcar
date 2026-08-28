/**
 * WelcomeScreen — porta de entrada do fluxo de autenticação (v1).
 *
 * Primeira tela que um usuário deslogado vê (ver `SessaoService.rotaInicialParaUsuario`).
 * Antes disso o app abria direto no Login; agora o hero de marca+manifesto
 * que vivia em LoginScreen.tsx migrou para cá, e Login/Register viraram
 * telas de formulário mais enxutas — mesmo estilo visual das 3 telas
 * (paleta fixa e escura em `authTheme.ts`).
 *
 * Sem `expo-linear-gradient` (o app é RN CLI puro, não Expo): o
 * escurecimento da imagem de fundo usa `ScrimEscurecimento`, que empilha
 * muitas faixas finas com opacidade crescente em vez de um degradê real.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScrimEscurecimento from '../components/ScrimEscurecimento';
import { C, HERO_MANIFESTO, HERO_SUBTITULO } from './authTheme';
import { tipografia, raio } from '../theme/escala';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

const { width: W } = Dimensions.get('window');

// Fonte do manifesto escala com a largura da tela, com piso e teto para não
// espremer em telas pequenas nem exagerar em tablets — mesma fórmula que o
// hero usava em LoginScreen.tsx antes da migração.
const HERO_FONT_SIZE = Math.round(Math.min(40, Math.max(30, W * 0.095)));

// Tagline curta abaixo do nome da marca, no topo. Não faz parte do
// manifesto (HERO_MANIFESTO/HERO_SUBTITULO), que é copy já existente e
// obrigatória — esta linha é nova, ajuste livremente aqui sem tocar layout.
const TOPO_TAGLINE = 'Agendamento fácil para o seu barbeiro de confiança.';

export default function WelcomeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  return (
    <ImageBackground
      source={require('../assets/barbeiros_padrao/barbearia-degrade.png')}
      resizeMode="cover"
      style={s.background}
    >
      {/* ── "Gradiente" sem dependência nova, sem degrau visível ── */}
      <ScrimEscurecimento corBase="15,25,35" opacidadeMaxima={0.95} estilo={StyleSheet.absoluteFill} />

      <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
        {/* ── Topo: marca + tagline ── */}
        <View style={s.topo}>
          <Text style={s.brand}>BARBERSHOP</Text>
          <Text style={s.tagline}>{TOPO_TAGLINE}</Text>
        </View>

        {/* ── Base: manifesto + ações ── */}
        <View style={s.base}>
          <Text
            style={s.manifesto}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.3}
          >
            {HERO_MANIFESTO}
          </Text>
          <Text style={s.subtitulo}>{HERO_SUBTITULO}</Text>

          <TouchableOpacity
            style={s.btnEntrar}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="Ir para tela de login"
          >
            <Text style={s.btnEntrarText}>Entrar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnCriarConta}
            onPress={() => navigation.navigate('Register')}
            accessibilityRole="button"
            accessibilityLabel="Ir para tela de cadastro"
          >
            <Text style={s.btnCriarContaText}>Criar conta</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

// Paleta fixa `C` (fluxo de entrada sempre escuro, ver authTheme.ts). Único
// uso do ThemeContext é `theme.colors.textSobrePrimaria` (preto), porque tem
// o mesmo valor fixo nos dois temas e por isso não quebra a paleta fixa
// desta tela — `C.amber` e `theme.colors.primary` são o mesmo hex
// ('#F59E0B'), então texto sobre `C.amber` usa o mesmo token usado sobre
// `theme.colors.primary`.
const getStyles = (theme: Theme) => StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: C.bg,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },

  // ── Topo ──
  topo: {
    paddingTop: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  brand: {
    fontSize: tipografia.subtitulo.fontSize,
    fontWeight: '800',
    color: C.text,
    letterSpacing: 6,
  },
  tagline: {
    marginTop: 8,
    fontSize: tipografia.apoio.fontSize,
    color: C.textSec,
    textAlign: 'center',
  },

  // ── Base ──
  base: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  manifesto: {
    fontSize: HERO_FONT_SIZE,
    lineHeight: Math.round(HERO_FONT_SIZE * 1.1),
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.5,
    textAlign: 'left',
    marginBottom: 12,
  },
  subtitulo: {
    fontSize: tipografia.apoio.fontSize,
    color: C.textSec,
    lineHeight: 21,
    textAlign: 'left',
    marginBottom: 28,
    maxWidth: '90%',
  },
  btnEntrar: {
    backgroundColor: C.amber,
    borderRadius: raio.card,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
    shadowColor: C.amberShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 6,
  },
  btnEntrarText: {
    color: theme.colors.textSobrePrimaria,
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  btnCriarConta: {
    borderWidth: 1.5,
    borderColor: C.text,
    borderRadius: raio.card,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginTop: 12,
  },
  btnCriarContaText: {
    color: C.text,
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
