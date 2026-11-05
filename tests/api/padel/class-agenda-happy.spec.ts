/**
 * Happy-path API tests de la agenda de clases (coach) con SQL real.
 *
 * Cubre A2–A12: slot CRUD, materialización idempotente (A5 ×2 con COUNT),
 * bloques sueltos (A7–A9), asignación all-or-nothing (A10: 201 / no inscrito
 * 400 / cupo 409 sin escritura), asistencia tri-estado (A11), remoción (A12),
 * cancelación con notificación + fila en `audit_logs`, y 409
 * `AGENDA_COURSE_ARCHIVED` en escritura vs 200 en lectura (EC-13).
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
const COACH_EMAIL = `padel-agenda-coach-${STAMP}@test.local`;
const STUDENT_A_EMAIL = `padel-agenda-a-${STAMP}@test.local`;
const STUDENT_B_EMAIL = `padel-agenda-b-${STAMP}@test.local`;
const STUDENT_C_EMAIL = `padel-agenda-c-${STAMP}@test.local`;
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
const JSON_HEADERS = { "Content-Type": "application/json" };

test.describe("Class agenda coach — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: COACH_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: STUDENT_A_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: STUDENT_B_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: STUDENT_C_EMAIL, password: PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    const emails = [COACH_EMAIL, STUDENT_A_EMAIL, STUDENT_B_EMAIL, STUDENT_C_EMAIL];
    await pool.query(
      `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [emails]
    );
    // courses cascade → weekly_slots/class_blocks/course_enrollments → block_enrollments.
    await pool.query(
      `DELETE FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [COACH_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
    await pool.end();
  });

  test("A2–A12 con verificación SQL, idempotencia, cupo y archivado", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(COACH_EMAIL, PASSWORD);
    const pool = getPool();
    try {
      const { rows: coachRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH_EMAIL]);
      const coachId = coachRows[0].id as string;
      const studentId = async (email: string): Promise<string> =>
        (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id as string;
      const studentAId = await studentId(STUDENT_A_EMAIL);
      const studentBId = await studentId(STUDENT_B_EMAIL);
      const studentCId = await studentId(STUDENT_C_EMAIL);

      // Seed: curso + 3 alumnos inscritos (C queda fuera del curso).
      const courseRes = await ctx.post("/api/courses", {
        data: { name: "Curso Agenda E2E", level: "intermedio" },
        headers: JSON_HEADERS,
      });
      expect(courseRes.status()).toBe(201);
      const courseId = (await courseRes.json()).course.id as string;
      for (const id of [studentAId, studentBId]) {
        const add = await ctx.post(`/api/courses/${courseId}/students`, {
          data: { studentId: id },
          headers: JSON_HEADERS,
        });
        expect(add.status()).toBe(201);
      }

      // A2 — crea slot semanal (lunes 18:00).
      const slotRes = await ctx.post(`/api/courses/${courseId}/agenda/slots`, {
        data: { dayOfWeek: 1, startTime: "18:00", durationMinutes: 60, label: "Clase lunes" },
        headers: JSON_HEADERS,
      });
      expect(slotRes.status()).toBe(201);
      const slotId = (await slotRes.json()).slot.id as string;
      const { rows: slotRows } = await pool.query(
        `SELECT day_of_week, start_time FROM weekly_slots WHERE id = $1`,
        [slotId]
      );
      expect(slotRows[0].day_of_week).toBe(1);
      expect(slotRows[0].start_time).toBe("18:00");

      // A1 — lista la plantilla.
      const listSlots = await ctx.get(`/api/courses/${courseId}/agenda/slots`);
      expect(listSlots.status()).toBe(200);
      expect((await listSlots.json()).items.map((s: { id: string }) => s.id)).toContain(slotId);

      // A3 — update parcial del slot.
      const slotUpdate = await ctx.put(`/api/courses/${courseId}/agenda/slots/${slotId}`, {
        data: { label: "Clase lunes editada" },
        headers: JSON_HEADERS,
      });
      expect(slotUpdate.status()).toBe(200);
      const { rows: slotUpdated } = await pool.query(
        `SELECT label FROM weekly_slots WHERE id = $1`,
        [slotId]
      );
      expect(slotUpdated[0].label).toBe("Clase lunes editada");

      // A5 — materializa la semana ×2 (idempotente por UNIQUE parcial).
      const weekStart = "2030-01-07";
      const week1 = await ctx.post(`/api/courses/${courseId}/agenda/weeks`, {
        data: { weekStart },
        headers: JSON_HEADERS,
      });
      expect(week1.status()).toBe(200);
      const week1Body = await week1.json();
      expect(week1Body.created).toBe(1);
      expect(week1Body.blocks).toHaveLength(1);
      const blockId = week1Body.blocks[0].id as string;

      const week2 = await ctx.post(`/api/courses/${courseId}/agenda/weeks`, {
        data: { weekStart },
        headers: JSON_HEADERS,
      });
      expect(week2.status()).toBe(200);
      expect((await week2.json()).created).toBe(0);
      const { rows: blockCount } = await pool.query(
        `SELECT count(*)::int AS n FROM class_blocks WHERE course_id = $1 AND block_date = $2`,
        [courseId, weekStart]
      );
      expect(blockCount[0].n).toBe(1);

      // A6 — bloquea el rango pedido (lectura).
      const blocksGet = await ctx.get(
        `/api/courses/${courseId}/agenda/blocks?from=${weekStart}&to=2030-01-13`
      );
      expect(blocksGet.status()).toBe(200);
      expect((await blocksGet.json()).blocks.map((b: { id: string }) => b.id)).toContain(blockId);

      // A7 — bloque suelto con cupo 1.
      const looseRes = await ctx.post(`/api/courses/${courseId}/agenda/blocks`, {
        data: { blockDate: "2030-01-08", startTime: "10:00", durationMinutes: 60, maxCapacity: 1, label: "Suelto" },
        headers: JSON_HEADERS,
      });
      expect(looseRes.status()).toBe(201);
      const looseId = (await looseRes.json()).block.id as string;
      const { rows: looseRows } = await pool.query(
        `SELECT max_capacity FROM class_blocks WHERE id = $1`,
        [looseId]
      );
      expect(looseRows[0].max_capacity).toBe(1);

      // A10 — cupo: A entra (201), B excede (409) y NO se escribe.
      const enrollA = await ctx.post(`/api/courses/${courseId}/agenda/blocks/${looseId}/enrollments`, {
        data: { studentIds: [studentAId] },
        headers: JSON_HEADERS,
      });
      expect(enrollA.status()).toBe(201);
      const overCapacity = await ctx.post(
        `/api/courses/${courseId}/agenda/blocks/${looseId}/enrollments`,
        { data: { studentIds: [studentBId] }, headers: JSON_HEADERS }
      );
      expect(overCapacity.status()).toBe(409);
      expect((await overCapacity.json()).code).toBe("AGENDA_CAPACITY");
      const { rows: capRows } = await pool.query(
        `SELECT count(*)::int AS n FROM block_enrollments WHERE block_id = $1`,
        [looseId]
      );
      expect(capRows[0].n).toBe(1);

      // A10 — alumno no inscrito al curso ⇒ 400 sin escritura.
      const notEnrolled = await ctx.post(
        `/api/courses/${courseId}/agenda/blocks/${blockId}/enrollments`,
        { data: { studentIds: [studentCId] }, headers: JSON_HEADERS }
      );
      expect(notEnrolled.status()).toBe(400);
      expect((await notEnrolled.json()).code).toBe("AGENDA_STUDENT_NOT_ENROLLED");
      const { rows: cRows } = await pool.query(
        `SELECT count(*)::int AS n FROM block_enrollments WHERE block_id = $1 AND student_id = $2`,
        [blockId, studentCId]
      );
      expect(cRows[0].n).toBe(0);

      // A10 — asignación válida + idempotencia.
      const assign = await ctx.post(`/api/courses/${courseId}/agenda/blocks/${blockId}/enrollments`, {
        data: { studentIds: [studentAId] },
        headers: JSON_HEADERS,
      });
      expect(assign.status()).toBe(201);
      expect((await assign.json()).assigned).toEqual([studentAId]);
      const again = await ctx.post(`/api/courses/${courseId}/agenda/blocks/${blockId}/enrollments`, {
        data: { studentIds: [studentAId] },
        headers: JSON_HEADERS,
      });
      expect(again.status()).toBe(201);
      const againBody = await again.json();
      expect(againBody.assigned).toEqual([]);
      expect(againBody.alreadyAssigned).toContain(studentAId);

      // GET detalle (hidratación del sheet): alumno asignado + contadores reales.
      const detail = await ctx.get(`/api/courses/${courseId}/agenda/blocks/${blockId}`);
      expect(detail.status()).toBe(200);
      const detailBody = await detail.json();
      expect(detailBody.block.id).toBe(blockId);
      expect(detailBody.block.enrolledCount).toBe(1);
      expect(detailBody.enrollments.map((row: { studentId: string }) => row.studentId)).toEqual([
        studentAId,
      ]);

      // A11 — asistencia tri-estado (true → false → null).
      for (const attended of [true, false, null] as const) {
        const attendance = await ctx.put(
          `/api/courses/${courseId}/agenda/blocks/${blockId}/enrollments/${studentAId}`,
          { data: { attended }, headers: JSON_HEADERS }
        );
        expect(attendance.status()).toBe(200);
      }
      const { rows: attendanceRows } = await pool.query(
        `SELECT attended, status FROM block_enrollments WHERE block_id = $1 AND student_id = $2`,
        [blockId, studentAId]
      );
      expect(attendanceRows[0].attended).toBeNull();

      // A12 — remoción real.
      const removed = await ctx.delete(
        `/api/courses/${courseId}/agenda/blocks/${blockId}/enrollments/${studentAId}`
      );
      expect(removed.status()).toBe(200);
      expect(await removed.json()).toEqual({ removed: true });
      const { rows: removedRows } = await pool.query(
        `SELECT count(*)::int AS n FROM block_enrollments WHERE block_id = $1 AND student_id = $2`,
        [blockId, studentAId]
      );
      expect(removedRows[0].n).toBe(0);

      // Re-asigna para probar la cancelación con notificación.
      const reassign = await ctx.post(`/api/courses/${courseId}/agenda/blocks/${blockId}/enrollments`, {
        data: { studentIds: [studentAId] },
        headers: JSON_HEADERS,
      });
      expect(reassign.status()).toBe(201);

      // A8 — edita label y luego cancela (tx + notified).
      const edit = await ctx.put(`/api/courses/${courseId}/agenda/blocks/${blockId}`, {
        data: { label: "Cancelada" },
        headers: JSON_HEADERS,
      });
      expect(edit.status()).toBe(200);
      const cancel = await ctx.put(`/api/courses/${courseId}/agenda/blocks/${blockId}`, {
        data: { status: "cancelled" },
        headers: JSON_HEADERS,
      });
      expect(cancel.status()).toBe(200);
      expect((await cancel.json()).block.status).toBe("cancelled");

      const { rows: cancelRows } = await pool.query(
        `SELECT status FROM class_blocks WHERE id = $1`,
        [blockId]
      );
      expect(cancelRows[0].status).toBe("cancelled");
      const { rows: enrollmentAfterCancel } = await pool.query(
        `SELECT status FROM block_enrollments WHERE block_id = $1 AND student_id = $2`,
        [blockId, studentAId]
      );
      expect(enrollmentAfterCancel[0].status).toBe("cancelled");

      // A9 — con inscripciones ⇒ 409; bloque vacío ⇒ 200 + fila borrada.
      const blockedDelete = await ctx.delete(`/api/courses/${courseId}/agenda/blocks/${looseId}`);
      expect(blockedDelete.status()).toBe(409);
      expect((await blockedDelete.json()).code).toBe("AGENDA_BLOCK_HAS_ENROLLMENTS");

      const emptyRes = await ctx.post(`/api/courses/${courseId}/agenda/blocks`, {
        data: { blockDate: "2030-01-09", startTime: "11:00", durationMinutes: 45 },
        headers: JSON_HEADERS,
      });
      expect(emptyRes.status()).toBe(201);
      const emptyId = (await emptyRes.json()).block.id as string;
      const deleted = await ctx.delete(`/api/courses/${courseId}/agenda/blocks/${emptyId}`);
      expect(deleted.status()).toBe(200);
      const { rows: goneRows } = await pool.query(
        `SELECT count(*)::int AS n FROM class_blocks WHERE id = $1`,
        [emptyId]
      );
      expect(goneRows[0].n).toBe(0);

      // A4 — borra slot; el bloque materializado sobrevive desprendido (EC-10).
      const slotDelete = await ctx.delete(`/api/courses/${courseId}/agenda/slots/${slotId}`);
      expect(slotDelete.status()).toBe(200);
      const slotDeleteBody = await slotDelete.json();
      expect(slotDeleteBody.deleted).toBe(true);
      expect(slotDeleteBody.detachedBlocks).toBe(1);
      const { rows: detached } = await pool.query(
        `SELECT weekly_slot_id FROM class_blocks WHERE id = $1`,
        [blockId]
      );
      expect(detached[0].weekly_slot_id).toBeNull();

      // Auditoría: CREATE weekly_slot / class_block_week / block_enrollment + UPDATE class_block.
      const { rows: weeklySlotAudit } = await pool.query(
        `SELECT action_type FROM audit_logs WHERE entity_name = 'weekly_slot' AND entity_id = $1`,
        [slotId]
      );
      expect(weeklySlotAudit.map((r) => r.action_type)).toContain("CREATE");
      const { rows: weekAudit } = await pool.query(
        `SELECT action_type FROM audit_logs WHERE entity_name = 'class_block_week' AND entity_id = $1`,
        [weekStart]
      );
      expect(weekAudit.map((r) => r.action_type)).toContain("CREATE");
      const { rows: enrollmentAudit } = await pool.query(
        `SELECT action_type FROM audit_logs WHERE entity_name = 'block_enrollment' AND entity_id = $1`,
        [blockId]
      );
      expect(enrollmentAudit.map((r) => r.action_type)).toContain("CREATE");
      const { rows: cancelAudit } = await pool.query(
        `SELECT new_values FROM audit_logs
          WHERE entity_name = 'class_block' AND entity_id = $1 AND action_type = 'UPDATE'`,
        [blockId]
      );
      expect(cancelAudit.some((r) => r.new_values?.status === "cancelled")).toBe(true);

      // EC-13 — curso archivado: escritura 409, lectura 200.
      const archivedRes = await ctx.post("/api/courses", {
        data: { name: "Curso Archivado", level: "iniciacion" },
        headers: JSON_HEADERS,
      });
      expect(archivedRes.status()).toBe(201);
      const archivedId = (await archivedRes.json()).course.id as string;
      const archive = await ctx.delete(`/api/courses/${archivedId}`);
      expect(archive.status()).toBe(200);
      expect((await archive.json()).course.status).toBe("archived");

      const writeOnArchived = await ctx.post(`/api/courses/${archivedId}/agenda/slots`, {
        data: { dayOfWeek: 2, startTime: "09:00", durationMinutes: 60 },
        headers: JSON_HEADERS,
      });
      expect(writeOnArchived.status()).toBe(409);
      expect((await writeOnArchived.json()).code).toBe("AGENDA_COURSE_ARCHIVED");
      expect((await ctx.get(`/api/courses/${archivedId}/agenda/slots`)).status()).toBe(200);
      expect((await ctx.post(`/api/courses/${archivedId}/agenda/weeks`, {
        data: {},
        headers: JSON_HEADERS,
      })).status()).toBe(409);
      expect((await ctx.post(`/api/courses/${archivedId}/agenda/blocks`, {
        data: { blockDate: "2030-02-01", startTime: "09:00", durationMinutes: 60 },
        headers: JSON_HEADERS,
      })).status()).toBe(409);
      expect((await ctx.post(
        `/api/courses/${archivedId}/agenda/blocks/${blockId}/enrollments`,
        { data: { studentIds: [studentAId] }, headers: JSON_HEADERS }
      )).status()).toBe(409);
      expect((await ctx.get(`/api/courses/${archivedId}/agenda/blocks`)).status()).toBe(200);

      // owner_id de las filas creadas = coach de la sesión.
      const { rows: owned } = await pool.query(
        `SELECT owner_id FROM courses WHERE id = $1`,
        [courseId]
      );
      expect(owned[0].owner_id).toBe(coachId);
    } finally {
      await ctx.dispose();
    }
  });
});
