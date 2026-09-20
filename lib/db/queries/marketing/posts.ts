import { db } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { marketingPosts } from "@/lib/db/schema";

export type MarketingPostInsert = typeof marketingPosts.$inferInsert;
export type MarketingPost = typeof marketingPosts.$inferSelect;

export async function createPost(data: MarketingPostInsert) {
  const [row] = await db.insert(marketingPosts).values(data).returning();
  return row;
}

export async function getPostById(id: string) {
  return await db.query.marketingPosts.findFirst({
    where: eq(marketingPosts.id, id),
  });
}

export async function getPostBySlug(slug: string) {
  return await db.query.marketingPosts.findFirst({
    where: eq(marketingPosts.slug, slug),
  });
}

// Todos los posts (admin), más recientes primero
export async function listPosts() {
  return await db.query.marketingPosts.findMany({
    orderBy: [desc(marketingPosts.createdAt)],
  });
}

// Solo publicados (público), ordenados por fecha de publicación desc
export async function getPublishedPosts(limit = 20) {
  return await db.query.marketingPosts.findMany({
    where: eq(marketingPosts.status, 'published'),
    orderBy: [desc(marketingPosts.publishedAt)],
    limit,
  });
}

export async function updatePost(id: string, data: Partial<MarketingPostInsert>) {
  const [row] = await db
    .update(marketingPosts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(marketingPosts.id, id))
    .returning();
  return row;
}

export async function deletePost(id: string) {
  const [row] = await db.delete(marketingPosts).where(eq(marketingPosts.id, id)).returning();
  return row;
}
