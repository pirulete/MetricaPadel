# Pattern: E-commerce

## Overview
Tienda online (suplementos, ropa, artesanías). Reutiliza `marketing_products` del CMS como catálogo y agrega carrito, órdenes y checkout. Activa `app/(public)/shop/` (ya existe) + área privada de órdenes.

## Features Activadas
- Marketing CMS (`marketing_products`, `marketing_categories`, caché `lib/marketing/cache.ts`)
- Auth.js + guards `validateUser` / `validateAdmin`
- Audit (`auditCreate`, `auditUpdate`, `auditAdminAction`)
- Notification inbox + push (order lifecycle)
- Rate limit en checkout público

## Schema
Agregar al final de `lib/db/schema.ts`:

```ts
export const orderStatusEnum = pgEnum('order_status', ['pending', 'paid', 'shipped', 'delivered', 'cancelled']);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: orderStatusEnum("status").notNull().default('pending'),
  shippingAddress: jsonb("shipping_address").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("orders_user_created_idx").on(table.userId, table.createdAt),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => marketingProducts.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull().default(1),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
}, (table) => [
  index("order_items_order_idx").on(table.orderId),
]);

export const cart = pgTable("cart", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => marketingProducts.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cart_user_product_idx").on(table.userId, table.productId),
]);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(marketingProducts, { fields: [orderItems.productId], references: [marketingProducts.id] }),
}));
export const cartRelations = relations(cart, ({ one }) => ({
  user: one(users, { fields: [cart.userId], references: [users.id] }),
  product: one(marketingProducts, { fields: [cart.productId], references: [marketingProducts.id] }),
}));

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type CartItem = typeof cart.$inferSelect;
```

## Queries
`lib/db/queries/orders.ts`:

```ts
import { db } from "@/lib/db";
import { cart, orderItems, orders } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

/** Carrito del usuario con producto embebido. */
export async function getCart(userId: string) {
  return db.query.cart.findMany({
    where: eq(cart.userId, userId),
    with: { product: true },
    orderBy: (t, { desc }) => [desc(t.addedAt)],
  });
}

/** Agrega al carrito (upsert: incrementa quantity si ya existe). */
export async function addToCart(userId: string, productId: string, quantity = 1) {
  const existing = await db.query.cart.findFirst({
    where: and(eq(cart.userId, userId), eq(cart.productId, productId)),
  });
  if (existing) {
    const [row] = await db.update(cart)
      .set({ quantity: existing.quantity + quantity })
      .where(eq(cart.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(cart).values({ userId, productId, quantity }).returning();
  return row;
}

export async function removeFromCart(userId: string, productId: string) {
  return db.delete(cart).where(and(eq(cart.userId, userId), eq(cart.productId, productId)));
}

/** Checkout: crea order + items en transacción y vacía el carrito. */
export async function checkout(userId: string, cartItems: Array<{ productId: string; quantity: number; price: string }>, shippingAddress: unknown) {
  return db.transaction(async (tx) => {
    const total = cartItems.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
    const [order] = await tx.insert(orders)
      .values({ userId, total: total.toFixed(2), shippingAddress }).returning();
    await tx.insert(orderItems).values(
      cartItems.map((i) => ({ orderId: order.id, productId: i.productId, quantity: i.quantity, price: i.price })),
    );
    await tx.delete(cart).where(eq(cart.userId, userId));
    return order;
  });
}

/** Historial de órdenes del usuario con items. */
export async function getOrderHistory(userId: string) {
  return db.query.orders.findMany({
    where: eq(orders.userId, userId),
    with: { items: { with: { product: true } } },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}
```

## API Endpoints
| Método | Ruta | Guard | Body | Response | Descripción |
|--------|------|-------|------|----------|-------------|
| POST | `/api/user/cart` | `guardUser` | `{productId, quantity}` | `CartItem` | Agrega al carrito |
| GET | `/api/user/orders` | `guardUser` | — | `Order[]` | Historial de órdenes |
| POST | `/api/user/checkout` | `guardUser` | `{items, shippingAddress}` | `Order` | Checkout (transacción, audit `auditCreate`) |

## UI Pages
| Ruta | Componentes | Estados | Descripción |
|------|-------------|---------|-------------|
| `app/(app)/orders/` | `OrderCard`, `Badge`, `EmptyState` | loading, empty, error | Historial con status |
| `app/(app)/orders/[id]/` | `OrderDetail`, `Table`, `Button` | loading, error | Detalle + items + dirección |
| `app/(public)/shop/` | (ya existe) | — | Catálogo desde `marketing_products` |

## Tests
- `tests/unit/orders.test.ts` — `addToCart` (upsert), `removeFromCart`, `checkout` (transacción), `getOrderHistory`
- `tests/api/orders.spec.ts` — guard 401/403 en `/api/user/cart`, `/api/user/orders`, `/api/user/checkout`
- `tests/api/orders-happy.spec.ts` — happy-path con SQL real: addToCart → checkout → verificar order + items + carrito vacío
- `tests/e2e/purchase-flow.spec.ts` — flujo navegable: shop → carrito → checkout → historial

## Notification Triggers
En `lib/notifications/triggers.ts`:

```ts
/** order.created — confirmación de compra (P2, billing). */
export async function triggerOrderCreated(userId: string, orderId: string, total: string) {
  return createNotification({
    userId, type: 'success', priority: 'P2', title: 'Orden confirmada',
    body: `Tu orden #${orderId.slice(0, 8)} por $${total} fue recibida.`, category: 'billing',
    ctaUrl: `/orders/${orderId}`, ctaLabel: 'Ver orden',
  });
}

/** order.shipped — envío despachado (P2, billing). */
export async function triggerOrderShipped(userId: string, orderId: string) {
  return createNotification({
    userId, type: 'info', priority: 'P2', title: 'Tu pedido fue enviado',
    body: `La orden #${orderId.slice(0, 8)} está en camino.`, category: 'billing',
    ctaUrl: `/orders/${orderId}`, ctaLabel: 'Seguir pedido',
  });
}

/** order.delivered — entrega completada (P3, billing). */
export async function triggerOrderDelivered(userId: string, orderId: string) {
  return createNotification({
    userId, type: 'success', priority: 'P3', title: 'Pedido entregado',
    body: `La orden #${orderId.slice(0, 8)} fue entregada. ¡Disfrútalo!`, category: 'billing',
    ctaUrl: `/orders/${orderId}`, ctaLabel: 'Ver detalle',
  });
}
```