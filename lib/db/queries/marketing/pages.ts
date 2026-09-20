import { db } from "@/lib/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { marketingPages, marketingSections, marketingStatusEnum } from "@/lib/db/schema";

export type MarketingPageInsert = typeof marketingPages.$inferInsert;
export type MarketingPage = typeof marketingPages.$inferSelect;

export type PageWithSections = {
  page: MarketingPage;
  sections: Array<typeof marketingSections.$inferSelect>;
};

export async function createPage(data: MarketingPageInsert) {
  const [row] = await db.insert(marketingPages).values(data).returning();
  return row;
}

export async function getPageById(id: string) {
  return await db.query.marketingPages.findFirst({
    where: eq(marketingPages.id, id),
  });
}

export async function getPageBySlug(slug: string, opts: { publishedOnly?: boolean } = {}): Promise<PageWithSections | null> {
  const page = await db.query.marketingPages.findFirst({
    where: opts.publishedOnly
      ? and(eq(marketingPages.slug, slug), eq(marketingPages.status, 'published'))
      : eq(marketingPages.slug, slug),
  });

  if (!page) return null;

  // Batched: 2 queries (page + sections ordenadas) → evita N+1
  const sections = await db.query.marketingSections.findMany({
    where: eq(marketingSections.pageId, page.id),
    orderBy: (table, { asc }) => [asc(table.sortOrder)],
  });

  return { page, sections };
}

export async function listPages() {
  const rows = await db
    .select({
      id: marketingPages.id,
      slug: marketingPages.slug,
      title: marketingPages.title,
      seoTitle: marketingPages.seoTitle,
      seoDescription: marketingPages.seoDescription,
      status: marketingPages.status,
      sortOrder: marketingPages.sortOrder,
      createdAt: marketingPages.createdAt,
      updatedAt: marketingPages.updatedAt,
      sectionCount: sql<number>`count(${marketingSections.id})::int`,
    })
    .from(marketingPages)
    .leftJoin(marketingSections, eq(marketingSections.pageId, marketingPages.id))
    .groupBy(marketingPages.id)
    .orderBy(desc(marketingPages.createdAt));

  return rows;
}

export async function updatePage(id: string, data: Partial<MarketingPageInsert>) {
  const [row] = await db
    .update(marketingPages)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(marketingPages.id, id))
    .returning();
  return row;
}

export async function deletePage(id: string) {
  // Sections se eliminan en cascada (FK onDelete: cascade)
  const [row] = await db.delete(marketingPages).where(eq(marketingPages.id, id)).returning();
  return row;
}

export async function countPublishedPages(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(marketingPages)
    .where(eq(marketingPages.status, 'published'));
  return row?.count ?? 0;
}

export { marketingStatusEnum };
