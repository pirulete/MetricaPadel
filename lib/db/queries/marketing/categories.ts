import { db } from "@/lib/db";
import { asc, eq, sql } from "drizzle-orm";
import { marketingCategories, marketingProducts } from "@/lib/db/schema";

export type MarketingCategoryInsert = typeof marketingCategories.$inferInsert;
export type MarketingCategory = typeof marketingCategories.$inferSelect;

export type CategoryWithCount = MarketingCategory & {
  productCount: number;
};

export async function createCategory(data: MarketingCategoryInsert) {
  const [row] = await db.insert(marketingCategories).values(data).returning();
  return row;
}

export async function getCategoryById(id: string) {
  return await db.query.marketingCategories.findFirst({
    where: eq(marketingCategories.id, id),
  });
}

export async function getCategoryBySlug(slug: string) {
  return await db.query.marketingCategories.findFirst({
    where: eq(marketingCategories.slug, slug),
  });
}

// Todas las categorías con conteo de productos
export async function listCategories(): Promise<CategoryWithCount[]> {
  const rows = await db
    .select({
      id: marketingCategories.id,
      slug: marketingCategories.slug,
      name: marketingCategories.name,
      sortOrder: marketingCategories.sortOrder,
      createdAt: marketingCategories.createdAt,
      updatedAt: marketingCategories.updatedAt,
      productCount: sql<number>`count(${marketingProducts.id})::int`,
    })
    .from(marketingCategories)
    .leftJoin(marketingProducts, eq(marketingProducts.categoryId, marketingCategories.id))
    .groupBy(marketingCategories.id)
    .orderBy(asc(marketingCategories.sortOrder));

  return rows;
}

export async function updateCategory(id: string, data: Partial<MarketingCategoryInsert>) {
  const [row] = await db
    .update(marketingCategories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(marketingCategories.id, id))
    .returning();
  return row;
}

// Borra la categoría; los productos quedan con categoryId NULL (FK onDelete: SET NULL)
export async function deleteCategory(id: string) {
  const [row] = await db.delete(marketingCategories).where(eq(marketingCategories.id, id)).returning();
  return row;
}
