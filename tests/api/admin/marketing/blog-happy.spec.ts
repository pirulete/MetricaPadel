/**
 * Happy-path CRUD de blog admin (SQL real contra NeonDB).
 * Cubre: crear post → listar → leer → actualizar → publicar → eliminar,
 * 409 slug duplicado y auditoría en audit_logs.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  cleanupMarketing, createAdminContext, createUser, deleteUserByEmail, getPool, uuid,
} from "./helpers";

const ADMIN_EMAIL = `admin-blog-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const PREFIX = `blog-happy-${Date.now()}-`;

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Admin marketing blog — happy-path", () => {
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

  test("CRUD completo de post", async () => {
    // Crear
    const create = await ctx.post("/api/admin/marketing/blog", {
      data: {
        slug: `${PREFIX}hello`,
        title: "Hello world",
        excerpt: "Primer post",
        content: [
          { type: "heading", text: "Bienvenida" },
          { type: "paragraph", text: "Contenido del post." },
          { type: "list", items: ["a", "b"] },
        ],
        status: "draft",
      },
    });
    expect(create.status()).toBe(201);
    const { post } = await create.json();
    expect(post.slug).toBe(`${PREFIX}hello`);
    expect(post.content).toHaveLength(3);

    // Listar
    const list = await ctx.get("/api/admin/marketing/blog");
    expect(list.status()).toBe(200);
    const { posts } = await list.json();
    expect(posts.find((p: { id: string }) => p.id === post.id)).toBeTruthy();

    // Leer
    const get = await ctx.get(`/api/admin/marketing/blog/${post.id}`);
    expect(get.status()).toBe(200);
    expect((await get.json()).post.id).toBe(post.id);

    // Actualizar + publicar
    const patch = await ctx.patch(`/api/admin/marketing/blog/${post.id}`, {
      data: { title: "Hello world v2", status: "published", publishedAt: new Date().toISOString() },
    });
    expect(patch.status()).toBe(200);
    const updated = await patch.json();
    expect(updated.post.status).toBe("published");
    expect(updated.post.publishedAt).toBeTruthy();

    // Slug duplicado → 409
    const dup = await ctx.post("/api/admin/marketing/blog", {
      data: { slug: `${PREFIX}hello`, title: "Dup", content: [] },
    });
    expect(dup.status()).toBe(409);

    // Auditoría
    const pool = getPool();
    const audit = await pool.query(
      `SELECT action_type FROM audit_logs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 3`,
      [post.id]
    );
    expect(audit.rows.map((r) => r.action_type)).toContain("CREATE");

    // Eliminar
    const del = await ctx.delete(`/api/admin/marketing/blog/${post.id}`);
    expect(del.status()).toBe(200);
    const getGone = await ctx.get(`/api/admin/marketing/blog/${post.id}`);
    expect(getGone.status()).toBe(404);
  });

  test("content inválido (bloque desconocido) → 400", async () => {
    const res = await ctx.post("/api/admin/marketing/blog", {
      data: { slug: `${PREFIX}bad`, title: "Bad", content: [{ type: "unknown", text: "x" }] },
    });
    expect(res.status()).toBe(400);
  });

  test("404 al operar sobre post inexistente", async () => {
    const id = await uuid();
    const get = await ctx.get(`/api/admin/marketing/blog/${id}`);
    expect(get.status()).toBe(404);
    const del = await ctx.delete(`/api/admin/marketing/blog/${id}`);
    expect(del.status()).toBe(404);
  });
});
