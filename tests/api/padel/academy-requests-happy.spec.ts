/**
 * Happy-path API tests de /api/academy-requests (v0.9) con SQL real.
 * POST join/create, GET list, approve join, approve create, reject.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const COACH_EMAIL = `req-coach-${Date.now()}@test.local`;
const COACH_PASSWORD = "TestPass123!";
const COACH2_EMAIL = `req-coach2-${Date.now()}@test.local`;
const COACH2_PASSWORD = "TestPass123!";
const SUPER_ADMIN_EMAIL = `req-sa-${Date.now()}@test.local`;
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

test.describe("Academy requests — happy-path (SQL real)", () => {
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
      `DELETE FROM academy_access_requests WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [[COACH_EMAIL, COACH2_EMAIL]]
    );
    await pool.query(
      `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1)))`,
      [[COACH_EMAIL, COACH2_EMAIL]]
    );
    await pool.query(
      `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [[COACH_EMAIL, COACH2_EMAIL]]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[COACH_EMAIL, COACH2_EMAIL, SUPER_ADMIN_EMAIL]]);
  });

  test("join: POST → GET list (SA) → approve → membership activa", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const coach2Ctx = await createAuthedContext(COACH2_EMAIL, COACH2_PASSWORD);
    const saCtx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const pool = getPool();
    const slug = `req-join-${Date.now()}`;
    try {
      // SUPER_ADMIN crea academia (ownerId = coach)
      const coachId = (
        await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH_EMAIL])
      ).rows[0].id as string;
      const create = await saCtx.post("/api/academies", {
        data: { name: "Academia Join", slug, ownerId: coachId },
        headers: { "Content-Type": "application/json" },
      });
      expect(create.status()).toBe(201);
      const academyId = (await create.json()).academy.id;

      // COACH2 solicita join (rol COACH)
      const req = await coach2Ctx.post("/api/academy-requests", {
        data: { type: "join_academy", academyId, requestedRole: "COACH" },
        headers: { "Content-Type": "application/json" },
      });
      expect(req.status()).toBe(201);
      const requestId = (await req.json()).request.id;

      // Verificación SQL real: solicitud pending
      const { rows: reqRows } = await pool.query(
        `SELECT status, type, requested_role FROM academy_access_requests WHERE id = $1`,
        [requestId]
      );
      expect(reqRows[0].status).toBe("pending");
      expect(reqRows[0].type).toBe("join_academy");
      expect(reqRows[0].requested_role).toBe("COACH");

      // GET list (SA) la ve con requester + academy
      const list = await saCtx.get("/api/academy-requests?status=pending");
      expect(list.status()).toBe(200);
      const listBody = await list.json();
      const found = listBody.requests.find((r: { id: string }) => r.id === requestId);
      expect(found).toBeTruthy();
      expect(found.requesterEmail).toBe(COACH2_EMAIL);
      expect(found.academyName).toBe("Academia Join");

      // approve → membership activa
      const approve = await saCtx.post(`/api/academy-requests/${requestId}/approve`);
      expect(approve.status()).toBe(200);
      const approveBody = await approve.json();
      expect(approveBody.membership.status).toBe("active");
      expect(approveBody.membership.role).toBe("COACH");

      // Verificación SQL real: membresía activa + request approved
      const { rows: memberRows } = await pool.query(
        `SELECT role, status FROM academy_memberships WHERE academy_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)`,
        [academyId, COACH2_EMAIL]
      );
      expect(memberRows[0].role).toBe("COACH");
      expect(memberRows[0].status).toBe("active");
      const { rows: approvedRows } = await pool.query(
        `SELECT status FROM academy_access_requests WHERE id = $1`,
        [requestId]
      );
      expect(approvedRows[0].status).toBe("approved");

      // COACH2 ya ve la academia
      const myAcademies = await coach2Ctx.get("/api/academies");
      const myBody = await myAcademies.json();
      expect(myBody.academies.find((a: { id: string }) => a.id === academyId)).toBeTruthy();
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM academy_access_requests WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1)))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
    }
  });

  test("create: POST → approve → academia + OWNER requester", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const coach2Ctx = await createAuthedContext(COACH2_EMAIL, COACH2_PASSWORD);
    const saCtx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const pool = getPool();
    const slug = `req-create-${Date.now()}`;
    try {
      // COACH2 solicita create
      const req = await coach2Ctx.post("/api/academy-requests", {
        data: { type: "create_academy", name: "Academia Creada", slug, primaryColor: "#0ea5e9" },
        headers: { "Content-Type": "application/json" },
      });
      expect(req.status()).toBe(201);
      const requestId = (await req.json()).request.id;

      // approve → academia + OWNER = requester
      const approve = await saCtx.post(`/api/academy-requests/${requestId}/approve`);
      expect(approve.status()).toBe(200);
      const approveBody = await approve.json();
      expect(approveBody.academy.slug).toBe(slug);
      expect(approveBody.academy.primaryColor).toBe("#0ea5e9");

      // Verificación SQL real: academia owner + membresía OWNER activa
      const { rows: academyRows } = await pool.query(
        `SELECT owner_id FROM academies WHERE id = $1`,
        [approveBody.academy.id]
      );
      const coach2Id = (
        await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH2_EMAIL])
      ).rows[0].id as string;
      expect(academyRows[0].owner_id).toBe(coach2Id);
      const { rows: memberRows } = await pool.query(
        `SELECT role, status FROM academy_memberships WHERE academy_id = $1 AND user_id = $2`,
        [approveBody.academy.id, coach2Id]
      );
      expect(memberRows[0].role).toBe("OWNER");
      expect(memberRows[0].status).toBe("active");

      // COACH2 ve la academia como OWNER
      const myAcademies = await coach2Ctx.get("/api/academies");
      const myBody = await myAcademies.json();
      const found = myBody.academies.find((a: { id: string }) => a.id === approveBody.academy.id);
      expect(found).toBeTruthy();
      expect(found.role).toBe("OWNER");
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM academy_access_requests WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1)))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
    }
  });

  test("reject: POST → reject → status rejected", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const coach2Ctx = await createAuthedContext(COACH2_EMAIL, COACH2_PASSWORD);
    const saCtx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const pool = getPool();
    const slug = `req-reject-${Date.now()}`;
    try {
      const req = await coach2Ctx.post("/api/academy-requests", {
        data: { type: "create_academy", name: "Academia Rechazada", slug },
        headers: { "Content-Type": "application/json" },
      });
      expect(req.status()).toBe(201);
      const requestId = (await req.json()).request.id;

      const reject = await saCtx.post(`/api/academy-requests/${requestId}/reject`);
      expect(reject.status()).toBe(200);
      const rejectBody = await reject.json();
      expect(rejectBody.request.status).toBe("rejected");

      // Verificación SQL real
      const { rows: reqRows } = await pool.query(
        `SELECT status FROM academy_access_requests WHERE id = $1`,
        [requestId]
      );
      expect(reqRows[0].status).toBe("rejected");

      // Re-aprobar tras rechazo → 400 (ya revisada)
      const reApprove = await saCtx.post(`/api/academy-requests/${requestId}/approve`);
      expect(reApprove.status()).toBe(400);
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM academy_access_requests WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1)))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
    }
  });

  test("GET /api/academy-requests/available-academies (coach) lista activas", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const coachCtx = await createAuthedContext(COACH_EMAIL, COACH_PASSWORD);
    const saCtx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const pool = getPool();
    const slug = `req-avail-${Date.now()}`;
    try {
      const coachId = (
        await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH_EMAIL])
      ).rows[0].id as string;
      const create = await saCtx.post("/api/academies", {
        data: { name: "Academia Disponible", slug, ownerId: coachId },
        headers: { "Content-Type": "application/json" },
      });
      expect(create.status()).toBe(201);
      const academyId = (await create.json()).academy.id;

      const avail = await coachCtx.get("/api/academy-requests/available-academies");
      expect(avail.status()).toBe(200);
      const availBody = await avail.json();
      const found = availBody.academies.find((a: { id: string }) => a.id === academyId);
      expect(found).toBeTruthy();
      expect(found.slug).toBe(slug);
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1)))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [[COACH_EMAIL, COACH2_EMAIL]]
      );
    }
  });
});