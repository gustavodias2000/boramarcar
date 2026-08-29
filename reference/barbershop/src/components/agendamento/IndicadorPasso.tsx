/**
 * IndicadorPasso — barra de progresso do fluxo de agendamento (Fase 2 do
 * plano de design). Primeiro indicador de passo/wizard do projeto — não há
 * outro para copiar.
 *
 * Só apresentação: o passo atual é derivado do estado que já existe em
 * AgendamentoScreen (servicoSelecionado/selectedDate/selectedTime), este
 * componente não guarda nenhum estado próprio nem decide navegação.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, type Theme } from '../../context/ThemeContext';
import { tipografia, raio } from '../../theme/escala';
import Icone from '../Icone';

interface IndicadorPassoProps {
  /** Rótulos dos passos, na ordem em que acontecem (ex.: ['Serviço', 'Data', 'Horário', 'Confirmação']). */
  passos: string[];
  /** Índice (0-based) do passo atual em `passos`. */
  passoAtual: number;
}

export default function IndicadorPasso({ passos, passoAtual }: IndicadorPassoProps) {
  const { theme } = useTheme();
  const s = getStyles(theme);

  return (
    <View
      testID="indicador-passo"
      style={s.container}
      accessibilityRole="progressbar"
      accessibilityLabel={`Passo ${Math.min(passoAtual + 1, passos.length)} de ${passos.length}: ${passos[Math.min(passoAtual, passos.length - 1)]}`}
      accessibilityValue={{ min: 1, max: passos.length, now: Math.min(passoAtual + 1, passos.length) }}
    >
      {passos.map((rotulo, index) => {
        const concluido = index < passoAtual;
        const ativo = index === passoAtual;
        const marcador = concluido ? s.marcadorConcluido : ativo ? s.marcadorAtivo : s.marcadorPendente;
        const texto = concluido || ativo ? s.rotuloDestacado : s.rotuloPendente;

        return (
          <React.Fragment key={rotulo}>
            <View style={s.passo}>
              <View style={marcador}>
                {concluido ? (
                  <Icone nome="check" tamanho={16} cor={theme.colors.textSobrePrimaria} decorativo />
                ) : (
                  <Text style={ativo ? s.numeroAtivo : s.numeroPendente}>{index + 1}</Text>
                )}
              </View>
              <Text style={texto} numberOfLines={1}>
                {rotulo}
              </Text>
            </View>
            {index < passos.length - 1 && (
              <View style={[s.conector, concluido && s.conectorConcluido]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.headerBorder,
    },
    passo: {
      alignItems: 'center',
      width: 64,
    },
    marcadorPendente: {
      width: 28,
      height: 28,
      borderRadius: raio.circulo,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    marcadorAtivo: {
      width: 28,
      height: 28,
      borderRadius: raio.circulo,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    marcadorConcluido: {
      width: 28,
      height: 28,
      borderRadius: raio.circulo,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    numeroPendente: {
      fontSize: tipografia.micro.fontSize,
      fontWeight: '600',
      color: theme.colors.textMuted,
    },
    numeroAtivo: {
      fontSize: tipografia.micro.fontSize,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    rotuloPendente: {
      fontSize: tipografia.micro.fontSize,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    rotuloDestacado: {
      fontSize: tipografia.micro.fontSize,
      color: theme.colors.text,
      fontWeight: '600',
      textAlign: 'center',
    },
    conector: {
      flex: 1,
      height: 1.5,
      backgroundColor: theme.colors.border,
      marginTop: 14,
      marginHorizontal: -4,
    },
    conectorConcluido: {
      backgroundColor: theme.colors.primary,
    },
  });
