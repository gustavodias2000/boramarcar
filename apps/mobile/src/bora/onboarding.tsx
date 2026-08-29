import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BusinessType } from "@boramarca/core";
import { getSegmentConfig } from "@boramarca/core";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ImageBackground,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAccent } from "./accent";
import { segmentIcon } from "./segment-art";
import { colors, radius, space, type } from "./theme";
import { PrimaryButton, TextAction } from "./ui";

/**
 * As telas de boas-vindas do primeiro acesso.
 *
 * TRÊS SLIDES, e a copy da barbearia é A DO BARBERSHOP, palavra por palavra — não uma
 * releitura. Ela já foi escrita, revisada e usada; reescrever seria perder trabalho bom
 * para ganhar texto pior.
 *
 * POR PERFIL, NÃO UMA SÓ. Quem abre uma empresa e quem vai marcar um horário chegam com
 * perguntas diferentes: um quer saber se dá para administrar, o outro se dá para reservar
 * rápido. O Barbershop já separava, e a separação continua.
 *
 * POR SEGMENTO, e é aqui que ele deixa de ser preso à barbearia. A barbearia tem as
 * fotos e a copy dela; as outras categorias montam a própria a partir do vocabulário que
 * o segmento já declara — "Nail Designer", "Sessões", "Tutores" — sobre a arte da
 * categoria. Nenhuma manicure recebe "Bem-vindo, Barbeiro!".
 *
 * VISTO UMA VEZ, POR PERFIL. A chave no armazenamento separa empresário de cliente,
 * como no Barbershop: quem já viu o do cliente e depois abre uma empresa vê o do
 * empresário, que é outro conteúdo.
 */

const { width: LARGURA } = Dimensions.get("window");

export type OnboardingProfile = "empresario" | "cliente";

export interface Slide {
  readonly key: string;
  readonly imagem?: ImageSourcePropType;
  readonly titulo: string;
  readonly descricao: string;
}

/** A chave é por perfil, e o segmento entra nela: abrir um salão depois de uma barbearia
 *  é um primeiro acesso de verdade naquele contexto. */
export function onboardingKey(profile: OnboardingProfile, segment: BusinessType): string {
  return `@boramarca/onboarding/${profile}/${segment}`;
}

export async function onboardingJaVisto(
  profile: OnboardingProfile,
  segment: BusinessType,
): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(onboardingKey(profile, segment))) === "1";
  } catch {
    // Sem leitura do armazenamento, mostrar de novo é melhor que engolir a apresentação.
    return false;
  }
}

export async function marcarOnboardingVisto(
  profile: OnboardingProfile,
  segment: BusinessType,
): Promise<void> {
  try {
    await AsyncStorage.setItem(onboardingKey(profile, segment), "1");
  } catch {
    // Falhar aqui só custa ver a apresentação de novo. Não vale quebrar a entrada.
  }
}

// ── Barbearia: a copy do Barbershop, intacta ────────────────────────────────

const SLIDES_CLIENTE_BARBEARIA: readonly Slide[] = [
  {
    key: "c1",
    imagem: require("./assets/barbearia-toalha-quente.png"),
    titulo: "Bem-vindo ao Bora Marcá!",
    descricao:
      "O jeito mais fácil de agendar seu corte favorito sem sair de casa. Rápido, simples e sem filas!",
  },
  {
    key: "c2",
    imagem: require("./assets/barbearia-corte.png"),
    titulo: "Escolha seu barbeiro",
    descricao:
      "Veja os serviços, preços e horários disponíveis. Encontre o profissional perfeito para você!",
  },
  {
    key: "c3",
    imagem: require("./assets/barbearia-barba.png"),
    titulo: "Confirme e pronto!",
    descricao:
      "Reserve seu horário em segundos e receba confirmação na hora. Sua cadeira está esperando!",
  },
];

const SLIDES_EMPRESARIO_BARBEARIA: readonly Slide[] = [
  {
    key: "b1",
    imagem: require("./assets/barbearia-lavagem.png"),
    titulo: "Bem-vindo, Barbeiro!",
    descricao:
      "Gerencie sua agenda, seus clientes e seus serviços em um único lugar. Profissionalismo na palma da mão!",
  },
  {
    key: "b2",
    imagem: require("./assets/barbearia-toalha-quente.png"),
    titulo: "Receba agendamentos",
    descricao:
      "Clientes reservam horários em tempo real. Você confirma, cancela ou conclui com um toque!",
  },
  {
    key: "b3",
    imagem: require("./assets/barbearia-degrade.png"),
    titulo: "Configure e comece!",
    descricao:
      "Defina seus horários, serviços e preços. Em minutos você já estará recebendo os primeiros clientes!",
  },
];

/**
 * As demais categorias montam a copy do próprio vocabulário.
 *
 * Sai fotografia e entra a composição da categoria — a mesma decisão de `segment-art`,
 * pelo mesmo motivo: uma foto de barbearia numa apresentação de manicure é pior que
 * nenhuma foto.
 */
function slidesDoSegmento(profile: OnboardingProfile, segment: BusinessType): readonly Slide[] {
  const { label, labels } = getSegmentConfig(segment);

  if (profile === "cliente") {
    return [
      {
        key: "c1",
        titulo: "Bem-vindo ao Bora Marcá!",
        descricao: `O jeito mais fácil de marcar ${labels.appointmentPlural.toLocaleLowerCase()} sem sair de casa. Rápido, simples e sem filas!`,
      },
      {
        key: "c2",
        titulo: `Escolha ${labels.professional.toLocaleLowerCase() === "profissional" ? "seu profissional" : `seu ${labels.professional.toLocaleLowerCase()}`}`,
        descricao:
          "Veja os serviços, preços e horários disponíveis. Encontre o profissional perfeito para você!",
      },
      {
        key: "c3",
        titulo: "Confirme e pronto!",
        descricao:
          "Reserve seu horário em segundos e receba confirmação na hora. Seu lugar está garantido!",
      },
    ];
  }

  return [
    {
      key: "b1",
      titulo: `Bem-vindo ao Bora Marcá!`,
      descricao: `Gerencie a agenda, os ${labels.customerPlural.toLocaleLowerCase()} e os serviços da sua ${label.toLocaleLowerCase()} em um único lugar.`,
    },
    {
      key: "b2",
      titulo: `Receba ${labels.appointmentPlural.toLocaleLowerCase()}`,
      descricao: `${labels.customerPlural} reservam horários em tempo real. Você confirma, cancela ou conclui com um toque!`,
    },
    {
      key: "b3",
      titulo: "Configure e comece!",
      descricao:
        "Defina seus horários, serviços e preços. Em minutos você já estará recebendo os primeiros clientes!",
    },
  ];
}

export function slidesDoOnboarding(
  profile: OnboardingProfile,
  segment: BusinessType,
): readonly Slide[] {
  if (segment === "barbershop") {
    return profile === "cliente" ? SLIDES_CLIENTE_BARBEARIA : SLIDES_EMPRESARIO_BARBEARIA;
  }
  return slidesDoSegmento(profile, segment);
}

// ── A tela ──────────────────────────────────────────────────────────────────

export function Onboarding({
  profile,
  segment,
  onFinish,
}: {
  readonly profile: OnboardingProfile;
  readonly segment: BusinessType;
  readonly onFinish: () => void;
}) {
  const accent = useAccent();
  const slides = slidesDoOnboarding(profile, segment);
  const lista = useRef<FlatList<Slide>>(null);
  const [indice, setIndice] = useState(0);
  const ultimo = indice === slides.length - 1;

  function aoRolar(evento: NativeSyntheticEvent<NativeScrollEvent>) {
    const proximo = Math.round(evento.nativeEvent.contentOffset.x / LARGURA);
    if (proximo !== indice) setIndice(proximo);
  }

  function avancar() {
    if (ultimo) {
      onFinish();
      return;
    }
    lista.current?.scrollToOffset({ offset: (indice + 1) * LARGURA, animated: true });
  }

  return (
    <View style={styles.root}>
      <FlatList
        ref={lista}
        data={slides as Slide[]}
        keyExtractor={(slide) => slide.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={aoRolar}
        renderItem={({ item }) => <SlideView slide={item} segment={segment} />}
      />

      <SafeAreaView edges={["bottom"]} style={styles.rodape}>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`Passo ${indice + 1} de ${slides.length}`}
          style={styles.pontos}
        >
          {slides.map((slide, posicao) => (
            <View
              key={slide.key}
              style={[
                styles.ponto,
                posicao === indice && { width: 22, backgroundColor: accent.accent },
              ]}
            />
          ))}
        </View>

        <PrimaryButton label={ultimo ? "Começar" : "Continuar"} onPress={avancar} />
        {ultimo ? null : <TextAction label="Pular" onPress={onFinish} />}
      </SafeAreaView>
    </View>
  );
}

function SlideView({ slide, segment }: { readonly slide: Slide; readonly segment: BusinessType }) {
  const accent = useAccent();

  const texto = (
    <View style={styles.copy}>
      <Text accessibilityRole="header" style={styles.titulo}>
        {slide.titulo}
      </Text>
      <Text style={styles.descricao}>{slide.descricao}</Text>
    </View>
  );

  if (slide.imagem) {
    return (
      <ImageBackground source={slide.imagem} resizeMode="cover" style={styles.slide}>
        <View style={styles.scrim} />
        {texto}
      </ImageBackground>
    );
  }

  // Sem fotografia, a categoria se apresenta pela própria cor.
  return (
    <View style={[styles.slide, { backgroundColor: colors.background }]}>
      <View style={[styles.aura, { backgroundColor: accent.accentSoft }]} />
      <SegmentGlyph segment={segment} />
      {texto}
    </View>
  );
}

function SegmentGlyph({ segment }: { readonly segment: BusinessType }) {
  const accent = useAccent();
  const Glyph = segmentIcon(segment);
  return (
    <View style={styles.glyph} pointerEvents="none">
      <Glyph color={accent.accent} size={112} strokeWidth={1.2} opacity={0.9} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  slide: { width: LARGURA, flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(9, 17, 25, 0.68)" },
  aura: {
    position: "absolute",
    top: "14%",
    alignSelf: "center",
    width: LARGURA * 0.72,
    height: LARGURA * 0.72,
    borderRadius: LARGURA,
    opacity: 0.55,
  },
  glyph: { position: "absolute", top: "26%", alignSelf: "center" },
  copy: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: 10 },
  titulo: { ...type.display, color: colors.white, fontSize: 32, lineHeight: 36 },
  descricao: { ...type.body, color: "#D6E2EE", maxWidth: 330 },
  rodape: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: 12 },
  pontos: { flexDirection: "row", gap: 6, alignSelf: "center", marginBottom: 6 },
  ponto: { width: 7, height: 7, borderRadius: radius.round, backgroundColor: colors.border },
});
