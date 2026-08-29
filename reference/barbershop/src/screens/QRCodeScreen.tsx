/**
 * QRCodeScreen — exibe o QR Code de convite do barbeiro para o cliente escanear.
 *
 * Sem dependência nativa: usa a API pública qr-server.com para gerar
 * a imagem do QR Code. Funciona offline? Não — mas não exige pod install.
 *
 * O QR Code codifica um deep link de CONVITE (App Link https://, com
 * fallback automático pra Play Store se o app não estiver instalado — ver
 * DeepLinkService.ts) — não mais o uid cru do profissional: o código vem de `garantirConvite`,
 * a mesma Cloud Function usada por VinculoClienteRepository, e cria um
 * vínculo explícito quando resgatado, em vez de abrir a agenda direto).
 * O link é montado por `DeepLinkService.linkDeConvite`, o mesmo módulo que
 * registra a rota no React Navigation — assim o formato do link nunca fica
 * fora de sincronia com quem o interpreta.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { obterOuCriarConviteProprio } from '../data/repositories/VinculoClienteRepository';
import { linkDeConvite } from '../services/DeepLinkService';
import { useTheme, type Theme } from '../context/ThemeContext';
import Icone from '../components/Icone';
import { tipografia, raio } from '../theme/escala';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'QRCode'>;

const QR_SIZE = 240;

/** Formata o código em blocos de 4 só para leitura (`XXXX-XXXX`) — o valor
 *  enviado ao backend é normalizado lá, isso é puramente visual. */
function formatarCodigo(codigo: string): string {
  return codigo.replace(/(.{4})(?=.)/g, '$1-');
}

export default function QRCodeScreen(_props: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  const displayName =
    auth.currentUser?.displayName ||
    auth.currentUser?.email?.split('@')[0] ||
    'barbeiro';

  const [codigo, setCodigo] = useState<string | null>(null);
  const [carregandoCodigo, setCarregandoCodigo] = useState(true);
  const [erroCodigo, setErroCodigo] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resultado = await obterOuCriarConviteProprio();
        if (ativo) setCodigo(resultado.codigo);
      } catch (error) {
        console.warn('[qrcode] falha ao obter o convite:', error);
        if (ativo) setErroCodigo(true);
      } finally {
        if (ativo) setCarregandoCodigo(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  // Origem diferente entre a imagem do QR e o botão de "copiar link direto"
  // de propósito — são pontos de entrada distintos, úteis para saber depois
  // qual canal trouxe mais vínculos.
  const deepLinkQr = codigo ? linkDeConvite(codigo, 'qr') : '';
  const deepLinkCompartilhar = codigo ? linkDeConvite(codigo, 'link') : '';

  // QR Code gerado via API sem dependência nativa
  const qrUrl = deepLinkQr
    ? `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${encodeURIComponent(deepLinkQr)}&color=000000&bgcolor=ffffff&margin=10`
    : '';

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleShare = async () => {
    if (!codigo || !deepLinkCompartilhar) return;
    try {
      await Share.share({
        // Nome + link + código no mesmo envio: quem recebe pode simplesmente
        // tocar no link (se já tiver o app) ou digitar o código à mão
        // (se for baixar o app depois) — as duas portas de entrada juntas.
        // Emoji aqui NÃO viram Icone: é texto puro que sai pelo share sheet
        // nativo (WhatsApp/SMS/etc.), fora da árvore de UI do app — mesma
        // exceção documentada em TemplatesMensagemScreen para conteúdo de
        // mensagem externa.
        message:
          `Agende seu horário com ${displayName} pelo app Barbershop! 📱✂️\n\n` +
          `Toque no link para adicionar:\n${deepLinkCompartilhar}\n\n` +
          `Ou baixe o app e digite o código:\n🔑 ${formatarCodigo(codigo)}`,
        title: 'Agendar com ' + displayName,
      });
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível compartilhar.');
    }
  };

  const handleShareLink = async () => {
    if (!deepLinkCompartilhar) return;
    try {
      await Share.share({
        message: deepLinkCompartilhar,
        url: deepLinkCompartilhar,
        title: 'Link de convite',
      });
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível compartilhar o link.');
    }
  };

  if (carregandoCodigo) {
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
        {/* Instruções */}
        <View style={s.infoCard}>
          <View style={s.infoTitleRow}>
            <Icone nome="qrcode" tamanho={20} cor={theme.colors.text} decorativo />
            <Text style={s.infoTitle}>Seu QR Code de Convite</Text>
          </View>
          <Text style={s.infoText}>
            Imprima e cole este QR Code na sua barbearia. Quando o cliente
            escanear, sua barbearia é adicionada à lista dele e o app abre
            direto no seu perfil.
          </Text>
        </View>

        {/* QR Code */}
        <View style={s.qrContainer}>
          {erroCodigo && (
            <View style={s.qrPlaceholder}>
              <Icone nome="telefone" tamanho={32} cor={theme.colors.textSecondary} decorativo />
              <Text style={s.qrErrorText}>
                Não foi possível gerar seu código de convite.{'\n'}Verifique sua conexão e volte a esta tela.
              </Text>
            </View>
          )}
          {!erroCodigo && !imageLoaded && !imageError && (
            <View style={s.qrPlaceholder}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={s.qrLoadingText}>Gerando QR Code...</Text>
            </View>
          )}
          {!erroCodigo && imageError && (
            <View style={s.qrPlaceholder}>
              <Icone nome="telefone" tamanho={32} cor={theme.colors.textSecondary} decorativo />
              <Text style={s.qrErrorText}>
                Sem conexão à internet.{'\n'}O QR Code requer conexão para ser gerado.
              </Text>
            </View>
          )}
          {!erroCodigo && (
            <Image
              source={{ uri: qrUrl }}
              style={[
                s.qrImage,
                (!imageLoaded || imageError) && s.qrImageHidden,
              ]}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setImageLoaded(false);
                setImageError(true);
              }}
              accessibilityLabel="QR Code de convite"
            />
          )}
        </View>

        {/* Código de convite */}
        <View style={s.idCard}>
          <Text style={s.idLabel}>Código de convite</Text>
          <Text style={s.idValue} selectable>
            {codigo ? formatarCodigo(codigo) : '—'}
          </Text>
          <Text style={s.idHint}>
            Clientes sem câmera podem informar este código no app.
          </Text>
        </View>

        {/* Botões de ação */}
        <TouchableOpacity
          style={s.shareButton}
          onPress={handleShare}
          disabled={!codigo}
          accessibilityRole="button"
          accessibilityLabel="Compartilhar convite via WhatsApp ou outros aplicativos"
          accessibilityState={{ disabled: !codigo }}
        >
          <View style={s.shareButtonContent}>
            <Icone nome="mensagem" tamanho={16} cor={theme.colors.textSobrePrimaria} decorativo />
            <Text style={s.shareButtonText}>Compartilhar via WhatsApp / mais</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.shareLinkButton}
          onPress={handleShareLink}
          disabled={!codigo}
          accessibilityRole="button"
          accessibilityLabel="Copiar link direto de convite"
          accessibilityState={{ disabled: !codigo }}
        >
          {/* Sem ícone de "link" no mapa compartilhado de Icone.tsx — arquivo
              fora do escopo desta lista (fundação usada por outros grupos em
              paralelo). Emoji decorativo removido, texto sozinho já é claro. */}
          <Text style={s.shareLinkText}>Copiar link direto</Text>
        </TouchableOpacity>

        {/* Dica de impressão */}
        <View style={s.tipCard}>
          <View style={s.tipTitleRow}>
            <Icone nome="aviso" tamanho={16} cor={theme.colors.bannerWarningText} decorativo />
            <Text style={s.tipTitle}>Dica de uso</Text>
          </View>
          <Text style={s.tipText}>
            Tire um print desta tela e mande para uma gráfica imprimir em tamanho
            A5 ou A4. Cole no espelho ou balcão da barbearia para que os clientes
            que estão aguardando possam agendar facilmente o próximo horário.
          </Text>
        </View>
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
      alignItems: 'center',
    },
    infoCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: raio.card,
      padding: 16,
      width: '100%',
      marginBottom: 20,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    infoTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    infoTitle: {
      fontSize: tipografia.corpoForte.fontSize,
      fontWeight: '700',
      color: theme.colors.text,
    },
    infoText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    qrContainer: {
      width: QR_SIZE + 24,
      height: QR_SIZE + 24,
      // Fundo sempre branco (não segue o tema): QR Code precisa de contraste
      // alto e fixo para ser lido pela câmera, inclusive no tema escuro.
      backgroundColor: '#ffffff',
      borderRadius: raio.card,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
      shadowColor: theme.colors.sombra,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 6,
      padding: 12,
    },
    qrPlaceholder: {
      position: 'absolute',
      alignItems: 'center',
      gap: 12,
    },
    qrLoadingText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
    },
    qrErrorText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    qrImage: {
      width: QR_SIZE,
      height: QR_SIZE,
      borderRadius: raio.input,
    },
    qrImageHidden: {
      opacity: 0,
      position: 'absolute',
    },
    idCard: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: raio.input,
      padding: 14,
      width: '100%',
      marginBottom: 16,
      alignItems: 'center',
    },
    idLabel: {
      fontSize: tipografia.micro.fontSize,
      color: theme.colors.textMuted,
      marginBottom: 6,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    idValue: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.text,
      fontFamily: 'monospace',
      marginBottom: 4,
    },
    idHint: {
      fontSize: tipografia.micro.fontSize,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    shareButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: raio.input,
      paddingVertical: 16,
      paddingHorizontal: 24,
      width: '100%',
      alignItems: 'center',
      marginBottom: 10,
      minHeight: 52,
      justifyContent: 'center',
    },
    shareButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    shareButtonText: {
      color: theme.colors.textSobrePrimaria,
      fontSize: tipografia.corpoForte.fontSize,
      fontWeight: '700',
    },
    shareLinkButton: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: raio.input,
      paddingVertical: 14,
      paddingHorizontal: 24,
      width: '100%',
      alignItems: 'center',
      marginBottom: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minHeight: 48,
      justifyContent: 'center',
    },
    shareLinkText: {
      color: theme.colors.primary,
      fontSize: tipografia.corpoForte.fontSize,
      fontWeight: '600',
    },
    tipCard: {
      backgroundColor: theme.colors.bannerWarningBackground,
      borderRadius: raio.input,
      padding: 14,
      width: '100%',
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.bannerWarningBorder,
    },
    tipTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    tipTitle: {
      fontSize: tipografia.apoio.fontSize,
      fontWeight: '700',
      color: theme.colors.bannerWarningText,
    },
    tipText: {
      fontSize: tipografia.apoio.fontSize,
      color: theme.colors.bannerWarningText,
      lineHeight: 19,
    },
  });
