/**
 * RegisterScreen — visual alinhado ao mesmo estilo premium escuro de
 * LoginScreen.tsx / WelcomeScreen.tsx (paleta fixa `C`, ver `authTheme.ts`).
 *
 * Antes esta tela usava `theme.colors.*` (tema claro/escuro do resto do
 * app), o que a deixava visualmente inconsistente com o Login. Agora as 3
 * telas do fluxo de entrada usam exatamente a mesma paleta.
 *
 * Nenhuma lógica de negócio mudou aqui — só apresentação e estilos.
 * Continuam obrigatórios: seletor Cliente/Barbeiro, campo de especialidade
 * (só para barbeiro), e o consentimento LGPD (checkbox + link para a
 * Política de Privacidade), exigido por lei antes de criar a conta.
 */
import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { createProfile } from '../data/repositories/UsuarioRepository';
import { maskPhone, formatPhoneToE164 } from '../utils/dateUtils';
import { C } from './authTheme';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import { useTheme, type Theme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TipoUsuario } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

interface FormErrors {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  senha?: string | null;
  confirmarSenha?: string | null;
  politica?: string | null;
}

export default function RegisterScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [tipo, setTipo] = useState<TipoUsuario>('cliente');
  const [especialidade, setEspecialidade] = useState('');
  const [aceitouPolitica, setAceitouPolitica] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const validateForm = () => {
    const newErrors: FormErrors = {};
    if (!nome.trim() || nome.trim().length < 3) {
      newErrors.nome = 'Nome deve ter pelo menos 3 caracteres';
    }
    if (!email.trim()) {
      newErrors.email = 'Email é obrigatório';
    } else if (!validateEmail(email.trim())) {
      newErrors.email = 'Email inválido';
    }
    const digits = telefone.replace(/\D/g, '');
    if (!digits || digits.length < 10) {
      newErrors.telefone = 'Telefone inválido (mínimo 10 dígitos)';
    }
    if (!senha.trim()) {
      newErrors.senha = 'Senha é obrigatória';
    } else if (senha.length < 6) {
      newErrors.senha = 'Senha deve ter pelo menos 6 caracteres';
    }
    if (senha !== confirmarSenha) {
      newErrors.confirmarSenha = 'Senhas não conferem';
    }
    // LGPD: consentimento explícito é obrigatório para tratar dados pessoais
    if (!aceitouPolitica) {
      newErrors.politica = 'É necessário aceitar a Política de Privacidade';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        senha,
      );
      const { uid } = userCredential.user;

      const telefoneE164 = formatPhoneToE164(telefone);

      await createProfile(uid, {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        telefone: telefoneE164,
        tipo,
        ...(tipo === 'barbeiro' && { especialidade: especialidade.trim() || 'Corte e barba' }),
        // LGPD: registra o consentimento. O carimbo de quando isso
        // aconteceu (`consentimentoEm`) é gravado pelo próprio
        // UsuarioRepository — a tela não cria timestamp do Firestore.
        consentimentoLGPD: true,
      });

      // Já entra logado e continua logado nas próximas aberturas.
      // Item 13: dispara o email de verificação (não bloqueia o fluxo)
      try {
        await sendEmailVerification(userCredential.user);
      } catch (verificationError) {
        console.warn('Falha ao enviar email de verificacao:', verificationError);
      }

      Alert.alert(
        'Conta criada!',
        'Enviamos um email de verificação para ' +
          email.trim() +
          '. Confirme o email para liberar o acesso ao aplicativo.',
        [{ text: 'Continuar', onPress: () => navigation.replace('VerifyEmail') }],
      );
    } catch (error: any) {
      console.error('Erro no cadastro:', error);
      let errorMessage = 'Erro ao criar conta. Tente novamente.';
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Este email já está cadastrado.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Email inválido.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Senha muito fraca. Use pelo menos 6 caracteres.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Erro de conexão. Verifique sua internet.';
          break;
        default:
          errorMessage = 'Erro inesperado. Tente novamente.';
      }
      Alert.alert('Erro no Cadastro', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const clearError = (field: keyof FormErrors) => {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={s.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Topo: voltar + título ── */}
          <View style={s.topSection}>
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Welcome'))}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.backBtnIcon}>←</Text>
            </TouchableOpacity>

            <Text style={s.title} accessibilityRole="header">
              {'Criar sua\nconta.'}
            </Text>
            <Text style={s.subtitle}>Escolha seu perfil para começar.</Text>
          </View>

          <View style={s.card}>
            {/* Tipo de conta */}
            <Text style={s.label}>TIPO DE CONTA</Text>
            <View style={s.tipoContainer}>
              <TouchableOpacity
                style={[s.tipoButton, tipo === 'cliente' && s.tipoButtonActive]}
                accessibilityRole="button"
                accessibilityLabel="Cadastrar como cliente"
                accessibilityState={{ selected: tipo === 'cliente' }}
                onPress={() => setTipo('cliente')}
              >
                <View style={s.tipoButtonContent}>
                  <Icone
                    nome="tesoura"
                    tamanho={16}
                    cor={tipo === 'cliente' ? theme.colors.textSobrePrimaria : C.textSec}
                    decorativo
                  />
                  <Text
                    style={[s.tipoButtonText, tipo === 'cliente' && s.tipoButtonTextActive]}
                  >
                    Cliente
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tipoButton, tipo === 'barbeiro' && s.tipoButtonActive]}
                accessibilityRole="button"
                accessibilityLabel="Cadastrar como barbeiro"
                accessibilityState={{ selected: tipo === 'barbeiro' }}
                onPress={() => setTipo('barbeiro')}
              >
                <View style={s.tipoButtonContent}>
                  <Icone
                    nome="barbearia"
                    tamanho={16}
                    cor={tipo === 'barbeiro' ? theme.colors.textSobrePrimaria : C.textSec}
                    decorativo
                  />
                  <Text
                    style={[s.tipoButtonText, tipo === 'barbeiro' && s.tipoButtonTextActive]}
                  >
                    Barbeiro
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Campos exclusivos do barbeiro */}
            {tipo === 'barbeiro' && (
              <View style={s.fieldGroup}>
                <Text style={s.label}>ESPECIALIDADE</Text>
                <View style={s.inputWrap}>
                  <TextInput
                    value={especialidade}
                    onChangeText={setEspecialidade}
                    style={s.input}
                    placeholder="Ex: Corte, barba e sobrancelha"
                    placeholderTextColor={C.textMuted}
                    autoCapitalize="sentences"
                    accessibilityLabel="Especialidade do barbeiro"
                  />
                </View>
              </View>
            )}

            {/* Nome */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>NOME COMPLETO</Text>
              <View style={[s.inputWrap, errors.nome && s.inputWrapError]}>
                <TextInput
                  value={nome}
                  onChangeText={(t) => { setNome(t); clearError('nome'); }}
                  style={s.input}
                  placeholder="Seu nome completo"
                  placeholderTextColor={C.textMuted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel="Nome completo"
                />
              </View>
              {errors.nome ? (
                <View style={s.errorRow}>
                  <Icone nome="aviso" tamanho={16} cor={C.error} decorativo />
                  <Text style={s.errorText}>{errors.nome}</Text>
                </View>
              ) : null}
            </View>

            {/* Email */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>EMAIL</Text>
              <View style={[s.inputWrap, errors.email && s.inputWrapError]}>
                <TextInput
                  value={email}
                  onChangeText={(t) => { setEmail(t); clearError('email'); }}
                  style={s.input}
                  placeholder="seuemail@exemplo.com"
                  placeholderTextColor={C.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Email"
                />
              </View>
              {errors.email ? (
                <View style={s.errorRow}>
                  <Icone nome="aviso" tamanho={16} cor={C.error} decorativo />
                  <Text style={s.errorText}>{errors.email}</Text>
                </View>
              ) : null}
            </View>

            {/* Telefone */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>TELEFONE / WHATSAPP</Text>
              <View style={[s.inputWrap, errors.telefone && s.inputWrapError]}>
                <TextInput
                  value={telefone}
                  onChangeText={(t) => { setTelefone(maskPhone(t)); clearError('telefone'); }}
                  style={s.input}
                  placeholder="(11) 99999-9999"
                  placeholderTextColor={C.textMuted}
                  keyboardType="phone-pad"
                  maxLength={15}
                  accessibilityLabel="Telefone ou WhatsApp"
                />
              </View>
              {errors.telefone ? (
                <View style={s.errorRow}>
                  <Icone nome="aviso" tamanho={16} cor={C.error} decorativo />
                  <Text style={s.errorText}>{errors.telefone}</Text>
                </View>
              ) : null}
            </View>

            {/* Senha */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>SENHA</Text>
              <View style={[s.inputWrap, errors.senha && s.inputWrapError]}>
                <TextInput
                  value={senha}
                  onChangeText={(t) => { setSenha(t); clearError('senha'); }}
                  style={s.input}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor={C.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Senha"
                />
              </View>
              {errors.senha ? (
                <View style={s.errorRow}>
                  <Icone nome="aviso" tamanho={16} cor={C.error} decorativo />
                  <Text style={s.errorText}>{errors.senha}</Text>
                </View>
              ) : null}
            </View>

            {/* Confirmar Senha */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>CONFIRMAR SENHA</Text>
              <View style={[s.inputWrap, errors.confirmarSenha && s.inputWrapError]}>
                <TextInput
                  value={confirmarSenha}
                  onChangeText={(t) => { setConfirmarSenha(t); clearError('confirmarSenha'); }}
                  style={s.input}
                  placeholder="Repita a senha"
                  placeholderTextColor={C.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Confirmar senha"
                />
              </View>
              {errors.confirmarSenha ? (
                <View style={s.errorRow}>
                  <Icone nome="aviso" tamanho={16} cor={C.error} decorativo />
                  <Text style={s.errorText}>{errors.confirmarSenha}</Text>
                </View>
              ) : null}
            </View>

            {/* Consentimento LGPD — obrigatório, não pode sumir do fluxo */}
            <TouchableOpacity
              style={s.consentRow}
              accessibilityRole="checkbox"
              accessibilityLabel="Li e aceito a Política de Privacidade"
              accessibilityState={{ checked: aceitouPolitica }}
              onPress={() => {
                setAceitouPolitica((v) => !v);
                clearError('politica');
              }}
            >
              <View style={[s.checkbox, aceitouPolitica && s.checkboxChecked]}>
                {aceitouPolitica ? (
                  <Icone nome="check" tamanho={16} cor={theme.colors.textSobrePrimaria} decorativo />
                ) : null}
              </View>
              <Text style={s.consentText}>
                Li e aceito a{' '}
                <Text
                  style={s.consentLink}
                  onPress={() => navigation.navigate('Privacidade')}
                >
                  Política de Privacidade
                </Text>{' '}
                e o tratamento dos meus dados conforme a LGPD.
              </Text>
            </TouchableOpacity>
            {errors.politica ? (
              <View style={s.errorRow}>
                <Icone nome="aviso" tamanho={16} cor={C.error} decorativo />
                <Text style={s.errorText}>{errors.politica}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.button, loading && s.buttonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Criar conta"
              accessibilityState={{ disabled: loading }}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.textSobrePrimaria} />
              ) : (
                <Text style={s.buttonText}>Criar conta</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.loginLink}
              accessibilityRole="button"
              accessibilityLabel="Voltar para login"
              onPress={() => navigation.goBack()}
            >
              <Text style={s.loginLinkText}>
                Já tem conta?{' '}
                <Text style={s.loginLinkBold}>Entrar</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  // ── Topo ──
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
    marginBottom: 20,
    shadowColor: theme.colors.sombra,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },

  // ── Seletor de tipo ──
  tipoContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  tipoButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: raio.card,
    borderWidth: 1.5,
    borderColor: C.inputBorder,
    alignItems: 'center',
    backgroundColor: C.input,
    minHeight: 52,
    justifyContent: 'center',
  },
  tipoButtonActive: {
    borderColor: C.amber,
    backgroundColor: C.amber,
  },
  tipoButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tipoButtonText: {
    fontSize: tipografia.corpoForte.fontSize,
    color: C.textSec,
    fontWeight: '600',
  },
  tipoButtonTextActive: {
    color: theme.colors.textSobrePrimaria,
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
    elevation: 2,
  },
  inputWrapError: {
    borderColor: C.error,
  },
  input: {
    flex: 1,
    fontSize: tipografia.corpo.fontSize,
    color: C.text,
    paddingVertical: 0,
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

  // ── Consentimento LGPD ──
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    marginBottom: 4,
    minHeight: 44,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: raio.chip,
    borderWidth: 2,
    borderColor: C.inputBorder,
    backgroundColor: C.input,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: C.amber,
    borderColor: C.amber,
  },
  consentText: {
    flex: 1,
    fontSize: tipografia.apoio.fontSize,
    lineHeight: 19,
    color: C.textSec,
  },
  consentLink: {
    color: C.amber,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // ── Botão principal ──
  button: {
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
  buttonDisabled: {
    backgroundColor: C.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: theme.colors.textSobrePrimaria,
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  loginLinkText: {
    fontSize: tipografia.apoio.fontSize,
    color: C.textSec,
  },
  loginLinkBold: {
    color: C.amber,
    fontWeight: '600',
  },
});
