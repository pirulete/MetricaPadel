import { db } from "@/lib/db";
import { asc, eq, sql } from "drizzle-orm";
import { marketingCategories, marketingProducts } from "@/lib/db/schema";

export type MarketingProductInsert = typeof marketingProducts.$inferInsert;
export type MarketingProduct = typeof marketingProducts.$inferSelect;

// Producto con nombre de categoría (left join; categoría puede ser null tras SET NULL)
export type ProductWithCategory = MarketingProduct & {
  categoryName: string | null;
  categorySlug: string | null;
};

// Fila devuelta por db.select(productSelect) — price es string (numeric de pg)
type ProductRow = Omit<MarketingProduct, "categoryId" | "images"> & {
  categoryId: string | null;
  images: unknown;
  categoryName: string | null;
  categorySlug: string | null;
};

const productSelect = {
  id: marketingProducts.id,
  slug: marketingProducts.slug,
  name: marketingProducts.name,
  description: marketingProducts.description,
  price: marketingProducts.price,
  compareAtPrice: marketingProducts.compareAtPrice,
  images: marketingProducts.images,
  categoryId: marketingProducts.categoryId,
  status: marketingProducts.status,
  sortOrder: marketingProducts.sortOrder,
  createdAt: marketingProducts.createdAt,
  updatedAt: marketingProducts.updatedAt,
  categoryName: marketingCategories.name,
  categorySlug: marketingCategories.slug,
};

function mapProduct(row: ProductRow): ProductWithCategory {
  return {
    ...row,
    categoryName: row.categoryName ?? null,
    categorySlug: row.categorySlug ?? null,
  };
}

export async function createProduct(data: MarketingProductInsert) {
  const [row] = await db.insert(marketingProducts).values(data).returning();
  return row;
}

export async function getProductById(id: string) {
  const [row] = await db
    .select(productSelect)
    .from(marketingProducts)
    .leftJoin(marketingCategories, eq(marketingCategories.id, marketingProducts.categoryId))
    .where(eq(marketingProducts.id, id));
  return row ? mapProduct(row) : null;
}

export async function getProductBySlug(slug: string) {
  const [row] = await db
    .select(productSelect)
    .from(marketingProducts)
    .leftJoin(marketingCategories, eq(marketingCategories.id, marketingProducts.categoryId))
    .where(eq(marketingProducts.slug, slug));
  return row ? mapProduct(row) : null;
}

// Todos los productos (admin), con nombre de categoría
export async function listProducts() {
  const rows = await db
    .select(productSelect)
    .from(marketingProducts)
    .leftJoin(marketingCategories, eq(marketingCategories.id, marketingProducts.categoryId))
    .orderBy(asc(marketingProducts.sortOrder));
  return rows.map(mapProduct);
}

export async function listProductsByCategory(categoryId: string) {
  const rows = await db
    .select(productSelect)
    .from(marketingProducts)
    .leftJoin(marketingCategories, eq(marketingCategories.id, marketingProducts.categoryId))
    .where(eq(marketingProducts.categoryId, categoryId))
    .orderBy(asc(marketingProducts.sortOrder));
  return rows.map(mapProduct);
}

// Solo publicados (público); opcional filtrar por slug de categoría
export async function getPublishedProducts(opts: { categorySlug?: string } = {}) {
  const rows = await db
    .select(productSelect)
    .from(marketingProducts)
    .leftJoin(marketingCategories, eq(marketingCategories.id, marketingProducts.categoryId))
    .where(
      opts.categorySlug
        ? sql`${marketingProducts.status} = 'published' AND ${marketingCategories.slug} = ${opts.categorySlug}`
        : eq(marketingProducts.status, 'published')
    )
    .orderBy(asc(marketingProducts.sortOrder));
  return rows.map(mapProduct);
}

export async function updateProduct(id: string, data: Partial<MarketingProductInsert>) {
  const [row] = await db
    .update(marketingProducts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(marketingProducts.id, id))
    .returning();
  return row;
}

export async function deleteProduct(id: string) {
  const [row] = await db.delete(marketingProducts).where(eq(marketingProducts.id, id)).returning();
  return row;
}
