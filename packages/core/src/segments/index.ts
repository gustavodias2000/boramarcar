/**
 * Catálogo de segmentos.
 *
 * Este arquivo sempre declarou a intenção de ser agnóstico de framework. Até
 * 25/08/2026 ele vivia numa raiz `src/` fora do `include` do tsconfig da web, então
 * nunca era compilado nem importado por ninguém — a intenção estava escrita e não
 * era estrutural.
 *
 * Agora vive no pacote compartilhado entre site e app (ADR 0005). O `tsconfig` deste
 * pacote não inclui a lib "DOM": o agnosticismo passou a ser verificado pelo
 * compilador, não prometido em comentário.
 *
 * A interface consulta `hasFeature` e `getSegmentConfig`. Nunca ramifica por tipo de
 * negócio direto.
 */
export const BUSINESS_TYPES = [
  "barbershop",
  "automotive_aesthetics",
  "beauty_salon",
  "manicure",
  "makeup",
  "massage",
  "tattoo",
  "eyebrows",
  "aesthetics",
  "depilation",
  "petshop",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const FEATURE_KEYS = [
  "customers",
  "appointments",
  "professionals",
  "services",
  "finance",
  "inventory",
  "vehicles",
  "boxes",
  "workOrders",
  "inspections",
  "beforeAfterPhotos",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type SegmentFeatures = Readonly<Record<FeatureKey, boolean>>;

export interface SegmentLabels {
  customer: string;
  customerPlural: string;
  professional: string;
  professionalPlural: string;
  appointment: string;
  appointmentPlural: string;
  vehicle?: string;
  vehiclePlural?: string;
}

export interface SegmentConfig {
  readonly key: BusinessType;
  readonly label: string;
  readonly features: SegmentFeatures;
  readonly labels: SegmentLabels;
}

const CORE_FEATURES: SegmentFeatures = {
  customers: true,
  appointments: true,
  professionals: true,
  services: true,
  finance: true,
  inventory: true,
  vehicles: false,
  boxes: false,
  workOrders: false,
  inspections: false,
  beforeAfterPhotos: false,
};

const withFeatures = (enabled: readonly FeatureKey[]): SegmentFeatures => ({
  ...CORE_FEATURES,
  ...Object.fromEntries(enabled.map((feature) => [feature, true])),
});

export const SEGMENT_CONFIGS: Readonly<Record<BusinessType, SegmentConfig>> = {
  barbershop: {
    key: "barbershop",
    label: "Barbearia",
    features: CORE_FEATURES,
    labels: {
      customer: "Cliente",
      customerPlural: "Clientes",
      professional: "Barbeiro",
      professionalPlural: "Barbeiros",
      appointment: "Agendamento",
      appointmentPlural: "Agendamentos",
    },
  },
  automotive_aesthetics: {
    key: "automotive_aesthetics",
    label: "Estética Automotiva",
    features: withFeatures(["vehicles", "boxes", "workOrders", "inspections", "beforeAfterPhotos"]),
    labels: {
      customer: "Cliente",
      customerPlural: "Clientes",
      professional: "Técnico",
      professionalPlural: "Técnicos",
      appointment: "Agendamento",
      appointmentPlural: "Agendamentos",
      vehicle: "Veículo",
      vehiclePlural: "Veículos",
    },
  },
  beauty_salon: {
    key: "beauty_salon",
    label: "Salão de Beleza",
    features: CORE_FEATURES,
    labels: {
      customer: "Cliente",
      customerPlural: "Clientes",
      professional: "Profissional",
      professionalPlural: "Profissionais",
      appointment: "Agendamento",
      appointmentPlural: "Agendamentos",
    },
  },
  manicure: {
    key: "manicure",
    label: "Manicure / Nail Designer",
    features: CORE_FEATURES,
    labels: {
      customer: "Cliente",
      customerPlural: "Clientes",
      professional: "Nail Designer",
      professionalPlural: "Nail Designers",
      appointment: "Agendamento",
      appointmentPlural: "Agendamentos",
    },
  },
  makeup: {
    key: "makeup",
    label: "Maquiagem",
    features: CORE_FEATURES,
    labels: {
      customer: "Cliente",
      customerPlural: "Clientes",
      professional: "Maquiador",
      professionalPlural: "Maquiadores",
      appointment: "Agendamento",
      appointmentPlural: "Agendamentos",
    },
  },
  massage: {
    key: "massage",
    label: "Massoterapia",
    features: CORE_FEATURES,
    labels: {
      customer: "Cliente",
      customerPlural: "Clientes",
      professional: "Terapeuta",
      professionalPlural: "Terapeutas",
      appointment: "Sessão",
      appointmentPlural: "Sessões",
    },
  },
  tattoo: {
    key: "tattoo",
    label: "Estúdio de Tatuagem",
    features: CORE_FEATURES,
    labels: {
      customer: "Cliente",
      customerPlural: "Clientes",
      professional: "Tatuador",
      professionalPlural: "Tatuadores",
      appointment: "Sessão",
      appointmentPlural: "Sessões",
    },
  },
  eyebrows: {
    key: "eyebrows",
    label: "Designer de Sobrancelhas",
    features: CORE_FEATURES,
    labels: {
      customer: "Cliente",
      customerPlural: "Clientes",
      professional: "Designer",
      professionalPlural: "Designers",
      appointment: "Agendamento",
      appointmentPlural: "Agendamentos",
    },
  },
  aesthetics: {
    key: "aesthetics",
    label: "Estética Facial e Corporal",
    features: CORE_FEATURES,
    labels: {
      customer: "Cliente",
      customerPlural: "Clientes",
      professional: "Especialista",
      professionalPlural: "Especialistas",
      appointment: "Sessão",
      appointmentPlural: "Sessões",
    },
  },
  depilation: {
    key: "depilation",
    label: "Depilação",
    features: CORE_FEATURES,
    labels: {
      customer: "Cliente",
      customerPlural: "Clientes",
      professional: "Profissional",
      professionalPlural: "Profissionais",
      appointment: "Sessão",
      appointmentPlural: "Sessões",
    },
  },
  petshop: {
    key: "petshop",
    label: "Pet Shop / Banho e Tosa",
    features: CORE_FEATURES,
    labels: {
      customer: "Tutor",
      customerPlural: "Tutores",
      professional: "Profissional",
      professionalPlural: "Profissionais",
      appointment: "Agendamento",
      appointmentPlural: "Agendamentos",
    },
  },
};

export function getSegmentConfig(businessType: BusinessType): SegmentConfig {
  return SEGMENT_CONFIGS[businessType];
}

/**
 * A plan may further restrict a feature, but can never enable one that the
 * selected segment does not support.
 */
export function hasFeature(
  businessType: BusinessType,
  feature: FeatureKey,
  planFeatures?: ReadonlySet<FeatureKey>,
): boolean {
  const enabledBySegment = SEGMENT_CONFIGS[businessType].features[feature];
  return enabledBySegment && (planFeatures === undefined || planFeatures.has(feature));
}
