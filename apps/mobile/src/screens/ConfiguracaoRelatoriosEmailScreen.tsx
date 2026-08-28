/** Preferências do relatório financeiro enviado por e-mail ao dono. */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { getBarbeiro } from '../data/repositories/BarbeiroRepository';
import {
  getConfiguracaoRelatorioEmail,
  resolverAlvoRelatorioEmail,
  salvarConfiguracaoRelatorioEmail,
  type AlvoRelatorioEmail,
} from '../data/repositories/RelatorioEmailRepository';
import { useTheme, type Theme } from '../context/ThemeContext';
import { CONFIGURACAO_RELATORIO_EMAIL_PADRAO } from '../types';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ConfiguracaoRelatoriosEmailScreen() {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const [alvo, setAlvo] = useState<AlvoRelatorioEmail | null>(null);
  const [semanal, setSemanal] = useState(CONFIGURACAO_RELATORIO_EMAIL_PADRAO.semanal);
  const [mensal, setMensal] = useState(CONFIGURACAO_RELATORIO_EMAIL_PADRAO.mensal);
  const [emailDestino, setEmailDestino] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  const carregar = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const barbeiro = await getBarbeiro(uid);
      const alvoResolvido = resolverAlvoRelatorioEmail(
        barbeiro ?? { id: uid, nome: '' },
      );
      setAlvo(alvoResolvido);

      const config = await getConfiguracaoRelatorioEmail(alvoResolvido);
      setSemanal(config.semanal);
      setMensal(config.mensal);
      // Sem preferência salva, mostrar o destinatário que o serviço já usa.
      setEmailDestino(config.emailDestino || auth.currentUser?.email || '');
    } catch (erro) {
      console.error('Erro ao carregar preferências de relatório por email:', erro);
      // A tela permanece utilizável com os defaults, inclusive o semanal.
      setEmailDestino(auth.currentUser?.email || '');
    } finally {
      setCarregando(false);
    }
  };

  const salvar = async () => {
    if (!alvo || salvando) return;
    const uid = auth.currentUser?.uid;
    const emailNormalizado = emailDestino.trim().toLowerCase();

    const temEnvioAtivo = semanal || mensal;
    if (temEnvioAtivo && !EMAIL_VALIDO.test(emailNormalizado)) {
      Alert.alert('E-mail inválido', 'Informe um e-mail válido para receber os relatórios.');
      return;
    }
    if (!uid) return;

    setSalvando(true);
    try {
      await salvarConfiguracaoRelatorioEmail(
        alvo,
        {
          semanal,
          mensal,
          ...(temEnvioAtivo ? { emailDestino: emailNormalizado } : {}),
        },
        uid,
      );
      Alert.alert('Preferências salvas', 'Os próximos relatórios serão enviados para esse e-mail.');
    } catch (erro) {
      console.error('Erro ao salvar preferências de relatório por email:', erro);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <View style={s.centered}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.intro}>
          <Text style={s.title}>Receba o resumo da sua barbearia</Text>
          <Text style={s.subtitle}>
            Escolha quando quer receber os resultados financeiros e operacionais.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Frequência de envio</Text>
          <View style={s.switchRow}>
            <View style={s.switchText}>
              <Text style={s.switchLabel}>Relatório semanal</Text>
              <Text style={s.hint}>Resumo dos últimos 7 dias.</Text>
            </View>
            <Switch
              value={semanal}
              onValueChange={setSemanal}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Receber relatório semanal por e-mail"
            />
          </View>
          <View style={s.divider} />
          <View style={s.switchRow}>
            <View style={s.switchText}>
              <Text style={s.switchLabel}>Relatório mensal</Text>
              <Text style={s.hint}>Fechamento do mês anterior.</Text>
            </View>
            <Switch
              value={mensal}
              onValueChange={setMensal}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Receber relatório mensal por e-mail"
            />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Destinatário</Text>
          <Text style={s.hint}>Você pode usar o e-mail da sua conta ou o e-mail administrativo da barbearia. Não é necessário se os dois envios estiverem desativados.</Text>
          <TextInput
            value={emailDestino}
            onChangeText={setEmailDestino}
            placeholder="financeiro@sua-barbearia.com"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
            accessibilityLabel="E-mail para receber relatórios"
            accessibilityHint="Informe o destinatário dos relatórios financeiros"
          />
        </View>

        <Text style={s.note}>O relatório reúne faturamento, atendimentos, clientes e cancelamentos do período. Desative semanal e mensal para pausar os envios.</Text>

        <TouchableOpacity
          style={[s.saveButton, salvando && s.saveButtonDisabled]}
          onPress={salvar}
          disabled={salvando}
          accessibilityRole="button"
          accessibilityLabel="Salvar preferências de relatório por e-mail"
          accessibilityState={{ disabled: salvando, busy: salvando }}
        >
          {salvando
            ? <ActivityIndicator color={theme.colors.textSobrePrimaria} />
            : <Text style={s.saveButtonText}>Salvar preferências</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  intro: { marginBottom: 20 },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 6 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 },
  cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  switchText: { flex: 1, paddingRight: 12 },
  switchLabel: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  hint: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  divider: { height: 1, backgroundColor: theme.colors.borderLight, marginVertical: 8 },
  input: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    marginTop: 12,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  note: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18, marginHorizontal: 4, marginBottom: 18 },
  saveButton: { alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: 10, justifyContent: 'center', minHeight: 52, paddingHorizontal: 16 },
  saveButtonDisabled: { backgroundColor: theme.colors.textMuted },
  saveButtonText: { color: theme.colors.textSobrePrimaria, fontSize: 16, fontWeight: '700' },
});
