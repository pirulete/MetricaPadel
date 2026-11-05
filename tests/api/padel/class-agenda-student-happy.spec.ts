/**
 * Happy-path API tests de la agenda del alumno (U1 + U2) con SQL real.
 *
 * U1: próximas clases + agregados; `?courseId` de un curso donde no está
 * inscrito ⇒ 404. U2: historial paginado con cursor propio B2
 * (`YYYY-MM-DDTHH:mm`), página 2 sin duplicados y `400` para formatos
 * inválidos. Incluye 401 sin sesión y 403 de rol no-USER.
 *
 * Especificación escrita por @app-engineer; la ejecuta @qa-release.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const STAMP = Date.now();
const COACH_EMAIL = `padel-agenda-student-coach-${STAMP}@test.local`;
const STUDENT_EMAIL = `padel-agenda-student-${STAMP}@test.local`;
const OUTSIDER_EMAIL = `padel-agenda-outsider-${STAMP}@test.local`;
const PASSWORD = "TestPass123!";
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

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Class agenda alumno — 401", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("U1/U2 sin sesión → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/student/agenda`)).status()).toBe(401);
    expect((await request.get(`${BASE_URL}/api/student/agenda/history`)).status()).toBe(401);
  });
});

test.describe("Class agenda alumno — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: COACH_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: STUDENT_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: OUTSIDER_EMAIL, password: PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    const emails = [COACH_EMAIL, STUDENT_EMAIL, OUTSIDER_EMAIL];
    await pool.query(
      `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [emails]
    );
    await pool.query(
      `DELETE FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [COACH_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
    await pool.end();
  });

  test("U1 próximas + agregados, U2 cursor B2 y anti-IDOR", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const coachCtx = await createAuthedContext(COACH_EMAIL, PASSWORD);
    const studentCtx = await createAuthedContext(STUDENT_EMAIL, PASSWORD);
    const outsiderCtx = await createAuthedContext(OUTSIDER_EMAIL, PASSWORD);
    const pool = getPool();
    try {
      const { rows: studentRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
      const studentId = studentRows[0].id as string;

      const course = async (name: string): Promise<string> => {
        const res = await coachCtx.post("/api/courses", {
          data: { name, level: "intermedio" },
          headers: JSON_HEADERS,
        });
        expect(res.status()).toBe(201);
        return (await res.json()).course.id as string;
      };
      const courseId = await course("Curso alumno agenda");
      const outsiderCourseId = await course("Curso del que el alumno no es parte");

      // Inscribe al alumno (la otra cuenta queda fuera de ambos cursos).
      const enroll = await coachCtx.post(`/api/courses/${courseId}/students`, {
        data: { studentId },
        headers: JSON_HEADERS,
      });
      expect(enroll.status()).toBe(201);

      // Seed de bloques: 1 futuro (U1) y 2 pasados (U2).
      const blocks: Array<{ id: string; blockDate: string }> = [];
      for (const [blockDate, startTime] of [
        ["2099-01-05", "18:00"],
        ["2020-01-07", "18:00"],
        ["2020-01-06", "18:00"],
      ] as const) {
        const created = await coachCtx.post(`/api/courses/${courseId}/agenda/blocks`, {
          data: { blockDate, startTime, durationMinutes: 60, label: `Clase ${blockDate}` },
          headers: JSON_HEADERS,
        });
        expect(created.status()).toBe(201);
        const block = (await created.json()).block;
        blocks.push({ id: block.id as string, blockDate: block.blockDate as string });

        const assigned = await coachCtx.post(
          `/api/courses/${courseId}/agenda/blocks/${block.id}/enrollments`,
          { data: { studentIds: [studentId] }, headers: JSON_HEADERS }
        );
        expect(assigned.status()).toBe(201);
      }

      // SQL real: 3 filas de asignación.
      const { rows: assignedRows } = await pool.query(
        `SELECT count(*)::int AS n FROM block_enrollments WHERE student_id = $1 AND status = 'scheduled'`,
        [studentId]
      );
      expect(assignedRows[0].n).toBe(3);

      // U1 — próximas incluye solo el bloque futuro + agregados reales.
      const u1 = await studentCtx.get("/api/student/agenda");
      expect(u1.status()).toBe(200);
      const u1Body = await u1.json();
      expect(u1Body.upcoming).toHaveLength(1);
      expect(u1Body.upcoming[0].blockId).toBe(blocks[0].id);
      expect(u1Body.upcoming[0].courseId).toBe(courseId);
      expect(u1Body.aggregates.total).toBe(3);
      expect(u1Body.aggregates.scheduled).toBe(3);
      expect(u1Body.todayIso).toBeTruthy();

      // U1 filtrado por curso propio (200) vs curso ajeno (404 anti-IDOR).
      expect((await studentCtx.get(`/api/student/agenda?courseId=${courseId}`)).status()).toBe(200);
      const notEnrolled = await studentCtx.get(`/api/student/agenda?courseId=${outsiderCourseId}`);
      expect(notEnrolled.status()).toBe(404);

      // U2 — página 1 con limit=1, cursor B2 en el mismo formato.
      const page1 = await studentCtx.get("/api/student/agenda/history?limit=1");
      expect(page1.status()).toBe(200);
      const page1Body = await page1.json();
      expect(page1Body.items).toHaveLength(1);
      expect(page1Body.items[0].blockDate).toBe("2020-01-07");
      expect(page1Body.nextCursor).toBe("2020-01-07T18:00");

      const page2 = await studentCtx.get(
        `/api/student/agenda/history?limit=1&cursor=${page1Body.nextCursor}`
      );
      expect(page2.status()).toBe(200);
      const page2Body = await page2.json();
      expect(page2Body.items).toHaveLength(1);
      expect(page2Body.items[0].blockDate).toBe("2020-01-06");
      expect(page2Body.items.map((i: { blockId: string }) => i.blockId)).not.toContain(
        page1Body.items[0].blockId
      );
      expect(page2Body.nextCursor).toBeNull();

      // B2 — cursor `YYYY-MM-DDTHH:mm` aceptado; ISO completo y fecha sola rechazados.
      expect(
        (await studentCtx.get("/api/student/agenda/history?cursor=2026-11-04T18:00")).status()
      ).toBe(200);
      expect(
        (await studentCtx.get("/api/student/agenda/history?cursor=2026-11-04T18:00:00.000Z")).status()
      ).toBe(400);
      expect(
        (await studentCtx.get("/api/student/agenda/history?cursor=2026-11-04")).status()
      ).toBe(400);

      // U2 — curso ajeno ⇒ 404.
      expect(
        (await studentCtx.get(`/api/student/agenda/history?courseId=${outsiderCourseId}`)).status()
      ).toBe(404);

      // Alumno sin inscripciones: agenda vacía (no filtra clases de otros).
      const outsiderU1 = await outsiderCtx.get("/api/student/agenda");
      expect(outsiderU1.status()).toBe(200);
      const outsiderBody = await outsiderU1.json();
      expect(outsiderBody.upcoming).toHaveLength(0);
      expect(outsiderBody.aggregates.total).toBe(0);

      // 403 — rol no-USER (coach) en U1/U2.
      expect((await coachCtx.get("/api/student/agenda")).status()).toBe(403);
      expect((await coachCtx.get("/api/student/agenda/history")).status()).toBe(403);
    } finally {
      await coachCtx.dispose();
      await studentCtx.dispose();
      await outsiderCtx.dispose();
    }
  });
});
