import { db } from "@/lib/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { marketingSections } from "@/lib/db/schema";

export type MarketingSectionInsert = typeof marketingSections.$inferInsert;
export type MarketingSection = typeof marketingSections.$inferSelect;

export async function createSection(pageId: string, data: Omit<MarketingSectionInsert, "pageId">) {
  const [row] = await db.insert(marketingSections).values({ ...data, pageId }).returning();
  return row;
}

export async function getSectionById(id: string) {
  return await db.query.marketingSections.findFirst({
    where: eq(marketingSections.id, id),
  });
}

export async function listSectionsByPage(pageId: string) {
  return await db.query.marketingSections.findMany({
    where: eq(marketingSections.pageId, pageId),
    orderBy: [asc(marketingSections.sortOrder)],
  });
}

export async function updateSection(id: string, data: Partial<MarketingSectionInsert>) {
  const [row] = await db
    .update(marketingSections)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(marketingSections.id, id))
    .returning();
  return row;
}

export async function deleteSection(id: string) {
  const [row] = await db.delete(marketingSections).where(eq(marketingSections.id, id)).returning();
  return row;
}

// Reordena todas las secciones de una página en un solo batch UPDATE.
// Los sortOrders se derivan de la posición con paso 1024 (convención del CMS).
export async function reorderSections(pageId: string, sectionIds: string[]) {
  const step = 1024;
  const current = await listSectionsByPage(pageId);
  const knownIds = new Set(current.map((s) => s.id));

  const valid = sectionIds.filter((id) => knownIds.has(id));
  if (valid.length === 0) return [];

  const updates = valid.map((id, index) =>
    db
      .update(marketingSections)
      .set({ sortOrder: index * step, updatedAt: new Date() })
      .where(and(eq(marketingSections.id, id), eq(marketingSections.pageId, pageId)))
      .returning()
  );

  const results = await Promise.all(updates);
  return results.map(([row]) => row);
}

export async function deleteSectionsByPage(pageId: string) {
  return await db.delete(marketingSections).where(eq(marketingSections.pageId, pageId));
}

// Para validar el orden recibido en reorder (todos los ids deben pertenecer a la página)
export async function sectionIdsBelongToPage(pageId: string, sectionIds: string[]): Promise<Set<string>> {
  if (sectionIds.length === 0) return new Set();
  const rows = await db
    .select({ id: marketingSections.id })
    .from(marketingSections)
    .where(and(eq(marketingSections.pageId, pageId), inArray(marketingSections.id, sectionIds)));
  return new Set(rows.map((r) => r.id));
}
