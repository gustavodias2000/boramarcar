/**
 * ConfiguracaoNotificacoesScreen — barbeiro liga/desliga canais (WhatsApp,
 * SMS, Push) e eventos (novo agendamento, confirmação, cancelamento,
 * lembrete) de aviso de agendamento.
 *
 * Onda D do sistema multicanal de avisos: a fundação de dados (Onda A), o
 * orquestrador/trigger no backend (Onda B) e o FCM multi-dispositivo (Onda C)
 * já existem — esta tela só edita a preferência lida por eles.
 *
 * O alvo (negócio inteiro vs. profissional autônomo) é resolvido SEMPRE a
 * partir do uid logado (`resolverAlvoNotificacao`, ver NotificationRepository),
 * nunca de `profissionalId` — hoje profissionais de equipe não têm login
 * próprio, então não existe configuração individual por membro (mesma
 * decisão de produto de `configuracaoAgenda`/`bloqueiosPrivados`). Quando o
 * dono abre esta tela a partir de `EditarProfissionalScreen` com
 * `profissionalId` na rota, o parâmetro serve só para exibir "Configurando
 * para: {nome}" — o dado carregado e salvo continua sendo o do negócio.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import {
  resolverAlvoNotificacao,
  getConfiguracaoNotificacoes,
  salvarConfiguracaoNotificacoes,
} from '../data/repositories/NotificationRepository';
import type { AlvoNotificacao } from '../data/repositories/NotificationRepository';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { CONFIGURACAO_NOTIFICACOES_PADRAO } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfiguracaoNotificacoes'>;

export default function ConfiguracaoNotificacoesScreen({ route }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  // Só para exibição — ver cabeçalho do arquivo. O dado carregado/salvo
  // nunca depende deste parâmetro.
  const profissionalId = route.params?.profissionalId;
  const profissionalNome = route.params?.profissionalNome;

  const [alvo, setAlvo] = useState<AlvoNotificacao | null>(null);
  const [canais, setCanais] = useState(CONFIGURACAO_NOTIFICACOES_PADRAO.canais);
  const [eventos, setEventos] = useState(CONFIGURACAO_NOTIFICACOES_PADRAO.eventos);
  const [retornoCliente, setRetornoCliente] = useState(
    CONFIGURACAO_NOTIFICACOES_PADRAO.retornoCliente,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Carga única na montagem: `loadConfig` só usa `auth.currentUser` e
    // imports estáticos (nenhuma variável reativa do componente), então não
    // há dependência faltante a declarar aqui.
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const barbeiro = await getBarbeiro(uid);
      const alvoResolvido: AlvoNotificacao = barbeiro
        ? resolverAlvoNotificacao(barbeiro)
        : { tipo: 'autonomo', id: uid };
      setAlvo(alvoResolvido);

      const config = await getConfiguracaoNotificacoes(alvoResolvido);
      setCanais(config.canais);
      setEventos(config.eventos);
      setRetornoCliente(config.retornoCliente ?? CONFIGURACAO_NOTIFICACOES_PADRAO.retornoCliente);
    } catch (error) {
      // Leitura negada pela regra do Firestore (isolamento de tenant) ou
      // falha de rede: cai graciosamente nos padrões já em tela em vez de
      // quebrar — não há Alert aqui de propósito, mesmo padrão silencioso de
      // ConfigAgendaScreen.loadConfig.
      console.error('Erro ao carregar configuração de notificações:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!alvo || saving) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSaving(true);
    try {
      // Sempre os objetos `canais`/`eventos` COMPLETOS — o merge do
      // Firestore é só no nível do documento (ver
      // NotificationRepository.salvarConfiguracaoNotificacoes); mandar um
      // mapa parcial substituiria o mapa inteiro salvo.
      await salvarConfiguracaoNotificacoes(alvo, { canais, eventos, retornoCliente }, uid);
      Alert.alert('Sucesso!', 'Configuração de notificações salva.');
    } catch (error) {
      console.error('Erro ao salvar configuração de notificações:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        {profissionalId && (
          <View style={s.profissionalBanner}>
            <Text style={s.profissionalBannerText}>
              Configurando para: {profissionalNome || 'um profissional da equipe'}
            </Text>
          </View>
        )}

        {/* Canais */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Canais de Aviso</Text>

          <View style={s.switchRow}>
            <Text style={s.switchLabel}>WhatsApp</Text>
            {/* thumbColor do Switch nativo em todos os switches desta tela —
                não é texto/ícone/ActivityIndicator sobre fundo saturado (é o
                "polegar" do próprio componente), por isso fica fora do
                escopo dos tokens textSobrePrimaria/textSobreDestaque. */}
            <Switch
              value={canais.whatsapp}
              onValueChange={(v) => setCanais((p) => ({ ...p, whatsapp: v }))}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Ativar avisos por WhatsApp"
            />
          </View>
          <Text style={s.hint}>
            Depende da configuração do serviço de WhatsApp já existente. Se o
            envio falhar, o agendamento continua normalmente.
          </Text>

          <View style={s.switchRow}>
            <Text style={s.switchLabel}>SMS</Text>
            <Switch
              value={canais.sms}
              onValueChange={(v) => setCanais((p) => ({ ...p, sms: v }))}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Ativar avisos por SMS"
            />
          </View>
          <Text style={s.hint}>SMS pode gerar custo.</Text>

          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Push</Text>
            <Switch
              value={canais.push}
              onValueChange={(v) => setCanais((p) => ({ ...p, push: v }))}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Ativar avisos por notificação push"
            />
          </View>
          <Text style={s.hint}>
            Depende da permissão de notificações estar concedida no celular.
          </Text>

          <Text style={s.hintDestaque}>
            Desativar um canal não cancela nenhum agendamento — só interrompe
            os avisos daquele canal.
          </Text>
        </View>

        {/* Eventos */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Eventos que Avisam</Text>

          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Novo agendamento</Text>
            <Switch
              value={eventos.novoAgendamento}
              onValueChange={(v) => setEventos((p) => ({ ...p, novoAgendamento: v }))}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Avisar sobre novo agendamento"
            />
          </View>
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Confirmação</Text>
            <Switch
              value={eventos.confirmacao}
              onValueChange={(v) => setEventos((p) => ({ ...p, confirmacao: v }))}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Avisar sobre confirmação de agendamento"
            />
          </View>
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Cancelamento</Text>
            <Switch
              value={eventos.cancelamento}
              onValueChange={(v) => setEventos((p) => ({ ...p, cancelamento: v }))}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Avisar sobre cancelamento de agendamento"
            />
          </View>
          <View style={[s.switchRow, s.switchRowLast]}>
            <Text style={s.switchLabel}>Lembretes</Text>
            <Switch
              value={eventos.lembrete}
              onValueChange={(v) => setEventos((p) => ({ ...p, lembrete: v }))}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Avisar sobre lembretes de agendamento"
            />
          </View>
        </View>

        {/* Retenção é uma configuração própria: não usa o toggle de lembrete
            transacional acima e começa desligada para não disparar nenhuma
            comunicação nova sem uma decisão explícita do barbeiro. */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Lembrete de Retorno</Text>
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Avisar cliente inativo</Text>
            <Switch
              value={retornoCliente.ativo}
              onValueChange={(ativo) => setRetornoCliente((p) => ({ ...p, ativo }))}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Ativar lembrete de retorno para clientes inativos"
            />
          </View>
          <Text style={s.hint}>
            Envia um lembrete quando o cliente fica esse período sem um atendimento concluído.
          </Text>

          {retornoCliente.ativo && (
            <>
              <Text style={s.inputLabel}>Dias sem comparecer</Text>
              <TextInput
                value={String(retornoCliente.diasSemComparecer)}
                onChangeText={(texto) => {
                  const apenasDigitos = texto.replace(/\D/g, '');
                  const dias = Number(apenasDigitos);
                  if (!apenasDigitos) {
                    setRetornoCliente((p) => ({ ...p, diasSemComparecer: 7 }));
                    return;
                  }
                  setRetornoCliente((p) => ({
                    ...p,
                    diasSemComparecer: Math.min(180, Math.max(7, dias)),
                  }));
                }}
                keyboardType="number-pad"
                maxLength={3}
                style={s.daysInput}
                accessibilityLabel="Dias sem comparecer para lembrar o cliente"
                accessibilityHint="Escolha um período entre 7 e 180 dias"
              />
              <Text style={s.hint}>Escolha entre 7 e 180 dias. Padrão: 30 dias.</Text>
              <Text style={s.hintDestaque}>
                Neste primeiro momento, o lembrete é enviado somente por notificação push.
                WhatsApp exige consentimento específico do cliente e ainda não está disponível.
              </Text>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[s.saveButton, saving && s.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Salvar configurações de notificações"
          accessibilityState={{ disabled: saving, busy: saving }}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.textSobrePrimaria} />
          ) : (
            <Text style={s.saveButtonText}>Salvar Configurações</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scroll: {
      padding: 16,
      paddingBottom: 40,
    },
    profissionalBanner: {
      backgroundColor: theme.colors.primary + '20',
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    profissionalBannerText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.primary,
      textAlign: 'center',
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 12,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    switchRowLast: {
      marginBottom: 0,
    },
    switchLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    hint: {
      fontSize: 12,
      color: theme.colors.textMuted,
      marginBottom: 14,
      lineHeight: 17,
    },
    hintDestaque: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      lineHeight: 17,
      fontWeight: '600',
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: 4,
      marginBottom: 8,
    },
    daysInput: {
      borderWidth: 1,
      borderColor: theme.colors.textMuted,
      borderRadius: 10,
      color: theme.colors.text,
      fontSize: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 46,
      marginBottom: 8,
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      minHeight: 52,
      justifyContent: 'center',
    },
    saveButtonDisabled: {
      backgroundColor: theme.colors.textMuted,
    },
    saveButtonText: {
      color: theme.colors.textSobrePrimaria,
      fontSize: 16,
      fontWeight: '700',
    },
  });
