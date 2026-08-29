/**
 * Núcleo do Bora Marcá — compartilhado entre o site e o aplicativo.
 *
 * REGRA DO PACOTE: nada aqui importa React, React Native ou API de navegador. É
 * TypeScript puro mais o cliente Supabase quando chegar a camada de dados.
 *
 * A verificação não é honra: `tsconfig.json` deste pacote omite a lib "DOM", então
 * `window`, `document` e afins não compilam. A regra de lint contra importar React
 * cobre o resto.
 *
 * Ver `docs/adr/0005-nucleo-compartilhado-entre-site-e-app.md`.
 */

export {
  BUSINESS_TYPES,
  FEATURE_KEYS,
  SEGMENT_CONFIGS,
  getSegmentConfig,
  hasFeature,
} from "./segments/index";

export {
  CATALOGO,
  categoriaPorId,
  categoriasDisponiveis,
} from "./segments/catalogo";

export type { CategoriaDoCatalogo } from "./segments/catalogo";

export { SEGMENT_PALETTES, getSegmentPalette } from "./segments/paletas";

export type { SegmentPalette } from "./segments/paletas";

export type {
  BusinessType,
  FeatureKey,
  SegmentConfig,
  SegmentFeatures,
  SegmentLabels,
} from "./segments/index";

export {
  BUSINESS_ROLES,
  BUSINESS_ROLE_LABELS,
  PERMISSIONS,
  can,
  isBusinessRole,
  permissionsFor,
  rolesWith,
} from "./permissions/index";

export type { BusinessRole, Permission } from "./permissions/index";

export {
  PATIO_STATUSES,
  displayLicensePlate,
  normalizeLicensePlate,
  normalizePatioOrder,
} from "./domain/automotive";

export type {
  AutomotiveMediaStage,
  AutomotivePaymentKind,
  AutomotivePaymentMethod,
  PatioOrder,
  PatioStatus,
  WorkOrderItem,
  WorkOrderItemKind,
  WorkOrderMedia,
  WorkOrderPayment,
} from "./domain/automotive";

export { formatCurrency, formatDateTime, formatTime } from "./format/index";

export {
  addWorkOrderItem,
  deliverWorkOrder,
  listPatioOrders,
  listWorkOrderItems,
  listWorkOrderMedia,
  listWorkOrderPayments,
  openWalkInWorkOrder,
  recordWorkOrderPayment,
  registerWorkOrderMedia,
  removeWorkOrderItem,
  removeWorkOrderMedia,
  listUserBusinesses,
  transitionWorkOrder,
} from "./data/index";

export type { Db, UserBusiness } from "./data/index";

export {
  CONSENT_PURPOSES,
  CONSENT_PURPOSE_DESCRIPTIONS,
  CONSENT_PURPOSE_LABELS,
  CONTACT_FIELDS,
  RETENTION_MONTHS_RANGE,
  anonymizeCustomer,
  banCustomer,
  clearCustomerContactFields,
  consentFor,
  deactivateProfessional,
  deleteBusiness,
  formatBirthdayMd,
  getCustomerContact,
  listAuditLog,
  listCustomerBans,
  listCustomerConsents,
  saveCustomerContact,
  setCustomerConsent,
  setDataRetention,
  toBirthdayMd,
  unbanCustomer,
} from "./privacy/index";

export type {
  AuditEntry,
  ConsentPurpose,
  ContactField,
  CustomerBan,
  CustomerConsent,
  CustomerContact,
} from "./privacy/index";

export {
  ROTA_PADRAO,
  destinoSeguro,
  navegacaoDoSegmento,
  rotaDaEmpresa,
  rotaInicialDaEmpresa,
  rotaInicialDoSegmento,
  rotaPermitida,
} from "./routing/index";
