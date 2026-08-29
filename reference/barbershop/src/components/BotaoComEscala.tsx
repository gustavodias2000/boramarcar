/**
 * BotaoComEscala — micro-interação de toque (Fase 4 do plano de design):
 * encolhe levemente (escala 0,96) ao pressionar e volta ao soltar, com a
 * opção de disparar um toque tátil (haptics) no `onPress`.
 *
 * Só apresentação — não decide nada de negócio. Usado nos CTAs de maior
 * valor (não em todo botão do app, ver BRIEFING/plano da Fase 4): o
 * `haptic` só deve ligar no botão que de fato "comete" a ação (ex.:
 * confirmar a reserva), nunca em passos intermediários — evita vibrar mais
 * de uma vez no mesmo fluxo.
 */
import React from 'react';
import {
  Pressable,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
  type AccessibilityRole,
  type AccessibilityState,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import RNHapticFeedback from 'react-native-haptic-feedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface BotaoComEscalaProps {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** Dispara um toque tátil leve junto com o `onPress`. Só no botão que efetivamente comete a ação. */
  haptic?: boolean;
  testID?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
}

export default function BotaoComEscala({
  children,
  onPress,
  style,
  disabled,
  haptic = false,
  testID,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
}: BotaoComEscalaProps) {
  const escala = useSharedValue(1);

  const estiloAnimado = useAnimatedStyle(() => ({
    transform: [{ scale: escala.value }],
  }));

  const handlePress = (event: GestureResponderEvent) => {
    if (haptic) {
      RNHapticFeedback.trigger('impactLight', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    }
    onPress?.(event);
  };

  return (
    <AnimatedPressable
      testID={testID}
      style={[style, estiloAnimado]}
      onPressIn={() => {
        escala.value = withSpring(0.96, { damping: 15, stiffness: 300 });
      }}
      onPressOut={() => {
        escala.value = withSpring(1, { damping: 15, stiffness: 300 });
      }}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
    >
      {children}
    </AnimatedPressable>
  );
}
