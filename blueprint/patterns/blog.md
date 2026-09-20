# Pattern: Blog / Contenido

## Overview
Publicación, documentation site o knowledge base. Reutiliza `marketing_posts` y `marketing_categories` del CMS y agrega interacción social: votos, bookmarks y comentarios. Activa el área privada de bookmarks y preferencias de notificación.

## Features Activadas
- Marketing CMS (`marketing_posts`, `marketing_categories`, caché + revalidate)
- Auth.js + guards `validateUser` / `validateAdmin`
- Audit (`auditCreate`, `auditDelete`)
- Notification inbox + push (post.published, comment.created)
- Notification preferences por categoría (`notification_preferences`)

## Schema
Agregar al final de `lib/db/schema.ts`:

```ts
export const voteTypeEnum = pgEnum('vote_type', ['upvote', 'downvote']);

export const postVotes = pgTable("post_votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => marketingPosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: voteTypeEnum("type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("post_votes_post_user_idx").on(table.postId, table.userId),
]);

export const postBookmarks = pgTable("post_bookmarks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: uuid("post_id").notNull().references(() => marketingPosts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("post_bookmarks_user_post_idx").on(table.userId, table.postId),
]);

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => marketingPosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): any => comments.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("comments_post_created_idx").on(table.postId, table.createdAt),
]);

export const postVotesRelations = relations(postVotes, ({ one }) => ({
  post: one(marketingPosts, { fields: [postVotes.postId], references: [marketingPosts.id] }),
  user: one(users, { fields: [postVotes.userId], references: [users.id] }),
}));
export const postBookmarksRelations = relations(postBookmarks, ({ one }) => ({
  post: one(marketingPosts, { fields: [postBookmarks.postId], references: [marketingPosts.id] }),
  user: one(users, { fields: [postBookmarks.userId], references: [users.id] }),
}));
export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(marketingPosts, { fields: [comments.postId], references: [marketingPosts.id] }),
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  parent: one(comments, { fields: [comments.parentId], references: [comments.id], relationName: 'replies' }),
  replies: many(comments, { relationName: 'replies' }),
}));

export type PostVote = typeof postVotes.$inferSelect;
export type PostBookmark = typeof postBookmarks.$inferSelect;
export type Comment = typeof comments.$inferSelect;
```

## Queries
`lib/db/queries/blog.ts`:

```ts
import { db } from "@/lib/db";
import { comments, postBookmarks, postVotes } from "@/lib/db/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";

/** Post con conteo de votos (net) y comentarios. */
export async function getPostWithStats(postId: string) {
  const [votes] = await db.select({
    net: sql<number>`COALESCE(SUM(CASE WHEN type = 'upvote' THEN 1 ELSE -1 END), 0)`,
  }).from(postVotes).where(eq(postVotes.postId, postId));
  const [commentCount] = await db.select({ count: count() })
    .from(comments).where(eq(comments.postId, postId));
  return { netVotes: votes?.net ?? 0, commentCount: commentCount?.count ?? 0 };
}

/** Posts trending por votos netos (últimos 30 días). */
export async function getTrendingPosts(limit = 5) {
  return db.select({
    postId: postVotes.postId,
    net: sql<number>`SUM(CASE WHEN type = 'upvote' THEN 1 ELSE -1 END)`,
  }).from(postVotes)
    .where(sql`created_at > now() - interval '30 days'`)
    .groupBy(postVotes.postId)
    .orderBy(sql`net DESC`)
    .limit(limit);
}

/** Toggle bookmark (retorna true si quedó guardado). */
export async function toggleBookmark(userId: string, postId: string): Promise<boolean> {
  const existing = await db.query.postBookmarks.findFirst({
    where: and(eq(postBookmarks.userId, userId), eq(postBookmarks.postId, postId)),
  });
  if (existing) {
    await db.delete(postBookmarks).where(eq(postBookmarks.id, existing.id));
    return false;
  }
  await db.insert(postBookmarks).values({ userId, postId });
  return true;
}

/** Upsert voto (mismo post+user: cambia tipo o elimina si es igual). */
export async function votePost(userId: string, postId: string, type: 'upvote' | 'downvote') {
  const existing = await db.query.postVotes.findFirst({
    where: and(eq(postVotes.userId, userId), eq(postVotes.postId, postId)),
  });
  if (existing?.type === type) {
    await db.delete(postVotes).where(eq(postVotes.id, existing.id));
    return null;
  }
  if (existing) {
    const [row] = await db.update(postVotes).set({ type }).where(eq(postVotes.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(postVotes).values({ userId, postId, type }).returning();
  return row;
}

/** Bookmarks del usuario con post embebido. */
export async function getBookmarks(userId: string) {
  return db.query.postBookmarks.findMany({
    where: eq(postBookmarks.userId, userId),
    with: { post: true },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}
```

## API Endpoints
| Método | Ruta | Guard | Body | Response | Descripción |
|--------|------|-------|------|----------|-------------|
| POST | `/api/user/posts/[id]/vote` | `guardUser` | `{type: 'upvote'\|'downvote'}` | `{netVotes}` | Vota / desvota (toggle) |
| POST | `/api/user/posts/[id]/bookmark` | `guardUser` | — | `{bookmarked: boolean}` | Toggle bookmark |
| GET | `/api/user/bookmarks` | `guardUser` | — | `PostBookmark[]` | Posts guardados |

## UI Pages
| Ruta | Componentes | Estados | Descripción |
|------|-------------|---------|-------------|
| `app/(app)/bookmarks/` | `PostCard`, `EmptyState`, `Button` | loading, empty, error | Posts guardados con remove |
| `app/(app)/settings/notifications/` | `PreferenceToggles`, `Switch` | loading, error | Preferencias de blog (categoría `social`) |

## Tests
- `tests/unit/blog.test.ts` — `getPostWithStats`, `getTrendingPosts`, `toggleBookmark`, `votePost` (toggle/upsert/delete)
- `tests/api/blog.spec.ts` — guard 401/403 en vote, bookmark y bookmarks
- `tests/api/blog-happy.spec.ts` — happy-path con SQL real: crear post → votar → bookmark → listar bookmarks
- `tests/e2e/bookmark-flow.spec.ts` — flujo navegable: leer post → bookmark → ver en `/bookmarks`

## Notification Triggers
En `lib/notifications/triggers.ts`:

```ts
/** post.published — notifica a suscriptores (P2, marketing, dedup por post). */
export async function triggerPostPublished(userId: string, postTitle: string, postSlug: string) {
  return createNotification({
    userId, type: 'info', priority: 'P2', title: 'Nuevo artículo',
    body: `Publicamos: "${postTitle}".`, category: 'marketing',
    groupId: crypto.randomUUID(), ctaUrl: `/blog/${postSlug}`, ctaLabel: 'Leer',
  });
}

/** comment.created — notifica al autor del post (P2, social). */
export async function triggerCommentCreated(authorId: string, commenterName: string, postSlug: string) {
  return createNotification({
    userId: authorId, type: 'info', priority: 'P2', title: 'Nuevo comentario',
    body: `${commenterName} comentó en tu artículo.`, category: 'social',
    ctaUrl: `/blog/${postSlug}`, ctaLabel: 'Ver comentario',
  });
}
```