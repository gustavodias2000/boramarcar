import type { BusinessType } from "@boramarca/core";
import {
  Brush,
  CarFront,
  Eye,
  Feather,
  Flower2,
  Hand,
  HeartPulse,
  PawPrint,
  PenTool,
  Scissors,
  Sparkles,
  type LucideProps,
} from "lucide-react-native";
import type { ComponentType } from "react";
import React from "react";
import { ImageBackground, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";

import { useAccent } from "./accent";
import { colors, radius, space, type } from "./theme";

/**
 * A imagem de cada categoria.
 *
 * ESTE ARQUIVO EXISTE PORQUE FOTO DE BARBEARIA NÃO SERVE PARA MANICURE. As três fotos —
 * corte, barba, degradê — vieram do Barbershop e são ótimas numa barbearia. Usá-las como
 * arte padrão de todo cartão de profissional colocava tesoura e navalha dentro de um pet
 * shop e de um estúdio de tatuagem.
 *
 * DUAS FORMAS DE ARTE, e a diferença é honesta:
 *
 *   FOTOGRAFIA, onde ela existe. Hoje só a barbearia tem, herdada do Barbershop, e
 *   continua exatamente como estava — a categoria está pronta e não é para mexer.
 *
 *   COMPOSIÇÃO, onde não existe. Ícone do ofício sobre o acento da categoria, montado em
 *   código. Não é foto de banco de imagem nem desenho genérico: é o mesmo ícone que a
 *   categoria já usa no resto do aplicativo, no tom que já é dela. Fica coerente com o
 *   produto e cada categoria fica distinta da outra.
 *
 * A composição é o padrão de propósito. Quando chegar fotografia de manicure, ela entra
 * em `SEGMENT_PHOTOS` e a categoria passa a usá-la sem que nenhuma tela mude. O
 * contrário — deixar cair na foto da barbearia — é o que precisava acabar.
 *
 * O ícone também é dado da categoria e mora aqui junto: um mapa só evita que a tela de
 * escolha ofereça tesoura para "Pet Shop" enquanto o cartão mostra pata.
 */

export const SEGMENT_ICONS: Readonly<Record<BusinessType, ComponentType<LucideProps>>> = {
  barbershop: Scissors,
  automotive_aesthetics: CarFront,
  beauty_salon: Sparkles,
  manicure: Hand,
  makeup: Brush,
  massage: HeartPulse,
  tattoo: PenTool,
  eyebrows: Eye,
  aesthetics: Flower2,
  depilation: Feather,
  petshop: PawPrint,
};

/**
 * Fotografia por categoria. Só entra aqui o que existe de verdade.
 *
 * Uma categoria ausente NÃO é um buraco: ela cai na composição, que é arte completa.
 * Inventar uma entrada apontando para a foto de outro ramo seria o defeito que este
 * arquivo veio corrigir.
 */
const SEGMENT_PHOTOS: Partial<Record<BusinessType, readonly ImageSourcePropType[]>> = {
  barbershop: [
    require("./assets/barbearia-corte.png"),
    require("./assets/barbearia-barba.png"),
    require("./assets/barbearia-degrade.png"),
  ],
};

export function segmentIcon(businessType: BusinessType): ComponentType<LucideProps> {
  return SEGMENT_ICONS[businessType];
}

export function hasSegmentPhotos(businessType: BusinessType): boolean {
  return Boolean(SEGMENT_PHOTOS[businessType]?.length);
}

/**
 * A arte de um cartão.
 *
 * `position` faz a lista variar em vez de repetir a mesma imagem em toda linha — o mesmo
 * profissional cai sempre na mesma arte, porque o índice é estável.
 */
export function SegmentArt({
  businessType,
  position = 0,
  caption,
  subtitle,
  height = 132,
}: {
  readonly businessType: BusinessType;
  readonly position?: number;
  readonly caption: string;
  readonly subtitle?: string;
  readonly height?: number;
}) {
  const accent = useAccent();
  const photos = SEGMENT_PHOTOS[businessType];
  const Glyph = SEGMENT_ICONS[businessType];

  const legend = (
    <View style={styles.legend}>
      <Text numberOfLines={1} style={styles.caption}>
        {caption}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (photos?.length) {
    return (
      <ImageBackground
        source={photos[position % photos.length]!}
        imageStyle={styles.image}
        style={[styles.frame, { height }]}
      >
        <View style={styles.scrim} />
        {legend}
      </ImageBackground>
    );
  }

  return (
    <View style={[styles.frame, styles.composed, { height, backgroundColor: accent.accentSoft }]}>
      {/*
        Duas marcas d'água do ícone, em escalas e opacidades diferentes. Uma só, centrada,
        parecia placeholder de imagem que não carregou; duas, deslocadas, leem como
        padrão gráfico — que é o que a composição precisa ser para não parecer defeito.
      */}
      <View style={styles.watermarkBack} pointerEvents="none">
        <Glyph color={accent.accent} size={height * 1.05} strokeWidth={1} opacity={0.14} />
      </View>
      <View style={styles.watermarkFront} pointerEvents="none">
        <Glyph color={accent.accent} size={height * 0.44} strokeWidth={1.6} opacity={0.9} />
      </View>
      {legend}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.card,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  image: { borderRadius: radius.card },
  composed: { borderWidth: 1, borderColor: colors.border },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6, 13, 20, 0.48)" },
  watermarkBack: { position: "absolute", right: -28, top: -22 },
  watermarkFront: { position: "absolute", left: space.lg, top: space.lg },
  legend: { padding: space.lg, gap: 2 },
  caption: { ...type.label, color: colors.white, fontSize: 17 },
  subtitle: { ...type.micro, color: "#D6E2EE", fontWeight: "500" },
});
