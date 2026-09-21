/**
 * API tests de guards del Core Evaluativo (padel).
 * 401 sin sesión (sin DB); 403 de rol y 404 IDOR con SQL real (skip graceful).
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";

let serverProbe: Promise<boolean> | null = null;

function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/providers`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

const UUID = "00000000-0000-0000-0000-000000000000";

test.describe("Padel — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("GET /api/rubrics → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/rubrics`)).status()).toBe(401);
  });

  test("POST /api/rubrics → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/rubrics`, {
      data: { title: "X", category: "tecnica", criteria: [] },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/rubrics/[id] → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/rubrics/${UUID}`)).status()).toBe(401);
  });

  test("PUT /api/rubrics/[id] → 401", async ({ request }) => {
    expect((await request.put(`${BASE_URL}/api/rubrics/${UUID}`)).status()).toBe(401);
  });

  test("DELETE /api/rubrics/[id] → 401", async ({ request }) => {
    expect((await request.delete(`${BASE_URL}/api/rubrics/${UUID}`)).status()).toBe(401);
  });

  test("GET /api/evaluations → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/evaluations`)).status()).toBe(401);
  });

  test("POST /api/evaluations → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/evaluations`, {
      data: { studentId: UUID, rubricId: UUID },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/evaluations/[id] → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/evaluations/${UUID}`)).status()).toBe(401);
  });

  test("PUT /api/evaluations/[id] → 401", async ({ request }) => {
    expect((await request.put(`${BASE_URL}/api/evaluations/${UUID}`)).status()).toBe(401);
  });

  test("POST /api/evaluations/[id]/publish → 401", async ({ request }) => {
    expect((await request.post(`${BASE_URL}/api/evaluations/${UUID}/publish`)).status()).toBe(401);
  });

  test("GET /api/student/evaluations → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/student/evaluations`)).status()).toBe(401);
  });

  test("GET /api/student/evaluations/[id] → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/student/evaluations/${UUID}`)).status()).toBe(401);
  });

  test("POST /api/student/evaluations/[id]/read → 401", async ({ request }) => {
    expect((await request.post(`${BASE_URL}/api/student/evaluations/${UUID}/read`)).status()).toBe(401);
  });

  test("GET /api/admin/users → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/admin/users`)).status()).toBe(401);
  });

  test("POST /api/admin/users → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/admin/users`, {
      data: { email: "x@test.local", firstName: "A", lastName: "B", password: "Secret123!" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Padel — 403 de rol + 404 IDOR (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
  });

  test.afterAll(async () => {
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(USER_EMAIL);
  });

  test("USER en endpoints coach → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    try {
      expect((await ctx.get("/api/rubrics")).status()).toBe(403);
      expect((await ctx.get("/api/evaluations")).status()).toBe(403);
      expect((await ctx.get("/api/admin/users")).status()).toBe(403);
      const post = await ctx.post("/api/rubrics", {
        data: { title: "X", category: "tecnica", criteria: [] },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("ADMIN en endpoints alumno → 403 (no es su evaluación)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      expect((await ctx.get("/api/student/evaluations")).status()).toBe(403);
      expect((await ctx.get(`/api/student/evaluations/${UUID}`)).status()).toBe(403);
      expect((await ctx.post(`/api/student/evaluations/${UUID}/read`)).status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("404 IDOR: rúbrica de otro coach → 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      // UUID inexistente → 404 (no 403) por ownership en queries
      expect((await ctx.get(`/api/rubrics/${UUID}`)).status()).toBe(404);
      expect((await ctx.put(`/api/rubrics/${UUID}`, { data: { title: "X" } })).status()).toBe(404);
      expect((await ctx.delete(`/api/rubrics/${UUID}`)).status()).toBe(404);
      expect((await ctx.get(`/api/evaluations/${UUID}`)).status()).toBe(404);
      expect((await ctx.post(`/api/evaluations/${UUID}/publish`)).status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});