/**
 * Happy-path API tests de paginación por cursor (G15) en los 5 listados de
 * Métrica Pádel con SQL real contra NeonDB:
 *   GET /api/rubrics, /api/courses, /api/evaluations, /api/history,
 *   GET /api/student/evaluations
 * Verifica: limit respetado, nextCursor presente cuando hay más, walk completo
 * sin duplicados ni pérdidas, nextCursor null al final.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-pagination-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-pagination-user-${Date.now()}@test.local`;
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

const HAS_DB = Boolean(process.env.DATABASE_URL);

/** Walk paginado: recorre todas las páginas y retorna los items acumulados. */
async function walk(ctx: Awaited<ReturnType<typeof createAuthedContext>>, url: string, limit = 2) {
  const all: any[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const qs = cursor ? `?limit=${limit}&cursor=${encodeURIComponent(cursor)}` : `?limit=${limit}`;
    const res = await ctx.get(`${url}${qs}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    all.push(...body.items);
    cursor = body.nextCursor;
    pages++;
    expect(pages).toBeLessThanOrEqual(5);
  } while (cursor);
  return all;
}

test.describe("Paginación por cursor G15 — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM course_rubrics WHERE course_id IN (SELECT id FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM course_enrollments WHERE course_id IN (SELECT id FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email IN ($1, $2)`, [ADMIN_EMAIL, USER_EMAIL]);
  });

  test("los 5 listados aceptan limit/cursor y pagan sin duplicados", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // ── Rúbricas: 3 → GET /api/rubrics?limit=2 ────────────────────────────
      const rubricIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const post = await ctx.post("/api/rubrics", {
          data: {
            title: `Rúbrica pag ${i}`,
            category: "tecnica_basica",
            criteria: [{ name: "Precisión", descriptors: ["A", "B", "C", "D"] }],
          },
          headers: { "Content-Type": "application/json" },
        });
        expect(post.status()).toBe(201);
        rubricIds.push((await post.json()).rubric.rubric.id);
      }
      const firstRubrics = await ctx.get("/api/rubrics?limit=2");
      expect(firstRubrics.status()).toBe(200);
      const firstRubricsBody = await firstRubrics.json();
      expect(firstRubricsBody.items).toHaveLength(2);
      expect(firstRubricsBody.nextCursor).toBeTruthy();
      const allRubrics = await walk(ctx, "/api/rubrics", 2);
      expect(allRubrics).toHaveLength(3);
      expect(new Set(allRubrics.map((r: { id: string }) => r.id)).size).toBe(3);

      // ── Cursos: 3 → GET /api/courses?limit=2 ──────────────────────────────
      for (let i = 0; i < 3; i++) {
        const post = await ctx.post("/api/courses", {
          data: { name: `Curso pag ${i}`, level: "iniciacion" },
          headers: { "Content-Type": "application/json" },
        });
        expect(post.status()).toBe(201);
      }
      const firstCourses = await ctx.get("/api/courses?limit=2");
      expect(firstCourses.status()).toBe(200);
      const firstCoursesBody = await firstCourses.json();
      expect(firstCoursesBody.items).toHaveLength(2);
      expect(firstCoursesBody.nextCursor).toBeTruthy();
      const allCourses = await walk(ctx, "/api/courses", 2);
      expect(allCourses).toHaveLength(3);
      expect(new Set(allCourses.map((c: { id: string }) => c.id)).size).toBe(3);

      // ── Evaluaciones coach: 3 borradores → GET /api/evaluations?limit=2 ──
      const studentId = (await pool.query(`SELECT id FROM users WHERE email = $1`, [USER_EMAIL])).rows[0].id;
      const evalIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const post = await ctx.post("/api/evaluations", {
          data: { studentId, rubricId: rubricIds[0] },
          headers: { "Content-Type": "application/json" },
        });
        expect(post.status()).toBe(201);
        evalIds.push((await post.json()).evaluation.id);
      }
      const firstEvals = await ctx.get("/api/evaluations?limit=2");
      expect(firstEvals.status()).toBe(200);
      const firstEvalsBody = await firstEvals.json();
      expect(firstEvalsBody.items).toHaveLength(2);
      expect(firstEvalsBody.nextCursor).toBeTruthy();
      const allEvals = await walk(ctx, "/api/evaluations", 2);
      expect(allEvals).toHaveLength(3);
      expect(new Set(allEvals.map((e: { id: string }) => e.id)).size).toBe(3);

      // ── Publicar las 3 para history + student ─────────────────────────────
      const criteriaId = (await pool.query(
        `SELECT id FROM rubric_criteria WHERE rubric_id = $1 LIMIT 1`,
        [rubricIds[0]]
      )).rows[0].id;
      const levelId = (await pool.query(
        `SELECT id FROM rubric_levels WHERE rubric_id = $1 AND score = 4 LIMIT 1`,
        [rubricIds[0]]
      )).rows[0].id;
      for (const id of evalIds) {
        const save = await ctx.put(`/api/evaluations/${id}`, {
          data: { scores: [{ criteriaId, levelId }] },
          headers: { "Content-Type": "application/json" },
        });
        expect(save.status()).toBe(200);
        const publish = await ctx.post(`/api/evaluations/${id}/publish`);
        expect(publish.status()).toBe(200);
      }

      // ── Historial coach: 3 publicadas → GET /api/history?limit=2 ─────────
      const firstHistory = await ctx.get("/api/history?limit=2");
      expect(firstHistory.status()).toBe(200);
      const firstHistoryBody = await firstHistory.json();
      expect(firstHistoryBody.items).toHaveLength(2);
      expect(firstHistoryBody.nextCursor).toBeTruthy();
      const allHistory = await walk(ctx, "/api/history", 2);
      expect(allHistory).toHaveLength(3);
      expect(new Set(allHistory.map((e: { id: string }) => e.id)).size).toBe(3);

      // ── Alumno: 3 publicadas → GET /api/student/evaluations?limit=2 ──────
      const studentCtx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
      try {
        const firstStudent = await studentCtx.get("/api/student/evaluations?limit=2");
        expect(firstStudent.status()).toBe(200);
        const firstStudentBody = await firstStudent.json();
        expect(firstStudentBody.items).toHaveLength(2);
        expect(firstStudentBody.nextCursor).toBeTruthy();
        const allStudent = await walk(studentCtx, "/api/student/evaluations", 2);
        expect(allStudent).toHaveLength(3);
        expect(new Set(allStudent.map((e: { id: string }) => e.id)).size).toBe(3);
      } finally {
        await studentCtx.dispose();
      }

      // ── Query inválida → 400 (limit fuera de rango / cursor no ISO) ───────
      expect((await ctx.get("/api/rubrics?limit=0")).status()).toBe(400);
      expect((await ctx.get("/api/rubrics?limit=51")).status()).toBe(400);
      expect((await ctx.get("/api/rubrics?cursor=not-a-date")).status()).toBe(400);
      expect((await ctx.get("/api/courses?limit=abc")).status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });
});