/**
 * ScrimEscurecimento — escurecimento gradual de cima (transparente) para
 * baixo (quase opaco) sobre uma imagem de fundo, sem depender de
 * `expo-linear-gradient`/`react-native-linear-gradient` (o app é RN CLI
 * puro; essas libs não estão instaladas nem são compatíveis aqui).
 *
 * Técnica: em vez de poucas faixas com opacidade fixa (o que cria
 * "degraus" visíveis — bordas duras entre faixas, como no problema
 * reportado em WelcomeScreen.tsx / ClienteHome.tsx), empilha muitas faixas
 * finas de altura igual, cada uma com opacidade um pouco maior que a
 * anterior seguindo uma curva suave. Quanto mais faixas finas, menos
 * degrau perceptível — com `N_FAIXAS` alto o olho não distingue mais as
 * bordas entre elas.
 *
 * Substitui o padrão anterior de 3 `View`s manuais com opacidade fixa
 * (`scrim1`/`scrim2`/`scrim3` em WelcomeScreen.tsx,
 * `heroScrim1`/`heroScrim2`/`heroScrim3` em ClienteHome.tsx).
 */
import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

interface ScrimEscurecimentoProps {
  /** Cor base em "R,G,B" (sem alpha) — ex.: '15,25,35' (padrão, tom escuro
   * azulado usado no fluxo de autenticação) ou '10,10,10' (preto neutro,
   * usado no card hero de ClienteHome). */
  corBase?: string;
  /** Opacidade da faixa mais escura (a de baixo, encostada na base). */
  opacidadeMaxima?: number;
  /** Estilo do container — normalmente `StyleSheet.absoluteFill` para
   * cobrir a imagem de fundo inteira. */
  estilo?: StyleProp<ViewStyle>;
}

// Número de faixas empilhadas. Quanto maior, mais suave o resultado (menos
// degrau perceptível). 16 ainda deixava degrau visível contra fundos de cor
// sólida e saturada (ex.: o avatar ilustrado sem foto, sem a textura de uma
// foto real pra disfarçar a transição) — 32 elimina isso sem custo de
// performance relevante (são só Views estáticas, sem imagem).
const N_FAIXAS = 32;

export default function ScrimEscurecimento({
  corBase = '15,25,35',
  opacidadeMaxima = 0.92,
  estilo,
}: ScrimEscurecimentoProps) {
  return (
    <View style={estilo} pointerEvents="none">
      {Array.from({ length: N_FAIXAS }).map((_, i) => {
        // Curva não-linear (expoente 1.3): a opacidade cresce devagar perto
        // do topo (mantém a foto bem visível ali) e mais rápido perto da
        // base — fica visualmente mais suave do que uma progressão linear,
        // que tende a deixar o meio "cinza" demais.
        const opacidade = Math.pow(i / (N_FAIXAS - 1), 1.3) * opacidadeMaxima;
        return (
          <View
            // Lista estática (N_FAIXAS fixo) que nunca reordena nem é
            // filtrada — usar o índice como key é seguro aqui.
            key={i}
            style={[
              styles.faixa,
              {
                height: `${100 / N_FAIXAS}%`,
                backgroundColor: `rgba(${corBase},${opacidade})`,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    width: '100%',
  },
});
