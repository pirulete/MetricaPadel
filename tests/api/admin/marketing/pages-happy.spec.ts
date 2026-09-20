/**
 * Happy-path CRUD de páginas admin (SQL real contra NeonDB).
 * Cubre: crear → listar → leer con secciones → actualizar → publicar → reorder
 * → home guard → eliminar. Verifica auditoría en audit_logs.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  cleanupMarketing, createAdminContext, createUser, deleteUserByEmail, getPool, uuid,
} from "./helpers";

const ADMIN_EMAIL = `admin-pages-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const PREFIX = `pages-happy-${Date.now()}-`;
const HOME_SLUG = `${PREFIX}home`;

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Admin marketing pages — happy-path", () => {
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

  test("CRUD completo: crear, listar, leer, actualizar, publicar y eliminar", async () => {
    // Crear página
    const create = await ctx.post("/api/admin/marketing/pages", {
      data: { slug: `${PREFIX}about`, title: "About us", seoTitle: "About", status: "draft" },
    });
    expect(create.status()).toBe(201);
    const { page } = await create.json();
    expect(page.slug).toBe(`${PREFIX}about`);

    // Listar (incluye sectionCount)
    const list = await ctx.get("/api/admin/marketing/pages");
    expect(list.status()).toBe(200);
    const { pages } = await list.json();
    const found = pages.find((p: { id: string }) => p.id === page.id);
    expect(found).toBeTruthy();
    expect(found.sectionCount).toBe(0);

    // Leer con secciones (vacías)
    const get = await ctx.get(`/api/admin/marketing/pages/${page.id}`);
    expect(get.status()).toBe(200);
    const detail = await get.json();
    expect(detail.sections).toEqual([]);

    // Agregar sección hero (config válida)
    const addSection = await ctx.post(`/api/admin/marketing/pages/${page.id}/sections`, {
      data: { blockType: "hero", config: { title: "Hola mundo", subtitle: "Bienvenido", ctas: [] } },
    });
    expect(addSection.status()).toBe(201);
    const { section } = await addSection.json();
    expect(section.blockType).toBe("hero");

    // Config inválida → 400
    const badSection = await ctx.post(`/api/admin/marketing/pages/${page.id}/sections`, {
      data: { blockType: "hero", config: { ctas: [] } },
    });
    expect(badSection.status()).toBe(400);

    // Actualizar página (publicar)
    const patch = await ctx.patch(`/api/admin/marketing/pages/${page.id}`, {
      data: { title: "About updated", status: "published" },
    });
    expect(patch.status()).toBe(200);
    const updated = await patch.json();
    expect(updated.page.status).toBe("published");

    // Slug duplicado → 409
    const dup = await ctx.post("/api/admin/marketing/pages", {
      data: { slug: `${PREFIX}about`, title: "Dup" },
    });
    expect(dup.status()).toBe(409);

    // Slug reservado → 400
    const reserved = await ctx.post("/api/admin/marketing/pages", {
      data: { slug: "admin", title: "Reserved" },
    });
    expect(reserved.status()).toBe(400);

    // Reorder de secciones
    const reorder = await ctx.put(`/api/admin/marketing/pages/${page.id}/sections`, {
      data: { sectionIds: [section.id] },
    });
    expect(reorder.status()).toBe(200);
    const reordered = await reorder.json();
    expect(reordered.sections[0].id).toBe(section.id);

    // Auditoría registrada (marketing_page CREATE + marketing_section CREATE)
    const pool = getPool();
    const audit = await pool.query(
      `SELECT action_type, entity_name FROM audit_logs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [page.id]
    );
    const types = audit.rows.map((r) => `${r.action_type}:${r.entity_name}`);
    expect(types).toContain("CREATE:marketing_page");

    // Eliminar
    const del = await ctx.delete(`/api/admin/marketing/pages/${page.id}`);
    expect(del.status()).toBe(200);
    const getGone = await ctx.get(`/api/admin/marketing/pages/${page.id}`);
    expect(getGone.status()).toBe(404);
  });

  test("home guard: no eliminar la única página publicada home", async () => {
    const create = await ctx.post("/api/admin/marketing/pages", {
      data: { slug: HOME_SLUG, title: "Home", status: "published" },
    });
    expect(create.status()).toBe(201);
    const { page } = await create.json();

    const del = await ctx.delete(`/api/admin/marketing/pages/${page.id}`);
    expect(del.status()).toBe(400);

    // Renombrar home → 400 si es la única publicada
    const patch = await ctx.patch(`/api/admin/marketing/pages/${page.id}`, {
      data: { slug: `${PREFIX}other` },
    });
    expect(patch.status()).toBe(400);
  });

  test("404 al operar sobre página inexistente", async () => {
    const id = await uuid();
    const get = await ctx.get(`/api/admin/marketing/pages/${id}`);
    expect(get.status()).toBe(404);
    const patch = await ctx.patch(`/api/admin/marketing/pages/${id}`, { data: { title: "x" } });
    expect(patch.status()).toBe(404);
    const del = await ctx.delete(`/api/admin/marketing/pages/${id}`);
    expect(del.status()).toBe(404);
  });

  test("revalidate manual con tags whitelist", async () => {
    const res = await ctx.post("/api/admin/marketing/revalidate", { data: { tags: ["pages:home", "posts"] } });
    expect(res.status()).toBe(200);
    const { revalidated } = await res.json();
    expect(revalidated).toEqual(["pages:home", "posts"]);

    const bad = await ctx.post("/api/admin/marketing/revalidate", { data: { tags: ["evil:tag"] } });
    expect(bad.status()).toBe(400);
  });
});
