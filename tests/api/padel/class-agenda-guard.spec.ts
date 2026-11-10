/**
 * API tests de guards de la agenda de clases (coach + alumno).
 *
 * 401 sin sesión ×14 (sin DB); 403 USER ×12, 403 TEMPORARY, 404 cross-course,
 * 404 bloque de otro curso, 409 `AGENDA_COURSE_ARCHIVED` (EC-13) y 400 Zod con
 * SQL real (skip graceful sin DATABASE_URL).
 *
 * Contrato: `production_artifacts/2026-11-04-class-agenda/auth-impact.md` y
 * `security-checklist.md` §9.
 * @group api
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import bcrypt from "bcryptjs";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const STAMP = Date.now();
const COACH_A_EMAIL = `padel-agenda-guard-a-${STAMP}@test.local`;
const COACH_B_EMAIL = `padel-agenda-guard-b-${STAMP}@test.local`;
const USER_EMAIL = `padel-agenda-guard-user-${STAMP}@test.local`;
const TEMP_EMAIL = `padel-agenda-guard-temp-${STAMP}@test.local`;
const PASSWORD = "TestPass123!";

const UUID = "00000000-0000-0000-0000-000000000000";
const UUID2 = "11111111-2222-4333-8444-555555555555";
const JSON_HEADERS = { "Content-Type": "application/json" };

let serverProbe: Promise<boolean> | null = null;

function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/providers`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

/** Las 15 rutas (A1–A12 + GET detalle + U1–U2) con ids uuid válidos para no fallar en Zod. */
function allAgendaRoutes(): Array<{ method: string; url: string }> {
  const course = `${BASE_URL}/api/courses/${UUID}`;
  return [
    { method: "GET", url: `${course}/agenda/slots` },
    { method: "POST", url: `${course}/agenda/slots` },
    { method: "PUT", url: `${course}/agenda/slots/${UUID}` },
    { method: "DELETE", url: `${course}/agenda/slots/${UUID}` },
    { method: "POST", url: `${course}/agenda/weeks` },
    { method: "GET", url: `${course}/agenda/blocks` },
    { method: "POST", url: `${course}/agenda/blocks` },
    { method: "GET", url: `${course}/agenda/blocks/${UUID}` },
    { method: "PUT", url: `${course}/agenda/blocks/${UUID}` },
    { method: "DELETE", url: `${course}/agenda/blocks/${UUID}` },
    { method: "POST", url: `${course}/agenda/blocks/${UUID}/enrollments` },
    { method: "PUT", url: `${course}/agenda/blocks/${UUID}/enrollments/${UUID2}` },
    { method: "DELETE", url: `${course}/agenda/blocks/${UUID}/enrollments/${UUID2}` },
    { method: "GET", url: `${BASE_URL}/api/student/agenda` },
    { method: "GET", url: `${BASE_URL}/api/student/agenda/history` },
  ];
}

/** Las 13 rutas de coach (A1–A12 + GET detalle de bloque). */
function coachRoutes(courseId: string): Array<{ method: string; url: string }> {
  const course = `${BASE_URL}/api/courses/${courseId}`;
  return [
    { method: "GET", url: `${course}/agenda/slots` },
    { method: "POST", url: `${course}/agenda/slots` },
    { method: "PUT", url: `${course}/agenda/slots/${UUID}` },
    { method: "DELETE", url: `${course}/agenda/slots/${UUID}` },
    { method: "POST", url: `${course}/agenda/weeks` },
    { method: "GET", url: `${course}/agenda/blocks` },
    { method: "POST", url: `${course}/agenda/blocks` },
    { method: "GET", url: `${course}/agenda/blocks/${UUID}` },
    { method: "PUT", url: `${course}/agenda/blocks/${UUID}` },
    { method: "DELETE", url: `${course}/agenda/blocks/${UUID}` },
    { method: "POST", url: `${course}/agenda/blocks/${UUID}/enrollments` },
    { method: "PUT", url: `${course}/agenda/blocks/${UUID}/enrollments/${UUID2}` },
    { method: "DELETE", url: `${course}/agenda/blocks/${UUID}/enrollments/${UUID2}` },
  ];
}

async function statuses(ctx: APIRequestContext, routes: Array<{ method: string; url: string }>) {
  const results: number[] = [];
  for (const route of routes) {
    const res = await ctx.fetch(route.url, { method: route.method });
    results.push(res.status());
  }
  return results;
}

/** ADMIN + TEMPORARY: el rol pasa, el estado NO (guardAdmin exige ACTIVE). */
async function insertTemporaryUser(email: string, password: string) {
  const hash = await bcrypt.hash(password, 10);
  await getPool().query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Temp', 'User', $2, 'TEMPORARY', 'ADMIN', now(), now())
     ON CONFLICT (email) DO UPDATE SET status = 'TEMPORARY', role = 'ADMIN', password_hash = $2`,
    [email.toLowerCase(), hash]
  );
}

test.describe("Class agenda — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("las 15 rutas → 401", async ({ request }) => {
    for (const route of allAgendaRoutes()) {
      const res = await request.fetch(route.url, { method: route.method });
      expect(res.status(), `${route.method} ${route.url}`).toBe(401);
    }
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Class agenda — 403/404/409/400 (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: COACH_A_EMAIL, password: PASSWORD });
    await createUser({ role: "ADMIN", email: COACH_B_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: PASSWORD });
    await insertTemporaryUser(TEMP_EMAIL, PASSWORD);
  });

  test.afterAll(async () => {
    const pool = getPool();
    const emails = [COACH_A_EMAIL, COACH_B_EMAIL, USER_EMAIL, TEMP_EMAIL];
    await pool.query(
      `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [emails]
    );
    await pool.query(
      `DELETE FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [emails]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
    await pool.end();
  });

  test("USER + ACTIVE → 403 en los 13 endpoints de coach", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, PASSWORD);
    const coachCtx = await createAuthedContext(COACH_A_EMAIL, PASSWORD);
    try {
      const created = await coachCtx.post("/api/courses", {
        data: { name: "Curso guard usuario", level: "iniciacion" },
        headers: JSON_HEADERS,
      });
      expect(created.status()).toBe(201);
      const courseId = (await created.json()).course.id as string;
      const statusesResult = await statuses(ctx, coachRoutes(courseId));
      expect(statusesResult).toEqual(Array(13).fill(403));
    } finally {
      await ctx.dispose();
      await coachCtx.dispose();
    }
  });

  test("ADMIN + TEMPORARY → 403 con code TEMPORARY en U1", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(TEMP_EMAIL, PASSWORD);
    try {
      expect((await ctx.get(`/api/courses/${UUID}/agenda/slots`)).status()).toBe(403);
      const u1 = await ctx.get("/api/student/agenda");
      expect(u1.status()).toBe(403);
      expect((await u1.json()).code).toBe("TEMPORARY");
      expect((await ctx.get("/api/student/agenda/history")).status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("404 cross-coach, bloque ajeno, 409 archivado y 400 Zod", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctxA = await createAuthedContext(COACH_A_EMAIL, PASSWORD);
    const ctxB = await createAuthedContext(COACH_B_EMAIL, PASSWORD);
    const ctxUser = await createAuthedContext(USER_EMAIL, PASSWORD);
    try {
      const pool = getPool();
      const course = async (ctx: APIRequestContext, name: string): Promise<string> => {
        const res = await ctx.post("/api/courses", {
          data: { name, level: "intermedio" },
          headers: JSON_HEADERS,
        });
        expect(res.status()).toBe(201);
        return (await res.json()).course.id as string;
      };

      const courseA = await course(ctxA, "Curso guard A");
      const courseB = await course(ctxB, "Curso guard B");
      const { rows: userRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [USER_EMAIL]);
      const userId = userRows[0].id as string;

      // 404 cross-coach: coach A sobre el curso de B (nunca 403).
      const courseBRes = `${BASE_URL}/api/courses/${courseB}`;
      expect((await ctxA.get(`${courseBRes}/agenda/slots`)).status()).toBe(404);
      expect((await ctxA.get(`${courseBRes}/agenda/blocks`)).status()).toBe(404);
      expect((await ctxA.put(`${courseBRes}/agenda/blocks/${UUID}`, {
        data: { label: "x" }, headers: JSON_HEADERS,
      })).status()).toBe(404);
      expect((await ctxA.post(`${courseBRes}/agenda/blocks/${UUID}/enrollments`, {
        data: { studentIds: [userId] }, headers: JSON_HEADERS,
      })).status()).toBe(404);

      // 404 bloque de otro curso bajo un curso propio.
      const blockB = await ctxB.post(`/api/courses/${courseB}/agenda/blocks`, {
        data: { blockDate: "2030-03-04", startTime: "18:00", durationMinutes: 60 },
        headers: JSON_HEADERS,
      });
      expect(blockB.status()).toBe(201);
      const blockBId = (await blockB.json()).block.id as string;
      const crossBlock = `${BASE_URL}/api/courses/${courseA}/agenda/blocks/${blockBId}`;
      // GET detalle: bloque de otro curso ⇒ 404 (no 200 con datos ajenos).
      expect((await ctxA.get(crossBlock)).status()).toBe(404);
      expect((await ctxA.put(crossBlock, { data: { label: "x" }, headers: JSON_HEADERS })).status()).toBe(404);
      expect((await ctxA.post(`${crossBlock}/enrollments`, {
        data: { studentIds: [userId] }, headers: JSON_HEADERS,
      })).status()).toBe(404);
      expect((await ctxA.put(`${crossBlock}/enrollments/${userId}`, {
        data: { attended: true }, headers: JSON_HEADERS,
      })).status()).toBe(404);
      expect((await ctxA.delete(`${crossBlock}/enrollments/${userId}`)).status()).toBe(404);

      // U1/U2 con ?courseId de un curso donde el alumno no está inscrito → 404.
      expect((await ctxUser.get(`/api/student/agenda?courseId=${courseA}`)).status()).toBe(404);
      expect((await ctxUser.get(`/api/student/agenda/history?courseId=${courseA}`)).status()).toBe(404);

      // 409 AGENDA_COURSE_ARCHIVED en escritura / 200 en lectura (EC-13).
      expect((await ctxA.delete(`/api/courses/${courseA}`)).status()).toBe(200);
      const courseARes = `${BASE_URL}/api/courses/${courseA}`;
      expect((await ctxA.get(`${courseARes}/agenda/slots`)).status()).toBe(200);
      expect((await ctxA.get(`${courseARes}/agenda/blocks`)).status()).toBe(200);
      for (const [method, url] of [
        ["POST", `${courseARes}/agenda/slots`],
        ["POST", `${courseARes}/agenda/weeks`],
        ["POST", `${courseARes}/agenda/blocks`],
        ["POST", `${courseARes}/agenda/blocks/${UUID}/enrollments`],
      ] as const) {
        const res = await ctxA.fetch(url, { method });
        expect(res.status(), `${method} ${url}`).toBe(409);
        expect((await res.json()).code).toBe("AGENDA_COURSE_ARCHIVED");
      }

      // 400 Zod: uuid inválido, día fuera de rango, studentIds vacío, cursor inválido.
      expect((await ctxA.get(`${BASE_URL}/api/courses/not-a-uuid/agenda/slots`)).status()).toBe(400);
      expect((await ctxB.post(`${BASE_URL}/api/courses/${courseB}/agenda/slots`, {
        data: { dayOfWeek: 8, startTime: "18:00", durationMinutes: 60 },
        headers: JSON_HEADERS,
      })).status()).toBe(400);
      expect((await ctxB.post(`${BASE_URL}/api/courses/${courseB}/agenda/blocks`, {
        data: { blockDate: "2030-13-40", startTime: "18:00", durationMinutes: 60 },
        headers: JSON_HEADERS,
      })).status()).toBe(400);
      expect((await ctxB.post(`${BASE_URL}/api/courses/${courseB}/agenda/weeks`, {
        data: { weekStart: "2030-13-40" },
        headers: JSON_HEADERS,
      })).status()).toBe(400);
      expect((await ctxB.post(`${BASE_URL}/api/courses/${courseB}/agenda/blocks/${blockBId}/enrollments`, {
        data: { studentIds: [] }, headers: JSON_HEADERS,
      })).status()).toBe(400);
      expect((await ctxUser.get("/api/student/agenda?courseId=not-a-uuid")).status()).toBe(400);
      expect((await ctxUser.get("/api/student/agenda/history?cursor=2026-11-04")).status()).toBe(400);
      expect((await ctxUser.get("/api/student/agenda/history?cursor=2026-11-04T18:00:00.000Z")).status()).toBe(400);

      // El curso del coach B sigue intacto.
      expect((await ctxB.get(`${BASE_URL}/api/courses/${courseB}`)).status()).toBe(200);
    } finally {
      await ctxA.dispose();
      await ctxB.dispose();
      await ctxUser.dispose();
    }
  });
});
