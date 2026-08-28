/**
 * OnboardingScreen — apresentação animada exibida apenas na primeira abertura.
 *
 * • 3 slides por tipo de usuário (cliente / barbeiro)
 * • FlatList horizontal paginada com dot indicators
 * • AsyncStorage guarda a flag após a primeira visualização
 * • Botões "Pular" (vai direto ao último slide) e "Próximo" / "Começar!"
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
  ImageBackground,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { C } from './authTheme';
import ScrimEscurecimento from '../components/ScrimEscurecimento';
import { tipografia, raio } from '../theme/escala';
import { useTheme, type Theme } from '../context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Conteúdo dos slides ──────────────────────────────────────────────────────
// Mesmo padrão visual de WelcomeScreen.tsx: cada slide é uma foto de fundo
// real em tela cheia (uma das 5 fotos padrão em
// `src/assets/barbeiros_padrao/`, o mesmo pool usado em
// `barbeirosPadrao.ts`), escurecida com `ScrimEscurecimento` e com o texto
// grande sobreposto — não mais emoji dentro de um círculo com glow.

interface Slide {
  key: string;
  imagem: ImageSourcePropType;
  titulo: string;
  descricao: string;
}

const SLIDES_CLIENTE: Slide[] = [
  {
    key: 'c1',
    imagem: require('../assets/barbeiros_padrao/barbearia-toalha-quente.png'),
    titulo: 'Bem-vindo ao Barbershop!',
    descricao:
      'O jeito mais fácil de agendar seu corte favorito sem sair de casa. Rápido, simples e sem filas!',
  },
  {
    key: 'c2',
    imagem: require('../assets/barbeiros_padrao/barbearia-corte.png'),
    titulo: 'Escolha seu barbeiro',
    descricao:
      'Veja os serviços, preços e horários disponíveis. Encontre o profissional perfeito para você!',
  },
  {
    key: 'c3',
    imagem: require('../assets/barbeiros_padrao/barbearia-barba.png'),
    titulo: 'Confirme e pronto!',
    descricao:
      'Reserve seu horário em segundos e receba confirmação na hora. Sua cadeira está esperando!',
  },
];

const SLIDES_BARBEIRO: Slide[] = [
  {
    key: 'b1',
    imagem: require('../assets/barbeiros_padrao/barbearia-lavagem.png'),
    titulo: 'Bem-vindo, Barbeiro!',
    descricao:
      'Gerencie sua agenda, seus clientes e seus serviços em um único lugar. Profissionalismo na palma da mão!',
  },
  {
    key: 'b2',
    imagem: require('../assets/barbeiros_padrao/barbearia-toalha-quente.png'),
    titulo: 'Receba agendamentos',
    descricao:
      'Clientes reservam horários em tempo real. Você confirma, cancela ou conclui com um toque!',
  },
  {
    key: 'b3',
    imagem: require('../assets/barbeiros_padrao/barbearia-degrade.png'),
    titulo: 'Configure e comece!',
    descricao:
      'Defina seus horários, serviços e preços. Em minutos você já estará recebendo os primeiros clientes!',
  },
];

// ─── Chave do AsyncStorage por tipo ──────────────────────────────────────────

export const ONBOARDING_KEY: Record<'cliente' | 'barbeiro', string> = {
  cliente: 'onboardingVisto_cliente',
  barbeiro: 'onboardingVisto_barbeiro',
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function OnboardingScreen({ route, navigation }: Props) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { tipo } = route.params;
  const slides = tipo === 'barbeiro' ? SLIDES_BARBEIRO : SLIDES_CLIENTE;
  const destino = tipo === 'barbeiro' ? 'Barbeiro' : 'Cliente';

  const flatListRef = useRef<FlatList<Slide>>(null);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  const concluir = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY[tipo], 'true');
    } catch (_) {
      // ignora falha no storage — o onboarding pode reaparecer na próxima sessão
    }
    // Barbeiro vai para o wizard de configuração inicial (serviços + horário)
    // antes de cair na home vazia. Substitui a tela para não voltar com o back.
    if (tipo === 'barbeiro') {
      navigation.replace('SetupBarbeiro');
    } else {
      navigation.replace(destino as any);
    }
  }, [tipo, destino, navigation]);

  const irParaSlide = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setIndiceAtual(index);
  };

  const handleProximo = () => {
    if (indiceAtual < slides.length - 1) {
      irParaSlide(indiceAtual + 1);
    } else {
      concluir();
    }
  };

  const handlePular = () => {
    irParaSlide(slides.length - 1);
  };

  const onMomentumScrollEnd = (e: any) => {
    const novoIndice = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setIndiceAtual(novoIndice);
  };

  const isUltimo = indiceAtual === slides.length - 1;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Botão pular (some no último slide) */}
      {!isUltimo && (
        <SafeAreaView style={styles.pularWrapper} edges={['top']}>
          <TouchableOpacity
            onPress={handlePular}
            style={styles.pularBtn}
            accessibilityRole="button"
            accessibilityLabel="Pular apresentação"
          >
            <Text style={styles.pularText}>Pular</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {/* Carrossel */}
      <Animated.FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <ImageBackground
            source={item.imagem}
            resizeMode="cover"
            style={[styles.slideBackground, { width: SCREEN_WIDTH }]}
          >
            {/* Mesmo escurecimento de WelcomeScreen.tsx — sem degrau visível
                e sem dependência de gradiente. */}
            <ScrimEscurecimento
              corBase="15,25,35"
              opacidadeMaxima={0.92}
              estilo={StyleSheet.absoluteFill}
            />
            <View style={styles.slideConteudo}>
              <Text style={styles.titulo}>{item.titulo}</Text>
              <Text style={styles.descricao}>{item.descricao}</Text>
            </View>
          </ImageBackground>
        )}
      />

      {/* Dots + botão */}
      <SafeAreaView style={styles.footer} edges={['bottom']}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => {
            const largura = scrollX.interpolate({
              inputRange: [
                (i - 1) * SCREEN_WIDTH,
                i * SCREEN_WIDTH,
                (i + 1) * SCREEN_WIDTH,
              ],
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const cor = scrollX.interpolate({
              inputRange: [
                (i - 1) * SCREEN_WIDTH,
                i * SCREEN_WIDTH,
                (i + 1) * SCREEN_WIDTH,
              ],
              outputRange: ['rgba(245,158,11,0.3)', C.amber, 'rgba(245,158,11,0.3)'],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: largura, backgroundColor: cor }]}
              />
            );
          })}
        </View>

        {/* Botão principal */}
        <TouchableOpacity
          style={styles.botao}
          onPress={handleProximo}
          accessibilityRole="button"
          accessibilityLabel={isUltimo ? 'Começar' : 'Próximo slide'}
        >
          <Text style={styles.botaoText}>
            {isUltimo ? 'Começar!' : 'Próximo →'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
// Paleta fixa `C` (fluxo de entrada sempre escuro, ver authTheme.ts). Único
// uso do ThemeContext é `theme.colors.textSobrePrimaria` (preto), porque tem
// o mesmo valor fixo nos dois temas e por isso não quebra a paleta fixa
// desta tela — `C.amber` e `theme.colors.primary` são o mesmo hex
// ('#F59E0B'), então texto sobre `C.amber` usa o mesmo token usado sobre
// `theme.colors.primary`.

const getStyles = (theme: Theme) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  pularWrapper: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
  },
  pularBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  pularText: {
    color: C.textSec,
    fontSize: tipografia.apoio.fontSize,
    fontWeight: '500',
  },
  // Slide = foto de fundo em tela cheia, mesmo padrão de WelcomeScreen.tsx
  // (ImageBackground + ScrimEscurecimento + texto sobreposto).
  slideBackground: {
    flex: 1,
  },
  slideConteudo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
    // Espaço suficiente pra não colidir com os dots + botão do footer,
    // que fica sobreposto na base da tela (ver `footer` abaixo).
    paddingBottom: 170,
  },
  // Mesmo peso visual de HERO_MANIFESTO em WelcomeScreen.tsx/authTheme.ts.
  titulo: {
    fontSize: tipografia.display.fontSize,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 40,
  },
  // Mesmo padrão de HERO_SUBTITULO: cor clara translúcida.
  descricao: {
    fontSize: tipografia.apoio.fontSize,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: '92%',
  },
  // Footer com dots + botão
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: raio.chip,
  },
  botao: {
    backgroundColor: C.amber,
    borderRadius: raio.card,
    paddingVertical: 18,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    shadowColor: C.amberShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 6,
  },
  botaoText: {
    color: theme.colors.textSobrePrimaria,
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
