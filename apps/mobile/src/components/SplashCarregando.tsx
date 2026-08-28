/**
 * SplashCarregando — tela mostrada nos milissegundos em que o app está
 * verificando se já existe uma sessão gravada.
 *
 * Sem ela o app piscaria a tela de login antes de pular para a área do
 * usuário, o que parece bug. Usa a mesma paleta fixa escura do LoginScreen
 * para a transição ficar contínua.
 */
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { darkTheme } from '../context/ThemeContext';
import { tipografia, raio } from '../theme/escala';
import Icone from './Icone';

// Paleta fixa escura (mesma do LoginScreen, para a transição ficar
// contínua) — usa diretamente os tokens do tema escuro em vez de hex
// próprio: `amberGlow` é o único valor sem token direto (é `primary` do
// tema escuro com opacidade, não uma cor da paleta por si).
const amberGlow = 'rgba(245,158,11,0.20)';

export default function SplashCarregando() {
  return (
    <View style={s.container} accessibilityLabel="Abrindo o aplicativo">
      <View style={s.logoGlow}>
        <View style={s.logoCircle}>
          <Icone nome="barbearia" tamanho={32} cor={darkTheme.colors.background} decorativo />
        </View>
      </View>
      <Text style={s.appName}>Barbershop</Text>
      <ActivityIndicator size="large" color={darkTheme.colors.primary} style={s.spinner} />
      <Text style={s.hint}>Entrando...</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkTheme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoGlow: {
    width: 110,
    height: 110,
    borderRadius: raio.circulo,
    backgroundColor: amberGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: raio.circulo,
    backgroundColor: darkTheme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
  },
  appName: {
    fontSize: tipografia.display.fontSize,
    fontWeight: '800',
    color: darkTheme.colors.text,
    letterSpacing: 0.5,
  },
  spinner: { marginTop: 28 },
  hint: {
    marginTop: 14,
    fontSize: tipografia.apoio.fontSize,
    color: darkTheme.colors.textSecondary,
  },
});
