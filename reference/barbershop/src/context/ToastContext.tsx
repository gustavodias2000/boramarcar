/**
 * ToastContext — feedback não-bloqueante (toast/snackbar), com uma
 * microanimação simples de entrada/saída (fade + slide).
 *
 * Item de prioridade baixa da AUDITORIA.md (Etapa 16/18): "toasts/bottom
 * sheets no lugar de Alerts". Não substitui o `Alert` nativo em TODO lugar
 * — confirmações destrutivas (cancelar agendamento, remover cliente) devem
 * continuar como `Alert` com botões Cancelar/Confirmar, porque exigem uma
 * decisão do usuário. O toast é só para o AVISO final de uma ação que já
 * foi decidida (“Agendamento confirmado”, “Cliente salvo”) — hoje esses
 * avisos usam `Alert.alert('Sucesso!', ...)` com um único botão OK, que
 * interrompe o fluxo sem necessidade.
 *
 * Sem dependência nova: usa `Animated` da própria RN, como o resto do
 * projeto já faz (ver jest.setup.js, que já tinha que lidar com isso).
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useTheme } from './ThemeContext';
import { tipografia, raio } from '../theme/escala';

export type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

/** Hook de conveniência: `const { showToast } = useToast();` */
export const useToast = (): ToastContextValue => useContext(ToastContext);

const DURATION_MS = 2600;
const ANIM_MS = 220;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 16, duration: ANIM_MS, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity, translateY]);

  const showToast = useCallback(
    (message: string, type: ToastType = 'success') => {
      if (timerRef.current) clearTimeout(timerRef.current);
      idRef.current += 1;
      setToast({ id: idRef.current, message, type });
      opacity.setValue(0);
      translateY.setValue(16);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: ANIM_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
      ]).start();
      timerRef.current = setTimeout(hide, DURATION_MS);
    },
    [opacity, translateY, hide],
  );

  const corPorTipo: Record<ToastType, string> = {
    success: theme.colors.success,
    error: theme.colors.error,
    info: theme.colors.info,
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.container,
            {
              backgroundColor: corPorTipo[toast.type],
              shadowColor: theme.colors.sombra,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <Text
            style={[styles.text, { color: theme.colors.textSobreDestaque }]}
            numberOfLines={2}
          >
            {toast.message}
          </Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
    borderRadius: raio.card,
    paddingVertical: 14,
    paddingHorizontal: 18,
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    zIndex: 999,
  },
  text: {
    // Cor aplicada inline no JSX (theme.colors.textSobreDestaque) — este
    // objeto estático não tem acesso a `theme`, mesmo padrão já usado aqui
    // para `backgroundColor`/`shadowColor` (ver estilo do container acima).
    fontSize: tipografia.apoio.fontSize,
    fontWeight: '700',
    textAlign: 'center',
  },
});
