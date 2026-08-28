/**
 * BarbeiroTabs — Bottom Tab Navigator para o fluxo do barbeiro.
 *
 * Abas:
 *  1. Inicio      — painel-resumo (tela de entrada; antes era a Agenda)
 *  2. Agenda      — lista de agendamentos do dia / todos
 *  3. Config      — configurações administrativas
 *  4. Analytics   — aba "Relatórios": cards Vendas/Compromissos/Despesas +
 *                   dashboard de métricas (rota interna segue "Analytics"
 *                   para não quebrar navigation.navigate já existente)
 *  5. Perfil      — perfil do barbeiro + sair
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import Icone, { type NomeIcone, type TamanhoIcone } from '../components/Icone';
import { tipografia } from '../theme/escala';
import type { BarbeiroTabParamList } from '../types';

import InicioScreen from '../screens/InicioScreen';
import BarbeiroHome from '../screens/BarbeiroHome';
import BarbeiroConfigTab from '../screens/tabs/BarbeiroConfigTab';
import BarbeiroRelatoriosTab from '../screens/tabs/BarbeiroRelatoriosTab';
import BarbeiroPerfilTab from '../screens/tabs/BarbeiroPerfilTab';

const Tab = createBottomTabNavigator<BarbeiroTabParamList>();

const ICONES: Record<string, NomeIcone> = {
  Inicio: 'inicio',
  Agenda: 'calendario',
  Config: 'configuracao',
  Analytics: 'relatorio',
  Perfil: 'pessoa',
};

/**
 * Aproxima o `size` que o React Navigation passa para `tabBarIcon` ao valor
 * mais próximo permitido pela escala do `Icone` (16/20/24/32) — nunca um
 * tamanho fixo inventado fora do padrão de tabs do React Navigation.
 */
function tamanhoIconeTab(size: number): TamanhoIcone {
  if (size <= 18) return 16;
  if (size <= 22) return 20;
  if (size <= 28) return 24;
  return 32;
}

/** Fábrica de `tabBarIcon`: usa `color`/`size` recebidos do React Navigation
 * (que já seguem `tabBarActiveTintColor`/`tabBarInactiveTintColor`), em vez
 * do antigo hack de opacidade sobre emoji de texto. */
function criarTabIcon(nome: NomeIcone) {
  return ({ color, size }: { focused: boolean; color: string; size: number }) => (
    <Icone nome={nome} tamanho={tamanhoIconeTab(size)} cor={color} decorativo />
  );
}

const InicioTabIcon = criarTabIcon(ICONES.Inicio);
const AgendaTabIcon = criarTabIcon(ICONES.Agenda);
const ConfigTabIcon = criarTabIcon(ICONES.Config);
const AnalyticsTabIcon = criarTabIcon(ICONES.Analytics);
const PerfilTabIcon = criarTabIcon(ICONES.Perfil);

export default function BarbeiroTabs() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 80 : 60,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: tipografia.micro.fontSize,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Inicio"
        component={InicioScreen}
        options={{ title: 'Início', tabBarIcon: InicioTabIcon }}
      />
      <Tab.Screen
        name="Agenda"
        component={BarbeiroHome}
        options={{ title: 'Agenda', tabBarIcon: AgendaTabIcon }}
      />
      <Tab.Screen
        name="Config"
        component={BarbeiroConfigTab}
        options={{ title: 'Configurações', tabBarIcon: ConfigTabIcon }}
      />
      <Tab.Screen
        name="Analytics"
        component={BarbeiroRelatoriosTab}
        options={{ title: 'Relatórios', tabBarIcon: AnalyticsTabIcon }}
      />
      <Tab.Screen
        name="Perfil"
        component={BarbeiroPerfilTab}
        options={{ title: 'Perfil', tabBarIcon: PerfilTabIcon }}
      />
    </Tab.Navigator>
  );
}
