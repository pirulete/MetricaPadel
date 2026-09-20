/**
 * Guard tests de la API admin del Marketing CMS.
 * 401: sin sesión. 403: sesión USER (no ADMIN).
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL, createAuthedContext, createUser, deleteUserByEmail,
} from "./helpers";

const USER_EMAIL = `guard-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";
const ANY_ID = "00000000-0000-0000-0000-000000000000";

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

const ENDPOINTS: Array<{ method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; url: string; body?: unknown }> = [
  { method: "GET", url: "/api/admin/marketing/pages" },
  { method: "POST", url: "/api/admin/marketing/pages", body: { slug: "x", title: "x" } },
  { method: "GET", url: `/api/admin/marketing/pages/${ANY_ID}` },
  { method: "PATCH", url: `/api/admin/marketing/pages/${ANY_ID}`, body: { title: "x" } },
  { method: "DELETE", url: `/api/admin/marketing/pages/${ANY_ID}` },
  { method: "POST", url: `/api/admin/marketing/pages/${ANY_ID}/sections`, body: { blockType: "hero", config: { title: "Hola" } } },
  { method: "PUT", url: `/api/admin/marketing/pages/${ANY_ID}/sections`, body: { sectionIds: [ANY_ID] } },
  { method: "PATCH", url: `/api/admin/marketing/pages/${ANY_ID}/sections/${ANY_ID}`, body: { config: {} } },
  { method: "DELETE", url: `/api/admin/marketing/pages/${ANY_ID}/sections/${ANY_ID}` },
  { method: "GET", url: "/api/admin/marketing/blog" },
  { method: "POST", url: "/api/admin/marketing/blog", body: { slug: "x", title: "x", content: [] } },
  { method: "GET", url: `/api/admin/marketing/blog/${ANY_ID}` },
  { method: "PATCH", url: `/api/admin/marketing/blog/${ANY_ID}`, body: { title: "x" } },
  { method: "DELETE", url: `/api/admin/marketing/blog/${ANY_ID}` },
  { method: "GET", url: "/api/admin/marketing/products" },
  { method: "POST", url: "/api/admin/marketing/products", body: { slug: "x", name: "x", price: "1.00" } },
  { method: "GET", url: `/api/admin/marketing/products/${ANY_ID}` },
  { method: "PATCH", url: `/api/admin/marketing/products/${ANY_ID}`, body: { name: "x" } },
  { method: "DELETE", url: `/api/admin/marketing/products/${ANY_ID}` },
  { method: "GET", url: "/api/admin/marketing/categories" },
  { method: "POST", url: "/api/admin/marketing/categories", body: { slug: "x", name: "x" } },
  { method: "GET", url: `/api/admin/marketing/categories/${ANY_ID}` },
  { method: "PATCH", url: `/api/admin/marketing/categories/${ANY_ID}`, body: { name: "x" } },
  { method: "DELETE", url: `/api/admin/marketing/categories/${ANY_ID}` },
  { method: "GET", url: "/api/admin/marketing/settings" },
  { method: "PATCH", url: "/api/admin/marketing/settings", body: { settings: { siteName: "x" } } },
  { method: "POST", url: "/api/admin/marketing/revalidate", body: { all: true } },
];

test.describe("Guard admin marketing — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  for (const ep of ENDPOINTS) {
    test(`${ep.method} ${ep.url} → 401`, async ({ request }) => {
      const res = await request.fetch(`${BASE_URL}${ep.url}`, {
        method: ep.method,
        data: ep.body,
        headers: ep.body ? { "Content-Type": "application/json" } : undefined,
      });
      expect(res.status()).toBe(401);
    });
  }
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Guard admin marketing — 403 con sesión USER", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL para crear sesión USER (SQL real)", () => {});
  } else {
    test.beforeEach(async () => {
      test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    });

    test.beforeAll(async () => {
      await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
    });

    test.afterAll(async () => {
      await deleteUserByEmail(USER_EMAIL);
    });

    for (const ep of ENDPOINTS) {
      test(`${ep.method} ${ep.url} → 403`, async () => {
        const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
        try {
          const res = await ctx.fetch(ep.url, {
            method: ep.method,
            data: ep.body,
            headers: ep.body ? { "Content-Type": "application/json" } : undefined,
          });
          expect(res.status()).toBe(403);
        } finally {
          await ctx.dispose();
        }
      });
    }
  }
});
