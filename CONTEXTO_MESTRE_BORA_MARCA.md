# CONTEXTO MESTRE — SAAS MULTI-SEGMENTO
## Nome provisório: Bora Marcá

> Este arquivo existe para dar contexto completo ao ChatGPT, Claude Code e outras IAs usadas no desenvolvimento.
> Antes de propor mudanças estruturais, leia este documento inteiro e analise o código atual do projeto.

> **Emendado em 25/08/2026.** O documento passou a viver no repositório, junto do código.
> As alterações desta revisão estão registradas no **§62**. As seções 47/48 e 54/55 tiveram a
> numeração corrigida — havia duas seções 48 e duas seções 55.

---

# 1. VISÃO GERAL

Este é um NOVO projeto SaaS multi-segmento.

Ele nasce a partir da experiência e dos aprendizados obtidos no projeto anterior de Barbearia/Barbershop, mas NÃO deve ser tratado como uma simples cópia daquele sistema.

O objetivo é construir uma plataforma única capaz de atender diferentes negócios baseados em:

- agendamento;
- clientes;
- profissionais;
- serviços;
- financeiro;
- comunicação;
- relatórios;
- operações específicas por segmento.

Nome provisório do projeto:

**Bora Marcá**

O nome definitivo será escolhido futuramente.

---

# 2. ORIGEM DO PROJETO

Existe um projeto anterior chamado Barbershop.

O Barbershop já foi desenvolvido e servirá como:

- referência arquitetural;
- fonte de componentes reaproveitáveis;
- referência de UX;
- referência de autenticação;
- referência de agenda;
- referência de clientes;
- referência de profissionais;
- referência de serviços;
- referência de financeiro;
- referência de notificações;
- referência de segurança;
- referência de LGPD;
- referência de erros e problemas que já foram corrigidos.

A intenção NÃO é manter o novo produto preso à barbearia.

O novo projeto deve aproveitar o que for bom do Barbershop e remover acoplamentos desnecessários ao nicho de barbearia.

> **Confirmado em 25/08/2026.** A extração de domínio verificou os treze itens acima, um a um.
> Todos existem e estão implementados no projeto anterior. Ver `docs/barbershop-extracao-dominio.md`.

---

# 3. OBJETIVO PRINCIPAL

Construir um SaaS multiempresa e multi-segmento.

Segmentos iniciais planejados:

1. Barbearia
2. Estética Automotiva
3. Salão de Beleza
4. Manicure / Nail Designer
5. **Maquiagem**
6. Massoterapia / Massagista
7. Estúdio de Tatuagem
8. Designer de Sobrancelhas
9. Estética Facial e Corporal
10. Depilação
11. Pet Shop / Banho e Tosa

Outros segmentos poderão ser adicionados futuramente.

A arquitetura deve permitir adicionar um novo segmento sem precisar duplicar todo o aplicativo.

---

# 4. REGRA DE OURO DA ARQUITETURA

A arquitetura deve seguir:

**CORE COMUM + MÓDULOS ESPECÍFICOS POR SEGMENTO**

Tudo que é comum entre os segmentos deve ficar no CORE.

Tudo que é específico de um determinado segmento deve ficar no módulo daquele segmento.

Exemplo:

## CORE

- autenticação;
- empresas;
- usuários;
- membros da empresa;
- permissões;
- clientes;
- agenda;
- serviços;
- profissionais;
- financeiro;
- caixa;
- notificações;
- planos;
- assinaturas;
- relatórios gerais;
- configurações;
- LGPD;
- auditoria.

## Automotive

- veículos;
- boxes;
- ordens de serviço;
- checklist do veículo;
- fotos de entrada;
- antes e depois;
- histórico automotivo;
- status operacional;
- precificação por categoria de veículo.

> **O padrão é CORE.** Algo só vira específico de segmento quando houver justificativa explícita.
> O teste de decisão está no agente `10 - Segmentos` (`.ai-team/agents/`).

---

# 5. NÃO CRIAR APLICATIVOS SEPARADOS

Não criar:

- BarbershopApp
- AutomotiveApp
- BeautyApp
- MassageApp
- TattooApp

Deve existir um único SaaS.

Exemplo conceitual:

```text
Plataforma
├── Core
├── Barbershop
├── Automotive
├── Beauty Salon
├── Manicure
├── Makeup
├── Massage
├── Tattoo
└── futuros segmentos
```

---

# 6. BANCO DE DADOS E MULTI-TENANT

## Decisão oficial de banco

O novo SaaS deve usar **Supabase com PostgreSQL como banco de dados principal**.

O Firebase/Firestore do projeto Barbershop anterior servirá apenas como referência de implementação e aprendizado. A estrutura NoSQL do Barbershop NÃO deve ser copiada automaticamente para este novo SaaS.

O novo projeto deve privilegiar:

- PostgreSQL relacional;
- chaves estrangeiras;
- integridade referencial;
- índices;
- constraints;
- views;
- funções quando fizer sentido;
- Row Level Security (RLS);
- Supabase Auth;
- Supabase Storage quando apropriado;
- Supabase Realtime apenas onde agregar valor real.

O Firebase poderá continuar sendo usado futuramente para algum serviço específico, por exemplo FCM/push notification, caso isso seja tecnicamente vantajoso, mas **não será o banco principal deste SaaS**.

Evitar uma arquitetura com Firebase/Firestore e Supabase funcionando simultaneamente como dois bancos principais, para não criar sincronização, duplicação de fonte de verdade e complexidade operacional desnecessária.

## Multi-tenant

O sistema deve nascer como multiempresa.

Cada empresa será um tenant.

Todos os dados operacionais devem pertencer explicitamente a uma empresa.

Campo principal:

```typescript
tenantId: string;
```

Isso deve existir em entidades como:

- clientes;
- funcionários;
- serviços;
- agendamentos;
- veículos;
- ordens de serviço;
- financeiro;
- caixa;
- produtos;
- notificações;
- relatórios;
- configurações.

Regra crítica:

**Empresa A nunca pode visualizar, editar ou consultar dados da Empresa B.**

O isolamento não pode depender somente do frontend.

No Supabase/PostgreSQL, o isolamento entre tenants deve ser aplicado principalmente por **Row Level Security (RLS)**, além das validações da aplicação.

Princípios:

- toda tabela multi-tenant deve possuir `tenant_id`;
- toda operação autenticada deve ser validada contra a associação do usuário ao tenant;
- políticas RLS devem proteger SELECT, INSERT, UPDATE e DELETE;
- não depender apenas de filtros feitos pelo frontend;
- service role nunca deve ser exposta ao cliente;
- operações administrativas com service role devem ocorrer somente em ambiente confiável;
- relações entre tabelas devem usar foreign keys sempre que apropriado;
- constraints devem impedir estados inválidos quando possível.

> **Emenda de 25/08/2026 — privilégio não é política.** Habilitar RLS e escrever políticas
> corretas **não** garante isolamento: `revoke ... from public` não remove os grants padrão que o
> Supabase concede a `anon` e `authenticated`, e `TRUNCATE` não é filtrado por RLS. Toda tabela e
> toda função precisam ter os privilégios revogados e reconcedidos explicitamente. Ver achados
> C-1, C-2 e C-3 em `docs/auditoria-2026-08-25.md`.

---

# 7. USUÁRIO NÃO É IGUAL A EMPRESA

Não assumir:

```text
1 usuário = 1 empresa
```

A arquitetura deve permitir futuramente que um usuário participe de mais de uma empresa.

Estrutura conceitual:

```text
users
businesses
business_members
```

Exemplo:

```typescript
interface BusinessMember {
  id: string;
  tenantId: string;
  userId: string;

  role:
    | "owner"
    | "manager"
    | "receptionist"
    | "professional"
    | "cashier";

  active: boolean;
}
```

No Supabase:

- autenticação deve usar `auth.users`;
- dados públicos/de perfil da aplicação devem ficar em tabela própria, por exemplo `profiles`;
- `business_members.user_id` deve se relacionar ao usuário autenticado;
- não armazenar senha ou credenciais próprias na tabela de perfil;
- políticas RLS devem considerar `auth.uid()` e a associação em `business_members`.

> O mesmo vale para o **cliente final**: um cliente pode ser atendido por várias empresas. O
> Barbershop resolve isso com um vínculo de id determinístico que rastreia a origem (QR, link,
> código ou convite). Ver §60.

---

# 8. TIPOS DE NEGÓCIO

Criar definição centralizada.

Exemplo:

```typescript
type BusinessType =
  | "barbershop"
  | "automotive_aesthetics"
  | "beauty_salon"
  | "manicure"
  | "makeup"
  | "massage"
  | "tattoo"
  | "eyebrows"
  | "aesthetics"
  | "depilation"
  | "petshop";
```

Cada empresa deve possuir:

```typescript
businessType: BusinessType;
```

> Adicionar categoria é **aditivo**. Nunca remova nem renomeie um valor já publicado:
> `businesses.business_type` referencia o enum.

---

# 9. ONBOARDING

Durante a criação da empresa, o empresário deverá informar o segmento.

Exemplo:

```text
Qual é o seu tipo de negócio?

○ Barbearia
○ Estética Automotiva
○ Salão de Beleza
○ Manicure / Nail Designer
○ Maquiagem
○ Massoterapia
○ Estúdio de Tatuagem
○ Designer de Sobrancelhas
○ Estética Facial e Corporal
○ Depilação
○ Pet Shop / Banho e Tosa
```

Depois da seleção, o sistema deve adaptar automaticamente:

- recursos habilitados;
- nomenclaturas;
- menus;
- dashboard;
- serviços sugeridos;
- configurações iniciais;
- fluxos de atendimento;
- visual.

---

# 10. TEMA VISUAL E TEMA FUNCIONAL

O conceito de tema não deve ser limitado a cores.

Existirão dois níveis.

## Tema visual

Controla:

- cores;
- ícones;
- cards;
- imagens;
- layout;
- identidade visual;
- aparência de dashboard.

## Tema funcional

Controla:

- menus;
- campos;
- funcionalidades;
- dashboard;
- fluxo operacional;
- terminologia;
- serviços padrão;
- recursos específicos.

Exemplo:

### Barbearia

```text
Cliente
  ↓
Serviço
  ↓
Barbeiro
  ↓
Horário
```

### Estética Automotiva

```text
Cliente
  ↓
Veículo
  ↓
Serviço
  ↓
Data
  ↓
Horário
  ↓
Técnico
  ↓
Box
  ↓
Confirmação
```

---

# 11. SEGMENT CONFIG

Criar uma configuração central por segmento.

Exemplo:

```typescript
const automotiveConfig = {
  key: "automotive_aesthetics",

  label: "Estética Automotiva",

  features: {
    customers: true,
    vehicles: true,
    appointments: true,
    professionals: true,
    boxes: true,
    workOrders: true,
    inspections: true,
    beforeAfterPhotos: true,
    inventory: true,
    finance: true
  }
};
```

Barbearia:

```typescript
const barbershopConfig = {
  key: "barbershop",

  label: "Barbearia",

  features: {
    customers: true,
    vehicles: false,
    appointments: true,
    professionals: true,
    boxes: false,
    workOrders: false,
    inspections: false,
    beforeAfterPhotos: false,
    inventory: true,
    finance: true
  }
};
```

> Implementado em `src/config/segments.ts`. **Atenção:** o arquivo está hoje fora do `include` do
> `web/tsconfig.json`, portanto nunca é compilado nem importado. É a lacuna que a Etapa 3.1 do
> plano de execução resolve.

---

# 12. FEATURE FLAGS

Criar mecanismo centralizado.

Exemplo:

```typescript
hasFeature("vehicles");
hasFeature("workOrders");
hasFeature("boxes");
hasFeature("beforeAfterPhotos");
```

No React:

```tsx
{hasFeature("vehicles") && <VehiclesMenu />}
```

Evitar espalhar pelo projeto:

```typescript
if (businessType === "automotive_aesthetics")
```

Esse tipo de decisão deve ficar centralizado.

---

# 13. LABELS DINÂMICAS

A linguagem do sistema deve acompanhar o segmento.

Não codificar nomes específicos em dezenas de telas.

Usar algo semelhante:

```typescript
labels.professional
labels.appointment
labels.customer
```

Exemplos:

## Barbearia

```text
professional = Barbeiro
appointment = Agendamento
```

## Estética Automotiva

```text
professional = Técnico
appointment = Serviço
vehicle = Veículo
```

## Maquiagem

```text
professional = Maquiador
appointment = Agendamento
```

## Massoterapia

```text
professional = Terapeuta
appointment = Sessão
```

## Tatuagem

```text
professional = Tatuador
appointment = Sessão
```

---

# 14. PERMISSÕES

Não espalhar verificações como:

```typescript
if (user.role === "owner")
```

Criar camada de autorização.

Exemplos:

```typescript
permissions.canViewFinance
permissions.canManageEmployees
permissions.canEditCustomers
permissions.canDeleteAppointments
permissions.canManageSettings
permissions.canCreateWorkOrder
```

A segurança crítica deve ser validada também fora do frontend.

---

# 15. ARQUITETURA SUPABASE / POSTGRESQL

## Componentes preferenciais

O novo SaaS deverá, salvo decisão técnica posterior bem justificada, usar:

```text
Supabase
├── PostgreSQL
├── Auth
├── Row Level Security
├── Storage
├── Realtime (somente onde necessário)
└── Edge Functions (quando fizer sentido)
```

## Estratégia de banco

Preferir tabelas relacionais em vez de estruturas NoSQL altamente duplicadas.

Exemplo conceitual:

```text
businesses
business_members
profiles
customers
professionals
services
appointments
payments
cash_transactions
plans
subscriptions

automotive_vehicles
automotive_boxes
automotive_appointments
automotive_work_orders
automotive_work_order_items
automotive_inspections
automotive_inspection_items
automotive_work_order_photos
automotive_work_order_events
```

Usar:

- UUID como identificador quando apropriado;
- `tenant_id` em tabelas multiempresa;
- foreign keys;
- índices compostos conforme os padrões de consulta;
- `created_at` e `updated_at`;
- constraints para dados críticos;
- migrations versionadas no repositório;
- seeds versionados para dados padrão dos segmentos.

Não tratar o Dashboard como justificativa para duplicar dados prematuramente. Primeiro usar SQL, índices, views/materialized views e agregações adequadas. Desnormalização só deve ser introduzida quando houver evidência de necessidade.

> **Padrão adotado e comprovado:** toda relação entre tabelas usa chave estrangeira **composta**
> `(id, tenant_id)`. Isso torna estruturalmente impossível apontar um registro para outro tenant,
> mesmo com bug de aplicação. Manter em toda tabela nova.

---

# 16. ESTRUTURA DE PASTAS SUGERIDA

A estrutura precisa ser adaptada ao framework e ao código real.

Não alterar arquitetura apenas por estética.

Sugestão conceitual:

```text
src/

  core/
    auth/
    tenants/
    users/
    permissions/
    customers/
    appointments/
    services/
    professionals/
    finance/
    notifications/
    reports/

  modules/

    barbershop/
      dashboard/
      professionals/

    automotive/
      vehicles/
      boxes/
      work-orders/
      inspections/
      before-after/
      dashboard/

    beauty-salon/

    manicure/

    makeup/

    massage/

    tattoo/

  shared/
    components/
    hooks/
    utils/
    types/
    constants/

  config/
    segments/
    permissions/
    plans/
```

> A fronteira precisa ser **física**, não por prefixo de nome de arquivo. Regra de lint:
> `core/` e `shared/` não podem importar de `modules/`.

> **Emenda de 25/08/2026 — haverá site e aplicativo.** O app atenderá também a equipe: técnico
> no pátio fotografando pelo celular, profissional consultando a própria agenda. Com dois alvos,
> a estrutura acima vira um **workspace npm** com pacote de núcleo compartilhado:
>
> ```text
> packages/core/     agnóstico de framework — zero React, zero React Native
>   segments/        catálogo, features e labels
>   permissions/     papéis e autorização de interface
>   domain/          tipos do domínio
>   data/            consultas e RPCs — recebe um SupabaseClient, não cria
>   format/          datas, moeda, placa
>
> web/               Next.js, consome o núcleo
> app/               React Native (futuro), consome o mesmo núcleo
> ```
>
> A camada de dados **recebe** o cliente Supabase em vez de criá-lo: web e app o constroem de
> formas diferentes, mas as consultas são as mesmas. É essa inversão que permite compartilhar.
>
> Registrado em `docs/adr/0005-nucleo-compartilhado-entre-site-e-app.md`.

---

# 17. EXPERIÊNCIA DO BARBERSHOP

O Barbershop anterior é considerado funcional e concluído como produto de referência.

Antes de migrar qualquer código:

1. analisar o projeto inteiro;
2. identificar arquitetura;
3. mapear autenticação;
4. mapear banco;
5. mapear regras de segurança;
6. mapear agenda;
7. mapear clientes;
8. mapear profissionais;
9. mapear serviços;
10. mapear financeiro;
11. mapear notificações;
12. mapear relatórios;
13. mapear componentes;
14. mapear hooks;
15. mapear services;
16. mapear telas;
17. mapear design system;
18. mapear testes;
19. mapear LGPD;
20. mapear problemas já solucionados.

Separar:

- o que será reaproveitado;
- o que será adaptado;
- o que será refatorado;
- o que não deve ser copiado.

Não copiar cegamente.

Ao analisar Firebase/Firestore do Barbershop:

- entender as regras de negócio existentes;
- entender o modelo de segurança;
- identificar dados e relacionamentos;
- converter o modelo conceitual para PostgreSQL quando apropriado;
- NÃO reproduzir automaticamente collections/documents no Supabase;
- aproveitar a migração para criar relações, foreign keys, constraints e RLS mais adequadas ao novo SaaS.

> **✅ CONCLUÍDO em 25/08/2026.** A análise está em `docs/barbershop-extracao-dominio.md`.
>
> Conclusão principal: **reuso de código é próximo de zero** (React Native não roda em Next.js,
> Firestore não vira SQL), mas **reuso de domínio é de 80% ou mais**. Praticamente as 49 telas do
> Barbershop são CORE — nenhuma é específica de barbearia.
>
> O documento traz o inventário de telas por categoria, o mapa de entidades, os mecanismos que
> valem copiar como decisão, as práticas de LGPD já resolvidas e a lista do que **não** trazer.

---

# 18. PRIMEIRO SEGMENTO BASE

A Barbearia será o primeiro segmento porque o Barbershop já existe.

Não é necessário reconstruir tudo agora.

A intenção é fazer o que já existe funcionar dentro da nova arquitetura.

> **Esta seção estava correta e foi desrespeitada.** A implementação seguiu o caminho oposto:
> onze de onze commits atenderam a estética automotiva e a Fase 2 ficou em 0%. A causa foi uma
> afirmação falsa em `docs/foundation.md`, hoje corrigida.
>
> Decisão formal registrada em `docs/adr/0004-barbershop-e-o-nucleo-da-plataforma.md`:
> **o domínio do Barbershop é o núcleo da plataforma; a estética automotiva é o primeiro módulo.**
>
> A ordem de implementação do núcleo está no **§59**, e vem antes da ordem automotiva do §53.

---

# 19. SEGUNDO SEGMENTO — ESTÉTICA AUTOMOTIVA

Esse será o primeiro módulo novo completo.

Deve receber atenção especial.

---

# 20. CLIENTES

Clientes pertencem ao CORE.

Exemplo:

```typescript
interface Customer {
  id: string;
  tenantId: string;

  name: string;

  cpfCnpj?: string;

  phone?: string;
  whatsapp?: string;
  email?: string;

  birthday?: Date;

  notes?: string;

  active: boolean;

  createdAt: Date;
  updatedAt?: Date;
}
```

Um cliente pode possuir vários veículos.

Exemplo:

```text
João Silva
├── Toyota Corolla
├── Fiat Toro
└── Honda Civic
```

> **Minimização de dados (LGPD).** O Barbershop guarda aniversário como `"MM-DD"`, sem ano:
> permite a campanha de aniversariantes sem armazenar a idade. Vale adotar.

---

# 21. VEÍCULOS

Veículos pertencem ao módulo Automotive.

Modelo inicial:

```typescript
interface Vehicle {
  id: string;

  tenantId: string;
  customerId: string;

  plate: string;

  brand: string;
  model: string;

  version?: string;

  year?: number;

  color?: string;

  type:
    | "hatch"
    | "sedan"
    | "suv"
    | "pickup"
    | "motorcycle"
    | "van"
    | "utility"
    | "other";

  mileage?: number;

  notes?: string;

  createdAt: Date;
  updatedAt?: Date;
}
```

---

# 22. CATEGORIAS DE VEÍCULOS

Criar inicialmente:

- Hatch
- Sedan
- SUV
- Pickup
- Moto
- Van
- Utilitário
- Outros

A empresa poderá personalizar futuramente.

---

# 23. SERVIÇOS AUTOMOTIVOS PADRÃO

Quando a empresa selecionar Estética Automotiva, sugerir:

- Lavagem simples
- Lavagem completa
- Lavagem detalhada
- Lavagem técnica
- Lavagem de motor
- Higienização interna
- Higienização de bancos
- Limpeza de teto
- Polimento comercial
- Polimento técnico
- Vitrificação
- Cristalização
- Descontaminação de pintura
- Revitalização de plásticos
- Hidratação de couro
- Limpeza de rodas
- Limpeza de caixa de roda
- Tratamento de vidros
- Impermeabilização

O empresário poderá:

- criar;
- editar;
- excluir;
- desativar.

> Estes serviços pertencem ao seed por segmento (`supabase/seed.sql`), ainda não implementado.

---

# 24. PREÇO POR CATEGORIA DE VEÍCULO

Um mesmo serviço pode ter preços diferentes.

Exemplo:

```text
Higienização completa

Hatch: R$ 250
Sedan: R$ 280
SUV: R$ 350
Pickup: R$ 400
```

A arquitetura de preços deve ser escalável.

> **Pendente.** `docs/foundation.md` prometeu esta funcionalidade junto da migration de módulo;
> a migration foi escrita sem ela. Hoje existe apenas `services.base_price` único.

---

# 25. AGENDA

A agenda é um recurso do CORE.

O fluxo do módulo automotivo será:

```text
Cliente
  ↓
Veículo
  ↓
Serviço
  ↓
Data
  ↓
Horário
  ↓
Técnico
  ↓
Box
  ↓
Confirmação
```

Cada serviço precisa ter duração.

Exemplo:

```text
Polimento técnico
Duração: 4 horas
```

Ao agendar, todo o período precisa ficar reservado.

> A **configuração de agenda** completa — almoço, antecedência mínima e máxima, buffer entre
> atendimentos e turno extra — está detalhada no **§61**. É a maior lacuna isolada do núcleo hoje.

---

# 26. APPOINTMENT GENÉRICO

Não criar:

```text
BarberAppointment
AutomotiveAppointment
BeautyAppointment
MassageAppointment
```

Criar uma entidade comum.

Exemplo:

```typescript
interface Appointment {
  id: string;

  tenantId: string;

  customerId: string;

  serviceId: string;

  professionalId?: string;

  startAt: Date;
  endAt: Date;

  status:
    | "scheduled"
    | "confirmed"
    | "in_progress"
    | "completed"
    | "cancelled";

  notes?: string;
}
```

> **Decisão sobre avaliação.** O Barbershop tem um sexto status, `avaliado`. A recomendação é
> **manter os cinco status acima** e tratar avaliação como entidade própria: um status que existe
> só para marcar "já avaliou" mistura duas dimensões diferentes.

---

# 27. EXTENSÃO AUTOMOTIVA DO AGENDAMENTO

Evitar colocar dezenas de campos específicos na entidade comum.

Avaliar estratégia semelhante:

```text
appointments
automotive_appointments
```

Exemplo:

```typescript
interface AutomotiveAppointment {
  appointmentId: string;

  tenantId: string;

  vehicleId: string;

  boxId?: string;
}
```

Essa arquitetura é sugestão.

Antes de implementar, avaliar o banco atual.

---

# 28. BOXES

Estéticas automotivas podem possuir espaços físicos de atendimento.

Exemplo:

```text
Box 01 — Lavagem
Box 02 — Lavagem
Box 03 — Polimento
Box 04 — Higienização
```

Modelo inicial:

```typescript
interface ServiceBox {
  id: string;

  tenantId: string;

  name: string;

  type?: string;

  active: boolean;
}
```

Regra:

**Um mesmo box não pode possuir dois atendimentos conflitantes no mesmo horário.**

> Implementado por *exclusion constraint* GiST, não por código de aplicação. **Liberar é tão
> crítico quanto reservar:** reserva sem fim previsto trava o recurso permanentemente. Ver
> achados C-5 e C-7 na auditoria.

---

# 29. ORDEM DE SERVIÇO

Quando o veículo chegar, permitir abrir uma OS.

Fluxo:

```text
Appointment
  ↓
Work Order
```

Modelo sugerido:

```typescript
interface WorkOrder {
  id: string;

  tenantId: string;

  appointmentId?: string;

  customerId: string;
  vehicleId: string;

  status:
    | "open"
    | "in_progress"
    | "inspection"
    | "completed"
    | "waiting_pickup"
    | "delivered";

  subtotal: number;
  discount: number;
  total: number;

  openedAt: Date;

  completedAt?: Date;

  deliveredAt?: Date;
}
```

---

# 30. ITENS DA ORDEM DE SERVIÇO

Uma OS pode conter vários serviços.

```typescript
interface WorkOrderItem {
  id: string;

  tenantId: string;

  workOrderId: string;

  serviceId: string;

  professionalId?: string;

  quantity: number;

  unitPrice: number;

  total: number;
}
```

---

# 31. CHECKLIST DE ENTRADA

Antes de iniciar o serviço, permitir checklist.

Itens iniciais:

- Quilometragem
- Nível de combustível
- Para-brisa
- Rodas
- Pneus
- Lataria
- Bancos
- Painel
- Objetos no interior
- Riscos
- Amassados

Estados:

- OK
- Avaria
- Atenção

Permitir:

- observação;
- fotos;
- usuário responsável;
- data/hora.

> **Pendente como estrutura.** Hoje o checklist é um `jsonb` livre: sem itens, sem os três
> estados e sem template. Assim é impossível consultar ou relatar avarias — que é a razão de
> existir um checklist de entrada.

---

# 32. MODELO DE INSPEÇÃO

Exemplo:

```typescript
interface VehicleInspection {
  id: string;

  tenantId: string;

  workOrderId: string;

  vehicleId: string;

  mileage?: number;

  fuelLevel?: number;

  notes?: string;

  createdBy: string;

  createdAt: Date;
}
```

Item:

```typescript
interface InspectionItem {
  id: string;

  inspectionId: string;

  label: string;

  status:
    | "ok"
    | "damaged"
    | "attention";

  notes?: string;
}
```

---

# 33. FOTOS

Permitir fotos associadas à OS.

Tipos:

```typescript
type WorkOrderPhotoType =
  | "checkin"
  | "damage"
  | "before"
  | "after";
```

Exemplo:

```typescript
interface WorkOrderPhoto {
  id: string;

  tenantId: string;

  workOrderId: string;

  type: WorkOrderPhotoType;

  url: string;

  createdAt: Date;
}
```

---

# 34. ANTES E DEPOIS

Criar recurso visual.

## Antes

Fotos do veículo antes do serviço.

## Depois

Fotos do resultado.

Futuramente o cliente poderá:

- visualizar;
- comparar;
- compartilhar em redes sociais ou WhatsApp.

> Para o par funcionar, a foto precisa registrar a **posição** (frontal, traseira, lateral,
> interior, roda). Sem isso não há como emparelhar entrada e entrega do mesmo ângulo.

---

# 35. FLUXO OPERACIONAL AUTOMOTIVO

Estados sugeridos:

```text
Agendado
  ↓
Veículo recebido
  ↓
Aguardando atendimento
  ↓
Em atendimento
  ↓
Aguardando inspeção
  ↓
Finalizado
  ↓
Aguardando retirada
  ↓
Entregue
```

Cada mudança deve registrar:

- data;
- horário;
- usuário responsável;
- observação opcional.

---

# 36. TIMELINE

Exemplo:

```text
08:02 — Veículo recebido
08:05 — Checklist realizado
08:15 — Lavagem iniciada
09:20 — Polimento iniciado
12:40 — Serviço finalizado
13:00 — Cliente avisado
14:15 — Veículo entregue
```

---

# 37. DASHBOARD AUTOMOTIVO

Não copiar o dashboard da barbearia apenas trocando nomes.

O dashboard automotivo deve refletir sua operação.

Mostrar inicialmente:

- Agendados hoje
- Veículos aguardando
- Veículos em atendimento
- Veículos finalizados
- Aguardando retirada
- Faturamento do dia
- Faturamento do mês
- Ticket médio
- Boxes ocupados
- Próximos agendamentos
- Serviços mais vendidos

Pode compartilhar componentes do CORE.

---

# 38. FUNCIONÁRIOS

Perfis iniciais:

## Proprietário

Acesso total.

## Gerente

Acesso operacional e financeiro conforme permissões.

## Atendente

Clientes e agenda.

## Profissional / Técnico

Visualiza e executa seus serviços.

## Caixa

Recebimentos.

Especialidades automotivas poderão incluir:

- Lavador
- Polidor
- Higienizador
- Detailer

---

# 39. ÁREA DO CLIENTE

Preparar a arquitetura para o cliente poder:

- cadastrar veículo;
- visualizar veículos;
- agendar;
- consultar preço;
- ver agendamentos;
- reagendar;
- cancelar;
- acompanhar andamento;
- ver histórico;
- visualizar antes/depois;
- receber notificações;
- avaliar atendimento.

> **Já existe completa no Barbershop** — `ClienteHome` e três abas. Não é trabalho a inventar,
> é trabalho a traduzir. Dois pré-requisitos vindos de lá:
>
> 1. **Vínculo cliente ↔ empresa** com id determinístico e rastreio de origem (ver §60).
> 2. **Disponibilidade sem dado pessoal**: o cliente precisa ver quais horários estão tomados sem
>    poder ler os agendamentos. O Barbershop resolve com uma coleção separada que carrega apenas
>    recurso, data, horário e um id opaco — nada de nome, e-mail ou telefone.

---

# 40. HISTÓRICO DO VEÍCULO

Cada veículo deve possuir histórico.

Exemplo:

```text
Toyota Corolla — ABC1D23

12/02 — Lavagem detalhada
18/04 — Higienização
22/07 — Polimento
24/08 — Vitrificação
```

---

# 41. NOTIFICAÇÕES

A camada de notificação deve ser desacoplada.

Eventos sugeridos:

```text
appointment_created
appointment_confirmed
vehicle_received
service_started
service_completed
vehicle_ready
appointment_cancelled
```

Esses eventos podem futuramente gerar:

- push;
- e-mail;
- WhatsApp;
- SMS.

> **Duas decisões do Barbershop que valem adotar:**
>
> - **Granularidade do sistema ≠ granularidade da configuração.** O sistema distingue
>   `cancelado_pelo_cliente` de `cancelado_pelo_profissional`; o usuário vê um único botão
>   "cancelamento".
> - **Idempotência de envio.** Um histórico por evento enviado impede disparo duplicado em
>   retentativa.

---

# 42. WHATSAPP

A estratégia desejada é evitar acoplamento com um único fornecedor.

Criar abstração conceitual semelhante a:

```typescript
WhatsAppProvider
```

Diretriz de integração conhecida do projeto:

- iniciar preferencialmente com Evolution API;
- manter abstração de provider;
- WuzAPI como alternativa/fallback;
- prever migração/opção futura para Meta WhatsApp Cloud;
- OpenWA somente como opção experimental/laboratório.

Os módulos não devem chamar diretamente uma API específica de WhatsApp.

Eles devem disparar eventos.

A camada de comunicação decide o provider.

---

# 43. FINANCEIRO

Aproveitar o núcleo comum.

Suportar:

- dinheiro;
- PIX;
- débito;
- crédito;
- parcelamento;
- desconto;
- comissão;
- contas a receber;
- contas a pagar;
- caixa.

Relatórios:

- faturamento diário;
- semanal;
- mensal;
- ticket médio;
- serviço mais vendido;
- cliente que mais compra;
- profissional mais produtivo;
- veículos mais atendidos.

> **Implementado.** `finance_entries` é o livro único do núcleo: recebimento de
> agendamento, de ordem de serviço e lançamento avulso caem no mesmo lugar — o pagamento da
> OS automotiva **espelha** para lá por gatilho, em vez de viver em paralelo. Duas verdades
> sobre o mesmo dinheiro divergem sempre.
>
> `cash_sessions` guarda o esperado e o contado separadamente: a conferência só existe se
> os dois números forem distintos. Pix e cartão não entram no esperado, porque não passam
> pela gaveta.
>
> A comissão é configurada no profissional, em percentual ou valor fixo, e lançada como
> despesa ao concluir o atendimento.
>
> **Leitura do livro é restrita a operador financeiro.** Um técnico não precisa saber
> quanto a empresa faturou — é o C-8 aplicado ao dinheiro.
>
> Todo relatório precisa de **recorte de período**. Agregação pertence ao banco: baixar o
> histórico inteiro para calcular no navegador é defeito, não otimização pendente.

---

# 44. ESTOQUE

Preparar arquitetura para materiais.

Exemplos automotivos:

- Shampoo
- APC
- Cera
- Vitrificador
- Desengraxante
- Produto para couro
- Limpador de vidro

Campos futuros:

- produto;
- estoque;
- estoque mínimo;
- custo;
- fornecedor.

Não é obrigatório implementar consumo avançado na primeira fase.

---

# 45. ASSINATURAS DOS CLIENTES DO SAAS

O produto será SaaS.

A arquitetura precisa permitir planos.

Exemplos conceituais:

- Free / Trial
- Básico
- Profissional
- Premium

As features também poderão depender de plano.

Portanto:

```text
Segment Feature
+
Plan Feature
=
Feature disponível
```

Evitar misturar regras de plano diretamente nas telas.

> A resolução do plano precisa ser **feita no servidor**. No cliente, é falsificável.

---

# 46. POSSIBILIDADE DE RECEITA RECORRENTE PARA ESTÉTICA

Futuramente o próprio estabelecimento poderá vender planos aos consumidores.

Exemplo:

```text
Plano Premium
R$ 199/mês

2 lavagens detalhadas
1 manutenção de vitrificação
10% de desconto em outros serviços
```

Não implementar obrigatoriamente agora, mas não criar arquitetura que impeça isso.

---

# 47. SEGURANÇA

> Numeração corrigida em 25/08/2026: esta seção estava numerada como 48, duplicando a de LGPD.

Regras obrigatórias para Supabase/PostgreSQL:

1. Nunca confiar exclusivamente no frontend.
2. Validar tenant em operações críticas.
3. Usuário de uma empresa não acessa outra.
4. Vehicle precisa pertencer ao tenant.
5. Vehicle precisa pertencer ao customer correto.
6. WorkOrder precisa pertencer ao tenant.
7. Appointment precisa pertencer ao tenant.
8. Permissões precisam ser verificadas.
9. Uploads precisam ter controle de acesso.
10. Dados financeiros precisam ter autorização adequada.
11. Não enfraquecer regras existentes do Barbershop ao migrar.
12. Habilitar RLS em todas as tabelas expostas pela API que contenham dados por tenant.
13. Não expor a `service_role` em aplicativo mobile, navegador ou cliente público.
14. Criar políticas explícitas para SELECT, INSERT, UPDATE e DELETE.
15. Usar foreign keys e constraints para complementar a segurança e integridade.
16. Storage buckets privados devem ter políticas de acesso por tenant quando armazenarem fotos, documentos ou arquivos internos.

Regras acrescentadas em 25/08/2026:

17. **Revogar e reconceder privilégios explicitamente** em toda tabela e função. Política RLS
    correta não substitui privilégio correto.
18. **Toda função nova nasce sem `execute`.** Abrir é decisão explícita e revisável.
19. **Segregar leitura também dentro do tenant.** Um técnico não precisa ler CPF, telefone e
    e-mail de todos os clientes.
20. **Nunca aceitar token, chave ou senha colada no chat.** O usuário faz isso na ferramenta
    legítima, na máquina dele.

---

# 48. LGPD

> **Estado em 26/08/2026 — traduzido.** `customer_contacts` segrega documento, telefone,
> e-mail, aniversário e anotações do cadastro operacional, sob `is_tenant_scheduler`: o
> técnico vê o nome do dono do carro e nada além. Consentimento por finalidade em
> `customer_consents`, sem valor padrão — ausência é opt-in pendente. `anonymize_customer`
> atende ao pedido de esquecimento sem destruir o registro fiscal. `audit_log` guarda autor
> e horário de anonimização e desligamento. `businesses.data_retention_months` declara o
> prazo. **Falta a varredura que executa esse prazo** — depende de execução agendada, que
> chega junto com as notificações (§41).

Preservar e evoluir práticas de LGPD existentes.

Considerar:

- minimização de dados;
- controle de acesso;
- exclusão/anonimização quando aplicável;
- consentimentos;
- retenção;
- auditoria;
- armazenamento seguro;
- proteção de fotos/documentos.

> **O Barbershop já resolveu tudo isto.** Práticas a traduzir:
>
> - consentimento explícito com carimbo de data, e consentimento **separado por finalidade**
>   (ausência significa opt-in pendente, nunca autorização implícita);
> - aniversário como `"MM-DD"`, sem ano;
> - dado sensível fora da vitrine pública — o motivo de um bloqueio é dado pessoal do
>   profissional e não fica junto do horário;
> - exclusão de conta real, com tela própria;
> - campanha de retenção nasce desativada e restrita a um canal, porque os demais exigem
>   consentimento próprio.
>
> **Anonimizar costuma ser a resposta correta**, não apagar: a retenção contábil impede excluir
> um cliente com histórico financeiro.

---

# 49. TESTES PRIORITÁRIOS

Criar testes para pontos críticos.

Mínimo:

- tenant isolation;
- permissões;
- agendamento;
- conflito de horário;
- conflito de box;
- veículo pertence ao cliente;
- veículo pertence ao tenant;
- OS pertence ao tenant;
- cálculo da OS;
- mudança de status;
- feature flags;
- labels por segmento;
- regras de segurança.

> **Teste de banco precisa rodar sob identidade autenticada.** Rodar como superusuário ignora
> RLS e não prova nada. Toda asserção negativa precisa de um **controle positivo** ao lado: um
> teste que passa porque a consulta está errada é pior que teste nenhum.
>
> Implementado em `supabase/tests/` com pgTAP. Ver `README.md`.

---

# 50. QUALIDADE DE CÓDIGO

Diretrizes:

- evitar duplicação;
- evitar componentes gigantes;
- evitar arquivos gigantes;
- evitar dependências desnecessárias;
- separar regra de negócio de UI;
- tipar adequadamente;
- preferir código legível;
- manter lint;
- manter testes;
- registrar decisões arquiteturais relevantes;
- evitar refatorações destrutivas sem necessidade.

---

# 51. FLUXO DE TRABALHO PARA IA

Sempre que ChatGPT, Claude Code ou outra IA trabalhar neste projeto:

## Antes de alterar

1. Ler este arquivo.
2. Ler os arquivos relevantes do projeto.
3. Entender a arquitetura atual.
4. Verificar impactos.
5. Identificar risco de regressão.

## Durante

1. Fazer alterações incrementais.
2. Evitar reescrever módulos funcionais sem necessidade.
3. Respeitar o CORE + Modules.
4. Respeitar tenant.
5. Respeitar permissões.

## Depois

1. Rodar lint.
2. Rodar testes.
3. Corrigir erros.
4. Informar arquivos alterados.
5. Informar o que foi concluído.
6. Informar pendências.
7. Não declarar sucesso sem validação.

> A equipe de agentes especializados está em `.ai-team/`, com o roteiro de fluxo em
> `.ai-team/prompts/`. Comece pelo Coordenador quando a tarefa não estiver organizada, e passe
> pelo agente de Segmentos sempre que a demanda puder servir a mais de uma categoria.

---

# 52. FASES DE IMPLEMENTAÇÃO

## FASE 1 — FUNDAÇÃO

- analisar Barbershop;
- mapear o que será reaproveitado;
- mapear o modelo Firebase antigo apenas como referência;
- definir schema PostgreSQL;
- configurar Supabase;
- configurar migrations;
- configurar Supabase Auth;
- definir tabelas multi-tenant;
- criar políticas RLS;
- criar arquitetura multi-segmento;
- BusinessType;
- SegmentConfig;
- feature flags;
- labels dinâmicas;
- Tenant;
- BusinessMember;
- permissões;
- estrutura de módulos.

## FASE 2 — BARBEARIA

- adaptar recursos existentes;
- mover conceitos específicos para módulo;
- preservar comportamento atual;
- validar regressões.

## FASE 3 — AUTOMOTIVE BASE

- veículos;
- serviços;
- preços;
- agenda;
- boxes;
- conflitos.

## FASE 4 — OPERAÇÃO AUTOMOTIVA

- OS;
- itens da OS;
- checklist;
- avarias;
- fotos;
- antes/depois;
- timeline;
- status.

## FASE 5 — EXPERIÊNCIA

- dashboard;
- financeiro;
- notificações;
- área do cliente;
- histórico;
- relatórios.

## FASE 6 — NOVOS SEGMENTOS

Depois que Core + Barbearia + Automotive estiverem maduros:

- Salão de Beleza
- Manicure
- Maquiagem
- Massoterapia
- Tatuagem
- demais segmentos

> **Status real em 25/08/2026:** Fase 1 ~60% · Fase 2 **0%** · Fase 3 ~70% · Fase 4 ~80% ·
> Fase 5 ~40% · Fase 6 ~5%. As fases foram executadas fora de ordem. Ver §58.

---

# 53. ORDEM RECOMENDADA PARA IMPLEMENTAÇÃO AUTOMOTIVE

1. BusinessType
2. SegmentConfig
3. Feature Flags
4. Labels
5. Vehicle
6. Vehicle CRUD
7. Serviços automotivos
8. Preço por categoria
9. Agenda automotiva
10. Boxes
11. Validação de conflito
12. WorkOrder
13. WorkOrderItems
14. Inspection
15. Fotos
16. Before/After
17. Timeline
18. Dashboard
19. Histórico
20. Cliente
21. Notificações
22. Financeiro
23. Testes
24. Segurança

> **Atenção à ordem.** Os itens 1 a 4 são de **plataforma**, não de automotivo, e valem para
> todas as categorias. Os itens 5 a 24 são do módulo.
>
> A ordem do **núcleo** — que vem antes desta — está no **§59**.

---

# 54. DECISÕES IMPORTANTES JÁ TOMADAS

> Numeração corrigida em 25/08/2026: esta seção estava numerada como 55, duplicando a seguinte.

- Projeto novo, não simples continuação do Barbershop.
- Supabase + PostgreSQL é o banco principal oficial do novo SaaS.
- Supabase Auth será a opção padrão de autenticação do novo projeto, salvo motivo técnico posterior.
- Multi-tenancy será protegido por `tenant_id` + Row Level Security (RLS).
- Firebase/Firestore não será o banco principal do novo SaaS.
- Firebase pode ser usado apenas para serviços específicos, como FCM/push, se houver vantagem.
- Não manter dois bancos principais sincronizados.
- Nome provisório: Bora Marcá.
- Arquitetura multi-segmento.
- Barbearia é o primeiro segmento.
- Estética Automotiva é o segundo e primeiro módulo novo completo.
- Um único SaaS.
- CORE + módulos.
- Multi-tenant obrigatório.
- Tema visual + tema funcional.
- Feature flags centralizadas.
- Labels dinâmicas.
- Agenda genérica com extensões específicas por segmento.
- Não poluir entidades do CORE com dezenas de campos específicos.
- Área do cliente deve existir.
- Financeiro deve ser comum.
- WhatsApp precisa usar abstração de provider.
- Segurança e LGPD são requisitos de arquitetura, não funcionalidades opcionais.
- Novo segmento deve ser adicionável sem reescrever o produto.

Acrescentadas em 25/08/2026:

- **O domínio do Barbershop é o núcleo da plataforma**; a estética automotiva é o primeiro
  módulo. Registrado em `docs/adr/0004`.
- O código do Barbershop **não será portado**; o domínio sim.
- Maquiagem entra como categoria.
- Avaliação de atendimento é entidade própria, não status de agendamento.
- Exclusão de cliente se resolve por **anonimização**, preservando o histórico financeiro.
- Defeito conhecido vira teste marcado `TODO`, não comentário.

---

# 55. COMO UMA IA DEVE RESPONDER AO RECEBER UMA TAREFA

Ao receber um pedido de implementação:

1. Identificar se a mudança pertence ao CORE ou a um módulo.
2. Identificar entidades afetadas.
3. Verificar tenant isolation.
4. Verificar permissões.
5. Verificar se existe solução semelhante no Barbershop.
6. Reutilizar apenas o que estiver bem implementado.
7. Mostrar resumo da estratégia.
8. Implementar.
9. Rodar validações.
10. Reportar resultado.

Não responder apenas com teoria quando o pedido for implementar código e o projeto estiver disponível.

> **Evidência antes de afirmação.** Rodar `npm run verify` e mostrar a saída real antes de
> declarar que algo funciona.

---

# 56. VISÃO FINAL DO PRODUTO

```text
Bora Marcá
│
├── Core SaaS
│   ├── Auth
│   ├── Empresas
│   ├── Usuários
│   ├── Permissões
│   ├── Clientes
│   ├── Agenda
│   ├── Serviços
│   ├── Financeiro
│   ├── Notificações
│   ├── Relatórios
│   └── Planos
│
├── Barbearia
│
├── Estética Automotiva
│   ├── Veículos
│   ├── Boxes
│   ├── OS
│   ├── Checklist
│   ├── Fotos
│   └── Antes/Depois
│
├── Salão de Beleza
│
├── Manicure
│
├── Maquiagem
│
├── Massoterapia
│
├── Tatuagem
│
└── Novos segmentos
```

O objetivo não é apenas criar um sistema de agenda.

O objetivo é construir uma plataforma SaaS modular capaz de adaptar:

- funcionalidades;
- experiência;
- linguagem;
- dashboard;
- operação;
- design;

conforme o segmento escolhido pelo empresário.

---

# 57. INSTRUÇÃO FINAL PARA CHATGPT / CLAUDE

Este arquivo é a fonte principal de contexto funcional e arquitetural.

Entretanto:

**o código real sempre tem prioridade sobre suposições deste documento.**

Antes de alterar arquitetura ou dados:

- analise o código;
- identifique diferenças entre este documento e a implementação atual;
- informe inconsistências;
- preserve funcionalidades que já estejam corretas;
- proponha migração incremental.

Nunca reescreva o projeto inteiro sem necessidade.

Prioridade:

**segurança + estabilidade + escalabilidade + manutenção + experiência do usuário.**

Decisão de infraestrutura vigente:

**Supabase + PostgreSQL é a fonte principal de dados do novo SaaS.**

Qualquer proposta para substituir essa decisão deve apresentar justificativa técnica clara antes de alterar a arquitetura.

---

# 58. STATUS ATUAL

> Atualizado em 25/08/2026, ao fim da Etapa 6.

**Concluído:**

- **Etapa 0 — rede de segurança.** Suíte pgTAP com harness de identidade (`tests.act_as`),
  matriz de isolamento entre dois tenants, matriz de papéis, snapshot de privilégios e CI.
  Antes disso, **nenhuma política de RLS jamais tinha sido executada**.
- **Etapa 1 — privilégios.** Revogação e reconcessão explícita em toda tabela e função,
  mais `alter default privileges` para impedir a recorrência. Achados C-1, C-2, C-3 e C-20.
- **Etapa 2 — bugs que corrompem a operação.** C-5 (box com fim previsto no lugar de
  `infinity`), C-6 e C-7 (a OS consome o agendamento), C-9 (pagamento validado contra o
  total), C-10 (mídia órfã fica inerte), C-13 (uma OS ativa por veículo), C-14 (`unbilled`).
- **Etapa 3 — plataforma.** Workspace npm com `packages/core` compartilhado entre site e
  app, catálogo de segmentos ligado ao banco, camada de permissões espelhando as funções de
  papel, camada de servidor, seis rotas reais e a dívida de formatação paga.
- **Etapa 4 — núcleo a partir do Barbershop.** Configuração de agenda completa, motivo de
  bloqueio como dado privado, avaliação, recorrência, lista de espera, convite e vínculo
  cliente ↔ empresa.
- **Etapa 5 — Barbearia como categoria de referência.** Catálogo sugerido para as onze
  categorias, `create_business_with_owner` numa transação, tela de abertura de empresa com
  escolha de segmento e guarda de rota por feature.
- **Etapa 6 — ponte Agenda ↔ Pátio.** As RPCs órfãs ganharam consumidor, o técnico passou a
  ter atribuição própria, boxes ganharam tela, e a última escrita direta virou RPC.

**Pendente:**

- **Etapa 7** — Manicure, salão e maquiagem: as categorias que provam que adicionar um
  segmento custa configuração, não desenvolvimento.
- **LGPD e permissões granulares** — ✅ entregue. Dado pessoal do cliente segregado em
  `customer_contacts`, legível só por quem contata (C-8); consentimento por finalidade;
  `anonymize_customer` no lugar da exclusão (C-12); `deactivate_professional` no lugar da
  política de DELETE que o schema sempre recusou (C-11); `delete_business` ordenado, que é
  a outra metade do C-12; trilha de auditoria e prazo de retenção declarado. Falta a
  varredura de descarte por prazo, que depende de execução agendada. Ver §48.
- **Financeiro** — ✅ livro único, caixa e comissão entregues. Falta contas a pagar e
  receber com vencimento, e parcelamento (§43).
- **Notificações** — outbox, worker e abstração de provider (§41, §42).
- **Área do cliente** — o vínculo criado na Etapa 4 é a chave; falta a superfície (§39).
- **Planos e assinaturas** (§45) · **estoque** (§44) · **preço por categoria de veículo** (§24)
  · **checklist estruturado** (§31) · **antes/depois pareado** (§34).

**Estado verificável:**

- 32 migrations, aplicáveis do zero.
- 14 arquivos de teste pgTAP, 246 asserções, sem nenhuma pendente em `TODO`.
- CI com cinco portões: pgTAP, agnosticismo do núcleo, formatação, lint e tipos.

---

# 59. ORDEM RECOMENDADA PARA O NÚCLEO

> Seção nova em 25/08/2026. Complementa o §53, e **vem antes dele**.

O §53 descreve a ordem do módulo automotivo. Esta descreve a ordem do núcleo, que é o que
sustenta todas as categorias.

| # | Item | Origem |
| --- | --- | --- |
| 1 | Privilégios de tabela e função fechados | auditoria C-1, C-2, C-3 |
| 2 | Bugs de operação corrigidos | auditoria C-5 a C-14 |
| 3 | Catálogo de segmentos dentro do build | §11, §12 |
| 4 | Tipo de negócio lido do banco pela interface | §8 |
| 5 | Labels dinâmicas | §13 |
| 6 | Camada de permissões | §14 |
| 7 | Fronteira núcleo × módulo no frontend | §4, §16 |
| 8 | Camada de servidor | pré-requisito de 15, 18, 20 e 21 |
| 9 | Onboarding com escolha de categoria | §9 |
| 10 | Cadastros: serviços, profissionais, clientes | §20 |
| 11 | Configuração de agenda completa | §61 |
| 12 | Bloqueios, folgas e motivo privado | §60 |
| 13 | Recorrência e lista de espera | §60 |
| 14 | Convite e vínculo cliente ↔ empresa | §60 |
| 15 | Notificações com abstração de provider | §41, §42 |
| 16 | Avaliação de atendimento | §60 |
| 17 | Financeiro: comissão, despesa, caixa | §43 |
| 18 | Relatórios com recorte de período | §43 |
| 19 | LGPD: consentimento, retenção, anonimização | §48 |
| 20 | Área do cliente | §39 |
| 21 | Planos e assinaturas | §45 |

Só depois disso o §53 faz sentido como módulo, e as demais categorias custam configuração.

---

# 60. FUNCIONALIDADES DO NÚCLEO IDENTIFICADAS NO BARBERSHOP

> Seção nova em 25/08/2026. Onze funcionalidades que existem prontas no projeto anterior e que
> este documento não mencionava. Todas são **núcleo**: valem para qualquer categoria.

## 60.1 Agendamento recorrente

Cliente fixo com dia da semana e horário definidos, em frequência semanal, quinzenal ou mensal.
Forte em manicure, barbearia e massoterapia.

## 60.2 Lista de espera

Cliente entra numa fila para uma data desejada e é avisado quando abre vaga.
Estados: aguardando, notificado, agendado, expirado.

## 60.3 Avaliação de atendimento

Nota e comentário vinculados ao atendimento concluído. **Entidade própria**, não status.

## 60.4 Vínculo cliente ↔ empresa

O mesmo cliente pode ser atendido por várias empresas. O vínculo usa **id determinístico** — a
mesma origem nunca duplica — e rastreia a origem: QR Code, link, código digitado ou convite.
É a base da área do cliente multiempresa (§39).

## 60.5 Convite por código e QR Code

Código de convite que o cliente resgata, com tela de leitura de QR, tela de digitação de código e
geração do QR do profissional. É também a base do convite de **membros da equipe**.

## 60.6 Banimento de cliente

Bloqueio de um cliente específico por empresa. Guardado em área privada — a lista já esteve
exposta na vitrine pública e o vazamento foi corrigido lá.

## 60.7 Templates de mensagem

Modelos de texto para agendamento, confirmação, cancelamento e lembrete, com variáveis
substituíveis.

## 60.8 Banner promocional

Aviso curto exibido ao cliente na tela de agendamento, com liga/desliga.

## 60.9 Configuração de agenda completa

Ver §61.

## 60.10 Idempotência de envio de notificação

Histórico por evento enviado, impedindo disparo duplicado em retentativa. Dado interno, sem
leitura pelo cliente.

## 60.11 Relatório financeiro por e-mail

Resumo semanal e/ou mensal enviado ao dono, com destinatário configurável.

---

# 61. CONFIGURAÇÃO DE AGENDA

> Seção nova em 25/08/2026. É a **maior lacuna isolada** do núcleo hoje: o Barbershop tem nove
> campos, o Bora Marcá tem três.

| Campo | Existe hoje | Para que serve |
| --- | --- | --- |
| Hora de início e fim | ✅ | jornada principal |
| Dias de atendimento | ✅ | dias da semana em que atende |
| **Intervalo de almoço** | ❌ | início e fim; vazio desativa |
| **Antecedência mínima** | ❌ | impede agendar para daqui a cinco minutos |
| **Antecedência máxima** | ❌ | quão longe no futuro se pode agendar |
| **Buffer entre atendimentos** | ❌ | descanso e limpeza depois de cada atendimento |
| **Turno extra** | ❌ | segundo bloco, por exemplo noturno, sem almoço aplicado |

Nenhum é enfeite:

- o **buffer** é essencial em estética automotiva e tatuagem;
- a **antecedência mínima** protege a operação de agendamentos em cima da hora;
- o **turno extra** existe porque barbearia abre à noite.

Além disso, o **bloqueio de horário** deve separar o *quando* do *motivo*: o horário é
informação operacional, o motivo é dado pessoal do profissional e não pertence à mesma
visibilidade.

---

# 62. REGISTRO DE EMENDAS

## [2026-08-25] Primeira emenda

**Motivo:** conclusão da análise do Barbershop exigida pelo §17 e pela Fase 1, mais os achados da
auditoria técnica.

**Alterações:**

| Onde | O quê |
| --- | --- |
| Repositório | O documento passou a ser versionado junto do código |
| §3, §8, §9, §13, §16, §52, §56 | Categoria **Maquiagem** acrescentada |
| §17 | Marcado como **concluído**, com o resultado da extração |
| §18 | Registro de que a seção estava correta e foi desrespeitada; ponteiro para o ADR 0004 |
| §47 | Numeração corrigida (era 48, duplicada) e quatro regras de segurança acrescentadas |
| §54 | Numeração corrigida (era 55, duplicada) e seis decisões acrescentadas |
| §58 | Status reescrito — a versão anterior estava vencida |
| §59 | **Nova** — ordem recomendada para o núcleo |
| §60 | **Nova** — onze funcionalidades do núcleo identificadas no Barbershop |
| §61 | **Nova** — configuração de agenda completa |
| §62 | **Nova** — este registro |
| §16 | Workspace com pacote de núcleo compartilhado entre site e app (ADR 0005) |
| §6, §7, §15, §20, §24, §25, §26, §28, §31, §34, §39, §41, §43, §45, §49, §51, §53, §55 | Notas de estado real, decisão ou pendência |

## [2026-08-25] Segunda emenda — execução das Etapas 0 a 6

**Motivo:** o documento é a fonte de verdade e o §58 descrevia um estado que deixou de existir.

| Onde | O quê |
| --- | --- |
| §58 | Reescrito: Etapas 0 a 6 concluídas, com o pendente separado do feito |
| §16 | Workspace com `packages/core` compartilhado entre site e app (ADR 0005) |

**Migrations acrescentadas:** 15, da `20260825000100` à `20260825001500`.

**Artefatos relacionados criados na mesma data:**

- `docs/auditoria-2026-08-25.md`
- `docs/plano-execucao.md`
- `docs/barbershop-extracao-dominio.md`
- `docs/como-prosseguir.md`
- `docs/adr/0004-barbershop-e-o-nucleo-da-plataforma.md`
- `supabase/migrations/20260825000100_add_makeup_business_type.sql`
- `.ai-team/` com dez agentes especializados

---

## [2026-08-26] Terceira emenda — Etapa 7, financeiro do núcleo e LGPD

**Motivo:** três blocos do §58 saíram de "pendente" e o documento não podia continuar
descrevendo-os como futuro.

| Onde | O quê |
| --- | --- |
| §58 | Etapa 7, financeiro do núcleo e LGPD marcados como entregues, com o que sobrou explícito |
| §48 | Nota de estado: as práticas do Barbershop traduzidas, e o que ainda depende de execução agendada |

**Migrations acrescentadas:** 17, da `20260825000100` à `20260825001800`.

**Decisão registrada — anonimizar em vez de excluir.** O pedido de exclusão do titular é
atendido por `anonymize_customer`: o dado pessoal desaparece e o fato comercial permanece.
Apagar o cadastro levaria junto o registro fiscal do que foi vendido, e as FKs `RESTRICT`
impediriam a operação de qualquer forma. **Pende confirmação jurídica** de que esta leitura
atende ao art. 18 — se não atender, muda o desenho, não só o código.

**Decisão registrada — encerrar empresa tem um caminho só.** O `CASCADE` de `businesses`
não garante ordem e colidia com as ~25 FKs `RESTRICT` internas ao tenant (C-12). Em vez de
afrouxar essas FKs — que são o que impede apagar um cliente com histórico —, o offboarding
virou `delete_business`, que apaga das folhas para a raiz e confere o nome digitado. O
`DELETE` solto em `businesses` foi revogado.

---

# FIM DO CONTEXTO MESTRE
