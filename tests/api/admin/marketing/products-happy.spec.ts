/**
 * Happy-path CRUD de productos + categorías admin (SQL real contra NeonDB).
 * Cubre: crear categoría → crear producto con categoría → listar con categoryName
 * → actualizar → publicar → borrar categoría (FK SET NULL) → eliminar producto.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  cleanupMarketing, createAdminContext, createUser, deleteUserByEmail, getPool, uuid,
} from "./helpers";

const ADMIN_EMAIL = `admin-products-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const PREFIX = `products-happy-${Date.now()}-`;

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Admin marketing products + categories — happy-path", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  let ctx: Awaited<ReturnType<typeof createAdminContext>>;

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    ctx = await createAdminContext(ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test.afterAll(async () => {
    await ctx.dispose();
    await cleanupMarketing(PREFIX);
    await deleteUserByEmail(ADMIN_EMAIL);
  });

  test("CRUD de categorías", async () => {
    const create = await ctx.post("/api/admin/marketing/categories", {
      data: { slug: `${PREFIX}cat`, name: "Gadgets", sortOrder: 1 },
    });
    expect(create.status()).toBe(201);
    const { category } = await create.json();

    const list = await ctx.get("/api/admin/marketing/categories");
    expect(list.status()).toBe(200);
    const { categories } = await list.json();
    const found = categories.find((c: { id: string }) => c.id === category.id);
    expect(found).toBeTruthy();
    expect(found.productCount).toBe(0);

    // Slug duplicado → 409
    const dup = await ctx.post("/api/admin/marketing/categories", {
      data: { slug: `${PREFIX}cat`, name: "Dup" },
    });
    expect(dup.status()).toBe(409);

    // Actualizar
    const patch = await ctx.patch(`/api/admin/marketing/categories/${category.id}`, { data: { name: "Gadgets Pro" } });
    expect(patch.status()).toBe(200);
    expect((await patch.json()).category.name).toBe("Gadgets Pro");

    await ctx.delete(`/api/admin/marketing/categories/${category.id}`);
  });

  test("CRUD de producto con categoría + FK SET NULL al borrar categoría", async () => {
    // Categoría
    const catRes = await ctx.post("/api/admin/marketing/categories", {
      data: { slug: `${PREFIX}devices`, name: "Devices" },
    });
    const { category } = await catRes.json();

    // Producto con categoría
    const create = await ctx.post("/api/admin/marketing/products", {
      data: {
        slug: `${PREFIX}phone`,
        name: "Phone X",
        description: "Un teléfono",
        price: "499.99",
        compareAtPrice: "599.99",
        images: ["https://example.com/phone.jpg"],
        categoryId: category.id,
        status: "published",
        sortOrder: 0,
      },
    });
    expect(create.status()).toBe(201);
    const { product } = await create.json();
    expect(product.price).toBe("499.99");

    // Listar con categoryName
    const list = await ctx.get("/api/admin/marketing/products");
    const { products } = await list.json();
    const listed = products.find((p: { id: string }) => p.id === product.id);
    expect(listed.categoryName).toBe("Devices");
    expect(listed.categorySlug).toBe(`${PREFIX}devices`);

    // Slug duplicado → 409
    const dup = await ctx.post("/api/admin/marketing/products", {
      data: { slug: `${PREFIX}phone`, name: "Dup", price: "1.00" },
    });
    expect(dup.status()).toBe(409);

    // Categoría inexistente → 400
    const badCat = await ctx.post("/api/admin/marketing/products", {
      data: { slug: `${PREFIX}orphan`, name: "Orphan", price: "1.00", categoryId: await uuid() },
    });
    expect(badCat.status()).toBe(400);

    // Actualizar producto
    const patch = await ctx.patch(`/api/admin/marketing/products/${product.id}`, {
      data: { name: "Phone X Pro", price: "549.99" },
    });
    expect(patch.status()).toBe(200);
    expect((await patch.json()).product.price).toBe("549.99");

    // Auditoría
    const pool = getPool();
    const audit = await pool.query(
      `SELECT action_type FROM audit_logs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 3`,
      [product.id]
    );
    expect(audit.rows.map((r) => r.action_type)).toContain("CREATE");

    // Borrar categoría → producto queda sin categoría (SET NULL, sin 500)
    const delCat = await ctx.delete(`/api/admin/marketing/categories/${category.id}`);
    expect(delCat.status()).toBe(200);

    const after = await ctx.get(`/api/admin/marketing/products/${product.id}`);
    expect(after.status()).toBe(200);
    expect((await after.json()).product.categoryId).toBeNull();

    // Eliminar producto
    const del = await ctx.delete(`/api/admin/marketing/products/${product.id}`);
    expect(del.status()).toBe(200);
    const getGone = await ctx.get(`/api/admin/marketing/products/${product.id}`);
    expect(getGone.status()).toBe(404);
  });

  test("404 al operar sobre producto inexistente", async () => {
    const id = await uuid();
    const get = await ctx.get(`/api/admin/marketing/products/${id}`);
    expect(get.status()).toBe(404);
    const del = await ctx.delete(`/api/admin/marketing/products/${id}`);
    expect(del.status()).toBe(404);
  });
});
