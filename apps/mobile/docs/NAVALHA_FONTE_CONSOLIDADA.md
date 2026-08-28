# Fonte consolidada do projeto Navalha

Gerado a partir de `Navalha.rar` em 06/08/2026.

Este arquivo preserva os fontes recebidos para permitir uma analise independente sem extrair o RAR. Os valores dos arquivos `.env` foram substituidos por `<REDACTED>`. O arquivo `Server.py` continha uma transcricao de ferramenta nas quatro primeiras linhas; abaixo e apresentado o codigo Python recuperavel a partir da quinta linha. Nenhuma correcao funcional foi aplicada.

## Manifesto

| Arquivo no RAR | Linhas recebidas | Caminho declarado |
|---|---:|---|
| `.env` | 9 | `/app/frontend/.env` |
| `.env back` | 9 | `/app/backend/.env` |
| `[barberId].tsx` | 226 | `/app/frontend/app/booking/[barberId].tsx` |
| `[id].tsx` | 120 | `/app/frontend/app/barber/[id].tsx` |
| `_layout.tsx` | 71 | `/app/frontend/app/(cliente)/_layout.tsx` |
| `app.json` | 45 | `/app/frontend/app.json` |
| `appointments.tsx` | 130 | `/app/frontend/app/(cliente)/appointments.tsx` |
| `auth.tsx` | 84 | `/app/frontend/src/context/auth.tsx` |
| `client.ts` | 56 | `/app/frontend/src/api/client.ts` |
| `Delegated to Design Agent.txt` | 7 | `(ausente ou ambiguo)` |
| `design_guidelines.json` | 170 | `/app/design_guidelines.json` |
| `home.tsx` | 143 | `/app/frontend/app/(cliente)/home.tsx` |
| `index.tsx` | 24 | `/app/frontend/app/index.tsx` |
| `login.tsx` | 106 | `/app/frontend/app/(auth)/login.tsx` |
| `package.json` | 70 | `/app/frontend/package.json` |
| `payment-return.tsx` | 95 | `/app/frontend/app/payment-return.tsx` |
| `PRD.md` | 35 | `/app/memory/PRD.md` |
| `profile.tsx` | 80 | `/app/frontend/app/(cliente)/profile.tsx` |
| `register.tsx` | 135 | `/app/frontend/app/(auth)/register.tsx` |
| `requirements.txt` | 29 | `/app/backend/requirements.txt` |
| `server.pi` | 68 | `(ausente ou ambiguo)` |
| `Server.py` | 420 | `(ausente ou ambiguo)` |
| `services.tsx` | 168 | `/app/frontend/app/(barbeiro)/services.tsx` |
| `test_credentials.md` | 19 | `/app/memory/test_credentials.md` |
| `today.tsx` | 170 | `/app/frontend/app/(barbeiro)/today.tsx` |
| `tokens.ts` | 33 | `/app/frontend/src/theme/tokens.ts` |
| `tsconfig.json` | 19 | `/app/frontend/tsconfig.json` |
| `welcome.tsx` | 73 | `/app/frontend/app/(auth)/welcome.tsx` |

## Conteudo dos arquivos

### .env

```dotenv
/app/frontend/.env

EXPO_TUNNEL_SUBDOMAIN=<REDACTED>
EXPO_PACKAGER_HOSTNAME=<REDACTED>
EXPO_PUBLIC_BACKEND_URL=<REDACTED>
EXPO_USE_FAST_RESOLVER=<REDACTED>
METRO_CACHE_ROOT=<REDACTED>
EXPO_PACKAGER_PROXY_URL=<REDACTED>
```

### .env back

```dotenv
/app/backend/.env
MONGO_URL=<REDACTED>
DB_NAME=<REDACTED>
JWT_SECRET=<REDACTED>
JWT_ALGORITHM=<REDACTED>
JWT_EXP_HOURS=<REDACTED>
STRIPE_API_KEY=<REDACTED>
STRIPE_WEBHOOK_SECRET=<REDACTED>
APP_URL=<REDACTED>
```

### [barberId].tsx

```tsx
/app/frontend/app/booking/[barberId].tsx
import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/src/api/client";
import { colors, spacing, radius } from "@/src/theme/tokens";

type Barber = { id: string; name: string; avatar_url?: string | null };
type Service = { id: string; name: string; duration_min: number; price_cents: number };
type Slot = { time: string; available: boolean };

const fmtBRL = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

function buildDays(count = 14) {
  const out: { key: string; label: string; day: string; weekday: string }[] = [];
  const weekdays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push({
      key: `${y}-${m}-${day}`,
      label: `${weekdays[d.getDay()]}`,
      day: `${day}`,
      weekday: weekdays[d.getDay()],
    });
  }
  return out;
}

export default function Booking() {
  const { barberId, serviceId } = useLocalSearchParams<{ barberId: string; serviceId?: string }>();
  const router = useRouter();
  const [barber, setBarber] = useState<Barber | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(serviceId || null);
  const days = useMemo(() => buildDays(14), []);
  const [selectedDate, setSelectedDate] = useState<string>(days[0].key);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const [b, s] = await Promise.all([
      api<{ barber: Barber }>(`/barbers/${barberId}`),
      api<{ services: Service[] }>(`/barbers/${barberId}/services`),
    ]);
    setBarber(b.barber); setServices(s.services);
    if (!selectedService && s.services[0]) setSelectedService(s.services[0].id);
  })(); }, [barberId]);

  useEffect(() => { (async () => {
    setLoadingSlots(true); setSelectedTime(null);
    try {
      const r = await api<{ slots: Slot[] }>(`/barbers/${barberId}/slots?date=${selectedDate}`);
      setSlots(r.slots);
    } catch {} finally { setLoadingSlots(false); }
  })(); }, [barberId, selectedDate]);

  const service = services.find(s => s.id === selectedService);

  const confirm = async () => {
    setErr(null);
    if (!service || !selectedTime) { setErr("Selecione serviço e horário"); return; }
    setConfirming(true);
    try {
      const r = await api<{ booking_id: string; checkout_url: string; session_id: string }>("/bookings/checkout", {
        method: "POST",
        body: JSON.stringify({
          barber_id: barberId, service_id: service.id,
          date: selectedDate, time: selectedTime,
        }),
      });
      // Open checkout in a browser
      const returnUrl = Platform.OS === "web" ? undefined : undefined;
      const res = await WebBrowser.openBrowserAsync(r.checkout_url);
      // After returning, navigate to payment status
      router.replace({ pathname: "/payment-return", params: { session_id: r.session_id } });
    } catch (e: any) {
      setErr(e.message || "Erro ao criar reserva");
      setConfirming(false);
    }
  };

  if (!barber) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <SafeAreaView testID="booking-screen" style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="booking-back" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Reservar</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 200 }}>
        <Text style={styles.step}>01 • Serviço</Text>
        <View style={{ gap: 8 }}>
          {services.map(s => (
            <Pressable
              key={s.id}
              testID={`svc-choice-${s.id}`}
              style={[styles.svcCard, selectedService === s.id && styles.svcCardActive]}
              onPress={() => setSelectedService(s.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.svcName}>{s.name}</Text>
                <Text style={styles.svcMeta}>{s.duration_min} min</Text>
              </View>
              <Text style={styles.svcPrice}>{fmtBRL(s.price_cents)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.step, { marginTop: spacing.xl }]}>02 • Data</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
          {days.map(d => (
            <Pressable
              key={d.key}
              testID={`day-${d.key}`}
              style={[styles.dayCell, selectedDate === d.key && styles.dayCellActive]}
              onPress={() => setSelectedDate(d.key)}
            >
              <Text style={[styles.dayLabel, selectedDate === d.key && styles.dayLabelActive]}>{d.weekday}</Text>
              <Text style={[styles.dayNum, selectedDate === d.key && styles.dayNumActive]}>{d.day}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.step, { marginTop: spacing.xl }]}>03 • Horário</Text>
        {loadingSlots ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.slotsGrid}>
            {slots.map(s => (
              <Pressable
                key={s.time}
                testID={`slot-${s.time}`}
                disabled={!s.available}
                onPress={() => setSelectedTime(s.time)}
                style={[
                  styles.slot,
                  !s.available && styles.slotUnavailable,
                  selectedTime === s.time && styles.slotActive,
                ]}
              >
                <Text style={[
                  styles.slotText,
                  !s.available && styles.slotTextUnavailable,
                  selectedTime === s.time && styles.slotTextActive,
                ]}>{s.time}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.cta}>
        {err && <Text style={styles.err}>{err}</Text>}
        <View style={styles.summary}>
          <View>
            <Text style={styles.sumLabel}>Total</Text>
            <Text style={styles.sumValue}>{service ? fmtBRL(service.price_cents) : "—"}</Text>
          </View>
          <Pressable
            testID="booking-confirm-btn"
            disabled={!selectedTime || !selectedService || confirming}
            style={[styles.confirmBtn, (!selectedTime || confirming) && { opacity: 0.5 }]}
            onPress={confirm}
          >
            {confirming ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Ionicons name="card" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.confirmText}>Confirmar e Pagar</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  backBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  step: { color: colors.brand, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: "700", marginBottom: spacing.md, marginTop: spacing.sm },
  svcCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  svcCardActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  svcName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  svcMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  svcPrice: { color: colors.brand, fontSize: 15, fontWeight: "800" },
  daysRow: { gap: 10, paddingRight: spacing.lg },
  dayCell: { width: 62, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: colors.surfaceSecondary },
  dayCellActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  dayLabelActive: { color: colors.onBrandPrimary },
  dayNum: { color: colors.onSurface, fontSize: 20, fontWeight: "800", marginTop: 4 },
  dayNumActive: { color: colors.onBrandPrimary },
  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  slot: { width: "31.5%", paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center" },
  slotUnavailable: { opacity: 0.35 },
  slotActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  slotText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  slotTextUnavailable: { textDecorationLine: "line-through" },
  slotTextActive: { color: colors.onBrandPrimary },
  cta: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  err: { color: colors.error, marginBottom: 8, textAlign: "center" },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sumLabel: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  sumValue: { color: colors.brand, fontSize: 22, fontWeight: "800" },
  confirmBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brand, paddingHorizontal: 20, paddingVertical: 14, borderRadius: radius.lg },
  confirmText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
});
```

### [id].tsx

```tsx
/app/frontend/app/barber/[id].tsx
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radius } from "@/src/theme/tokens";

type Barber = { id: string; name: string; bio?: string | null; avatar_url?: string | null };
type Service = { id: string; name: string; description?: string; duration_min: number; price_cents: number; category: string };

const { width } = Dimensions.get("window");
const fmtBRL = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

export default function BarberDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [barber, setBarber] = useState<Barber | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    try {
      const [b, s] = await Promise.all([
        api<{ barber: Barber }>(`/barbers/${id}`),
        api<{ services: Service[] }>(`/barbers/${id}/services`),
      ]);
      setBarber(b.barber); setServices(s.services);
    } catch {} finally { setLoading(false); }
  })(); }, [id]);

  if (loading || !barber) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <View testID="barber-detail-screen" style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.hero}>
          <Image source={{ uri: barber.avatar_url || undefined }} style={styles.heroImg} contentFit="cover" />
          <LinearGradient
            colors={["rgba(18,20,21,0.4)", "rgba(18,20,21,0.85)", colors.surface]}
            locations={[0, 0.6, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <SafeAreaView edges={["top"]} style={styles.heroSafe}>
            <Pressable testID="barber-back-btn" style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroBody}>
            <Text style={styles.heroName}>{barber.name}</Text>
            <Text style={styles.heroBio}>{barber.bio}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Serviços</Text>
          {services.length === 0 ? (
            <Text style={styles.empty}>Nenhum serviço cadastrado ainda.</Text>
          ) : services.map(s => (
            <Pressable
              key={s.id}
              testID={`service-row-${s.id}`}
              style={styles.svcRow}
              onPress={() => router.push({ pathname: "/booking/[barberId]", params: { barberId: barber.id, serviceId: s.id } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.svcName}>{s.name}</Text>
                {s.description && <Text style={styles.svcDesc} numberOfLines={2}>{s.description}</Text>}
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={12} color={colors.onSurfaceSecondary} />
                  <Text style={styles.svcMeta}>{s.duration_min} min</Text>
                </View>
              </View>
              <View style={styles.svcRight}>
                <Text style={styles.svcPrice}>{fmtBRL(s.price_cents)}</Text>
                <View style={styles.svcCta}>
                  <Text style={styles.svcCtaText}>Reservar</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.onBrandPrimary} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  hero: { width, height: 380, backgroundColor: colors.surfaceSecondary },
  heroImg: { width: "100%", height: "100%" },
  heroSafe: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  heroBody: { position: "absolute", bottom: 24, left: spacing.xl, right: spacing.xl },
  heroName: { color: colors.onSurface, fontSize: 32, fontWeight: "800", marginBottom: 6 },
  heroBio: { color: colors.onSurfaceTertiary, fontSize: 14, lineHeight: 20 },
  section: { padding: spacing.xl },
  sectionTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "700", marginBottom: spacing.md },
  empty: { color: colors.onSurfaceSecondary },
  svcRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  svcName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  svcDesc: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  svcMeta: { color: colors.onSurfaceSecondary, fontSize: 12 },
  svcRight: { alignItems: "flex-end", gap: 8 },
  svcPrice: { color: colors.brand, fontSize: 16, fontWeight: "800" },
  svcCta: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  svcCtaText: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "700" },
});
```

### _layout.tsx

```tsx
/app/frontend/app/(cliente)/_layout.tsx
iimport { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { colors } from "@/src/theme/tokens";
import { useAuth } from "@/src/context/auth";

export default function BarbeiroLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/(auth)/welcome");
    else if (user.role !== "barbeiro") router.replace("/(cliente)/home");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceSecondary,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          height: 78,
          paddingTop: 8,
          paddingBottom: 20,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Hoje",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "sunny" : "sunny-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: "Serviços",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "list" : "list-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
```

### app.json

```json
/app/frontend/app.json
{
  "expo": {
    "name": "frontend",
    "slug": "frontend",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "frontend",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.emergent.mobilefirst.c3c47j"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#000000"
      },
      "edgeToEdgeEnabled": true,
      "package": "com.emergent.mobilefirst.c3c47j"
    },
    "web": {
      "bundler": "metro",
      "output": "single",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-image.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#000000"
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

### appointments.tsx

```tsx
/app/frontend/app/(cliente)/appointments.tsx
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radius } from "@/src/theme/tokens";

type Booking = {
  id: string; barber_name: string; service_name: string; date: string; time: string;
  duration_min: number; amount_cents: number; status: string; payment_status: string;
};

const fmtBRL = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function Appointments() {
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ bookings: Booking[] }>("/bookings/mine");
      setItems(r.bookings);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cancel = async (id: string) => {
    try {
      await api(`/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      load();
    } catch {}
  };

  const upcoming = items.filter(b => b.status === "confirmed" || b.status === "pending");
  const past = items.filter(b => b.status === "completed" || b.status === "cancelled");

  return (
    <SafeAreaView testID="cliente-appointments-screen" style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Minha Agenda</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <Text style={styles.section}>Próximos</Text>
            {upcoming.length === 0 ? (
              <Text style={styles.empty}>Nenhum agendamento futuro. Que tal marcar um corte?</Text>
            ) : upcoming.map(b => <Card key={b.id} b={b} onCancel={() => cancel(b.id)} canCancel />)}
            <Text style={[styles.section, { marginTop: spacing.xl }]}>Histórico</Text>
            {past.length === 0 ? <Text style={styles.empty}>Sem histórico ainda.</Text> : past.map(b => <Card key={b.id} b={b} />)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ b, onCancel, canCancel }: { b: Booking; onCancel?: () => void; canCancel?: boolean }) {
  const statusColor =
    b.status === "confirmed" ? colors.success :
    b.status === "pending" ? colors.warning :
    b.status === "completed" ? colors.onSurfaceSecondary :
    colors.error;
  const statusLabel =
    b.status === "confirmed" ? "Confirmado" :
    b.status === "pending" ? "Aguardando pagamento" :
    b.status === "completed" ? "Concluído" : "Cancelado";
  return (
    <View testID={`booking-card-${b.id}`} style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardBarber}>{b.barber_name}</Text>
          <Text style={styles.cardService}>{b.service_name}</Text>
        </View>
        <View style={[styles.statusPill, { borderColor: statusColor }]}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.rowBetween}>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.onSurfaceSecondary} />
          <Text style={styles.meta}>{fmtDate(b.date)} • {b.time}</Text>
        </View>
        <Text style={styles.price}>{fmtBRL(b.amount_cents)}</Text>
      </View>
      {canCancel && (
        <Pressable testID={`cancel-booking-${b.id}`} onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancelar reserva</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  h1: { color: colors.onSurface, fontSize: 28, fontWeight: "800" },
  scroll: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxxl },
  section: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: spacing.md, fontWeight: "700" },
  empty: { color: colors.onSurfaceSecondary, fontSize: 14, marginBottom: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardBarber: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  cardService: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: "700" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { color: colors.onSurfaceSecondary, fontSize: 13 },
  price: { color: colors.brand, fontSize: 16, fontWeight: "800" },
  cancelBtn: { marginTop: spacing.md, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, alignItems: "center" },
  cancelText: { color: colors.error, fontWeight: "700", fontSize: 13 },
});
```

### auth.tsx

```tsx
/app/frontend/src/context/auth.tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken, getToken, saveToken } from "@/src/api/client";

export type User = {
  id: string;
  name: string;
  email: string;
  role: "cliente" | "barbeiro";
  phone?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string, role: "cliente" | "barbeiro", phone?: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) { setUser(null); return; }
    try {
      const r = await api<{ user: User }>("/auth/me");
      setUser(r.user);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => { (async () => { await refresh(); setLoading(false); })(); }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    });
    await saveToken(r.access_token);
    setUser(r.user);
    return r.user;
  };

  const register = async (name: string, email: string, password: string, role: "cliente" | "barbeiro", phone?: string) => {
    const r = await api<{ access_token: string; user: User }>("/auth/register", {
      method: "POST", body: JSON.stringify({ name, email, password, role, phone }),
    });
    await saveToken(r.access_token);
    setUser(r.user);
    return r.user;
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  const updateProfile = async (patch: Partial<User>) => {
    const r = await api<{ user: User }>("/auth/me", { method: "PATCH", body: JSON.stringify(patch) });
    setUser(r.user);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
```

### client.ts

```ts
/app/frontend/src/api/client.ts
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const KEY = "navalha_token";

// Web fallback because expo-secure-store isn't supported on web
const memStore: Record<string, string | null> = {};

export async function saveToken(token: string) {
  if (Platform.OS === "web") {
    memStore[KEY] = token;
    try { localStorage.setItem(KEY, token); } catch {}
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    if (memStore[KEY]) return memStore[KEY];
    try { return localStorage.getItem(KEY); } catch { return null; }
  }
  return await SecureStore.getItemAsync(KEY);
}

export async function clearToken() {
  if (Platform.OS === "web") {
    memStore[KEY] = null;
    try { localStorage.removeItem(KEY); } catch {}
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

export async function api<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}
```

### Delegated to Design Agent.txt

```text
Design System Complete (Navalha Barbershop App)
Picked 6 Glass / Luxe DARK personality infused with premium editorial typography (Fraunces + Satoshi) for an exclusive, modern barbershop feel.
Defined a deep charcoal/smoked grey palette with a warm Copper/Amber accent (avoided pure black and banned purples/blues).
Structured dual-role layout: Cinematic, discovery-focused UI for Clientes (Home, Barber Profiles, Booking) and a utility-first timeline dashboard for Barbeiros.
Sourced high-quality cinematic imagery for auth screens and service highlights.
Output generated to /app/design_guidelines.json.
Next Action Items: Main agent to initialize React Native Expo project, load Fraunces/Satoshi fonts, configure custom JWT auth alongside Stripe, and start building out the Authentication & Role Selection split screens.
```

### design_guidelines.json

```json
/app/design_guidelines.json

{
  "app_name": "Navalha",
  "personality": "6 Glass / Luxe DARK",
  "personality_one_liner": "A cinematic, premium dark-themed experience with deep charcoal surfaces, copper accents, and elegant editorial typography that feels like an exclusive gentleman's barbershop.",
  "color": {
    "surface": "#121415",
    "onSurface": "#F0F0F0",
    "surfaceSecondary": "#1A1D1E",
    "onSurfaceSecondary": "#A3A6A8",
    "surfaceTertiary": "#262A2C",
    "onSurfaceTertiary": "#D1D3D4",
    "surfaceInverse": "#EBEBEB",
    "onSurfaceInverse": "#121415",
    "brand": "#D47B39",
    "brandPrimary": "#D47B39",
    "onBrandPrimary": "#0A0B0C",
    "brandSecondary": "#B26129",
    "onBrandSecondary": "#F0F0F0",
    "brandTertiary": "#3D2719",
    "onBrandTertiary": "#E8A97B",
    "success": "#4A7C59",
    "onSuccess": "#E3F0E8",
    "warning": "#D4A339",
    "onWarning": "#362705",
    "error": "#B54D4D",
    "onError": "#FCE8E8",
    "info": "#4A6C7C",
    "onInfo": "#E3EEF3",
    "border": "#262A2C",
    "borderStrong": "#3D4143",
    "divider": "#1F2224"
  },
  "typography": {
    "displayFontFamily": "Fraunces",
    "textFontFamily": "Satoshi",
    "scale": {
      "sm": 12,
      "base": 14,
      "lg": 16,
      "xl": 20,
      "2xl": 24
    }
  },
  "spacing": {
    "rule": "Use generous cinematic spacing between major layout blocks. Form inputs and chips use tighter rhythmic spacing. Always leave safe-area padding at screen roots.",
    "xs": 4,
    "sm": 8,
    "md": 12,
    "lg": 16,
    "xl": 24,
    "2xl": 32,
    "3xl": 48
  },
  "radius_tokens": {
    "sm": 4,
    "md": 8,
    "lg": 16,
    "pill": 999
  },
  "shadow_tier": "0",
  "navigation": "bottom_tabs",
  "icon_set": "Phosphor",
  "glassmorphism": {
    "enabled": true,
    "do's": [
      "Use glass effect for the bottom tab bar and sticky CTAs to maintain cinematic depth over scrolling content.",
      "Use frosted overlays on featured barbershop images.",
      "Apply translucent tinted base underneath text on glass to guarantee readability (≥75% of surface layer in dark mode)."
    ],
    "dont's": [
      "Do not apply blur/glass to body content, form fields, or dense utility screens like the Barber Dashboard timeline.",
      "Do not use generic gray blurs; always tint with surface or brand tokens."
    ]
  },
  "platform_libraries": {
    "glass": {
      "ios": "expo-glass-effect",
      "android": "expo-blur",
      "low_end_android_fallback": "solid surfaceSecondary"
    },
    "image": "expo-image",
    "blur": "expo-blur",
    "bottom_sheet": "@gorhom/bottom-sheet",
    "animation": "react-native-reanimated",
    "gesture": "react-native-gesture-handler"
  },
  "screens": [
    {
      "name": "Onboarding & Auth",
      "purpose": "Set the premium mood with a cinematic full-bleed background, role selection (Cliente / Barbeiro), and authentication.",
      "states": {
        "loading": "Subtle pulsing opacity on the logo.",
        "empty": "N/A",
        "error": "Standard error toast positioned top with red error token."
      },
      "layout": "Full-bleed background image with a top-to-bottom transparent-to-dark gradient scrim. Brand logo centered. Role selection pills and auth inputs at the bottom 40% anchored above a sticky CTA button."
    },
    {
      "name": "Cliente - Home",
      "purpose": "A cinematic discovery feed showcasing top barbers, featured services, and active appointments.",
      "states": {
        "loading": "Dark tinted skeleton loaders matching card dimensions.",
        "empty": "Illustration of a barber chair with 'No services found' and a retry CTA.",
        "error": "Error message with 'Tentar novamente' button centered."
      },
      "layout": "Sticky glass header. Horizontal scroll of featured barbers (cards with image + subtle gradient scrim + name). Vertical grid of categories (Hair, Beard, Combo) using brandTertiary tinted chips. Next upcoming appointment as a highlighted glass card."
    },
    {
      "name": "Cliente - Barber Profile & Services",
      "purpose": "Detailed view of a barber, their availability, and specific services with pricing/duration.",
      "states": {
        "loading": "Spinner centered on the screen.",
        "empty": "No services listed for this barber.",
        "error": "Failed to load barber details."
      },
      "layout": "Hero image banner of the barber with a gradient fade into the content. Avatar positioned overlapping the banner edge. Service list presented as stacked rows (Title + duration on left, price on right). A sticky primary CTA 'Agendar Horário' pinned to the bottom."
    },
    {
      "name": "Cliente - Booking Flow",
      "purpose": "Step-by-step selection of Date, Time, and Checkout via Stripe.",
      "states": {
        "loading": "Loading slots spinner.",
        "empty": "No time slots available for the selected date.",
        "error": "Payment failure or booking conflict message."
      },
      "layout": "Step-based top progress indicator. Date selection uses a horizontal scrollable strip of days. Time slots are presented in a 3-column pill grid. The final review step shows a breakdown summary card with embedded Stripe input field. Sticky 'Confirmar e Pagar' CTA."
    },
    {
      "name": "Barbeiro - Dashboard",
      "purpose": "Utility-first command center for the barber to manage their day and view revenue.",
      "states": {
        "loading": "Skeleton rows for timeline.",
        "empty": "'Nenhum agendamento para hoje' with an empty-state illustration.",
        "error": "Failed to sync calendar."
      },
      "layout": "Clean utility focus. Top revenue summary widget (surfaceSecondary). Vertical timeline list for today's appointments grouped by time. Action buttons on rows to mark 'Concluído' or 'Cancelar'."
    }
  ],
  "images": {
    "auth_hero_bg": {
      "url": "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTJ8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBwcmVtaXVtJTIwYmFyYmVyc2hvcCUyMGludGVyaW9yfGVufDB8fHx8MTc4NTc4OTEwOHww&ixlib=rb-4.1.0&q=85",
      "alt": "Dark modern leather barber chair against a brick wall"
    },
    "service_haircut": {
      "url": "https://images.unsplash.com/photo-1747832802200-7aaceb517e0c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzh8MHwxfHNlYXJjaHwyfHxiYXJiZXIlMjBjdXR0aW5nJTIwaGFpciUyMGNpbmVtYXRpY3xlbnwwfHx8fDE3ODU3ODkxMDh8MA&ixlib=rb-4.1.0&q=85",
      "alt": "Barber performing a cinematic haircut"
    },
    "service_beard": {
      "url": "https://images.pexels.com/photos/3998427/pexels-photo-3998427.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
      "alt": "Barber carefully shaving a beard"
    }
  },
  "instructions_to_main_agent": [
    "Strictly follow the '6 Glass / Luxe DARK' personality. Use the specified deep charcoal/smoked grey background (#121415), never pure black. Use the warm Copper/Amber (#D47B39) purely for accents and primary CTAs.",
    "Ensure 'Fraunces' (or a similar high-contrast serif) is used for headers to establish a premium, classic barbershop feel, contrasted with 'Satoshi' for the main body UI.",
    "Implement a strict gradient-to-dark scrim pattern (Layer 1: expo-linear-gradient, Layer 2: Text) over the auth_hero_bg image and barber profile banners to ensure text readability.",
    "For the booking flow, use a bottom sticky CTA container with a glass effect (`expo-glass-effect` or `expo-blur` with surface tint) hovering over the scrollable content.",
    "In the Barbeiro Dashboard, switch to a slightly more utilitarian layout (less glass, sharper borders) to optimize for speed and readability during a busy workday.",
    "Use Phosphor icons consistently. Stick to filled-active / outlined-inactive patterns for the bottom tabs.",
    "For Stripe payment, ensure the card input component is styled minimally with `surfaceTertiary` background, blending naturally into the dark theme."
  ],
  "haptics": {
    "primary_button_press": "impactMedium",
    "tab_switch": "selection",
    "time_slot_select": "impactLight",
    "payment_success": "notificationSuccess"
  }
}
```

### home.tsx

```tsx
/app/frontend/app/(cliente)/home.tsx
import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { colors, spacing, radius } from "@/src/theme/tokens";

type Barber = { id: string; name: string; bio?: string | null; avatar_url?: string | null; service_count: number };
const CATS = [
  { key: "all", label: "Todos", icon: "flash" as const },
  { key: "corte", label: "Corte", icon: "cut" as const },
  { key: "barba", label: "Barba", icon: "brush" as const },
  { key: "combo", label: "Combo", icon: "sparkles" as const },
  { key: "extras", label: "Extras", icon: "options" as const },
];

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState("all");

  const load = useCallback(async () => {
    try {
      const r = await api<{ barbers: Barber[] }>("/barbers");
      setBarbers(r.barbers);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView testID="cliente-home-screen" style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.hi}>Olá, {user?.name.split(" ")[0]}</Text>
            <Text style={styles.h1}>Pronto para{"\n"}o próximo corte?</Text>
          </View>
        </View>

        <View style={styles.chipRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipContent}>
            {CATS.map(c => (
              <Pressable
                key={c.key}
                testID={`chip-${c.key}`}
                onPress={() => setCat(c.key)}
                style={[styles.chip, cat === c.key && styles.chipActive]}
              >
                <Ionicons name={c.icon} size={14} color={cat === c.key ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
                <Text style={[styles.chipText, cat === c.key && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Text style={styles.sectionTitle}>Barbeiros em destaque</Text>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
        ) : barbers.length === 0 ? (
          <Text style={styles.empty}>Nenhum barbeiro disponível</Text>
        ) : (
          <View style={{ gap: spacing.lg }}>
            {barbers.map(b => (
              <Pressable
                key={b.id}
                testID={`barber-card-${b.id}`}
                style={styles.card}
                onPress={() => router.push({ pathname: "/barber/[id]", params: { id: b.id } })}
              >
                <Image source={{ uri: b.avatar_url || undefined }} style={styles.cardImg} contentFit="cover" transition={200} />
                <LinearGradient
                  colors={["transparent", "rgba(18,20,21,0.9)", colors.surfaceSecondary]}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.cardBody}>
                  <View style={styles.badge}>
                    <Ionicons name="star" size={12} color={colors.brand} />
                    <Text style={styles.badgeText}>{b.service_count} serviços</Text>
                  </View>
                  <Text style={styles.cardName}>{b.name}</Text>
                  <Text style={styles.cardBio} numberOfLines={2}>{b.bio || "Estilo, precisão e cuidado."}</Text>
                  <View style={styles.cardCta}>
                    <Text style={styles.cardCtaText}>Ver perfil</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.brand} />
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  header: { marginBottom: spacing.xl },
  hi: { color: colors.onSurfaceSecondary, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  h1: { color: colors.onSurface, fontSize: 30, fontWeight: "800", lineHeight: 36 },
  chipRow: { marginHorizontal: -spacing.xl, marginBottom: spacing.lg, height: 56, justifyContent: "center" },
  chipContent: { paddingHorizontal: spacing.xl, gap: 10, alignItems: "center" },
  chip: {
    flexShrink: 0, height: 36, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: colors.onBrandPrimary },
  sectionTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700", marginBottom: spacing.md },
  empty: { color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.xl },
  card: {
    borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surfaceSecondary,
    height: 260, borderWidth: 1, borderColor: colors.border,
  },
  cardImg: { width: "100%", height: "100%" },
  cardBody: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg },
  badge: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, marginBottom: 8,
  },
  badgeText: { color: colors.onBrandTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  cardName: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginBottom: 4 },
  cardBio: { color: colors.onSurfaceTertiary, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  cardCta: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardCtaText: { color: colors.brand, fontWeight: "700", fontSize: 13, letterSpacing: 0.5 },
});
```

### index.tsx

```tsx
/app/frontend/app/index.tsx
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/auth";
import { colors } from "@/src/theme/tokens";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/(auth)/welcome");
    else if (user.role === "cliente") router.replace("/(cliente)/home");
    else router.replace("/(barbeiro)/today");
  }, [user, loading, router]);

  return (
    <View testID="splash-screen" style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}
```

### login.tsx

```tsx
/app/frontend/app/(auth)/login.tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme/tokens";
import { useAuth } from "@/src/context/auth";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!email || !password) { setErr("Preencha email e senha"); return; }
    setLoading(true);
    try {
      const u = await login(email.trim(), password);
      if (u.role === "cliente") router.replace("/(cliente)/home");
      else router.replace("/(barbeiro)/today");
    } catch (e: any) {
      setErr(e.message || "Erro ao entrar");
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView testID="login-screen" style={styles.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="login-back-btn" style={styles.back} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Bem-vindo{"\n"}de volta.</Text>
          <Text style={styles.subtitle}>Entre para agendar seu próximo corte.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
              value={email} onChangeText={setEmail}
              autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
              placeholder="voce@email.com" placeholderTextColor={colors.onSurfaceSecondary}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Senha</Text>
            <TextInput
              testID="login-password-input"
              value={password} onChangeText={setPassword}
              secureTextEntry placeholder="••••••••"
              placeholderTextColor={colors.onSurfaceSecondary}
              style={styles.input}
            />
          </View>

          {err && <Text testID="login-error" style={styles.err}>{err}</Text>}

          <Pressable testID="login-submit-btn" style={[styles.btn, loading && { opacity: 0.6 }]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Entrar</Text>}
          </Pressable>

          <Pressable testID="login-go-register" style={styles.linkWrap} onPress={() => router.replace("/(auth)/register")}>
            <Text style={styles.linkMuted}>Ainda não tem conta? </Text>
            <Text style={styles.link}>Criar conta</Text>
          </Pressable>

          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>Contas demo</Text>
            <Text style={styles.demoText}>Cliente: cliente@navalha.com / cliente123</Text>
            <Text style={styles.demoText}>Barbeiro: rafael@navalha.com / barber123</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -8, marginBottom: spacing.lg },
  title: { color: colors.onSurface, fontSize: 34, fontWeight: "800", lineHeight: 40, marginBottom: spacing.sm },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 15, marginBottom: spacing.xl },
  field: { marginBottom: spacing.lg },
  label: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1.5, marginBottom: 8, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: 16, color: colors.onSurface, fontSize: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  err: { color: colors.error, marginBottom: spacing.md },
  btn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm },
  btnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  linkWrap: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  linkMuted: { color: colors.onSurfaceSecondary },
  link: { color: colors.brand, fontWeight: "700" },
  demoBox: { marginTop: spacing.xxl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  demoTitle: { color: colors.brand, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 },
  demoText: { color: colors.onSurfaceTertiary, fontSize: 13, marginBottom: 4 },
});
```

### package.json

```json
/app/frontend/package.json

{
  "name": "frontend",
  "main": "expo-router/entry",
  "version": "1.0.0",
  "scripts": {
    "preinstall": "./scripts/cmd-guard.js --preinstall",
    "start": "expo start",
    "reset-project": "node ./scripts/reset-project.js",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "expo lint"
  },
  "dependencies": {
    "@expo/metro-runtime": "6.1.2",
    "@expo/vector-icons": "15.1.1",
    "@react-native-async-storage/async-storage": "2.2.0",
    "date-fns": "4.1.0",
    "dayjs": "1.11.13",
    "expo": "54.0.36",
    "expo-blur": "15.0.8",
    "expo-constants": "18.0.13",
    "expo-font": "14.0.12",
    "expo-haptics": "15.0.8",
    "expo-image": "3.0.11",
    "expo-linear-gradient": "15.0.8",
    "expo-linking": "8.0.12",
    "expo-router": "6.0.24",
    "expo-secure-store": "15.0.8",
    "expo-splash-screen": "31.0.13",
    "expo-status-bar": "3.0.9",
    "expo-symbols": "1.0.8",
    "expo-system-ui": "6.0.9",
    "expo-web-browser": "15.0.11",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.5",
    "react-native-dotenv": "3.4.11",
    "react-native-gesture-handler": "2.28.0",
    "react-native-reanimated": "4.1.1",
    "react-native-safe-area-context": "5.6.0",
    "react-native-screens": "4.16.0",
    "react-native-web": "0.21.0",
    "react-native-webview": "13.15.0",
    "react-native-worklets": "0.5.1"
  },
  "devDependencies": {
    "@types/react": "19.1.10",
    "eslint": "9.25.0",
    "eslint-config-expo": "10.0.0",
    "expo-doctor": "1.19.8",
    "typescript": "5.9.3"
  },
  "resolutions": {
    "@eslint/plugin-kit": "0.3.4",
    "postcss": "8.5.10",
    "uuid": "11.1.1",
    "undici": "6.27.0",
    "tar": "7.5.19",
    "**/@eslint/eslintrc/js-yaml": "4.3.0",
    "**/@expo/xcpretty/js-yaml": "4.3.0",
    "**/@istanbuljs/load-nyc-config/js-yaml": "3.15.0",
    "shell-quote": "1.9.0"
  },
  "private": true,
  "packageManager": "yarn@1.22.22+sha512.a6b2f7906b721bba3d67d4aff083df04dad64c399707841b7acf00f6b133b7ac24255f2652fa22ae3534329dc6180534e98d17432037ff6fd140556e2bb3137e"
}
```

### payment-return.tsx

```tsx
/app/frontend/app/payment-return.tsx

import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radius } from "@/src/theme/tokens";

const fmtBRL = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

export default function PaymentReturn() {
  const { session_id } = useLocalSearchParams<{ session_id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "paid" | "unpaid" | "error">("checking");
  const [booking, setBooking] = useState<any>(null);
  const [attempts, setAttempts] = useState(0);

  const check = useCallback(async () => {
    try {
      const r = await api<{ booking: any }>(`/bookings/status/${session_id}`);
      setBooking(r.booking);
      if (r.booking.payment_status === "paid") { setStatus("paid"); return; }
      setStatus("unpaid");
    } catch { setStatus("error"); }
  }, [session_id]);

  useEffect(() => { if (session_id) check(); }, [session_id, check]);

  useEffect(() => {
    if (status === "unpaid" && attempts < 5) {
      const t = setTimeout(() => { setAttempts(a => a + 1); check(); }, 2000);
      return () => clearTimeout(t);
    }
  }, [status, attempts, check]);

  const isSuccess = status === "paid";
  const bg = isSuccess ? colors.success : status === "checking" || (status === "unpaid" && attempts < 5) ? colors.brand : colors.warning;
  const icon: any = isSuccess ? "checkmark-circle" : status === "checking" || (status === "unpaid" && attempts < 5) ? "time" : "alert-circle";
  const title = isSuccess ? "Pagamento confirmado" : status === "error" ? "Erro" : (status === "unpaid" && attempts >= 5) ? "Pagamento não confirmado" : "Aguardando pagamento";
  const subtitle = isSuccess ? "Sua reserva está garantida. Nos vemos em breve!" : (status === "unpaid" && attempts >= 5) ? "O pagamento não foi finalizado. Você pode tentar novamente." : "Estamos verificando o status do seu pagamento...";

  return (
    <SafeAreaView testID="payment-return-screen" style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <View style={[styles.iconRing, { borderColor: bg }]}>
          {status === "checking" || (status === "unpaid" && attempts < 5) ? (
            <ActivityIndicator size="large" color={colors.brand} />
          ) : (
            <Ionicons name={icon} size={80} color={bg} />
          )}
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {booking && (
          <View style={styles.card}>
            <Row label="Barbeiro" value={booking.barber_name} />
            <Row label="Serviço" value={booking.service_name} />
            <Row label="Data" value={`${booking.date} • ${booking.time}`} />
            <Row label="Total" value={fmtBRL(booking.amount_cents)} highlight />
          </View>
        )}

        <Pressable testID="payment-return-home" style={styles.btn} onPress={() => router.replace("/(cliente)/appointments")}>
          <Text style={styles.btnText}>Ver minha agenda</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, highlight }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && { color: colors.brand, fontSize: 18 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1, alignItems: "center", padding: spacing.xl, paddingTop: spacing.xxxl },
  iconRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: spacing.sm },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: "center", marginBottom: spacing.xl, paddingHorizontal: spacing.md },
  card: { alignSelf: "stretch", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 13 },
  rowValue: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  btn: { alignSelf: "stretch", backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 16, alignItems: "center" },
  btnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
});
```

### PRD.md

```markdown
/app/memory/PRD.md

# Navalha - PRD

## What
Mobile app (React Native + Expo, Expo Router) for a barbershop appointment/booking business.

## Users
- **Cliente**: browses barbers, chooses service + date + time, pays and views agenda.
- **Barbeiro**: manages his services, sees today's timeline, marks bookings completed/cancelled, tracks revenue.

## Auth
Custom JWT (email/password, bcrypt), role stored on user. `expo-secure-store` on native, localStorage fallback on web.

## Payments
Stripe Checkout Session (hosted). If pod key is placeholder (`sk_test_emergent`), backend serves a demo HTML checkout page at `/api/mock-checkout/{session_id}` that simulates the same success flow (marks booking as paid+confirmed).

Client opens checkout URL via `expo-web-browser`, then app polls `/api/bookings/status/{session_id}`.

## Backend endpoints (all under /api)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`
- `GET /barbers`, `GET /barbers/{id}`, `GET /barbers/{id}/services`, `GET /barbers/{id}/slots?date=YYYY-MM-DD`
- `POST /services`, `GET /services/mine`, `DELETE /services/{id}` (barbeiro-only)
- `POST /bookings/checkout`, `GET /bookings/status/{session_id}`, `GET /bookings/mine`, `PATCH /bookings/{id}/status`

## Screens
- (auth) welcome / login / register
- (cliente) home / appointments / profile / barber/[id] / booking/[barberId] / payment-return
- (barbeiro) today / services / profile

## Design
Dark luxe theme — deep charcoal (#121415) with copper accent (#D47B39). See `/app/design_guidelines.json`.

## Seed data
3 barbeiros with 2–3 services each + 1 demo cliente. Credentials in `/app/memory/test_credentials.md`.
```

### profile.tsx

```tsx
/app/frontend/app/(cliente)/profile.tsx
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/auth";
import { colors, spacing, radius } from "@/src/theme/tokens";
import ClientProfile from "../(cliente)/profile";
export default ClientProfile;

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const doLogout = async () => {
    await logout();
    router.replace("/(auth)/welcome");
  };

  return (
    <SafeAreaView testID="cliente-profile-screen" style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Perfil</Text>
        <View style={styles.avatarBox}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{user?.name?.[0]?.toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{user?.role === "cliente" ? "Cliente" : "Barbeiro"}</Text>
          </View>
        </View>

        <View style={styles.list}>
          <Row icon="calendar-outline" label="Meus agendamentos" onPress={() => router.push("/(cliente)/appointments")} />
          <Row icon="cut-outline" label="Explorar barbeiros" onPress={() => router.push("/(cliente)/home")} />
          <Row icon="mail-outline" label={user?.email || ""} muted />
          {user?.phone && <Row icon="call-outline" label={user.phone} muted />}
        </View>

        <Pressable testID="profile-logout-btn" style={styles.logoutBtn} onPress={doLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, onPress, muted }: any) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <Text style={[styles.rowText, muted && { color: colors.onSurfaceSecondary }]}>{label}</Text>
      {onPress && <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  h1: { color: colors.onSurface, fontSize: 28, fontWeight: "800", marginBottom: spacing.lg },
  avatarBox: { alignItems: "center", paddingVertical: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  avatarLetter: { color: colors.brand, fontSize: 40, fontWeight: "800" },
  name: { color: colors.onSurface, fontSize: 22, fontWeight: "700" },
  email: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4 },
  rolePill: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  roleText: { color: colors.brand, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", textTransform: "uppercase" },
  list: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: spacing.xl },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  logoutBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 16, borderWidth: 1, borderColor: colors.error, borderRadius: radius.lg },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: 15 },
});
```

### register.tsx

```tsx
/app/frontend/app/(auth)/register.tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme/tokens";
import { useAuth } from "@/src/context/auth";

type Role = "cliente" | "barbeiro";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("cliente");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!name || !email || !password) { setErr("Preencha todos os campos obrigatórios"); return; }
    if (password.length < 6) { setErr("Senha deve ter no mínimo 6 caracteres"); return; }
    setLoading(true);
    try {
      const u = await register(name.trim(), email.trim(), password, role, phone.trim() || undefined);
      if (u.role === "cliente") router.replace("/(cliente)/home");
      else router.replace("/(barbeiro)/today");
    } catch (e: any) {
      setErr(e.message || "Erro ao cadastrar");
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView testID="register-screen" style={styles.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="register-back-btn" style={styles.back} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Criar sua{"\n"}conta.</Text>
          <Text style={styles.subtitle}>Escolha seu perfil para começar.</Text>

          <View style={styles.roleRow}>
            <Pressable
              testID="register-role-cliente"
              style={[styles.roleBtn, role === "cliente" && styles.roleBtnActive]}
              onPress={() => setRole("cliente")}
            >
              <Ionicons name="person-outline" size={20} color={role === "cliente" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
              <Text style={[styles.roleText, role === "cliente" && styles.roleTextActive]}>Cliente</Text>
            </Pressable>
            <Pressable
              testID="register-role-barbeiro"
              style={[styles.roleBtn, role === "barbeiro" && styles.roleBtnActive]}
              onPress={() => setRole("barbeiro")}
            >
              <Ionicons name="cut-outline" size={20} color={role === "barbeiro" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
              <Text style={[styles.roleText, role === "barbeiro" && styles.roleTextActive]}>Barbeiro</Text>
            </Pressable>
          </View>

          <Field label="Nome" testID="register-name-input" value={name} onChange={setName} placeholder="Seu nome completo" />
          <Field label="Email" testID="register-email-input" value={email} onChange={setEmail} placeholder="voce@email.com" keyboardType="email-address" />
          <Field label="Telefone (opcional)" testID="register-phone-input" value={phone} onChange={setPhone} placeholder="+55 11 98888-7777" keyboardType="phone-pad" />
          <Field label="Senha" testID="register-password-input" value={password} onChange={setPassword} placeholder="••••••••" secureTextEntry />

          {err && <Text testID="register-error" style={styles.err}>{err}</Text>}

          <Pressable testID="register-submit-btn" style={[styles.btn, loading && { opacity: 0.6 }]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Criar conta</Text>}
          </Pressable>

          <Pressable testID="register-go-login" style={styles.linkWrap} onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.linkMuted}>Já tem conta? </Text>
            <Text style={styles.link}>Entrar</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        testID={props.testID}
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor={colors.onSurfaceSecondary}
        keyboardType={props.keyboardType}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.keyboardType === "email-address" ? "none" : "sentences"}
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -8, marginBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 34, fontWeight: "800", lineHeight: 40, marginBottom: spacing.sm },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 15, marginBottom: spacing.lg },
  roleRow: { flexDirection: "row", gap: 12, marginBottom: spacing.lg },
  roleBtn: {
    flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: 16, backgroundColor: colors.surfaceSecondary,
  },
  roleBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  roleText: { color: colors.onSurfaceSecondary, fontWeight: "600" },
  roleTextActive: { color: colors.onBrandPrimary },
  field: { marginBottom: spacing.md },
  label: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1.5, marginBottom: 8, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: 16, color: colors.onSurface, fontSize: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  err: { color: colors.error, marginBottom: spacing.md },
  btn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm },
  btnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  linkWrap: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg },
  linkMuted: { color: colors.onSurfaceSecondary },
  link: { color: colors.brand, fontWeight: "700" },
});
```

### requirements.txt

```text
/app/backend/requirements.txt
fastapi==0.110.1
uvicorn==0.25.0
boto3>=1.34.129
requests-oauthlib>=2.0.0
cryptography>=42.0.8
python-dotenv>=1.0.1
pymongo==4.6.3
pydantic>=2.6.4
email-validator>=2.2.0
pyjwt>=2.10.1
bcrypt==4.1.3
passlib>=1.7.4
tzdata>=2024.2
motor==3.3.1
pytest>=8.0.0
pytest-xdist>=3.6.0
black>=24.1.1
isort>=5.13.2
flake8>=7.0.0
mypy>=1.8.0
python-jose>=3.3.0
requests>=2.31.0
pandas>=2.2.0
numpy>=1.26.0
python-multipart>=0.0.9
jq>=1.6.0
typer>=0.9.0
emergentintegrations==0.2.0
```

### server.pi

```python
ultima alteração feita
app.include_router(api)

from fastapi.responses import HTMLResponse

@app.get("/api/mock-checkout/{session_id}", response_class=HTMLResponse)
async def mock_checkout(session_id: str, confirm: int = 0):
    b = await db.bookings.find_one({"stripe_session_id": session_id}, {"_id": 0})
    if not b:
        return HTMLResponse("<h1>Sessao nao encontrada</h1>", status_code=404)
    if confirm == 1:
        await db.bookings.update_one(
            {"stripe_session_id": session_id},
            {"$set": {"payment_status": "paid", "status": "confirmed"}},
        )
        html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<title>Pagamento confirmado</title>"
            "<style>body{background:#121415;color:#F0F0F0;font-family:-apple-system,system-ui,sans-serif;margin:0;padding:24px;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}"
            ".ring{width:120px;height:120px;border-radius:60px;border:3px solid #4A7C59;display:flex;align-items:center;justify-content:center;font-size:60px;color:#4A7C59;margin-bottom:24px}"
            "h1{font-size:26px;margin:8px 0}p{color:#A3A6A8;margin:6px 0}"
            ".info{background:#1A1D1E;border:1px solid #262A2C;border-radius:16px;padding:20px;margin-top:24px;max-width:400px;width:100%}"
            ".row{display:flex;justify-content:space-between;padding:6px 0}.k{color:#A3A6A8}.v{color:#F0F0F0;font-weight:700}</style></head><body>"
            f"<div class='ring'>&#10003;</div><h1>Pagamento confirmado</h1><p>Sua reserva foi garantida.</p>"
            f"<div class='info'>"
            f"<div class='row'><span class='k'>Barbeiro</span><span class='v'>{b['barber_name']}</span></div>"
            f"<div class='row'><span class='k'>Servico</span><span class='v'>{b['service_name']}</span></div>"
            f"<div class='row'><span class='k'>Data</span><span class='v'>{b['date']} - {b['time']}</span></div>"
            f"<div class='row'><span class='k'>Total</span><span class='v'>R$ {b['amount_cents']/100:.2f}</span></div>"
            f"</div><p style='margin-top:24px;font-size:12px'>Voce pode fechar esta janela e voltar ao app.</p>"
            f"</body></html>"
        )
        return HTMLResponse(html)
    html = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Checkout Demo</title>"
        "<style>body{background:#121415;color:#F0F0F0;font-family:-apple-system,system-ui,sans-serif;margin:0;padding:24px;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}"
        ".card{background:#1A1D1E;border:1px solid #262A2C;border-radius:16px;padding:24px;max-width:440px;width:100%}"
        "h1{font-size:22px;margin:0 0 6px}p{color:#A3A6A8;margin:6px 0 20px;font-size:14px}"
        ".row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1F2224}.k{color:#A3A6A8}.v{color:#F0F0F0;font-weight:700}"
        ".total{color:#D47B39;font-size:22px;font-weight:800}"
        "button{width:100%;padding:16px;background:#D47B39;color:#0A0B0C;border:0;border-radius:16px;font-size:16px;font-weight:700;margin-top:20px;cursor:pointer}"
        ".note{margin-top:14px;font-size:11px;color:#A3A6A8;text-align:center}"
        ".badge{display:inline-block;background:#3D2719;color:#E8A97B;padding:4px 10px;border-radius:999px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin-bottom:12px}"
        "</style></head><body><div class='card'>"
        "<div class='badge'>Modo Demo - Stripe</div>"
        "<h1>Confirmar pagamento</h1>"
        "<p>Este eh um checkout simulado. Adicione uma chave Stripe real para pagamentos reais.</p>"
        f"<div class='row'><span class='k'>Barbeiro</span><span class='v'>{b['barber_name']}</span></div>"
        f"<div class='row'><span class='k'>Servico</span><span class='v'>{b['service_name']}</span></div>"
        f"<div class='row'><span class='k'>Data</span><span class='v'>{b['date']} - {b['time']}</span></div>"
        f"<div class='row' style='border:0'><span class='k'>Total</span><span class='v total'>R$ {b['amount_cents']/100:.2f}</span></div>"
        "<form method='get'><input type='hidden' name='confirm' value='1'/>"
        "<button type='submit'>Pagar agora</button></form>"
        "<p class='note'>Ao pagar, sua reserva sera confirmada.</p>"
        "</div></body></html>"
    )
    return HTMLResponse(html)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Server.py

Trecho recuperado como `/app/backend/server.py`; o involucro textual da ferramenta foi removido.

```python

import os
import uuid
import logging
from datetime import datetime, timedelta, timezone, date, time as dtime
from pathlib import Path
from typing import List, Optional, Literal

import bcrypt
import jwt
import stripe
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXP_HOURS = int(os.environ.get("JWT_EXP_HOURS", "168"))
STRIPE_API_KEY = os.environ["STRIPE_API_KEY"]
APP_URL = os.environ.get("APP_URL", "http://localhost:8081")

stripe.api_key = STRIPE_API_KEY

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("navalha")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Navalha Barbearia API")
api = APIRouter(prefix="/api")

Role = Literal["cliente", "barbeiro"]

# ---------------- Models ----------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: Role
    phone: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: Role
    phone: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None

class ServiceIn(BaseModel):
    name: str
    description: Optional[str] = None
    duration_min: int = Field(gt=0)
    price_cents: int = Field(gt=0)
    category: Optional[str] = "corte"

class ServiceOut(ServiceIn):
    id: str
    barber_id: str

class BookingCheckoutIn(BaseModel):
    barber_id: str
    service_id: str
    date: str  # YYYY-MM-DD
    time: str  # HH:MM

class BookingOut(BaseModel):
    id: str
    barber_id: str
    barber_name: str
    customer_id: str
    customer_name: str
    service_id: str
    service_name: str
    date: str
    time: str
    duration_min: int
    amount_cents: int
    currency: str
    status: str
    payment_status: str

# ---------------- Auth utils ----------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def make_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "role": role, "iat": now, "exp": now + timedelta(hours=JWT_EXP_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")

def require_role(role: str):
    async def dep(user=Depends(current_user)):
        if user.get("role") != role:
            raise HTTPException(403, "Forbidden")
        return user
    return dep

def user_out(u: dict) -> dict:
    return {
        "id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"],
        "phone": u.get("phone"), "bio": u.get("bio"), "avatar_url": u.get("avatar_url"),
    }

# ---------------- Auth routes ----------------
@api.post("/auth/register")
async def register(x: RegisterIn):
    email = x.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email já cadastrado")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "name": x.name, "email": email, "role": x.role,
        "phone": x.phone, "password_hash": hash_password(x.password),
        "bio": None, "avatar_url": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"access_token": make_token(uid, x.role), "user": user_out(doc)}

@api.post("/auth/login")
async def login(x: LoginIn):
    u = await db.users.find_one({"email": x.email.lower()})
    if not u or not verify_password(x.password, u["password_hash"]):
        raise HTTPException(401, "Email ou senha inválidos")
    return {"access_token": make_token(u["id"], u["role"]), "user": user_out(u)}

@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return {"user": user_out(user)}

class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None

@api.patch("/auth/me")
async def update_me(x: UpdateProfileIn, user=Depends(current_user)):
    upd = {k: v for k, v in x.model_dump().items() if v is not None}
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return {"user": user_out(u)}

# ---------------- Barbers ----------------
@api.get("/barbers")
async def list_barbers():
    cursor = db.users.find({"role": "barbeiro"}, {"_id": 0, "password_hash": 0})
    out = []
    async for b in cursor:
        svc_count = await db.services.count_documents({"barber_id": b["id"]})
        out.append({**user_out(b), "service_count": svc_count})
    return {"barbers": out}

@api.get("/barbers/{barber_id}")
async def get_barber(barber_id: str):
    b = await db.users.find_one({"id": barber_id, "role": "barbeiro"}, {"_id": 0, "password_hash": 0})
    if not b:
        raise HTTPException(404, "Barbeiro não encontrado")
    return {"barber": user_out(b)}

# ---------------- Services ----------------
@api.get("/barbers/{barber_id}/services")
async def barber_services(barber_id: str):
    cursor = db.services.find({"barber_id": barber_id}, {"_id": 0})
    return {"services": [s async for s in cursor]}

@api.get("/services/mine")
async def my_services(user=Depends(require_role("barbeiro"))):
    cursor = db.services.find({"barber_id": user["id"]}, {"_id": 0})
    return {"services": [s async for s in cursor]}

@api.post("/services")
async def create_service(x: ServiceIn, user=Depends(require_role("barbeiro"))):
    sid = str(uuid.uuid4())
    doc = {"id": sid, "barber_id": user["id"], **x.model_dump()}
    await db.services.insert_one(doc)
    doc.pop("_id", None)
    return {"service": doc}

@api.delete("/services/{sid}")
async def delete_service(sid: str, user=Depends(require_role("barbeiro"))):
    r = await db.services.delete_one({"id": sid, "barber_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Serviço não encontrado")
    return {"ok": True}

# ---------------- Slots ----------------
BUSINESS_START = 9  # 09:00
BUSINESS_END = 20   # 20:00
SLOT_MIN = 30

def _gen_day_slots():
    out = []
    for h in range(BUSINESS_START, BUSINESS_END):
        out.append(f"{h:02d}:00")
        out.append(f"{h:02d}:30")
    return out

@api.get("/barbers/{barber_id}/slots")
async def barber_slots(barber_id: str, date: str):
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "date inválido")
    all_slots = _gen_day_slots()
    cursor = db.bookings.find(
        {"barber_id": barber_id, "date": date, "status": {"$in": ["confirmed", "pending"]}},
        {"_id": 0, "time": 1}
    )
    taken = {b["time"] async for b in cursor}
    return {"slots": [{"time": s, "available": s not in taken} for s in all_slots]}

# ---------------- Bookings + Stripe ----------------
@api.post("/bookings/checkout")
async def create_checkout(x: BookingCheckoutIn, user=Depends(require_role("cliente"))):
    barber = await db.users.find_one({"id": x.barber_id, "role": "barbeiro"})
    if not barber:
        raise HTTPException(404, "Barbeiro não encontrado")
    svc = await db.services.find_one({"id": x.service_id, "barber_id": x.barber_id})
    if not svc:
        raise HTTPException(404, "Serviço não encontrado")
    try:
        datetime.strptime(x.date, "%Y-%m-%d")
        datetime.strptime(x.time, "%H:%M")
    except ValueError:
        raise HTTPException(400, "Data/hora inválida")

    conflict = await db.bookings.find_one({
        "barber_id": x.barber_id, "date": x.date, "time": x.time,
        "status": {"$in": ["confirmed", "pending"]}
    })
    if conflict:
        raise HTTPException(409, "Horário indisponível")

    bid = str(uuid.uuid4())
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": "brl",
                "product_data": {"name": f"{svc['name']} • {barber['name']}"},
                "unit_amount": svc["price_cents"],
            },
            "quantity": 1,
        }],
        success_url=f"{APP_URL}/payment-return?session_id={{CHECKOUT_SESSION_ID}}&status=success",
        cancel_url=f"{APP_URL}/payment-return?session_id={{CHECKOUT_SESSION_ID}}&status=cancel",
        metadata={"booking_id": bid, "user_id": user["id"]},
    )

    doc = {
        "id": bid, "barber_id": x.barber_id, "barber_name": barber["name"],
        "customer_id": user["id"], "customer_name": user["name"],
        "service_id": svc["id"], "service_name": svc["name"],
        "date": x.date, "time": x.time, "duration_min": svc["duration_min"],
        "amount_cents": svc["price_cents"], "currency": "brl",
        "status": "pending", "payment_status": "unpaid",
        "stripe_session_id": session.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bookings.insert_one(doc)
    return {"booking_id": bid, "checkout_url": session.url, "session_id": session.id}

@api.get("/bookings/status/{session_id}")
async def booking_status(session_id: str, user=Depends(current_user)):
    b = await db.bookings.find_one({"stripe_session_id": session_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Reserva não encontrada")
    if b.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            ps = s.payment_status  # 'paid' / 'unpaid' / 'no_payment_required'
            new_status = "confirmed" if ps == "paid" else b["status"]
            await db.bookings.update_one(
                {"stripe_session_id": session_id},
                {"$set": {"payment_status": ps, "status": new_status}},
            )
            b["payment_status"] = ps
            b["status"] = new_status
        except Exception as e:
            logger.warning(f"Stripe retrieve error: {e}")
    b.pop("stripe_session_id", None)
    return {"booking": b}

@api.get("/bookings/mine")
async def my_bookings(user=Depends(current_user)):
    q = {"customer_id": user["id"]} if user["role"] == "cliente" else {"barber_id": user["id"]}
    cursor = db.bookings.find(q, {"_id": 0, "stripe_session_id": 0}).sort([("date", 1), ("time", 1)])
    return {"bookings": [b async for b in cursor]}

class UpdateBookingStatus(BaseModel):
    status: Literal["completed", "cancelled"]

@api.patch("/bookings/{bid}/status")
async def update_booking(bid: str, x: UpdateBookingStatus, user=Depends(current_user)):
    b = await db.bookings.find_one({"id": bid})
    if not b:
        raise HTTPException(404, "Reserva não encontrada")
    if user["role"] == "barbeiro" and b["barber_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    if user["role"] == "cliente" and b["customer_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    if user["role"] == "cliente" and x.status != "cancelled":
        raise HTTPException(403, "Cliente só pode cancelar")
    await db.bookings.update_one({"id": bid}, {"$set": {"status": x.status}})
    return {"ok": True}

# ---------------- Seed ----------------
DEMO_BARBERS = [
    {
        "name": "Rafael Souza", "email": "rafael@navalha.com", "password": "barber123",
        "bio": "Especialista em cortes clássicos e degradê há 10 anos.",
        "avatar_url": "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=400&q=80",
        "services": [
            {"name": "Corte Clássico", "description": "Corte executivo com tesoura e máquina.", "duration_min": 30, "price_cents": 5500, "category": "corte"},
            {"name": "Barba Completa", "description": "Modelagem com toalha quente e óleo.", "duration_min": 30, "price_cents": 4500, "category": "barba"},
            {"name": "Combo Corte + Barba", "description": "Serviço completo.", "duration_min": 60, "price_cents": 8900, "category": "combo"},
        ],
    },
    {
        "name": "Diego Martins", "email": "diego@navalha.com", "password": "barber123",
        "bio": "Referência em degradê americano e desenhos.",
        "avatar_url": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=400&q=80",
        "services": [
            {"name": "Degradê Americano", "description": "Fade preciso na máquina.", "duration_min": 45, "price_cents": 7000, "category": "corte"},
            {"name": "Sobrancelha", "description": "Design com navalha.", "duration_min": 15, "price_cents": 2500, "category": "extras"},
        ],
    },
    {
        "name": "Lucas Pereira", "email": "lucas@navalha.com", "password": "barber123",
        "bio": "Cortes modernos e coloração masculina.",
        "avatar_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80",
        "services": [
            {"name": "Corte + Lavagem", "description": "Corte moderno com lavagem.", "duration_min": 40, "price_cents": 6500, "category": "corte"},
            {"name": "Combo Premium", "description": "Corte, barba e sobrancelha.", "duration_min": 75, "price_cents": 11500, "category": "combo"},
        ],
    },
]

@app.on_event("startup")
async def seed():
    await db.users.create_index("email", unique=True)
    await db.services.create_index("barber_id")
    await db.bookings.create_index([("barber_id", 1), ("date", 1), ("time", 1)])
    if await db.users.count_documents({"role": "barbeiro"}) > 0:
        return
    for b in DEMO_BARBERS:
        uid = str(uuid.uuid4())
        await db.users.insert_one({
            "id": uid, "name": b["name"], "email": b["email"], "role": "barbeiro",
            "password_hash": hash_password(b["password"]),
            "phone": None, "bio": b["bio"], "avatar_url": b["avatar_url"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        for s in b["services"]:
            await db.services.insert_one({"id": str(uuid.uuid4()), "barber_id": uid, **s})
    # Demo cliente
    if not await db.users.find_one({"email": "cliente@navalha.com"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "name": "João Cliente", "email": "cliente@navalha.com",
            "role": "cliente", "password_hash": hash_password("cliente123"),
            "phone": "+55 11 99999-0000", "bio": None, "avatar_url": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info("Seed complete")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@api.get("/")
async def root():
    return {"service": "Navalha API", "ok": True}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### services.tsx

```tsx
/app/frontend/app/(barbeiro)/services.tsx
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radius } from "@/src/theme/tokens";

type Service = { id: string; name: string; description?: string; duration_min: number; price_cents: number; category?: string };

const fmtBRL = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const CATS = ["corte", "barba", "combo", "extras"];

export default function Services() {
  const [items, setItems] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState("corte");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ services: Service[] }>("/services/mine");
      setItems(r.services);
    } catch {} finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reset = () => { setName(""); setDesc(""); setDuration("30"); setPrice(""); setCat("corte"); setErr(null); };

  const save = async () => {
    setErr(null);
    const dur = parseInt(duration, 10);
    const priceCents = Math.round(parseFloat(price.replace(",", ".")) * 100);
    if (!name || !dur || !priceCents || priceCents <= 0) { setErr("Preencha todos os campos"); return; }
    setSaving(true);
    try {
      await api("/services", { method: "POST", body: JSON.stringify({ name, description: desc, duration_min: dur, price_cents: priceCents, category: cat }) });
      setShowForm(false); reset(); load();
    } catch (e: any) { setErr(e.message || "Erro"); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { await api(`/services/${id}`, { method: "DELETE" }); load(); } catch {}
  };

  return (
    <SafeAreaView testID="barbeiro-services-screen" style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Meus Serviços</Text>
        <Pressable testID="add-service-btn" style={styles.addBtn} onPress={() => { reset(); setShowForm(true); }}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? <ActivityIndicator color={colors.brand} /> :
          items.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="cut-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>Nenhum serviço cadastrado</Text>
              <Text style={styles.emptyHint}>Toque em + para adicionar</Text>
            </View>
          ) : items.map(s => (
            <View key={s.id} testID={`service-item-${s.id}`} style={styles.card}>
              <View style={{ flex: 1 }}>
                <View style={styles.catPill}><Text style={styles.catText}>{s.category || "corte"}</Text></View>
                <Text style={styles.svcName}>{s.name}</Text>
                {s.description && <Text style={styles.svcDesc} numberOfLines={2}>{s.description}</Text>}
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={12} color={colors.onSurfaceSecondary} />
                  <Text style={styles.metaText}>{s.duration_min} min</Text>
                  <Text style={styles.price}>{fmtBRL(s.price_cents)}</Text>
                </View>
              </View>
              <Pressable testID={`delete-service-${s.id}`} onPress={() => remove(s.id)} style={styles.trashBtn}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          ))
        }
      </ScrollView>

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Novo Serviço</Text>
                <Pressable testID="close-form-btn" onPress={() => setShowForm(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Nome</Text>
                <TextInput testID="svc-name-input" value={name} onChangeText={setName} placeholder="Ex. Corte Executivo" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                <Text style={styles.label}>Descrição</Text>
                <TextInput testID="svc-desc-input" value={desc} onChangeText={setDesc} placeholder="Detalhes do serviço" placeholderTextColor={colors.onSurfaceSecondary} style={[styles.input, { height: 80 }]} multiline />
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Duração (min)</Text>
                    <TextInput testID="svc-duration-input" value={duration} onChangeText={setDuration} placeholder="30" keyboardType="number-pad" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Preço (R$)</Text>
                    <TextInput testID="svc-price-input" value={price} onChangeText={setPrice} placeholder="45,00" keyboardType="decimal-pad" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                  </View>
                </View>
                <Text style={styles.label}>Categoria</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {CATS.map(c => (
                    <Pressable key={c} testID={`svc-cat-${c}`} onPress={() => setCat(c)} style={[styles.catBtn, cat === c && styles.catBtnActive]}>
                      <Text style={[styles.catBtnText, cat === c && styles.catBtnTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
                {err && <Text style={styles.err}>{err}</Text>}
                <Pressable testID="save-service-btn" style={[styles.saveBtn, saving && { opacity: 0.5 }]} disabled={saving} onPress={save}>
                  {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Salvar serviço</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h1: { color: colors.onSurface, fontSize: 28, fontWeight: "800" },
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxxl },
  emptyBox: { padding: spacing.xxl, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: radius.lg },
  emptyText: { color: colors.onSurface, marginTop: 12, fontWeight: "600" },
  emptyHint: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  card: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  catPill: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginBottom: 6 },
  catText: { color: colors.brand, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700" },
  svcName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  svcDesc: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  metaText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  price: { color: colors.brand, fontSize: 14, fontWeight: "800", marginLeft: "auto" },
  trashBtn: { padding: spacing.sm },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "90%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  sheetTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  label: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.md, marginBottom: 6, fontWeight: "700" },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: 14, color: colors.onSurface, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  catBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  catBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  catBtnText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  catBtnTextActive: { color: colors.onBrandPrimary },
  err: { color: colors.error, marginTop: 12, textAlign: "center" },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 16, alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.lg },
  saveText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
});
```

### test_credentials.md

```markdown
/app/memory/test_credentials.md

# Navalha - Test Credentials

## Cliente demo
- Email: `cliente@navalha.com`
- Password: `cliente123`
- Role: cliente

## Barbeiros demo
- Email: `rafael@navalha.com` / Password: `barber123` (3 services)
- Email: `diego@navalha.com`  / Password: `barber123` (2 services)
- Email: `lucas@navalha.com`  / Password: `barber123` (2 services)

## Notes
- Stripe key `sk_test_emergent` in the pod is a placeholder and is NOT a real Stripe key.
- Backend auto-detects the placeholder and switches booking checkout to a DEMO/MOCK flow that serves an HTML confirmation page at `/api/mock-checkout/{session_id}`, then marks the booking as `paid`+`confirmed` when the user clicks "Pagar agora".
- Real Stripe path is preserved: setting `STRIPE_API_KEY` in `/app/backend/.env` to a real `sk_test_...` key will trigger Stripe Checkout Sessions automatically.
```

### today.tsx

```tsx
/app/frontend/app/(barbeiro)/today.tsx
import { useCallback, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { colors, spacing, radius } from "@/src/theme/tokens";

type Booking = {
  id: string; customer_name: string; service_name: string; date: string; time: string;
  duration_min: number; amount_cents: number; status: string; payment_status: string;
};

const fmtBRL = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Today() {
  const { user } = useAuth();
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ bookings: Booking[] }>("/bookings/mine");
      setItems(r.bookings);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const t = todayStr();
  const today = useMemo(() => items.filter(b => b.date === t && (b.status === "confirmed" || b.status === "pending")), [items, t]);
  const upcoming = useMemo(() => items.filter(b => b.date > t && (b.status === "confirmed" || b.status === "pending")), [items, t]);
  const revenue = useMemo(
    () => items.filter(b => b.payment_status === "paid" && b.status !== "cancelled").reduce((a, b) => a + b.amount_cents, 0),
    [items]
  );
  const revenueToday = useMemo(
    () => items.filter(b => b.date === t && b.payment_status === "paid" && b.status !== "cancelled").reduce((a, b) => a + b.amount_cents, 0),
    [items, t]
  );

  const updateStatus = async (id: string, status: "completed" | "cancelled") => {
    try {
      await api(`/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch {}
  };

  return (
    <SafeAreaView testID="barbeiro-today-screen" style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <Text style={styles.hi}>Bom dia,</Text>
        <Text style={styles.h1}>{user?.name.split(" ")[0]}</Text>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.mLabel}>Hoje</Text>
            <Text style={styles.mValue}>{today.length}</Text>
            <Text style={styles.mHint}>agendamentos</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mLabel}>Receita hoje</Text>
            <Text style={[styles.mValue, { color: colors.brand }]}>{fmtBRL(revenueToday)}</Text>
            <Text style={styles.mHint}>pagos</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.mLabel}>Total</Text>
            <Text style={[styles.mValue, { color: colors.success }]}>{fmtBRL(revenue)}</Text>
            <Text style={styles.mHint}>faturado</Text>
          </View>
        </View>

        <Text style={styles.section}>Agenda de hoje</Text>
        {loading ? <ActivityIndicator color={colors.brand} /> :
          today.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="calendar-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>Nenhum agendamento para hoje</Text>
            </View>
          ) : today.map(b => (
            <View key={b.id} testID={`today-booking-${b.id}`} style={styles.card}>
              <View style={styles.timeCol}>
                <Text style={styles.timeText}>{b.time}</Text>
                <Text style={styles.durText}>{b.duration_min}min</Text>
              </View>
              <View style={styles.divVert} />
              <View style={{ flex: 1 }}>
                <Text style={styles.custName}>{b.customer_name}</Text>
                <Text style={styles.serviceText}>{b.service_name}</Text>
                <View style={styles.metaRow}>
                  <View style={[styles.pill, { borderColor: b.payment_status === "paid" ? colors.success : colors.warning }]}>
                    <Text style={[styles.pillText, { color: b.payment_status === "paid" ? colors.success : colors.warning }]}>
                      {b.payment_status === "paid" ? "Pago" : "Aguardando"}
                    </Text>
                  </View>
                  <Text style={styles.priceText}>{fmtBRL(b.amount_cents)}</Text>
                </View>
                <View style={styles.actionsRow}>
                  <Pressable testID={`complete-${b.id}`} style={styles.completeBtn} onPress={() => updateStatus(b.id, "completed")}>
                    <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} />
                    <Text style={styles.completeText}>Concluir</Text>
                  </Pressable>
                  <Pressable testID={`cancel-${b.id}`} style={styles.cancelBtn} onPress={() => updateStatus(b.id, "cancelled")}>
                    <Text style={styles.cancelText}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        }

        {upcoming.length > 0 && (
          <>
            <Text style={[styles.section, { marginTop: spacing.xl }]}>Próximos dias</Text>
            {upcoming.slice(0, 10).map(b => (
              <View key={b.id} style={styles.smallCard}>
                <Text style={styles.smallDate}>{b.date} • {b.time}</Text>
                <Text style={styles.smallText}>{b.customer_name} — {b.service_name}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  hi: { color: colors.onSurfaceSecondary, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" },
  h1: { color: colors.onSurface, fontSize: 32, fontWeight: "800", marginBottom: spacing.lg },
  metricsRow: { flexDirection: "row", gap: 10, marginBottom: spacing.xl },
  metric: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  mLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700" },
  mValue: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: 6 },
  mHint: { color: colors.onSurfaceSecondary, fontSize: 10, marginTop: 2 },
  section: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginBottom: spacing.md },
  emptyBox: { padding: spacing.xl, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: radius.lg },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: 10 },
  card: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  timeCol: { alignItems: "center", justifyContent: "center", minWidth: 60 },
  timeText: { color: colors.brand, fontSize: 22, fontWeight: "800" },
  durText: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  divVert: { width: 1, backgroundColor: colors.divider, marginHorizontal: spacing.md },
  custName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  serviceText: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  pillText: { fontSize: 10, fontWeight: "700" },
  priceText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  completeBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingVertical: 8, borderRadius: radius.md },
  completeText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  cancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error },
  cancelText: { color: colors.error, fontWeight: "700", fontSize: 12 },
  smallCard: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  smallDate: { color: colors.brand, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700" },
  smallText: { color: colors.onSurface, fontSize: 13, marginTop: 4 },
});
```

### tokens.ts

```ts
/app/frontend/src/theme/tokens.ts
export const colors = {
  surface: "#121415",
  onSurface: "#F0F0F0",
  surfaceSecondary: "#1A1D1E",
  onSurfaceSecondary: "#A3A6A8",
  surfaceTertiary: "#262A2C",
  onSurfaceTertiary: "#D1D3D4",
  surfaceInverse: "#EBEBEB",
  onSurfaceInverse: "#121415",
  brand: "#D47B39",
  brandPrimary: "#D47B39",
  onBrandPrimary: "#0A0B0C",
  brandSecondary: "#B26129",
  brandTertiary: "#3D2719",
  onBrandTertiary: "#E8A97B",
  success: "#4A7C59",
  onSuccess: "#E3F0E8",
  warning: "#D4A339",
  error: "#B54D4D",
  onError: "#FCE8E8",
  border: "#262A2C",
  borderStrong: "#3D4143",
  divider: "#1F2224",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 4, md: 8, lg: 16, pill: 999 };
export const fonts = {
  display: "System",
  displayBold: "System",
  text: "System",
};
```

### tsconfig.json

```json
/app/frontend/tsconfig.json

{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": [
        "./*"
      ]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}
```

### welcome.tsx

```tsx
/app/frontend/app/(auth)/welcome.tsx
import { View, Text, StyleSheet, Pressable, ImageBackground, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius } from "@/src/theme/tokens";

const { height } = Dimensions.get("window");

export default function Welcome() {
  const router = useRouter();
  return (
    <View testID="welcome-screen" style={styles.root}>
      <ImageBackground
        source={{ uri: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?crop=entropy&cs=srgb&fm=jpg&w=1080&q=85" }}
        style={styles.bg}
        resizeMode="cover"
      >
        <LinearGradient
          colors={["rgba(18,20,21,0.2)", "rgba(18,20,21,0.85)", "rgba(18,20,21,1)"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.top}>
            <Text style={styles.mark}>NAVALHA</Text>
            <Text style={styles.tag}>Barbearia • Reserve seu horário</Text>
          </View>
          <View style={styles.bottom}>
            <Text style={styles.headline}>Corte de mestre.{"\n"}Reserva sem esforço.</Text>
            <Text style={styles.sub}>Escolha seu barbeiro favorito, o horário perfeito e pague direto pelo app.</Text>
            <Pressable
              testID="welcome-login-btn"
              style={styles.primaryBtn}
              onPress={() => router.push("/(auth)/login")}
            >
              <Text style={styles.primaryBtnText}>Entrar</Text>
            </Pressable>
            <Pressable
              testID="welcome-register-btn"
              style={styles.ghostBtn}
              onPress={() => router.push("/(auth)/register")}
            >
              <Text style={styles.ghostBtnText}>Criar conta</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  bg: { flex: 1, width: "100%", height: "100%" },
  safe: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "space-between" },
  top: { marginTop: spacing.xl, alignItems: "flex-start" },
  mark: { color: colors.onSurface, fontSize: 22, letterSpacing: 6, fontWeight: "800" },
  tag: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 2, marginTop: 6 },
  bottom: { paddingBottom: spacing.lg },
  headline: { color: colors.onSurface, fontSize: 34, fontWeight: "800", lineHeight: 40, marginBottom: spacing.md },
  sub: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22, marginBottom: spacing.xl },
  primaryBtn: {
    backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 16,
    alignItems: "center", marginBottom: spacing.md,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16, letterSpacing: 0.5 },
  ghostBtn: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg,
    paddingVertical: 16, alignItems: "center",
  },
  ghostBtnText: { color: colors.onSurface, fontWeight: "600", fontSize: 16 },
});
```
