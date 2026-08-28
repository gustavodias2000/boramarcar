/**
 * ClienteTabs — Bottom Tab Navigator para o fluxo do cliente.
 *
 * Abas:
 *  1. Barbeiros    — lista de barbeiros disponíveis para agendar
 *  2. Agendamentos — histórico e próximos agendamentos do cliente
 *  3. Perfil       — perfil do cliente + sair
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import Icone, { type NomeIcone, type TamanhoIcone } from '../components/Icone';
import { tipografia } from '../theme/escala';
import type { ClienteTabParamList } from '../types';

import ClienteHome from '../screens/ClienteHome';
import ClienteAgendamentosTab from '../screens/tabs/ClienteAgendamentosTab';
import ClientePerfilTab from '../screens/tabs/ClientePerfilTab';

const Tab = createBottomTabNavigator<ClienteTabParamList>();

const ICONES: Record<string, NomeIcone> = {
  Barbeiros: 'tesoura',
  Agendamentos: 'calendario',
  PerfilCliente: 'pessoa',
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

const BarbeirosTabIcon = criarTabIcon(ICONES.Barbeiros);
const AgendamentosTabIcon = criarTabIcon(ICONES.Agendamentos);
const PerfilClienteTabIcon = criarTabIcon(ICONES.PerfilCliente);

export default function ClienteTabs() {
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
        name="Barbeiros"
        component={ClienteHome}
        options={{ title: 'Barbeiros', tabBarIcon: BarbeirosTabIcon }}
      />
      <Tab.Screen
        name="Agendamentos"
        component={ClienteAgendamentosTab}
        options={{ title: 'Meus Horários', tabBarIcon: AgendamentosTabIcon }}
      />
      <Tab.Screen
        name="PerfilCliente"
        component={ClientePerfilTab}
        options={{ title: 'Perfil', tabBarIcon: PerfilClienteTabIcon }}
      />
    </Tab.Navigator>
  );
}
