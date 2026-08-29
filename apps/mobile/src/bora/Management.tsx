import { getSegmentConfig } from "@boramarca/core";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import {
  Ban,
  Banknote,
  Bell,
  Cake,
  CalendarDays,
  ChevronRight,
  Clock3,
  LifeBuoy,
  Mail,
  Megaphone,
  MessageCircle,
  QrCode,
  RefreshCw,
  Scissors,
  Tag,
  Users,
  UsersRound,
  type LucideProps,
} from "lucide-react-native";
import type { ComponentType } from "react";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { RootStackParamList } from "./BoraMarcaApp";
import { useBoraState } from "./state";
import { colors, radius, space, type } from "./theme";
import { ScreenHeader } from "./ui";

/**
 * Gestão — o mesmo menu que o barbeiro já conhece.
 *
 * A LISTA É A DO BARBERSHOP, item por item, na mesma ordem e nos mesmos quatro grupos.
 * Ela não foi inventada: é o inventário do que um negócio de agendamento precisa
 * administrar, já validado em uso. Reordenar ou "melhorar" aqui seria trocar
 * conhecimento por palpite.
 *
 * OS GRUPOS NÃO TÊM RÓTULO, e isso é do original: o espaçamento separa. Rótulo de seção
 * em menu curto vira ruído.
 *
 * A COR DE CADA ITEM É DECORATIVA e fica fora do vocabulário do tema, exatamente como no
 * Barbershop — não existe token semântico para distinguir dezesseis itens, e inventar
 * dezesseis tokens seria pior. O acento da categoria continua mandando no resto da tela;
 * aqui ele não entra, senão os dezesseis viram um bloco só da mesma cor.
 *
 * O QUE AINDA NÃO EXISTE DIZ QUE NÃO EXISTE. Cada item declara para onde vai; quem não
 * tem destino aparece com "Em breve", não navega e não finge. Esconder os que faltam
 * daria a impressão de um produto menor do que ele é, e um item que abre tela vazia é
 * pior que um item honesto.
 */

type Rota = keyof RootStackParamList;

interface ItemGestao {
  readonly icon: ComponentType<LucideProps>;
  readonly label: string;
  readonly desc: string;
  readonly cor: string;
  /** Ausente = ainda não construído. */
  readonly route?: Rota;
}

/** Verde do WhatsApp. É token no Barbershop; aqui é literal porque só aparece nestes dois. */
const WHATSAPP = "#25D366";

function grupos(profissionalPlural: string): readonly (readonly ItemGestao[])[] {
  return [
    [
      {
        icon: Scissors,
        label: "Meus Serviços",
        desc: "Cadastre serviços com duração e preço",
        cor: "#FFB020",
        route: "Servicos",
      },
      {
        icon: CalendarDays,
        label: "Horário de Atendimento",
        desc: "Configure dias, horários e intervalo de almoço",
        cor: "#2F80ED",
      },
      {
        icon: Banknote,
        label: "Despesas",
        desc: "Lance e acompanhe os gastos do negócio",
        cor: "#DC2626",
      },
      {
        icon: Bell,
        label: "Notificações de agendamento",
        desc: "Escolha os canais e eventos que avisam sobre agendamentos",
        cor: "#0EA5E9",
      },
      {
        icon: Mail,
        label: "Relatórios por e-mail",
        desc: "Escolha a frequência e o destinatário do resumo financeiro",
        cor: "#10B981",
      },
    ],
    [
      {
        icon: MessageCircle,
        label: "Templates WhatsApp",
        desc: "Personalize mensagens de agendamento",
        cor: WHATSAPP,
      },
      {
        icon: RefreshCw,
        label: "Recorrências",
        desc: "Gerencie agendamentos periódicos de clientes fiéis",
        cor: "#9B59F6",
      },
      {
        icon: QrCode,
        label: "QR Code",
        desc: "Exiba o QR Code para clientes agendarem",
        cor: "#FF5C8A",
      },
      {
        icon: Tag,
        label: "Banner Promocional",
        desc: "Avise sobre promoções na tela de agendamento",
        cor: "#F59E0B",
      },
    ],
    [
      {
        icon: UsersRound,
        label: `Minha Equipe`,
        desc: `Cadastre ${profissionalPlural.toLocaleLowerCase()} e configure comissões`,
        cor: "#6C5CE7",
        route: "Equipe",
      },
      {
        icon: Users,
        label: "Clientes",
        desc: "Importe contatos ou cadastre clientes manualmente",
        cor: "#2F80ED",
      },
      {
        icon: Cake,
        label: "Aniversariantes",
        desc: "Veja os próximos aniversários e mande parabéns",
        cor: "#FF8FA3",
      },
      {
        icon: Megaphone,
        label: "Promoção via WhatsApp",
        desc: "Envie uma mensagem promocional para sua carteira de clientes",
        cor: WHATSAPP,
      },
      {
        icon: Clock3,
        label: "Lista de Espera",
        desc: "Veja clientes aguardando horário disponível",
        cor: "#17C3B2",
      },
      {
        icon: Ban,
        label: "Clientes Banidos",
        desc: "Gerencie clientes que não podem agendar",
        cor: "#F0507A",
      },
    ],
    [
      {
        icon: LifeBuoy,
        label: "Ajuda e Suporte",
        desc: "FAQ e contato com o suporte Bora Marcá",
        cor: "#8A8F98",
      },
    ],
  ];
}

export function ManagementMenu() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { activeContext } = useBoraState();
  const labels = activeContext
    ? getSegmentConfig(activeContext.businessType).labels
    : { professionalPlural: "Profissionais" };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader
          title="Gestão"
          subtitle="Tudo que sustenta a agenda: catálogo, equipe, dinheiro e conversa com o cliente."
        />

        {grupos(labels.professionalPlural).map((grupo, indice) => (
          <View key={`grupo-${indice}`} style={styles.grupo}>
            {grupo.map((item) => (
              <ItemDoMenu
                key={item.label}
                item={item}
                onPress={item.route ? () => navigation.navigate(item.route as never) : undefined}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ItemDoMenu({
  item,
  onPress,
}: {
  readonly item: ItemGestao;
  readonly onPress?: () => void;
}) {
  const disponivel = Boolean(onPress);
  const Glyph = item.icon;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !disponivel }}
      accessibilityHint={disponivel ? undefined : "Ainda não disponível"}
      disabled={!disponivel}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed, !disponivel && styles.indisponivel]}
    >
      <View style={[styles.itemIcone, { backgroundColor: `${item.cor}22` }]}>
        <Glyph color={item.cor} size={21} strokeWidth={2} />
      </View>

      <View style={styles.itemCopy}>
        <View style={styles.itemTituloLinha}>
          <Text style={styles.itemLabel}>{item.label}</Text>
          {disponivel ? null : (
            <View style={styles.emBreve}>
              <Text style={styles.emBreveTexto}>EM BREVE</Text>
            </View>
          )}
        </View>
        <Text style={styles.itemDesc}>{item.desc}</Text>
      </View>

      {disponivel ? <ChevronRight color={colors.muted} size={20} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: space.xxl },
  grupo: { paddingHorizontal: space.xl, gap: 8, marginBottom: space.xl },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  pressed: { opacity: 0.78 },
  indisponivel: { opacity: 0.55 },
  itemIcone: {
    width: 42,
    height: 42,
    borderRadius: radius.input,
    alignItems: "center",
    justifyContent: "center",
  },
  itemCopy: { flex: 1, gap: 3 },
  itemTituloLinha: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemLabel: { ...type.label, color: colors.text, fontSize: 16, flexShrink: 1 },
  itemDesc: { ...type.micro, color: colors.textSecondary, fontWeight: "500" },
  emBreve: {
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  emBreveTexto: { ...type.micro, color: colors.muted, fontSize: 9, letterSpacing: 0.6 },
});
