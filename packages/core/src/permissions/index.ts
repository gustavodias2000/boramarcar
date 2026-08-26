/**
 * Camada de autorização de interface.
 *
 * ESTA CAMADA NÃO PROTEGE NADA. O banco é a autoridade: RLS e as funções
 * transacionais recusam a operação de novo, sempre. O que existe aqui serve para a
 * interface não oferecer o que vai ser negado — botão desabilitado em vez de erro.
 *
 * O mapa abaixo espelha, uma a uma, as funções de papel do banco. Se divergirem, o
 * sintoma é uma tela que promete o que a RPC recusa. Ao mexer numa, mexa na outra.
 *
 *   is_active_business_member    → MEMBRO
 *   is_tenant_owner              → PROPRIETARIO
 *   is_tenant_administrator      → ADMINISTRADOR
 *   is_tenant_scheduler          → OPERACIONAL
 *   is_tenant_finance_operator   → FINANCEIRO
 *
 * Substitui três definições independentes de `BusinessRole` que conviviam em
 * `automotive-insights.tsx`, `automotive-profile.tsx` e `automotive-patio.tsx`, e as
 * checagens soltas de string espalhadas pelos componentes.
 */

export const BUSINESS_ROLES = [
  "owner",
  "manager",
  "receptionist",
  "professional",
  "cashier",
] as const;

export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const BUSINESS_ROLE_LABELS: Readonly<Record<BusinessRole, string>> = {
  owner: "Proprietário",
  manager: "Gerente",
  receptionist: "Recepção",
  professional: "Profissional",
  cashier: "Caixa",
};

export const PERMISSIONS = [
  /** Ler a operação da empresa. Qualquer membro ativo. */
  "viewOperation",
  /** Criar, remarcar, confirmar e bloquear na agenda. */
  "manageSchedule",
  /** Cadastrar e editar clientes. */
  "manageCustomers",
  /** Ler documento, telefone, e-mail e aniversário do cliente. Segregado por LGPD. */
  "viewCustomerContacts",
  /**
   * Anonimizar cliente. Não existe "excluir": apagar o cadastro levaria junto o
   * registro fiscal do que foi vendido a ele. Ver `anonymize_customer`.
   */
  "anonymizeCustomers",
  /** Catálogo de serviços e cadastro de profissionais. */
  "manageCatalog",
  /** Cadastro e edição de veículos. */
  "manageVehicles",
  /** Abrir OS, lançar itens, atribuir box, avançar etapa. */
  "manageWorkOrders",
  /** Registrar recebimento e estorno. É onde o caixa atua. */
  "recordPayments",
  /** Configurar o programa de fidelidade. */
  "configureLoyalty",
  /** Editar dados da empresa. */
  "manageBusiness",
  /** Convidar, promover e desligar membros da equipe. */
  "manageMembers",
  /** Ler a trilha de auditoria. */
  "viewAuditLog",
  /** Encerrar a empresa e apagar todo o histórico. */
  "deleteBusiness",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MEMBRO = BUSINESS_ROLES;
const PROPRIETARIO = ["owner"] as const satisfies readonly BusinessRole[];
const ADMINISTRADOR = ["owner", "manager"] as const satisfies readonly BusinessRole[];
const OPERACIONAL = ["owner", "manager", "receptionist"] as const satisfies readonly BusinessRole[];
const FINANCEIRO = ["owner", "manager", "receptionist", "cashier"] as const satisfies readonly BusinessRole[];

const PERMISSION_ROLES: Readonly<Record<Permission, readonly BusinessRole[]>> = {
  viewOperation: MEMBRO,
  manageSchedule: OPERACIONAL,
  manageCustomers: OPERACIONAL,
  viewCustomerContacts: OPERACIONAL,
  anonymizeCustomers: ADMINISTRADOR,
  manageCatalog: ADMINISTRADOR,
  manageVehicles: OPERACIONAL,
  manageWorkOrders: OPERACIONAL,
  recordPayments: FINANCEIRO,
  configureLoyalty: ADMINISTRADOR,
  manageBusiness: ADMINISTRADOR,
  manageMembers: PROPRIETARIO,
  viewAuditLog: ADMINISTRADOR,
  deleteBusiness: PROPRIETARIO,
};

export function isBusinessRole(value: unknown): value is BusinessRole {
  return typeof value === "string" && (BUSINESS_ROLES as readonly string[]).includes(value);
}

/**
 * O papel pode ser nulo — usuário sem sessão, ou autenticado sem vínculo com nenhuma
 * empresa. Nesse caso nada é permitido, o que é o comportamento correto: a interface
 * não oferece ação enquanto não souber quem está operando.
 */
export function can(role: BusinessRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSION_ROLES[permission].includes(role);
}

/**
 * Todas as permissões de um papel de uma vez. Serve à tela de conta, que hoje repete
 * a matriz à mão em JSX em vez de derivá-la.
 */
export function permissionsFor(
  role: BusinessRole | null | undefined,
): Readonly<Record<Permission, boolean>> {
  return Object.fromEntries(
    PERMISSIONS.map((permission) => [permission, can(role, permission)]),
  ) as Record<Permission, boolean>;
}

/**
 * Quais papéis detêm uma permissão. Usado para explicar ao usuário por que uma ação
 * está indisponível, em vez de só desabilitar o botão.
 */
export function rolesWith(permission: Permission): readonly BusinessRole[] {
  return PERMISSION_ROLES[permission];
}
