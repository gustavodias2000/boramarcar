/**
 * LoginScreen — visual premium Azul Profundo + Âmbar (v3).
 *
 * A partir da divisão do fluxo de entrada em 3 telas (Welcome → Login →
 * Register), o hero de marca+manifesto migrou para a WelcomeScreen. Esta
 * tela ficou mais enxuta: botão de voltar, título curto e o formulário.
 *
 * Continua:
 *  • Animação de entrada: card sobe do fundo
 *  • Mostrar/ocultar senha com toggle
 *  • Listras diagonais de fundo (referência à pole de barbearia)
 *  • Scale feedback ao pressionar o botão principal
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { getProfile } from '../data/repositories/UsuarioRepository';
import { lembrarSessao } from '../services/SessaoService';
import {
  consumirAgendamentoPendente,
  consumirConvitePendente,
  consumirRelatorioPendente,
} from '../services/DeepLinkService';
import { C } from './authTheme';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

interface FormErrors {
  email?: string | null;
  senha?: string | null;
}

const { width: W, height: H } = Dimensions.get('window');

// ─── Listras diagonais ────────────────────────────────────────────────────────
const STRIPE_COUNT = 12;
const STRIPE_W = 2;
const STRIPE_GAP = W / STRIPE_COUNT;

export default function LoginScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [email, setEmail]                 = useState('');
  const [senha, setSenha]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [errors, setErrors]               = useState<FormErrors>({});
  const [emailFocused, setEmailFocused]   = useState(false);
  const [senhaFocused, setSenhaFocused]   = useState(false);
  const [mostrarSenha, setMostrarSenha]   = useState(false);

  const senhaRef = useRef<TextInput>(null);

  // ── Animações de entrada ──
  const topOpacity     = useRef(new Animated.Value(0)).current;
  const topTranslateY  = useRef(new Animated.Value(-24)).current;
  const cardOpacity   = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(32)).current;
  const btnScale      = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Usar timing (duração fixa) ao invés de spring para evitar que
    // o card ainda esteja se movendo quando o usuário toca nos inputs.
    Animated.parallel([
      Animated.timing(topOpacity, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }),
      Animated.timing(topTranslateY, {
        toValue: 0, duration: 350, useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1, duration: 400, delay: 150, useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 0, duration: 350, delay: 150, useNativeDriver: true,
      }),
    ]).start();
    // Animação de entrada, roda uma vez. Os quatro valores são
    // `useRef(new Animated.Value(...)).current` — a identidade nunca muda,
    // então listá-los como dependências não alteraria nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPressIn = () =>
    Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true }).start();
  const onPressOut = () =>
    Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();

  // ── Validação ──
  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const validateForm = () => {
    const errs: FormErrors = {};
    if (!email.trim())               errs.email = 'Email é obrigatório';
    else if (!validateEmail(email.trim())) errs.email = 'Email inválido';
    if (!senha.trim())               errs.senha = 'Senha é obrigatória';
    else if (senha.length < 6)       errs.senha = 'Mínimo 6 caracteres';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const clearError = (field: keyof FormErrors) => {
    if (errors[field]) setErrors(p => ({ ...p, [field]: null }));
  };

  // ── Login ──
  const handleLogin = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const { user } = await signInWithEmailAndPassword(auth, email.trim(), senha);
      if (!user.emailVerified) {
        navigation.replace('VerifyEmail');
        return;
      }
      await user.getIdToken(true);
      const userData = await getProfile(user.uid);
      const tipo = userData?.tipo === 'barbeiro' ? 'barbeiro' : 'cliente';
      // Guarda o tipo no aparelho: nas próximas aberturas o app já sabe para
      // qual área ir e não precisa pedir email e senha novamente.
      await lembrarSessao(user.uid, tipo);

      // Veio de um convite (QR Code/link/código) escaneado antes de entrar?
      // Tem prioridade sobre o agendamento pendente — cenário raro dos dois
      // coexistirem, mas precisa de uma ordem definida. Consumimos sempre
      // (mesmo para barbeiro) para o convite não ficar guardado e disparar
      // na conta errada depois.
      // Sempre consome: cliente descarta; barbeiro poderá retomá-lo abaixo.
      // Isso evita que uma intenção de relatório sobreviva a outro deep link.
      const relatorioPendente = await consumirRelatorioPendente();
      const convitePendente = await consumirConvitePendente();
      if (tipo === 'cliente' && convitePendente) {
        // A área autenticada precisa ser a base da pilha. Assim, quando a
        // tela transitória do convite terminar, Voltar nunca revela Welcome.
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Cliente' },
            {
              name: 'AbrirConvite',
              params: { codigo: convitePendente.codigo, origem: convitePendente.origem },
            },
          ],
        });
        return;
      }

      // Veio de um QR Code escaneado antes de entrar? Retoma o agendamento.
      // Consumimos sempre (mesmo para barbeiro) para o link não ficar guardado
      // e disparar na conta errada depois.
      const agendamentoPendente = await consumirAgendamentoPendente();
      if (tipo === 'cliente' && agendamentoPendente) {
        // Mantém Cliente embaixo do fluxo vindo do QR Code/link.
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Cliente' },
            { name: 'AbrirAgendamento', params: { barbeiroId: agendamentoPendente } },
          ],
        });
        return;
      }

      // Remove Welcome/Login do histórico depois de uma autenticação bem
      // sucedida. Na rota raiz autenticada, o botão físico Voltar encerra ou
      // minimiza o app; ele não pode levar à área pública.
      if (tipo === 'barbeiro' && relatorioPendente) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Barbeiro', params: { screen: 'Analytics' } }],
        });
        return;
      }

      navigation.reset({
        index: 0,
        routes: [{ name: tipo === 'barbeiro' ? 'Barbeiro' : 'Cliente' }],
      });
    } catch (error: any) {
      let msg = 'Erro ao fazer login. Tente novamente.';
      switch (error.code) {
        case 'auth/user-not-found':         msg = 'Usuário não encontrado.'; break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':     msg = 'Email ou senha incorretos.'; break;
        case 'auth/invalid-email':          msg = 'Email inválido.'; break;
        case 'auth/user-disabled':          msg = 'Conta desabilitada.'; break;
        case 'auth/too-many-requests':      msg = 'Muitas tentativas. Aguarde.'; break;
        case 'auth/network-request-failed': msg = 'Sem conexão com internet.'; break;
      }
      Alert.alert('Erro no login', msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Recuperar senha ──
  const handleForgotPassword = () => {
    if (!email.trim()) {
      Alert.alert('Recuperar senha', 'Digite seu email acima primeiro.');
      return;
    }
    if (!validateEmail(email.trim())) {
      Alert.alert('Email inválido', 'Digite um email válido para continuar.');
      return;
    }
    Alert.alert(
      'Recuperar senha',
      `Enviar link de recuperação para:\n${email.trim()}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            try {
              await sendPasswordResetEmail(auth, email.trim());
              Alert.alert('Email enviado!', 'Verifique sua caixa de entrada e spam.');
            } catch (e: any) {
              Alert.alert('Erro', e.code === 'auth/user-not-found'
                ? 'Nenhuma conta com este email.'
                : 'Não foi possível enviar o email.');
            }
          },
        },
      ],
    );
  };

  return (
    // Android: edges apenas 'top' — bottom é gerenciado pelo adjustResize do AndroidManifest.
    // 'bottom' junto com adjustResize causa duplo recálculo de inset ao abrir o teclado.
    <SafeAreaView style={s.safeArea} edges={['top']}>

      {/* ── Listras diagonais de fundo ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: STRIPE_COUNT }).map((_, i) => (
          <View
            key={i}
            style={[
              s.stripe,
              { left: i * STRIPE_GAP - H * 0.3 },
            ]}
          />
        ))}
      </View>

      {/* ── Círculos decorativos ── */}
      <View style={s.circleTopRight}  pointerEvents="none" />
      <View style={s.circleBottomLeft} pointerEvents="none" />
      <View style={s.circleCenter}    pointerEvents="none" />

      {/* No Android, o AndroidManifest já tem adjustResize — não usar behavior
          para evitar duplo ajuste que descarta o foco do input */}
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Topo animado: voltar + título ── */}
          <Animated.View
            style={[
              s.topSection,
              { opacity: topOpacity, transform: [{ translateY: topTranslateY }] },
            ]}
          >
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Welcome'))}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.backBtnIcon}>←</Text>
            </TouchableOpacity>

            <Text
              style={s.title}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.3}
            >
              {'Bem-vindo\nde volta.'}
            </Text>
            <Text style={s.subtitle}>Entre para agendar seu próximo corte.</Text>
          </Animated.View>

          {/* ── Card animado ── */}
          <Animated.View
            style={[
              s.card,
              { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] },
            ]}
          >
            <Text style={s.cardTitle}>Entrar na conta</Text>

            {/* Email */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>EMAIL</Text>
              <View style={[
                s.inputWrap,
                emailFocused  && s.inputWrapFocused,
                errors.email  && s.inputWrapError,
              ]}>
                <View style={s.inputIcon}>
                  <Icone nome="email" tamanho={16} cor={C.textSec} decorativo />
                </View>
                <TextInput
                  value={email}
                  onChangeText={t => { setEmail(t); clearError('email'); }}
                  style={s.input}
                  placeholder="seu@email.com"
                  placeholderTextColor={C.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => senhaRef.current?.focus()}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  accessibilityLabel="Campo de email"
                />
              </View>
              {errors.email ? (
                <View style={s.errorRow}>
                  <Icone nome="aviso" tamanho={16} cor={C.error} decorativo />
                  <Text style={s.errorText}>{errors.email}</Text>
                </View>
              ) : null}
            </View>

            {/* Senha */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>SENHA</Text>
              <View style={[
                s.inputWrap,
                senhaFocused  && s.inputWrapFocused,
                errors.senha  && s.inputWrapError,
              ]}>
                <View style={s.inputIcon}>
                  <Icone nome="senha" tamanho={16} cor={C.textSec} decorativo />
                </View>
                <TextInput
                  ref={senhaRef}
                  value={senha}
                  onChangeText={t => { setSenha(t); clearError('senha'); }}
                  style={s.input}
                  placeholder="Sua senha"
                  placeholderTextColor={C.textMuted}
                  secureTextEntry={!mostrarSenha}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  onFocus={() => setSenhaFocused(true)}
                  onBlur={() => setSenhaFocused(false)}
                  accessibilityLabel="Campo de senha"
                />
                {/* Toggle mostrar/ocultar senha */}
                <TouchableOpacity
                  onPress={() => setMostrarSenha(v => !v)}
                  style={s.eyeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icone
                    nome={mostrarSenha ? 'ocultar-senha' : 'mostrar-senha'}
                    tamanho={20}
                    cor={C.textSec}
                    decorativo
                  />
                </TouchableOpacity>
              </View>
              {errors.senha ? (
                <View style={s.errorRow}>
                  <Icone nome="aviso" tamanho={16} cor={C.error} decorativo />
                  <Text style={s.errorText}>{errors.senha}</Text>
                </View>
              ) : null}
            </View>

            {/* Botão principal com scale feedback */}
            <Animated.View style={{ transform: [{ scale: btnScale }] }}>
              <TouchableOpacity
                style={[s.loginBtn, loading && s.loginBtnDisabled]}
                onPress={handleLogin}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Entrar no aplicativo"
                accessibilityState={{ disabled: loading }}
              >
                {loading
                  ? <ActivityIndicator color={theme.colors.textSobrePrimaria} />
                  : <Text style={s.loginBtnText}>Entrar  →</Text>
                }
              </TouchableOpacity>
            </Animated.View>

            {/* Esqueci a senha */}
            <TouchableOpacity
              style={s.forgotBtn}
              onPress={handleForgotPassword}
              accessibilityRole="button"
              accessibilityLabel="Recuperar senha"
            >
              <Text style={s.forgotText}>Esqueceu sua senha?</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Criar conta ── */}
          <Animated.View
            style={[
              s.registerSection,
              { opacity: cardOpacity },
            ]}
          >
            <Text style={s.registerPrompt}>Ainda não tem conta?</Text>
            <TouchableOpacity
              style={s.registerBtn}
              onPress={() => navigation.navigate('Register')}
              accessibilityRole="button"
              accessibilityLabel="Criar nova conta"
            >
              <Text style={s.registerBtnText}>Criar conta grátis</Text>
            </TouchableOpacity>
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
// Paleta fixa `C` (fluxo de entrada sempre escuro, ver authTheme.ts) — só
// `theme.colors.sombra`, `theme.colors.textSobrePrimaria` (preto) vêm do
// ThemeContext, porque têm o mesmo valor fixo nos dois temas e por isso não
// quebram a paleta fixa desta tela. `C.amber` e `theme.colors.primary` são o
// mesmo hex ('#F59E0B'), então texto/ícone preto sobre `C.amber` usa o token
// normalmente usado sobre `theme.colors.primary`.
const styles = (theme: Theme) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  flex: { flex: 1 },

  // ── Listras ──
  stripe: {
    position: 'absolute',
    top: 0,
    width: STRIPE_W,
    height: H * 1.6,
    backgroundColor: C.stripe,
    transform: [{ rotate: '20deg' }],
  },

  // ── Círculos ──
  circleTopRight: {
    position: 'absolute',
    width: W * 0.85,
    height: W * 0.85,
    borderRadius: W * 0.425,
    backgroundColor: C.circle1,
    top: -W * 0.25,
    right: -W * 0.3,
  },
  circleBottomLeft: {
    position: 'absolute',
    width: W * 0.7,
    height: W * 0.7,
    borderRadius: W * 0.35,
    backgroundColor: C.circle2,
    bottom: -W * 0.2,
    left: -W * 0.25,
  },
  circleCenter: {
    position: 'absolute',
    width: W * 0.5,
    height: W * 0.5,
    borderRadius: W * 0.25,
    backgroundColor: C.circle3,
    top: '35%',
    left: '25%',
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    justifyContent: 'center',
  },

  // ── Topo (voltar + título) ──
  topSection: {
    alignItems: 'flex-start',
    paddingTop: 8,
    paddingBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: raio.modal,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  backBtnIcon: {
    fontSize: tipografia.subtitulo.fontSize,
    color: C.text,
  },
  title: {
    fontSize: tipografia.display.fontSize,
    lineHeight: 38,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.5,
    textAlign: 'left',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: tipografia.apoio.fontSize,
    color: C.textSec,
    lineHeight: 21,
    textAlign: 'left',
    maxWidth: '90%',
  },

  // ── Card ──
  card: {
    backgroundColor: C.card,
    borderRadius: raio.modal,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 24,
    marginTop: 4,
    marginBottom: 20,
    shadowColor: theme.colors.sombra,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardTitle: {
    fontSize: tipografia.subtitulo.fontSize,
    fontWeight: '700',
    color: C.text,
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // ── Campos ──
  fieldGroup: { marginBottom: 18 },
  label: {
    fontSize: tipografia.micro.fontSize,
    fontWeight: '700',
    color: C.amber,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.input,
    borderRadius: raio.input,
    borderWidth: 1.5,
    borderColor: C.inputBorder,
    paddingHorizontal: 14,
    minHeight: 52,
    // Elevation FIXA — nunca muda com o foco.
    // No Android, mudar elevation no onFocus (0 → 4) gera evento de layout
    // que o sistema interpreta como motivo para fechar o teclado.
    elevation: 2,
  },
  inputWrapFocused: {
    // Apenas muda a cor da borda — sem alterar elevation, shadow ou dimensões.
    // Qualquer mudança de layout/elevation aqui conflita com adjustResize no Android.
    borderColor: C.amber,
    // shadowColor/shadowOffset/shadowOpacity/shadowRadius são iOS-only;
    // no Android não têm efeito, por isso foram removidos daqui.
  },
  inputWrapError: {
    borderColor: C.error,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: tipografia.corpo.fontSize,
    color: C.text,
    paddingVertical: 0,
  },
  eyeBtn: {
    paddingLeft: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: C.errorBg,
    borderRadius: raio.chip,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  errorText: {
    color: C.error,
    fontSize: tipografia.micro.fontSize,
    fontWeight: '500',
  },

  // ── Botão principal ──
  loginBtn: {
    backgroundColor: C.amber,
    borderRadius: raio.card,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 54,
    justifyContent: 'center',
    shadowColor: C.amberShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 6,
  },
  loginBtnDisabled: {
    backgroundColor: C.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  loginBtnText: {
    color: theme.colors.textSobrePrimaria,
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  forgotBtn: {
    alignItems: 'center',
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  forgotText: {
    color: C.textSec,
    fontSize: tipografia.apoio.fontSize,
    fontWeight: '500',
  },

  // ── Criar conta ──
  registerSection: {
    alignItems: 'center',
    gap: 14,
  },
  registerPrompt: {
    fontSize: tipografia.apoio.fontSize,
    color: C.textSec,
  },
  registerBtn: {
    borderWidth: 1.5,
    borderColor: C.amber,
    borderRadius: raio.card,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    width: '100%',
    backgroundColor: C.amberDim,
  },
  registerBtnText: {
    color: C.amber,
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
