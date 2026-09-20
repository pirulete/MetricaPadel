# Pattern: SaaS / B2B

## Overview
Plataforma de suscripción recurrente (fitness, CRM, project management). Activa el área privada `app/(app)` con dashboard de métricas, settings de plan, RBAC USER/ADMIN y el motor de notificaciones para billing.

## Features Activadas
- Auth.js + guards `validateUser` / `validateAdmin` (RBAC USER/ADMIN)
- Audit (`lib/audit/helpers.ts` — `auditAdminAction`, `auditCreate`, `auditUpdate`)
- Notification inbox + push (`lib/notifications/engine.ts`, `triggers.ts`)
- Marketing CMS (landing con pricing block) — opcional
- Rate limit en endpoints públicos (`lib/rate-limit.ts`)

## Schema
Agregar al final de `lib/db/schema.ts` (imports ya cubiertos por la línea 1: `pgTable, text, timestamp, uuid, varchar, json, jsonb, integer, numeric, boolean, pgEnum, index, uniqueIndex`):

```ts
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'trialing', 'past_due', 'cancelled', 'expired']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['pending', 'paid', 'failed', 'refunded']);

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  features: jsonb("features").notNull().default([]),
  limits: jsonb("limits").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  status: subscriptionStatusEnum("status").notNull().default('trialing'),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("subscriptions_user_status_idx").on(table.userId, table.status),
]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: invoiceStatusEnum("status").notNull().default('pending'),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("invoices_user_created_idx").on(table.userId, table.createdAt),
]);

export const plansRelations = relations(plans, ({ many }) => ({ subscriptions: many(subscriptions) }));
export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  invoices: many(invoices),
}));
export const invoicesRelations = relations(invoices, ({ one }) => ({
  user: one(users, { fields: [invoices.userId], references: [users.id] }),
  subscription: one(subscriptions, { fields: [invoices.subscriptionId], references: [subscriptions.id] }),
}));

export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
```

## Queries
`lib/db/queries/billing.ts`:

```ts
import { db } from "@/lib/db";
import { invoices, plans, subscriptions } from "@/lib/db/schema";
import { and, asc, desc, eq, gte } from "drizzle-orm";

/** Plan activo del usuario (status active/trialing, vigente). */
export async function getActiveSubscription(userId: string) {
  return db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.userId, userId),
      gte(subscriptions.currentPeriodEnd, new Date()),
    ),
    with: { plan: true },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

/** Crea suscripción (cancela implícitamente las previas al setear status). */
export async function createSubscription(userId: string, planId: string, periodEnd: Date) {
  const [row] = await db.insert(subscriptions)
    .values({ userId, planId, status: 'active', currentPeriodEnd: periodEnd })
    .returning();
  return row;
}

/** Cancela suscripción activa (status → cancelled, sin borrar historial). */
export async function cancelSubscription(userId: string, subscriptionId: string) {
  const [row] = await db.update(subscriptions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)))
    .returning();
  return row ?? null;
}

/** Historial de facturas del usuario (desc). */
export async function getInvoices(userId: string): Promise<Invoice[]> {
  return db.select().from(invoices)
    .where(eq(invoices.userId, userId))
    .orderBy(desc(invoices.createdAt));
}

/** Lista planes activos (admin). */
export async function listPlans(): Promise<Plan[]> {
  return db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.price));
}
```

## API Endpoints
| Método | Ruta | Guard | Body | Response | Descripción |
|--------|------|-------|------|----------|-------------|
| GET | `/api/admin/plans` | `guardAdmin` | — | `Plan[]` | Lista planes |
| POST | `/api/admin/plans` | `guardAdmin` | `{name, price, features, limits}` | `Plan` | Crea plan (audit `auditAdminAction`) |
| POST | `/api/user/subscriptions` | `guardUser` | `{planId}` | `Subscription` | Suscribe al usuario (audit `auditCreate`) |
| GET | `/api/user/invoices` | `guardUser` | — | `Invoice[]` | Historial de facturas |

## UI Pages
| Ruta | Componentes | Estados | Descripción |
|------|-------------|---------|-------------|
| `app/(app)/dashboard/` | `MetricCard`, `Chart`, `EmptyState` | loading, empty, error | Métricas: clientes activos, MRR, churn |
| `app/(app)/settings/` | `PlanCard`, `Button`, `Badge`, `Sonner` | loading, empty, error | Plan actual, upgrade/downgrade |

## Tests
- `tests/unit/billing.test.ts` — `getActiveSubscription`, `createSubscription`, `cancelSubscription`, `getInvoices` (mock `db`)
- `tests/api/billing.spec.ts` — guard 401/403 en `/api/user/subscriptions` y `/api/admin/plans`
- `tests/api/billing-happy.spec.ts` — happy-path con SQL real: crear plan → suscribir → listar invoices
- `tests/e2e/upgrade-flow.spec.ts` — flujo navegable upgrade de plan en settings

## Notification Triggers
En `lib/notifications/triggers.ts`:

```ts
/** subscription.created — al suscribirse (P2, billing). */
export async function triggerSubscriptionCreated(userId: string, planName: string) {
  return createNotification({
    userId, type: 'success', priority: 'P2', title: 'Suscripción activa',
    body: `Tu plan ${planName} está activo.`, category: 'billing',
    ctaUrl: '/settings', ctaLabel: 'Ver plan',
  });
}

/** subscription.cancelled — al cancelar (P3, billing, dedup por groupId). */
export async function triggerSubscriptionCancelled(userId: string, planName: string) {
  return createNotification({
    userId, type: 'warning', priority: 'P3', title: 'Suscripción cancelada',
    body: `Tu plan ${planName} se canceló al final del período.`, category: 'billing',
    groupId: crypto.randomUUID(), ctaUrl: '/settings', ctaLabel: 'Reactivar',
  });
}

/** invoice.paid — pago confirmado (P3, billing). */
export async function triggerInvoicePaid(userId: string, amount: string) {
  return createNotification({
    userId, type: 'info', priority: 'P3', title: 'Pago recibido',
    body: `Recibimos tu pago de $${amount}.`, category: 'billing',
    ctaUrl: '/settings', ctaLabel: 'Ver facturas',
  });
}
```