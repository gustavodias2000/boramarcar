import type { ComponentType, ReactNode } from "react";
import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  type LucideProps,
} from "lucide-react-native";

import { colors, elevation, radius, space, type } from "./theme";

export type Icon = ComponentType<LucideProps>;

export function BrandMark({ inverse = false }: { readonly inverse?: boolean }) {
  return <Text style={[styles.brand, inverse && styles.brandInverse]}>bora marcá</Text>;
}

export function AppIcon({ icon: Glyph, color = colors.text, size = 22 }: { readonly icon: Icon; readonly color?: string; readonly size?: number }) {
  return <Glyph color={color} size={size} strokeWidth={2} />;
}

export function PrimaryButton({ label, onPress, disabled, loading, icon: Icon }: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly icon?: Icon;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const unavailable = Boolean(disabled || loading);
  const animate = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, damping: 16, stiffness: 280 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, elevation.primary]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: unavailable, busy: loading }}
        disabled={unavailable}
        onPress={onPress}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        style={({ pressed }) => [styles.primaryButton, unavailable && styles.buttonDisabled, pressed && styles.buttonPressed]}
      >
        {loading ? <ActivityIndicator color={colors.onAmber} /> : Icon ? <Icon color={colors.onAmber} size={20} strokeWidth={2.4} /> : null}
        <Text style={styles.primaryButtonText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function SecondaryButton({ label, onPress, icon: Icon, disabled = false }: {
  readonly label: string;
  readonly onPress: () => void;
  readonly icon?: Icon;
  readonly disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed, disabled && styles.buttonDisabled]}>{Icon ? <Icon color={colors.text} size={20} /> : null}<Text style={styles.secondaryButtonText}>{label}</Text></Pressable>;
}

export function TextAction({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.textAction, pressed && styles.buttonPressed]}><Text style={styles.textActionText}>{label}</Text></Pressable>;
}

export function ScreenHeader({ title, subtitle, onBack, right }: {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly right?: ReactNode;
}) {
  return <View style={styles.header}><View style={styles.headerTop}>{onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={styles.backButton}><ArrowLeft color={colors.text} size={22} /></Pressable> : null}<View style={styles.headerCopy}><Text style={styles.headerTitle}>{title}</Text>{subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}</View>{right}</View></View>;
}

export function Field({ label, error, ...props }: { readonly label: string; readonly error?: string } & TextInputProps) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput placeholderTextColor={colors.muted} style={[styles.input, error && styles.inputError]} {...props} />{error ? <Text style={styles.errorText}>{error}</Text> : null}</View>;
}

export function Notice({ children, tone = "info" }: { readonly children: ReactNode; readonly tone?: "info" | "danger" | "success" }) {
  const toneStyle = tone === "danger" ? styles.noticeDanger : tone === "success" ? styles.noticeSuccess : styles.noticeInfo;
  const color = tone === "danger" ? colors.danger : tone === "success" ? colors.success : colors.info;
  return <View style={[styles.notice, toneStyle]}><AlertCircle color={color} size={19} /><Text style={[styles.noticeText, { color }]}>{children}</Text></View>;
}

export function Surface({ children, style }: { readonly children: ReactNode; readonly style?: ViewStyle }) {
  return <View style={[styles.surface, elevation.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { readonly children: string; readonly action?: ReactNode }) {
  return <View style={styles.sectionTitle}><Text style={styles.sectionTitleText}>{children}</Text>{action}</View>;
}

export function SelectRow({ title, subtitle, selected, onPress, icon: Icon }: {
  readonly title: string;
  readonly subtitle?: string;
  readonly selected?: boolean;
  readonly onPress: () => void;
  readonly icon?: Icon;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.selectRow, selected && styles.selectRowSelected, pressed && styles.buttonPressed]}>{Icon ? <View style={[styles.selectIcon, selected && styles.selectIconSelected]}><Icon color={selected ? colors.onAmber : colors.amber} size={21} /></View> : null}<View style={styles.selectContent}><Text style={styles.selectTitle}>{title}</Text>{subtitle ? <Text style={styles.selectSubtitle}>{subtitle}</Text> : null}</View>{selected ? <View style={styles.check}><Check color={colors.onAmber} size={15} strokeWidth={3} /></View> : <ChevronRight color={colors.muted} size={20} />}</Pressable>;
}

export function AppointmentCard({ time, title, subtitle, status = "Confirmado", onPress }: {
  readonly time: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status?: string;
  readonly onPress?: () => void;
}) {
  const content = <><View style={styles.appointmentTime}><Clock3 color={colors.amber} size={18} /><Text style={styles.appointmentHour}>{time}</Text></View><View style={styles.appointmentCopy}><Text style={styles.appointmentTitle}>{title}</Text><Text style={styles.appointmentSubtitle}>{subtitle}</Text></View><View style={styles.statusChip}><Text style={styles.statusText}>{status}</Text></View></>;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [styles.appointment, pressed && styles.buttonPressed]}>{content}</Pressable> : <View style={styles.appointment}>{content}</View>;
}

export function EmptyState({ title, body, action }: { readonly title: string; readonly body: string; readonly action?: ReactNode }) {
  return <View style={styles.empty}><CalendarDays color={colors.amber} size={30} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text>{action ? <View style={styles.emptyAction}>{action}</View> : null}</View>;
}

const styles = StyleSheet.create({
  brand: { color: colors.text, fontSize: 25, fontWeight: "800", letterSpacing: -1.45 },
  brandInverse: { color: colors.text },
  primaryButton: { minHeight: 56, borderRadius: radius.card, backgroundColor: colors.amber, flexDirection: "row", gap: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: space.xl },
  primaryButtonText: { ...type.label, color: colors.onAmber, fontSize: 16, fontWeight: "800" },
  secondaryButton: { minHeight: 54, borderRadius: radius.card, borderColor: colors.borderStrong, borderWidth: 1.5, flexDirection: "row", gap: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: space.xl },
  secondaryButtonText: { ...type.label, color: colors.text, fontSize: 16 },
  buttonDisabled: { opacity: 0.52 }, buttonPressed: { opacity: 0.78 },
  textAction: { minHeight: 42, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 }, textActionText: { ...type.label, color: colors.amber },
  header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg },
  headerTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, gap: 4 }, headerTitle: { ...type.title, color: colors.text }, headerSubtitle: { ...type.body, color: colors.textSecondary },
  field: { gap: 7 }, fieldLabel: { ...type.label, color: colors.amberLight }, input: { backgroundColor: colors.field, borderWidth: 1, borderColor: colors.border, borderRadius: radius.input, color: colors.text, minHeight: 56, paddingHorizontal: 16, ...type.body }, inputError: { borderColor: colors.danger }, errorText: { ...type.micro, color: colors.danger },
  notice: { borderRadius: radius.input, flexDirection: "row", gap: 10, padding: 14, alignItems: "flex-start" }, noticeInfo: { backgroundColor: "#122A43" }, noticeDanger: { backgroundColor: "#401D2A" }, noticeSuccess: { backgroundColor: "#133A33" }, noticeText: { ...type.body, flex: 1 },
  surface: { borderRadius: radius.card, backgroundColor: colors.surfaceRaised, padding: space.lg },
  sectionTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xl, marginBottom: space.md }, sectionTitleText: { ...type.subtitle, color: colors.text },
  selectRow: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, minHeight: 72, paddingHorizontal: 14, flexDirection: "row", gap: 12, alignItems: "center" }, selectRowSelected: { borderColor: colors.amber, backgroundColor: colors.amberSoft }, selectIcon: { width: 42, height: 42, borderRadius: radius.input, alignItems: "center", justifyContent: "center", backgroundColor: "#202E3C" }, selectIconSelected: { backgroundColor: colors.amber }, selectContent: { flex: 1, gap: 3 }, selectTitle: { ...type.label, color: colors.text, fontSize: 16 }, selectSubtitle: { ...type.micro, color: colors.textSecondary, fontWeight: "500" }, check: { width: 24, height: 24, borderRadius: radius.round, alignItems: "center", justifyContent: "center", backgroundColor: colors.amber },
  appointment: { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceRaised, borderRadius: radius.card, padding: 14, gap: 12, flexDirection: "row", alignItems: "center" }, appointmentTime: { alignItems: "center", gap: 4, minWidth: 48 }, appointmentHour: { ...type.micro, color: colors.amberLight }, appointmentCopy: { flex: 1, gap: 3 }, appointmentTitle: { ...type.label, color: colors.text }, appointmentSubtitle: { ...type.micro, color: colors.textSecondary, fontWeight: "500" }, statusChip: { borderRadius: radius.round, backgroundColor: "#133A33", paddingVertical: 5, paddingHorizontal: 8 }, statusText: { ...type.micro, color: colors.success, fontSize: 10 },
  empty: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 32, gap: 9 }, emptyTitle: { ...type.subtitle, color: colors.text, textAlign: "center" }, emptyBody: { ...type.body, color: colors.textSecondary, textAlign: "center" }, emptyAction: { width: "100%", marginTop: 8 },
});
