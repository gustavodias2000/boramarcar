import React, { useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { auth } from '../../firebaseConfig';
import { encerrarSessao } from '../services/SessaoService';
import { useTheme } from '../context/ThemeContext';
import usePerfilBasico from '../hooks/usePerfilBasico';
import useEnderecoAutocomplete from '../hooks/useEnderecoAutocomplete';
import useAlteracaoDeSenha from '../hooks/useAlteracaoDeSenha';
import useExclusaoDeConta from '../hooks/useExclusaoDeConta';
import useFotoDePerfil from '../hooks/useFotoDePerfil';
import useVerificacaoDeEmail from '../hooks/useVerificacaoDeEmail';
import ThemeSelector from '../components/ThemeSelector';
import AvatarIlustrado from '../components/AvatarIlustrado';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Barbeiro } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Perfil'>;

export default function PerfilScreen({ navigation }: Props) {
  const { theme } = useTheme();

  // Endereço do estabelecimento com autocomplete — ver useEnderecoAutocomplete
  const enderecoEstabelecimento = useEnderecoAutocomplete();

  // Foto de perfil (só existe para barbeiro — ver useFotoDePerfil)
  const foto = useFotoDePerfil();

  // Endereço e foto vivem na vitrine (coleção `barbeiros`), carregada junto
  // do perfil: usePerfilBasico busca o documento e entrega aqui para semear
  // os dois hooks.
  const { definirEnderecoInicial } = enderecoEstabelecimento;
  const { definirFotoInicial } = foto;
  const semearVitrine = useCallback(
    (barbeiroDoc: Barbeiro | null) => {
      definirEnderecoInicial(
        barbeiroDoc?.enderecoFormatado || barbeiroDoc?.endereco || '',
        barbeiroDoc?.latitude != null && barbeiroDoc?.longitude != null
          ? { lat: barbeiroDoc.latitude, lng: barbeiroDoc.longitude }
          : null,
      );
      definirFotoInicial(barbeiroDoc?.fotoUrl, barbeiroDoc?.fotoPadraoId);
    },
    [definirEnderecoInicial, definirFotoInicial],
  );

  // Dados pessoais + sincronização da vitrine — ver usePerfilBasico
  const perfil = usePerfilBasico(enderecoEstabelecimento, semearVitrine);

  // Troca de senha (estado + reautenticação) — ver useAlteracaoDeSenha
  const senha = useAlteracaoDeSenha();

  // Exclusão de conta (LGPD) — ver useExclusaoDeConta
  const irParaLogin = useCallback(() => navigation.replace('Login'), [navigation]);
  const exclusao = useExclusaoDeConta(perfil.userData?.tipo === 'barbeiro', irParaLogin);

  // Reenvio do email de confirmação — ver useVerificacaoDeEmail
  const verificacaoEmail = useVerificacaoDeEmail();

  const handleLogout = () => {
    Alert.alert('Sair', 'Deseja realmente sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await encerrarSessao();
          navigation.replace('Login');
        },
      },
    ]);
  };

  if (perfil.loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
          Carregando perfil...
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            <AvatarIlustrado id={auth.currentUser?.uid || perfil.userData?.uid || ''} nome={perfil.nome} size={80} />
          </View>
          <Text style={[styles.userName, { color: theme.colors.text }]}>{perfil.nome}</Text>
          <Text style={[styles.userEmail, { color: theme.colors.textSecondary }]}>
            {auth.currentUser?.email}
          </Text>
          <View style={[styles.tipoBadge, { backgroundColor: theme.colors.primary + '20' }]}>
            <Icone
              nome={perfil.userData?.tipo === 'barbeiro' ? 'barbearia' : 'tesoura'}
              tamanho={16}
              cor={theme.colors.primary}
              decorativo
            />
            <Text style={[styles.tipoText, { color: theme.colors.primary }]}>
              {perfil.userData?.tipo === 'barbeiro' ? 'Barbeiro' : 'Cliente'}
            </Text>
          </View>
        </View>

        {/* Verificação de email (item 13) */}
        {auth.currentUser && !auth.currentUser.emailVerified && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.sectionTitleRow}>
              <Icone nome="email" tamanho={20} cor={theme.colors.text} decorativo />
              <Text style={[styles.sectionTitle, styles.sectionTitleInline, { color: theme.colors.text }]}>
                Email não verificado
              </Text>
            </View>
            <Text style={[styles.verificationText, { color: theme.colors.textSecondary }]}>
              Confirme seu email para garantir a recuperação da sua conta.
            </Text>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: theme.colors.primary }, verificacaoEmail.reenviando && styles.saveButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Reenviar email de verificação"
              onPress={verificacaoEmail.reenviarVerificacao}
              disabled={verificacaoEmail.reenviando}
            >
              {verificacaoEmail.reenviando ? (
                <ActivityIndicator color={theme.colors.textSobrePrimaria} />
              ) : (
                <Text style={[styles.saveButtonText, { color: theme.colors.textSobrePrimaria }]}>Reenviar email de verificação</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Dados do perfil */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Dados pessoais
          </Text>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: theme.colors.text }]}>Nome completo</Text>
            <TextInput
              value={perfil.nome}
              onChangeText={perfil.alterarNome}
              style={[
                styles.input,
                { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border },
                perfil.errors.nome && { borderColor: theme.colors.error },
              ]}
              placeholder="Seu nome completo"
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="words"
              accessibilityLabel="Nome completo"
            />
            {perfil.errors.nome ? <Text style={[styles.errorText, { color: theme.colors.error }]}>{perfil.errors.nome}</Text> : null}
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: theme.colors.text }]}>Telefone / WhatsApp</Text>
            <TextInput
              value={perfil.telefone}
              onChangeText={perfil.alterarTelefone}
              style={[
                styles.input,
                { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border },
                perfil.errors.telefone && { borderColor: theme.colors.error },
              ]}
              placeholder="(11) 99999-9999"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="phone-pad"
              maxLength={15}
              accessibilityLabel="Telefone ou WhatsApp"
            />
            {perfil.errors.telefone ? <Text style={[styles.errorText, { color: theme.colors.error }]}>{perfil.errors.telefone}</Text> : null}
          </View>

          {perfil.userData?.tipo === 'barbeiro' && (
            <View style={[styles.inputContainer, styles.enderecoContainer]}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Endereço do estabelecimento
              </Text>
              <View>
                <TextInput
                  value={enderecoEstabelecimento.endereco}
                  onChangeText={enderecoEstabelecimento.alterarEndereco}
                  style={[
                    styles.input,
                    { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border },
                  ]}
                  placeholder="Comece a digitar e escolha uma sugestão"
                  placeholderTextColor={theme.colors.textSecondary}
                  autoCapitalize="sentences"
                  accessibilityLabel="Endereço do estabelecimento"
                />
                {enderecoEstabelecimento.buscando && (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                    style={styles.enderecoSpinner}
                  />
                )}
                {enderecoEstabelecimento.sugestoes.length > 0 && (
                  <View style={[styles.sugestoesBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    {enderecoEstabelecimento.sugestoes.map((s) => (
                      <TouchableOpacity
                        key={s.placeId}
                        style={[styles.sugestaoItem, { borderBottomColor: theme.colors.borderLight }]}
                        onPress={() => enderecoEstabelecimento.selecionarSugestao(s)}
                        accessibilityRole="button"
                        accessibilityLabel={`Selecionar endereço ${s.description}`}
                      >
                        <View style={styles.sugestaoRow}>
                          <Icone nome="endereco" tamanho={16} cor={theme.colors.text} decorativo />
                          <Text style={[styles.sugestaoText, styles.sugestaoTextInline, { color: theme.colors.text }]} numberOfLines={2}>
                            {s.description}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              {enderecoEstabelecimento.coordenadas ? (
                <View style={styles.hintSmallRow}>
                  <Icone nome="check" tamanho={16} cor={theme.colors.textSecondary} decorativo />
                  <Text style={[styles.hintSmall, styles.hintSmallInline, { color: theme.colors.textSecondary }]}>
                    Endereço confirmado com localização no mapa.
                  </Text>
                </View>
              ) : (
                <Text style={[styles.hintSmall, { color: theme.colors.textSecondary }]}>
                  Exibido aos clientes na confirmação do agendamento, com link para o mapa.
                </Text>
              )}
            </View>
          )}

          {perfil.userData?.tipo === 'cliente' && (
            <View style={[styles.pushConsentRow, { borderTopColor: theme.colors.borderLight }]}>
              <View style={styles.pushConsentCopy}>
                <Text style={[styles.label, { color: theme.colors.text }]}>Lembretes e novidades</Text>
                <Text style={[styles.hintSmall, { color: theme.colors.textSecondary }]}>
                  Receber notificações push sobre retornos e novidades das barbearias.
                </Text>
              </View>
              <Switch
                value={perfil.receberNotificacoesPush}
                onValueChange={perfil.alterarReceberNotificacoesPush}
                disabled={perfil.saving}
                accessibilityLabel="Receber notificações push de lembretes e novidades"
                accessibilityHint="Você pode alterar essa escolha quando quiser"
                accessibilityState={{ checked: perfil.receberNotificacoesPush, disabled: perfil.saving }}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.colors.primary }, perfil.saving && styles.saveButtonDisabled]}
            onPress={perfil.salvarPerfil}
            disabled={perfil.saving}
            accessibilityRole="button"
            accessibilityLabel="Salvar alterações do perfil"
            accessibilityState={{ disabled: perfil.saving, busy: perfil.saving }}
          >
            {perfil.saving ? (
              <ActivityIndicator color={theme.colors.textSobrePrimaria} />
            ) : (
              <Text style={[styles.saveButtonText, { color: theme.colors.textSobrePrimaria }]}>Salvar alterações</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Foto de perfil (só barbeiro — vitrine pública) */}
        {perfil.userData?.tipo === 'barbeiro' && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Foto de perfil
            </Text>
            <View style={styles.fotoPerfilRow}>
              <AvatarIlustrado
                id={auth.currentUser?.uid || perfil.userData.uid}
                nome={perfil.nome}
                fotoUrl={foto.fotoUrl}
                fotoPadraoId={foto.fotoPadraoId}
                size={88}
              />
              <TouchableOpacity
                style={[styles.trocarFotoButton, { borderColor: theme.colors.primary }, foto.enviandoFoto && styles.saveButtonDisabled]}
                onPress={foto.trocarFoto}
                disabled={foto.enviandoFoto}
                accessibilityRole="button"
                accessibilityLabel="Trocar foto de perfil"
                accessibilityState={{ disabled: foto.enviandoFoto, busy: foto.enviandoFoto }}
              >
                {foto.enviandoFoto ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : (
                  <Text style={[styles.trocarFotoButtonText, { color: theme.colors.primary }]}>
                    Trocar foto
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Aparência / Tema */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Aparência</Text>
          <ThemeSelector />
        </View>

        {/* Alterar senha */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={senha.alternarSecao}
            accessibilityRole="button"
            accessibilityLabel="Alterar senha"
            accessibilityState={{ expanded: senha.secaoAberta }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Alterar senha
            </Text>
            <Text style={[styles.passwordToggleIcon, { color: theme.colors.primary }]}>
              {senha.secaoAberta ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {senha.secaoAberta && (
            <View>
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: theme.colors.text }]}>Senha atual</Text>
                <TextInput
                  value={senha.senhaAtual}
                  onChangeText={senha.setSenhaAtual}
                  style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="Digite sua senha atual"
                  placeholderTextColor={theme.colors.textSecondary}
                  secureTextEntry
                  autoCapitalize="none"
                  accessibilityLabel="Senha atual"
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: theme.colors.text }]}>Nova senha</Text>
                <TextInput
                  value={senha.novaSenha}
                  onChangeText={senha.setNovaSenha}
                  style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor={theme.colors.textSecondary}
                  secureTextEntry
                  autoCapitalize="none"
                  accessibilityLabel="Nova senha"
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: theme.colors.text }]}>Confirmar nova senha</Text>
                <TextInput
                  value={senha.confirmarNovaSenha}
                  onChangeText={senha.setConfirmarNovaSenha}
                  style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="Repita a nova senha"
                  placeholderTextColor={theme.colors.textSecondary}
                  secureTextEntry
                  autoCapitalize="none"
                  accessibilityLabel="Confirmar nova senha"
                />
              </View>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.colors.primary }, senha.alterandoSenha && styles.saveButtonDisabled]}
                onPress={senha.alterarSenha}
                disabled={senha.alterandoSenha}
                accessibilityRole="button"
                accessibilityLabel="Alterar senha"
                accessibilityState={{ disabled: senha.alterandoSenha, busy: senha.alterandoSenha }}
              >
                {senha.alterandoSenha ? (
                  <ActivityIndicator color={theme.colors.textSobrePrimaria} />
                ) : (
                  <Text style={[styles.saveButtonText, { color: theme.colors.textSobrePrimaria }]}>Alterar senha</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Privacidade (LGPD) */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Privacidade
          </Text>
          <TouchableOpacity
            style={[styles.privacyLink, styles.privacyLinkRow]}
            accessibilityRole="button"
            accessibilityLabel="Abrir Política de Privacidade"
            onPress={() => navigation.navigate('Privacidade')}
          >
            <Icone nome="documento" tamanho={16} cor={theme.colors.primary} decorativo />
            <Text style={[styles.privacyLinkText, { color: theme.colors.primary }]}>
              Ver Política de Privacidade
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.privacyLink, styles.privacyLinkRow]}
            accessibilityRole="button"
            accessibilityLabel="Excluir minha conta e meus dados"
            accessibilityHint="Ação irreversível, apaga todos os seus dados"
            onPress={exclusao.alternarSecao}
          >
            <Icone nome="excluir" tamanho={16} cor={theme.colors.error} decorativo />
            <Text style={[styles.privacyLinkText, { color: theme.colors.error }]}>
              Excluir minha conta e meus dados
            </Text>
          </TouchableOpacity>

          {exclusao.secaoAberta && (
            <View style={styles.deleteSection}>
              <Text style={[styles.deleteWarning, { color: theme.colors.textSecondary }]}>
                A exclusão é permanente e remove seu perfil e dados pessoais
                (LGPD, art. 18). Digite sua senha para confirmar.
              </Text>
              <TextInput
                value={exclusao.senha}
                onChangeText={exclusao.setSenha}
                style={[
                  styles.input,
                  styles.deletePasswordInput,
                  { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border },
                ]}
                placeholder="Sua senha"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                accessibilityLabel="Senha para confirmar exclusão da conta"
              />
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: theme.colors.error }, exclusao.excluindo && styles.saveButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Confirmar exclusão da conta"
                accessibilityHint="Ação irreversível, apaga todos os seus dados"
                onPress={exclusao.excluirConta}
                disabled={exclusao.excluindo}
              >
                {exclusao.excluindo ? (
                  <ActivityIndicator color={theme.colors.textSobreDestaque} />
                ) : (
                  <Text style={[styles.deleteButtonText, { color: theme.colors.textSobreDestaque }]}>Excluir definitivamente</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: theme.colors.error }]}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Sair da conta"
          accessibilityHint="Encerra a sessão atual"
        >
          <Text style={[styles.logoutButtonText, { color: theme.colors.textSobreDestaque }]}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  enderecoContainer: { zIndex: 10 },
  fotoPerfilRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pushConsentRow: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pushConsentCopy: {
    flex: 1,
  },
  trocarFotoButton: {
    marginLeft: 20,
    borderWidth: 1,
    borderRadius: raio.input,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trocarFotoButtonText: {
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '600',
  },
  // Mesmo tamanho do chevron equivalente em SuporteScreen (faqChevron).
  passwordToggleIcon: { fontSize: tipografia.micro.fontSize },
  deletePasswordInput: { marginBottom: 12 },
  scrollContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  avatarWrap: {
    marginBottom: 12,
  },
  userName: {
    // Maior destaque da tela — funciona como o "título" da página, por isso
    // usa o token de título (24) em vez de subtítulo, mesmo sendo abaixo do
    // avatar em vez de no topo.
    fontSize: tipografia.titulo.fontSize,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: tipografia.apoio.fontSize,
    marginBottom: 8,
  },
  tipoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
  },
  tipoText: {
    fontSize: tipografia.apoio.fontSize,
    fontWeight: '600',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: raio.card,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    // "seção" na escala de tipografia (BRIEFING-FASE-1.md) — era 18, mais
    // próximo de subtitulo (20) do que de corpoForte (16).
    fontSize: tipografia.subtitulo.fontSize,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitleInline: {
    marginBottom: 0,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: raio.input,
    padding: 12,
    fontSize: tipografia.corpo.fontSize,
  },
  errorText: {
    fontSize: tipografia.apoio.fontSize,
    marginTop: 4,
  },
  hintSmall: {
    fontSize: tipografia.micro.fontSize,
    marginTop: 6,
    lineHeight: 16,
  },
  hintSmallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  hintSmallInline: {
    marginTop: 0,
  },
  enderecoSpinner: {
    position: 'absolute',
    right: 12,
    top: 14,
  },
  sugestoesBox: {
    borderWidth: 1,
    borderRadius: raio.input,
    marginTop: -12,
    marginBottom: 4,
    overflow: 'hidden',
  },
  sugestaoItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sugestaoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sugestaoText: {
    fontSize: tipografia.apoio.fontSize,
    lineHeight: 19,
  },
  sugestaoTextInline: {
    flex: 1,
  },
  saveButton: {
    borderRadius: raio.input,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  // Estado desabilitado por opacidade (não mais fundo cinza fixo em hex):
  // mesmo padrão já usado em PromocaoScreen/BannerPromocionalScreen nesta
  // fase — funciona igual sobre qualquer cor de fundo (save = primary,
  // delete = error), sem precisar de mais um token.
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    // Cor vem de theme.colors.textSobrePrimaria via override inline (botão
    // tem fundo primary — âmbar) — ver JSX. Token consolidado na Fase 1.
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '600',
  },
  verificationText: {
    fontSize: tipografia.apoio.fontSize,
    lineHeight: 20,
    marginBottom: 12,
  },
  privacyLink: {
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  privacyLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  privacyLinkText: {
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '600',
  },
  deleteSection: {
    marginTop: 8,
  },
  deleteWarning: {
    fontSize: tipografia.apoio.fontSize,
    lineHeight: 19,
    marginBottom: 12,
  },
  deleteButton: {
    borderRadius: raio.input,
    padding: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  deleteButtonText: {
    // Cor vem de theme.colors.textSobreDestaque via override inline (botão
    // tem fundo error).
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '600',
  },
  logoutButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: raio.input,
    padding: 16,
    alignItems: 'center',
  },
  logoutButtonText: {
    // Cor vem de theme.colors.textSobreDestaque via override inline (botão
    // tem fundo error).
    fontSize: tipografia.corpoForte.fontSize,
    fontWeight: '600',
  },
});
