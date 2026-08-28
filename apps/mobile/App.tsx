import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ThemeProvider } from './src/context/ThemeContext';
import { ToastProvider } from './src/context/ToastContext';
import { useSessaoRestaurada } from './src/hooks/useSessaoRestaurada';
import { criarLinking } from './src/services/DeepLinkService';
import SplashCarregando from './src/components/SplashCarregando';
import type { RootStackParamList } from './src/types';

// Navegação por tabs
import BarbeiroTabs from './src/navigation/BarbeiroTabs';
import ClienteTabs from './src/navigation/ClienteTabs';

// Telas
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import VerifyEmailScreen from './src/screens/VerifyEmailScreen';
import AgendamentoScreen from './src/screens/AgendamentoScreen';
import PerfilProfissionalScreen from './src/screens/PerfilProfissionalScreen';
import AbrirAgendamentoScreen from './src/screens/AbrirAgendamentoScreen';
import AbrirConviteScreen from './src/screens/AbrirConviteScreen';
import AbrirRelatoriosScreen from './src/screens/AbrirRelatoriosScreen';
import AdicionarCodigoScreen from './src/screens/AdicionarCodigoScreen';
import AgendamentoConfirmadoScreen from './src/screens/AgendamentoConfirmadoScreen';
import HistoricoScreen from './src/screens/HistoricoScreen';
import PerfilScreen from './src/screens/PerfilScreen';
import PrivacidadeScreen from './src/screens/PrivacidadeScreen';
import ConfigAgendaScreen from './src/screens/ConfigAgendaScreen';
import FolgasScreen from './src/screens/FolgasScreen';
import BloqueiosScreen from './src/screens/BloqueiosScreen';
import ConfigServicosScreen from './src/screens/ConfigServicosScreen';
import ConfiguracaoNotificacoesScreen from './src/screens/ConfiguracaoNotificacoesScreen';
import ConfiguracaoRelatoriosEmailScreen from './src/screens/ConfiguracaoRelatoriosEmailScreen';
import SetupBarbeiroScreen from './src/screens/SetupBarbeiroScreen';
import ClientesScreen from './src/screens/ClientesScreen';
import AniversariantesScreen from './src/screens/AniversariantesScreen';
import PromocaoScreen from './src/screens/PromocaoScreen';
import BannerPromocionalScreen from './src/screens/BannerPromocionalScreen';
import AgendamentoManualScreen from './src/screens/AgendamentoManualScreen';
import TemplatesMensagemScreen from './src/screens/TemplatesMensagemScreen';
import ClientesBanidosScreen from './src/screens/ClientesBanidosScreen';
import HistoricoClienteScreen from './src/screens/HistoricoClienteScreen';
import QRCodeScreen from './src/screens/QRCodeScreen';
import SuporteScreen from './src/screens/SuporteScreen';
import ListaEsperaScreen from './src/screens/ListaEsperaScreen';
import RecorrenciasScreen from './src/screens/RecorrenciasScreen';
import CriarRecorrenciaScreen from './src/screens/CriarRecorrenciaScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import EquipeScreen from './src/screens/EquipeScreen';
import EditarProfissionalScreen from './src/screens/EditarProfissionalScreen';
import ComissoesScreen from './src/screens/ComissoesScreen';
import DespesasScreen from './src/screens/DespesasScreen';
import VendasRelatorioScreen from './src/screens/VendasRelatorioScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Ref do container de navegação — usado por `NotificationService` para
// navegar a partir de um toque em notificação (fora da árvore de componentes,
// não tem acesso ao hook `useNavigation`). Ver `_handleNotificationNavigation`.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  // Sessão gravada no aparelho: se o usuário já entrou antes, abrimos direto
  // na área dele em vez de pedir email e senha de novo.
  const { carregando, rotaInicial } = useSessaoRestaurada();

  // `initialRouteName` só é lido na primeira montagem do Navigator, por isso
  // esperamos a sessão resolver antes de montá-lo — senão o app abriria no
  // Login e teria que "pular" para a área do usuário na frente dele.
  if (carregando) {
    return (
      <ThemeProvider>
        <SplashCarregando />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
      {/* `linking` faz o app abrir na tela certa quando o cliente escaneia o
          QR Code da barbearia (barbershop://agendar/{uid}). A rota inicial
          resolvida pela sessão é quem fica embaixo, para o botão voltar
          levar o cliente à área dele em vez de sair do app. */}
      <NavigationContainer ref={navigationRef} linking={criarLinking(rotaInicial)}>
        <Stack.Navigator
          initialRouteName={rotaInicial}
          screenOptions={{
            headerStyle: {
              backgroundColor: '#0F1923',
            },
            headerTintColor: '#F59E0B',
            headerTitleStyle: {
              fontWeight: '700',
              color: '#F8FAFC',
              fontSize: 17,
            },
            headerShadowVisible: false,
          }}
        >
          {/* Autenticação */}
          <Stack.Screen
            name="Welcome"
            component={WelcomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="VerifyEmail"
            component={VerifyEmailScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />

          {/* Cliente — Tab Navigator */}
          <Stack.Screen
            name="Cliente"
            component={ClienteTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Agendamento"
            component={AgendamentoScreen}
            options={{ title: 'Novo Agendamento' }}
          />
          <Stack.Screen
            name="PerfilProfissional"
            component={PerfilProfissionalScreen}
            options={{ headerShown: false }}
          />
          {/* Alvo do deep link do QR Code — resolve o profissional e some da pilha */}
          <Stack.Screen
            name="AbrirAgendamento"
            component={AbrirAgendamentoScreen}
            options={{ headerShown: false }}
          />
          {/* Alvo do deep link de convite (QR Code/link/convite de barbearia) —
              resgata o vínculo e some da pilha */}
          <Stack.Screen
            name="AbrirConvite"
            component={AbrirConviteScreen}
            options={{ headerShown: false }}
          />
          {/* O link no e-mail não abre dados diretamente: esta porta confirma
              a sessão e o perfil de barbeiro antes da aba Relatórios. */}
          <Stack.Screen
            name="AbrirRelatorios"
            component={AbrirRelatoriosScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AgendamentoConfirmado"
            component={AgendamentoConfirmadoScreen}
            options={{ title: 'Agendamento', headerBackVisible: false }}
          />
          <Stack.Screen
            name="Historico"
            component={HistoricoScreen}
            options={{ title: 'Histórico' }}
          />

          {/* Barbeiro — Tab Navigator */}
          <Stack.Screen
            name="Barbeiro"
            component={BarbeiroTabs}
            options={{ headerShown: false }}
          />

          {/* Compartilhadas */}
          <Stack.Screen
            name="Perfil"
            component={PerfilScreen}
            options={{ title: 'Meu Perfil' }}
          />
          <Stack.Screen
            name="Privacidade"
            component={PrivacidadeScreen}
            options={{ title: 'Política de Privacidade' }}
          />
          <Stack.Screen
            name="AdicionarCodigo"
            component={AdicionarCodigoScreen}
            options={{ title: 'Adicionar barbearia' }}
          />

          {/* Configurações do barbeiro */}
          <Stack.Screen
            name="ConfigAgenda"
            component={ConfigAgendaScreen}
            options={{ title: 'Horário de Atendimento' }}
          />
          <Stack.Screen
            name="Folgas"
            component={FolgasScreen}
            options={{ title: 'Dias de Folga' }}
          />
          <Stack.Screen
            name="Bloqueios"
            component={BloqueiosScreen}
            options={{ title: 'Bloquear Horário' }}
          />
          <Stack.Screen
            name="ConfigServicos"
            component={ConfigServicosScreen}
            options={{ title: 'Meus Serviços' }}
          />
          <Stack.Screen
            name="ConfiguracaoNotificacoes"
            component={ConfiguracaoNotificacoesScreen}
            options={{ title: 'Notificações de Agendamento' }}
          />
          <Stack.Screen
            name="ConfiguracaoRelatoriosEmail"
            component={ConfiguracaoRelatoriosEmailScreen}
            options={{ title: 'Relatórios por e-mail' }}
          />
          <Stack.Screen
            name="SetupBarbeiro"
            component={SetupBarbeiroScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Clientes"
            component={ClientesScreen}
            options={{ title: 'Clientes' }}
          />
          <Stack.Screen
            name="Aniversariantes"
            component={AniversariantesScreen}
            options={{ title: 'Aniversariantes' }}
          />
          <Stack.Screen
            name="Promocao"
            component={PromocaoScreen}
            options={{ title: 'Promoção' }}
          />
          <Stack.Screen
            name="BannerPromocional"
            component={BannerPromocionalScreen}
            options={{ title: 'Banner Promocional' }}
          />
          <Stack.Screen
            name="AgendamentoManual"
            component={AgendamentoManualScreen}
            options={{ title: 'Novo Agendamento' }}
          />
          <Stack.Screen
            name="Equipe"
            component={EquipeScreen}
            options={{ title: 'Minha Equipe' }}
          />
          <Stack.Screen
            name="EditarProfissional"
            component={EditarProfissionalScreen}
            options={{ title: 'Profissional' }}
          />
          <Stack.Screen
            name="Comissoes"
            component={ComissoesScreen}
            options={{ title: 'Comissões' }}
          />
          <Stack.Screen
            name="TemplatesMensagem"
            component={TemplatesMensagemScreen}
            options={{ title: 'Templates WhatsApp' }}
          />
          <Stack.Screen
            name="ClientesBanidos"
            component={ClientesBanidosScreen}
            options={{ title: 'Clientes Banidos' }}
          />
          <Stack.Screen
            name="HistoricoCliente"
            component={HistoricoClienteScreen}
            options={({ route }) => ({
              title: `Histórico — ${route.params.clienteNome}`,
            })}
          />
          <Stack.Screen
            name="QRCode"
            component={QRCodeScreen}
            options={{ title: 'QR Code de Agendamento' }}
          />
          <Stack.Screen
            name="Suporte"
            component={SuporteScreen}
            options={{ title: 'Ajuda e Suporte' }}
          />
          <Stack.Screen
            name="ListaEspera"
            component={ListaEsperaScreen}
            options={{ title: 'Lista de Espera' }}
          />
          <Stack.Screen
            name="Recorrencias"
            component={RecorrenciasScreen}
            options={{ title: 'Recorrências' }}
          />
          <Stack.Screen
            name="CriarRecorrencia"
            component={CriarRecorrenciaScreen}
            options={({ route }) => ({
              title: `Recorrência — ${route.params.clienteNome}`,
            })}
          />
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Despesas"
            component={DespesasScreen}
            options={{ title: 'Despesas' }}
          />
          <Stack.Screen
            name="VendasRelatorio"
            component={VendasRelatorioScreen}
            options={{ title: 'Vendas' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      </ToastProvider>
    </ThemeProvider>
  );
}
