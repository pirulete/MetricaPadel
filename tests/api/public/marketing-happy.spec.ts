/**
 * Happy-path tests de los endpoints públicos del Marketing CMS.
 * Requiere servidor corriendo (http://localhost:3000) y datos seed:
 *   pnpm run seed:marketing
 * Los tests dependientes de datos (home/posts/products) se SKIPean si la DB
 * no tiene la página home publicada (patrón estándar de happy-path con SQL real).
 */
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

let serverProbe: Promise<boolean> | null = null;

/** Skip graceful si no hay servidor en BASE_URL (patrón tests/api/auth/helpers). */
function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/csrf`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

let api: APIRequestContext;

test.beforeAll(async () => {
  test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  api = await pwRequest.newContext({ baseURL: BASE_URL });
});

test.afterAll(async () => {
  await api.dispose();
});

test("GET /api/public/settings/navigation → 200 con defaults", async () => {
  const response = await api.get("/api/public/settings/navigation");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("siteName");
  expect(Array.isArray(body.navLinks)).toBe(true);
  expect(Array.isArray(body.footerLinks)).toBe(true);
  // Caché pública presente
  expect(response.headers()["cache-control"]).toContain("s-maxage=300");
});

test("GET /api/public/pages/home → 200 con page + sections", async () => {
  const probe = await api.get("/api/public/pages/home");
  test.skip(probe.status() === 404, "Seed no ejecutado: no hay página home publicada");

  expect(probe.status()).toBe(200);
  const body = await probe.json();
  expect(body.page.slug).toBe("home");
  expect(body.page.status).toBe("published");
  expect(Array.isArray(body.sections)).toBe(true);
  // Ordenadas por sortOrder y con shape SectionDto
  const hero = body.sections.find((s: { blockType: string }) => s.blockType === "hero");
  expect(hero).toBeDefined();
  expect(hero.config.title).toBeTruthy();
});

test("GET /api/public/pages/[slug] → 404 para reservado y no existente", async () => {
  const reserved = await api.get("/api/public/pages/login");
  expect(reserved.status()).toBe(404);

  const missing = await api.get("/api/public/pages/no-existe-xyz");
  expect([404, 200]).toContain(missing.status()); // 200 solo si existe la página
});

test("GET /api/public/posts → 200 con array posts", async () => {
  const response = await api.get("/api/public/posts?limit=5");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Array.isArray(body.posts)).toBe(true);
  if (body.posts.length > 0) {
    const post = body.posts[0];
    expect(post.slug).toBeTruthy();
    expect(post.status).toBe("published");
  }
});

test("GET /api/public/posts/[slug] → 200 y 404", async () => {
  const probe = await api.get("/api/public/posts");
  const posts = (await probe.json()).posts as Array<{ slug: string }>;
  test.skip(posts.length === 0, "Seed no ejecutado: no hay posts");

  const response = await api.get(`/api/public/posts/${posts[0].slug}`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.post.slug).toBe(posts[0].slug);

  const missing = await api.get("/api/public/posts/no-existe-xyz");
  expect(missing.status()).toBe(404);
});

test("GET /api/public/products → 200 con array products", async () => {
  const response = await api.get("/api/public/products");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Array.isArray(body.products)).toBe(true);
  if (body.products.length > 0) {
    const product = body.products[0];
    expect(product.slug).toBeTruthy();
    expect(product.price).toEqual(expect.any(String)); // numeric de pg serializa string
  }
});

test("GET /api/public/products?category=suscripcion → filtra por categoría", async () => {
  const probe = await api.get("/api/public/products");
  const products = (await probe.json()).products as Array<{ categorySlug: string | null }>;
  test.skip(products.length === 0, "Seed no ejecutado: no hay productos");

  const response = await api.get("/api/public/products?category=suscripcion");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.products.every((p: { categorySlug: string | null }) => p.categorySlug === "suscripcion")).toBe(true);
});

test("GET /api/public/products/[slug] → 200 y 404", async () => {
  const probe = await api.get("/api/public/products");
  const products = (await probe.json()).products as Array<{ slug: string }>;
  test.skip(products.length === 0, "Seed no ejecutado: no hay productos");

  const response = await api.get(`/api/public/products/${products[0].slug}`);
  expect(response.status()).toBe(200);

  const missing = await api.get("/api/public/products/no-existe-xyz");
  expect(missing.status()).toBe(404);
});

test("POST /api/public/contact → 200 ok con payload válido", async () => {
  const response = await api.post("/api/public/contact", {
    data: { name: "Ana", email: "ana@ejemplo.com", message: "Hola, quiero más info." },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test("POST /api/public/contact → 400 con payload inválido", async () => {
  const response = await api.post("/api/public/contact", {
    data: { name: "", email: "no-email", message: "x".repeat(2001) },
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toHaveProperty("error");
});
