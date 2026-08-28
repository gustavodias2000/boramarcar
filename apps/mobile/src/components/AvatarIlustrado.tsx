/**
 * AvatarIlustrado — avatar com iniciais sobre cor determinística por `id`,
 * ou a foto do profissional quando disponível. Substitui o círculo de
 * iniciais manual usado nas telas de vitrine (item da Fase 2 do redesign).
 *
 * Sem gradiente (não há `react-native-linear-gradient` no projeto): fundo
 * sólido escolhido por hash simples do `id`, dentro da paleta do tema atual.
 */
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme, type Theme } from '../context/ThemeContext';
import { FOTOS_PADRAO, type FotoPadraoId } from '../assets/barbeirosPadrao';
import { raio } from '../theme/escala';

interface AvatarIlustradoProps {
  id: string;
  nome: string;
  fotoUrl?: string;
  /** Foto padrão do pool local (sem upload) — usada só quando `fotoUrl`
   * não existe ainda. Ver `FOTOS_PADRAO`. */
  fotoPadraoId?: string;
  /** Obrigatório em `variant="circulo"` (define o diâmetro). Ignorado em
   * `variant="capa"`, que preenche o container do pai — opcional só para
   * não forçar os chamadores desse modo a inventar um valor sem sentido. */
  size?: number;
  /** 'circulo' (padrão): avatar pequeno e redondo, comportamento de sempre —
   * usado no card compacto de equipe e nas telas de perfil.
   * 'capa': preenche o container do pai, sem recorte circular — usado no
   * card "hero" do profissional solo, que reproduz o cartão de foto de capa
   * do app de referência Navalha. */
  variant?: 'circulo' | 'capa';
  /** Só em `variant="capa"`, opcional: dimensões exatas em pixels do
   * container pai. Quando informadas, a foto usa essas medidas diretamente
   * em vez de `StyleSheet.absoluteFillObject` — necessário porque, dentro de
   * uma `ScrollView` (ex.: `PerfilProfissionalScreen`), o preenchimento por
   * `absoluteFillObject` mede o `Image` antes do layout do pai estar
   * definitivo e a foto fica mais estreita que o container (bug confirmado
   * ao vivo: fundo do hero visível como uma faixa na borda direita). Dentro
   * de uma `FlatList` (ex.: `ClienteHome`) isso não acontece, mas passar as
   * medidas explícitas também ali não tem custo — por isso vale como padrão
   * sempre que o chamador souber as dimensões do container.       */
  largura?: number;
  altura?: number;
}

function isFotoPadraoId(valor: string | undefined): valor is FotoPadraoId {
  return !!valor && Object.prototype.hasOwnProperty.call(FOTOS_PADRAO, valor);
}

/** Converte um hex `#RRGGBB` em componentes RGB. Usado só para derivar os
 * círculos decorativos do fallback `capa` a partir da MESMA cor de fundo do
 * hash (nunca para inventar uma cor nova). */
function hexParaRgb(hex: string): [number, number, number] {
  const limpo = hex.replace('#', '');
  const r = parseInt(limpo.substring(0, 2), 16);
  const g = parseInt(limpo.substring(2, 4), 16);
  const b = parseInt(limpo.substring(4, 6), 16);
  return [r, g, b];
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

/** Hash simples e determinístico — mesmo `id` sempre gera a mesma cor. */
function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export default function AvatarIlustrado({
  id,
  nome,
  fotoUrl,
  fotoPadraoId,
  size = 0,
  variant = 'circulo',
  largura,
  altura,
}: AvatarIlustradoProps) {
  const { theme } = useTheme();
  const paleta = [
    theme.colors.primary,
    theme.colors.secondary,
    theme.colors.success,
    theme.colors.error,
    theme.colors.info,
  ];
  const corFundo = paleta[hashId(id) % paleta.length];
  const corTexto = theme.isDark ? theme.colors.background : theme.colors.surface;
  const isCapa = variant === 'capa';
  const radius = size / 2;

  const s = getStyles(theme);

  // 'capa': preenche o pai inteiro, sem recorte circular nem borda própria
  // (a borda do card hero, se houver, é responsabilidade do container pai).
  // 'circulo': dimensão fixa em `size`, redondo, com a borda fina de sempre.
  // Sem anotação explícita de `StyleProp<ViewStyle>` de propósito: o tipo
  // amplo de ViewStyle inclui `overflow: 'scroll'`, que não existe em
  // ImageStyle — isso quebraria a reutilização deste mesmo valor no `style`
  // do `<Image>` logo abaixo. Deixar o TS inferir o tipo estrutural mínimo
  // mantém a compatibilidade com View e Image ao mesmo tempo.
  const dimensaoStyle = isCapa
    ? largura != null && altura != null
      ? { width: largura, height: altura }
      : StyleSheet.absoluteFillObject
    : { width: size, height: size, borderRadius: radius };
  const bordaStyle = isCapa ? null : s.borda;

  if (fotoUrl) {
    return (
      <Image
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        source={{ uri: fotoUrl }}
        resizeMode="cover"
        style={[dimensaoStyle, bordaStyle]}
      />
    );
  }

  if (isFotoPadraoId(fotoPadraoId)) {
    return (
      <Image
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        source={FOTOS_PADRAO[fotoPadraoId]}
        resizeMode="cover"
        style={[dimensaoStyle, bordaStyle]}
      />
    );
  }

  // Fallback sem foto, modo 'capa': além da letra, 2 círculos decorativos
  // translúcidos concêntricos atrás dela — mesma assinatura visual dos
  // círculos de WelcomeScreen/LoginScreen/OnboardingScreen (ver `C.circle1`
  // /`circle2`/`circle3` em `screens/authTheme.ts`), mas sem inventar uma
  // paleta nova: a cor de cada círculo é a MESMA `corFundo` do hash,
  // clareada (tint) ou escurecida (shade) e aplicada com opacidade baixa —
  // uma cor idêntica a `corFundo` com alpha reduzido ficaria invisível
  // sobre o próprio `corFundo` (composição alpha de uma cor sobre ela mesma
  // não muda o resultado), por isso a variação de claridade é necessária
  // para os círculos aparecerem.
  const [rBase, gBase, bBase] = hexParaRgb(corFundo);
  const circuloClaro = `rgba(${clamp255(rBase + 55)},${clamp255(gBase + 55)},${clamp255(bBase + 55)},0.20)`;
  const circuloEscuro = `rgba(${clamp255(rBase - 40)},${clamp255(gBase - 40)},${clamp255(bBase - 40)},0.16)`;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        s.container,
        dimensaoStyle,
        bordaStyle,
        { backgroundColor: corFundo },
      ]}
    >
      {isCapa && (
        <>
          <View
            pointerEvents="none"
            style={[s.circuloDecorativo, s.circuloDecorativoGrande, { backgroundColor: circuloClaro }]}
          />
          <View
            pointerEvents="none"
            style={[s.circuloDecorativo, s.circuloDecorativoPequeno, { backgroundColor: circuloEscuro }]}
          />
        </>
      )}
      <Text style={[s.texto, { color: corTexto, fontSize: isCapa ? 96 : size * 0.4 }]}>
        {nome ? nome.charAt(0).toUpperCase() : '?'}
      </Text>
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      justifyContent: 'center',
      alignItems: 'center',
      // Necessário para os círculos decorativos do fallback 'capa' (que se
      // posicionam parcialmente fora dos limites via offsets negativos)
      // não vazarem visualmente para fora do próprio avatar.
      overflow: 'hidden',
    },
    texto: {
      fontWeight: 'bold',
    },
    borda: {
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
    },
    // Círculos decorativos concêntricos do fallback sem foto (só
    // `variant="capa"`) — mesma assinatura visual dos círculos translúcidos
    // do fluxo de autenticação, atrás da letra. `borderRadius: 999` força a
    // forma circular independente do tamanho calculado por `aspectRatio`.
    circuloDecorativo: {
      position: 'absolute',
      borderRadius: raio.circulo,
    },
    circuloDecorativoGrande: {
      width: '70%',
      aspectRatio: 1,
      top: '-20%',
      right: '-20%',
    },
    circuloDecorativoPequeno: {
      width: '45%',
      aspectRatio: 1,
      bottom: '-12%',
      left: '-12%',
    },
  });
