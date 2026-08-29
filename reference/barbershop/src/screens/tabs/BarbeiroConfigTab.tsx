/**
 * BarbeiroConfigTab — aba de configurações do barbeiro.
 * Lista todos os itens administrativos agrupados por tema, em cards
 * limpos com ícone colorido — inspirado no layout de Configurações do Masters.
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../../context/ThemeContext';
import Icone, { type NomeIcone } from '../../components/Icone';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';

// Navigation type: tab screen que pode navegar para stack screens
type Props = CompositeScreenProps<
  BottomTabScreenProps<any, 'Config'>,
  NativeStackScreenProps<RootStackParamList>
>;

interface ItemConfig {
  icon: NomeIcone;
  label: string;
  desc: string;
  route: keyof RootStackParamList;
  cor: string;
}

// Grupos temáticos, do mais essencial para o mais avançado — sem rótulos de
// seção, para manter o visual limpo (cards + espaçamento fazem a separação).
//
// `cor` é uma paleta decorativa própria por categoria (não são tokens
// semânticos do tema — não há "primary"/"success"/... suficiente para
// distinguir 13 itens) — mesmo padrão de exceção documentada no relatório
// da Fase 1 para cor fixa fora do vocabulário do ThemeContext. A única cor
// que É token é a do WhatsApp (`theme.colors.whatsapp`), por isso os grupos
// viram uma função de `theme` em vez de constante de módulo.
const getGrupos = (theme: Theme): ItemConfig[][] => [
  [
    {
      icon: 'tesoura',
      label: 'Meus Serviços',
      desc: 'Cadastre serviços com duração e preço',
      route: 'ConfigServicos',
      cor: '#FFB020',
    },
    {
      icon: 'calendario',
      label: 'Horário de Atendimento',
      desc: 'Configure dias, horários e intervalo de almoço',
      route: 'ConfigAgenda',
      cor: '#2F80ED',
    },
    {
      icon: 'dinheiro',
      label: 'Despesas',
      desc: 'Lance e acompanhe os gastos do negócio',
      route: 'Despesas',
      cor: '#DC2626',
    },
    {
      icon: 'notificacao',
      label: 'Notificações de agendamento',
      desc: 'Escolha os canais e eventos que avisam sobre agendamentos',
      route: 'ConfiguracaoNotificacoes',
      cor: '#0EA5E9',
    },
    {
      icon: 'relatorio',
      label: 'Relatórios por e-mail',
      desc: 'Escolha a frequência e o destinatário do resumo financeiro',
      route: 'ConfiguracaoRelatoriosEmail',
      cor: '#10B981',
    },
  ],
  [
    {
      icon: 'mensagem',
      label: 'Templates WhatsApp',
      desc: 'Personalize mensagens de agendamento',
      route: 'TemplatesMensagem',
      cor: theme.colors.whatsapp,
    },
    {
      icon: 'recarregar',
      label: 'Recorrências',
      desc: 'Gerencie agendamentos periódicos de clientes fiéis',
      route: 'Recorrencias',
      cor: '#9B59F6',
    },
    {
      icon: 'qrcode',
      label: 'QR Code',
      desc: 'Exiba o QR Code para clientes agendarem',
      route: 'QRCode',
      cor: '#FF5C8A',
    },
    {
      icon: 'preco',
      label: 'Banner Promocional',
      desc: 'Avise sobre promoções na tela de agendamento',
      route: 'BannerPromocional',
      cor: '#F59E0B',
    },
  ],
  [
    {
      // Emoji original "pessoas de mãos dadas" não está no mapa de
      // substituição — fora da lista, decisão por proximidade semântica:
      // mesma ideia de "grupo de pessoas" do ícone `equipe` (Users), como
      // o item "Clientes" abaixo.
      icon: 'equipe',
      label: 'Minha Equipe',
      desc: 'Cadastre profissionais e configure comissões',
      route: 'Equipe',
      cor: '#6C5CE7',
    },
    {
      icon: 'equipe',
      label: 'Clientes',
      desc: 'Importe contatos ou cadastre clientes manualmente',
      route: 'Clientes',
      cor: '#2F80ED',
    },
    {
      icon: 'aniversario',
      label: 'Aniversariantes',
      desc: 'Veja os próximos aniversários e mande parabéns',
      route: 'Aniversariantes',
      cor: '#FF8FA3',
    },
    {
      icon: 'promocao',
      label: 'Promoção via WhatsApp',
      desc: 'Envie uma mensagem promocional para sua carteira de clientes',
      route: 'Promocao',
      cor: theme.colors.whatsapp,
    },
    {
      // Emoji original "ampulheta" não está no mapa de substituição — sem
      // ícone de espera disponível em Icone.tsx; `horario` (Clock) é o
      // mais próximo semanticamente (tempo de espera).
      icon: 'horario',
      label: 'Lista de Espera',
      desc: 'Veja clientes aguardando horário disponível',
      route: 'ListaEspera',
      cor: '#17C3B2',
    },
    {
      icon: 'bloqueado',
      label: 'Clientes Banidos',
      desc: 'Gerencie clientes que não podem agendar',
      route: 'ClientesBanidos',
      cor: '#F0507A',
    },
  ],
  [
    {
      icon: 'ajuda',
      label: 'Ajuda e Suporte',
      desc: 'FAQ e contato com o suporte Barbershop',
      route: 'Suporte',
      cor: '#8A8F98',
    },
  ],
];

export default function BarbeiroConfigTab({ navigation }: Props) {
  const { theme } = useTheme();
  const s = getStyles(theme);
  const grupos = getGrupos(theme);

  const renderItem = (item: ItemConfig, isLast: boolean) => (
    <TouchableOpacity
      key={item.route}
      style={[s.item, isLast && s.itemLast]}
      onPress={() => navigation.navigate(item.route as any)}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <View style={[s.itemIconContainer, { backgroundColor: item.cor }]}>
        {/* Ícone branco fixo sobre círculo de cor de categoria (paleta
            decorativa própria, sem token no tema — ver relatório) — mesmo
            padrão de contraste já usado no app para texto/ícone sobre fundo
            saturado. */}
        <Icone nome={item.icon} tamanho={20} cor="#fff" decorativo />
      </View>
      <View style={s.itemText}>
        <Text style={s.itemLabel}>{item.label}</Text>
        <Text style={s.itemDesc}>{item.desc}</Text>
      </View>
      <Text style={s.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Configurações</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {grupos.map((grupo, gi) => (
          <View key={gi} style={s.group}>
            {grupo.map((item, ii) => renderItem(item, ii === grupo.length - 1))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  group: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    marginBottom: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  itemIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  itemText: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  itemDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  chevron: {
    fontSize: 24,
    color: theme.colors.textMuted,
    marginLeft: 8,
  },
});
