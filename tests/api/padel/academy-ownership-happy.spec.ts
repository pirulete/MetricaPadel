/**
 * Happy-path API tests de ownership SUPER_ADMIN (v0.9) con SQL real.
 * POST /api/academies (SA + ownerId), transfer-ownership, role assign (PUT),
 * restore.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const COACH_EMAIL = `own-coach-${Date.now()}@test.local`;
const COACH_PASSWORD = "TestPass123!";
const COACH2_EMAIL = `own-coach2-${Date.now()}@test.local`;
const COACH2_PASSWORD = "TestPass123!";
const SUPER_ADMIN_EMAIL = `own-sa-${Date.now()}@test.local`;
const SUPER_ADMIN_PASSWORD = "TestPass123!";

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

test.describe("Academy ownership — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: COACH_EMAIL, password: COACH_PASSWORD });
    await createUser({ role: "ADMIN", email: COACH2_EMAIL, password: COACH2_PASSWORD });
    await createUser({ role: "SUPER_ADMIN", email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1)))`,
      [[COACH_EMAIL, COACH2_EMAIL, SUPER_ADMIN_EMAIL]]
    );
    await pool.query(
      `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [[COACH_EMAIL, COACH2_EMAIL, SUPER_ADMIN_EMAIL]]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[COACH_EMAIL, COACH2_EMAIL, SUPER_ADMIN_EMAIL]]);
  });

  test("SA crea academia con ownerId → transfer → role assign → restore", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const saCtx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const pool = getPool();
    const slug = `own-academy-${Date.now()}`;
    try {
      const coachId = (
        await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH_EMAIL])
      ).rows[0].id as string;
      const coach2Id = (
        await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH2_EMAIL])
      ).rows[0].id as string;

      // SA crea academia con ownerId = coach
      const create = await saCtx.post("/api/academies", {
        data: { name: "Academia Ownership", slug, ownerId: coachId },
        headers: { "Content-Type": "application/json" },
      });
      expect(create.status()).toBe(201);
      const academyId = (await create.json()).academy.id;

      // Verificación SQL real: owner_id = coach
      const { rows: ownerRows } = await pool.query(
        `SELECT owner_id FROM academies WHERE id = $1`,
        [academyId]
      );
      expect(ownerRows[0].owner_id).toBe(coachId);

      // COACH2 se agrega como miembro activo vía SQL (evita rate limit de invite)
      await pool.query(
        `INSERT INTO academy_memberships (academy_id, user_id, role, status, created_at, updated_at)
         VALUES ($1, $2, 'COACH', 'active', now(), now())`,
        [academyId, coach2Id]
      );

      // SA transfiere ownership a COACH2
      const transfer = await saCtx.post(`/api/academies/${academyId}/transfer-ownership`, {
        data: { targetUserId: coach2Id },
        headers: { "Content-Type": "application/json" },
      });
      expect(transfer.status()).toBe(200);
      const transferBody = await transfer.json();
      expect(transferBody.newOwner.userId).toBe(coach2Id);
      expect(transferBody.newOwner.role).toBe("OWNER");
      expect(transferBody.previousOwner.userId).toBe(coachId);
      expect(transferBody.previousOwner.role).toBe("ADMIN");

      // Verificación SQL real: owner_id + roles
      const { rows: afterTransfer } = await pool.query(
        `SELECT owner_id FROM academies WHERE id = $1`,
        [academyId]
      );
      expect(afterTransfer[0].owner_id).toBe(coach2Id);
      const { rows: coachRole } = await pool.query(
        `SELECT role FROM academy_memberships WHERE academy_id = $1 AND user_id = $2`,
        [academyId, coachId]
      );
      expect(coachRole[0].role).toBe("ADMIN");

      // SA promueve a coach de vuelta a OWNER (ahora hay 2 OWNERS: coach + coach2)
      const promoteCoach = await saCtx.put(`/api/academies/${academyId}/members/${coachId}`, {
        data: { role: "OWNER" },
        headers: { "Content-Type": "application/json" },
      });
      expect(promoteCoach.status()).toBe(200);

      // SA asigna rol ADMIN a COACH2 (demote a ADMIN — hay otro OWNER activo)
      const assign = await saCtx.put(`/api/academies/${academyId}/members/${coach2Id}`, {
        data: { role: "ADMIN" },
        headers: { "Content-Type": "application/json" },
      });
      expect(assign.status()).toBe(200);
      const assignBody = await assign.json();
      expect(assignBody.membership.role).toBe("ADMIN");

      // SA re-asigna OWNER a COACH2 (solo SA puede)
      const assignOwner = await saCtx.put(`/api/academies/${academyId}/members/${coach2Id}`, {
        data: { role: "OWNER" },
        headers: { "Content-Type": "application/json" },
      });
      expect(assignOwner.status()).toBe(200);
      expect((await assignOwner.json()).membership.role).toBe("OWNER");

      // SA archiva y restaura
      const archive = await saCtx.delete(`/api/academies/${academyId}`);
      expect(archive.status()).toBe(200);
      const restore = await saCtx.post(`/api/academies/${academyId}/restore`);
      expect(restore.status()).toBe(200);
      const restoreBody = await restore.json();
      expect(restoreBody.academy.status).toBe("active");

      // Verificación SQL real: status active
      const { rows: statusRows } = await pool.query(
        `SELECT status FROM academies WHERE id = $1`,
        [academyId]
      );
      expect(statusRows[0].status).toBe("active");

      // Restaurar de nuevo → 400 (ya activa)
      const restoreAgain = await saCtx.post(`/api/academies/${academyId}/restore`);
      expect(restoreAgain.status()).toBe(400);
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1)))`,
        [[COACH_EMAIL, COACH2_EMAIL, SUPER_ADMIN_EMAIL]]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [[COACH_EMAIL, COACH2_EMAIL, SUPER_ADMIN_EMAIL]]
      );
    }
  });

  test("SA crea academia sin ownerId → default = session.user.id (SA es OWNER)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const saCtx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const pool = getPool();
    const slug = `own-default-${Date.now()}`;
    try {
      const create = await saCtx.post("/api/academies", {
        data: { name: "Academia Default", slug },
        headers: { "Content-Type": "application/json" },
      });
      expect(create.status()).toBe(201);
      const academyId = (await create.json()).academy.id;
      const saId = (
        await pool.query(`SELECT id FROM users WHERE email = $1`, [SUPER_ADMIN_EMAIL])
      ).rows[0].id as string;

      const { rows: ownerRows } = await pool.query(
        `SELECT owner_id FROM academies WHERE id = $1`,
        [academyId]
      );
      expect(ownerRows[0].owner_id).toBe(saId);
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
        [SUPER_ADMIN_EMAIL]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
        [SUPER_ADMIN_EMAIL]
      );
    }
  });
});