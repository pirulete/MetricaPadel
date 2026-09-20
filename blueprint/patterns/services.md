# Pattern: Services / Consultoría

## Overview
Agencia, consultora o studio con reservas de servicios. Agrega catálogo de servicios, booking por slots y testimonios con moderación admin. Activa páginas públicas de servicios + área privada de reservas.

## Features Activadas
- Auth.js + guards `validateUser` / `validateAdmin`
- Audit (`auditAdminAction`, `auditCreate`, `auditUpdate`)
- Notification inbox + push (booking lifecycle)
- Rate limit en endpoints públicos (`lib/rate-limit.ts`)
- Marketing CMS (landing con services grid) — opcional

## Schema
Agregar al final de `lib/db/schema.ts`:

```ts
export const bookingStatusEnum = pgEnum('booking_status', ['pending', 'confirmed', 'cancelled', 'completed']);

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  category: varchar("category", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  timeSlot: varchar("time_slot", { length: 5 }).notNull(), // HH:mm
  status: bookingStatusEnum("status").notNull().default('pending'),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("bookings_service_date_idx").on(table.serviceId, table.date),
  index("bookings_user_created_idx").on(table.userId, table.createdAt),
]);

export const testimonials = pgTable("testimonials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
  rating: integer("rating").notNull(), // 1-5
  content: text("content").notNull(),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("testimonials_service_approved_idx").on(table.serviceId, table.approved),
]);

export const servicesRelations = relations(services, ({ many }) => ({
  bookings: many(bookings),
  testimonials: many(testimonials),
}));
export const bookingsRelations = relations(bookings, ({ one }) => ({
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  service: one(services, { fields: [bookings.serviceId], references: [services.id] }),
}));
export const testimonialsRelations = relations(testimonials, ({ one }) => ({
  user: one(users, { fields: [testimonials.userId], references: [users.id] }),
  service: one(services, { fields: [testimonials.serviceId], references: [services.id] }),
}));

export type Service = typeof services.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Testimonial = typeof testimonials.$inferSelect;
```

## Queries
`lib/db/queries/bookings.ts`:

```ts
import { db } from "@/lib/db";
import { bookings, services, testimonials } from "@/lib/db/schema";
import { and, asc, eq, gte, ne } from "drizzle-orm";

/** Slots disponibles: horas del servicio menos las ya reservadas (no canceladas). */
export async function getAvailableSlots(serviceId: string, date: string): Promise<string[]> {
  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (!service) return [];
  const taken = await db.select({ timeSlot: bookings.timeSlot })
    .from(bookings)
    .where(and(
      eq(bookings.serviceId, serviceId),
      eq(bookings.date, date),
      ne(bookings.status, 'cancelled'),
    ));
  const takenSet = new Set(taken.map((t) => t.timeSlot));
  const slots: string[] = [];
  for (let h = 9; h < 17; h++) {
    const slot = `${String(h).padStart(2, '0')}:00`;
    if (!takenSet.has(slot)) slots.push(slot);
  }
  return slots;
}

/** Crea reserva (valida slot libre antes de insertar). */
export async function createBooking(userId: string, serviceId: string, date: string, timeSlot: string, notes?: string) {
  const available = await getAvailableSlots(serviceId, date);
  if (!available.includes(timeSlot)) return null;
  const [row] = await db.insert(bookings)
    .values({ userId, serviceId, date, timeSlot, notes }).returning();
  return row;
}

/** Cancela reserva propia (status → cancelled). */
export async function cancelBooking(userId: string, bookingId: string) {
  const [row] = await db.update(bookings)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)))
    .returning();
  return row ?? null;
}

/** Testimonios aprobados de un servicio (público). */
export async function getTestimonials(serviceId: string): Promise<Testimonial[]> {
  return db.select().from(testimonials)
    .where(and(eq(testimonials.serviceId, serviceId), eq(testimonials.approved, true)))
    .orderBy(asc(testimonials.createdAt));
}

/** Servicios activos (público). */
export async function listActiveServices(): Promise<Service[]> {
  return db.select().from(services).where(eq(services.isActive, true)).orderBy(asc(services.name));
}
```

## API Endpoints
| Método | Ruta | Guard | Body | Response | Descripción |
|--------|------|-------|------|----------|-------------|
| GET | `/api/admin/services` | `guardAdmin` | — | `Service[]` | Lista servicios |
| POST | `/api/admin/services` | `guardAdmin` | `{name, description, durationMinutes, price, category}` | `Service` | Crea servicio (audit `auditAdminAction`) |
| POST | `/api/user/bookings` | `guardUser` | `{serviceId, date, timeSlot, notes}` | `Booking` | Crea reserva (audit `auditCreate`) |
| GET | `/api/public/testimonials` | rate limit | `?serviceId=` | `Testimonial[]` | Testimonios aprobados |

## UI Pages
| Ruta | Componentes | Estados | Descripción |
|------|-------------|---------|-------------|
| `app/(app)/bookings/` | `BookingCard`, `Badge`, `EmptyState` | loading, empty, error | Mis reservas + cancelar |
| `app/(public)/services/` | `ServiceCard`, `Grid` | loading, empty, error | Listado de servicios |
| `app/(public)/services/[id]/` | `ServiceDetail`, `SlotPicker`, `Form`, `TestimonialList` | loading, error | Detalle + booking form + testimonios |

## Tests
- `tests/unit/bookings.test.ts` — `getAvailableSlots` (excluye canceladas), `createBooking` (slot ocupado → null), `cancelBooking`, `getTestimonials` (solo aprobados)
- `tests/api/bookings.spec.ts` — guard 401/403 en `/api/user/bookings` y `/api/admin/services`; rate limit en `/api/public/testimonials`
- `tests/api/bookings-happy.spec.ts` — happy-path con SQL real: crear servicio → reservar slot → verificar disponibilidad
- `tests/e2e/booking-flow.spec.ts` — flujo navegable: services → detalle → reservar → ver en `/bookings`

## Notification Triggers
En `lib/notifications/triggers.ts`:

```ts
/** booking.created — confirmación de solicitud (P2, account). */
export async function triggerBookingCreated(userId: string, serviceName: string, date: string, timeSlot: string) {
  return createNotification({
    userId, type: 'info', priority: 'P2', title: 'Reserva solicitada',
    body: `${serviceName} — ${date} a las ${timeSlot}.`, category: 'account',
    ctaUrl: '/bookings', ctaLabel: 'Ver reservas',
  });
}

/** booking.confirmed — admin confirma (P2, account). */
export async function triggerBookingConfirmed(userId: string, serviceName: string, date: string) {
  return createNotification({
    userId, type: 'success', priority: 'P2', title: 'Reserva confirmada',
    body: `Tu reserva de ${serviceName} para el ${date} fue confirmada.`, category: 'account',
    ctaUrl: '/bookings', ctaLabel: 'Ver reservas',
  });
}

/** booking.cancelled — cancelación (P3, account). */
export async function triggerBookingCancelled(userId: string, serviceName: string) {
  return createNotification({
    userId, type: 'warning', priority: 'P3', title: 'Reserva cancelada',
    body: `Tu reserva de ${serviceName} fue cancelada.`, category: 'account',
    ctaUrl: '/bookings', ctaLabel: 'Ver reservas',
  });
}
```