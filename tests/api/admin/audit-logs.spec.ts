/**
 * API tests de GET /api/admin/audit-logs — happy-path con SQL real + guards 401/403.
 * Verifica paginación + filtros actionType/userId + usuario asociado.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
  getPool,
} from "../admin/marketing/helpers";

const SUPER_ADMIN_EMAIL = `padel-audit-sa-${Date.now()}@test.local`;
const ADMIN_EMAIL = `padel-audit-admin-${Date.now()}@test.local`;
const PASSWORD = "TestPass123!";

let serverProbe: Promise<boolean> | null = null;

function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/providers`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Audit logs — guards 401/403", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("401 sin sesión", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/admin/audit-logs`)).status()).toBe(401);
  });

  test("403 para ADMIN", async () => {
    test.skip(!HAS_DB, "Requiere DATABASE_URL");
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: PASSWORD });
    const ctx = await createAuthedContext(ADMIN_EMAIL, PASSWORD);
    try {
      expect((await ctx.get("/api/admin/audit-logs")).status()).toBe(403);
    } finally {
      await ctx.dispose();
      await deleteUserByEmail(ADMIN_EMAIL);
    }
  });
});

test.describe("Audit logs — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "SUPER_ADMIN", email: SUPER_ADMIN_EMAIL, password: PASSWORD });
  });

  test.afterAll(async () => {
    await deleteUserByEmail(SUPER_ADMIN_EMAIL);
  });

  test("GET lista logs paginados con usuario asociado + filtros", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, PASSWORD);
    const pool = getPool();
    try {
      // Inserta un log de prueba con el SUPER_ADMIN como actor
      const { rows: saRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [SUPER_ADMIN_EMAIL]);
      const saId = saRows[0].id as string;
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action_type, entity_name, entity_id, new_values, metadata, created_at)
         VALUES (gen_random_uuid(), $1, 'SUPER_ADMIN_ACTION', 'platform', 'test', '{"role":"ADMIN"}'::json, '{"superAdmin":true}'::json, now())`,
        [saId]
      );

      // Listado paginado
      const res = await ctx.get("/api/admin/audit-logs?page=1&pageSize=10");
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.logs)).toBe(true);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(10);
      expect(body.pagination.total).toBeGreaterThanOrEqual(1);

      // Filtro por actionType
      const byAction = await ctx.get("/api/admin/audit-logs?actionType=SUPER_ADMIN_ACTION");
      expect(byAction.status()).toBe(200);
      const actionBody = await byAction.json();
      expect(actionBody.logs.length).toBeGreaterThanOrEqual(1);
      expect(actionBody.logs.every((l: { actionType: string }) => l.actionType === "SUPER_ADMIN_ACTION")).toBe(true);

      // Filtro por userId + usuario asociado (userEmail)
      const byUser = await ctx.get(`/api/admin/audit-logs?userId=${saId}`);
      expect(byUser.status()).toBe(200);
      const userBody = await byUser.json();
      expect(userBody.logs.length).toBeGreaterThanOrEqual(1);
      expect(userBody.logs.every((l: { userId: string }) => l.userId === saId)).toBe(true);
      expect(userBody.logs[0].userEmail).toBe(SUPER_ADMIN_EMAIL);

      // userId inválido → 400
      const bad = await ctx.get("/api/admin/audit-logs?userId=not-a-uuid");
      expect(bad.status()).toBe(400);

      // pageSize > 100 → 400
      const tooBig = await ctx.get("/api/admin/audit-logs?pageSize=200");
      expect(tooBig.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });
});