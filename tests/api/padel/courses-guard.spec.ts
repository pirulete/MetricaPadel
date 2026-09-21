/**
 * API tests de guards de Cursos/Dashboard/Historial (Etapa 2+3).
 * 401 sin sesión (sin DB); 403 de rol con SQL real (skip graceful).
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-courses-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-courses-user-${Date.now()}@test.local`;
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

test.describe("Cursos — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("GET /api/courses → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/courses`)).status()).toBe(401);
  });

  test("POST /api/courses → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/courses`, {
      data: { name: "X", level: "iniciacion" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/courses/[id] → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/courses/${UUID}`)).status()).toBe(401);
  });

  test("PUT /api/courses/[id] → 401", async ({ request }) => {
    expect((await request.put(`${BASE_URL}/api/courses/${UUID}`)).status()).toBe(401);
  });

  test("DELETE /api/courses/[id] → 401", async ({ request }) => {
    expect((await request.delete(`${BASE_URL}/api/courses/${UUID}`)).status()).toBe(401);
  });

  test("POST /api/courses/join → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/courses/join`, {
      data: { inviteCode: "PAD-AB12" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/courses/[id]/rubrics → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/courses/${UUID}/rubrics`)).status()).toBe(401);
  });

  test("POST /api/courses/[id]/rubrics → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/courses/${UUID}/rubrics`, {
      data: { rubricId: UUID },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/dashboard/teacher → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/dashboard/teacher`)).status()).toBe(401);
  });

  test("GET /api/dashboard/student → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/dashboard/student`)).status()).toBe(401);
  });

  test("GET /api/history → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/history`)).status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Cursos — 403 de rol (SQL real)", () => {
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
      expect((await ctx.get("/api/courses")).status()).toBe(403);
      expect((await ctx.get(`/api/courses/${UUID}`)).status()).toBe(403);
      expect((await ctx.get("/api/dashboard/teacher")).status()).toBe(403);
      expect((await ctx.get("/api/history")).status()).toBe(403);
      const post = await ctx.post("/api/courses", {
        data: { name: "X", level: "iniciacion" },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("ADMIN en endpoints alumno → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      expect((await ctx.get("/api/dashboard/student")).status()).toBe(403);
      const join = await ctx.post("/api/courses/join", {
        data: { inviteCode: "PAD-AB12" },
        headers: { "Content-Type": "application/json" },
      });
      expect(join.status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });
});