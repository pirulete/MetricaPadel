/**
 * API tests de guards de gestión de alumnos por curso (G12).
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

const ADMIN_EMAIL = `padel-students-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-students-user-${Date.now()}@test.local`;
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

test.describe("Course students — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("POST /api/courses/[id]/students → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/courses/${UUID}/students`, {
      data: { studentId: UUID },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/courses/[id]/students/[studentId] → 401", async ({ request }) => {
    expect((await request.delete(`${BASE_URL}/api/courses/${UUID}/students/${UUID}`)).status()).toBe(401);
  });

  test("GET /api/courses/[id]/students/search → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/courses/${UUID}/students/search?q=test`)).status()).toBe(401);
  });

  test("GET /api/student/evolution → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/student/evolution`)).status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Course students — 403 de rol (SQL real)", () => {
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
      const add = await ctx.post(`/api/courses/${UUID}/students`, {
        data: { studentId: UUID },
        headers: { "Content-Type": "application/json" },
      });
      expect(add.status()).toBe(403);
      expect((await ctx.delete(`/api/courses/${UUID}/students/${UUID}`)).status()).toBe(403);
      expect((await ctx.get(`/api/courses/${UUID}/students/search?q=test`)).status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("ADMIN en endpoint alumno (evolution) → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      expect((await ctx.get("/api/student/evolution")).status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });
});