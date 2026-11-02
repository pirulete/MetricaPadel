/**
 * API tests de guards del Editor de Transiciones (coach/ADMIN).
 * 401 sin sesión (sin DB); 403 de rol/estado y 404 anti-IDOR con SQL real (skip graceful).
 * Contrato: `production_artifacts/2026-11-02-coach-transition-editor/auth-impact.md` §1 y §9.
 * @group api
 */
import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
  getPool,
} from "../admin/marketing/helpers";

const STAMP = Date.now();
const COACH_A_EMAIL = `padel-transitions-a-${STAMP}@test.local`;
const COACH_B_EMAIL = `padel-transitions-b-${STAMP}@test.local`;
const USER_EMAIL = `padel-transitions-user-${STAMP}@test.local`;
const TEMP_ADMIN_EMAIL = `padel-transitions-temp-${STAMP}@test.local`;
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

const UUID = "00000000-0000-0000-0000-000000000000";
const MISSING_ID = "11111111-2222-4333-8444-555555555555";

/** Escenario mínimo válido (`transitionCreateSchema`). */
function transitionPayload(title = "Transición de prueba") {
  const step = (id: number) => ({
    id,
    label: `Paso ${id}`,
    positions: {
      A: { x: 2, y: 2 },
      B: { x: 8, y: 2 },
      C: { x: 2, y: 18 },
      D: { x: 8, y: 18 },
    },
    shot: null,
  });
  return { title, initialStepIndex: 0, steps: [step(1), step(2)] };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** ADMIN + TEMPORARY: el rol pasa, el estado NO (guardAdmin exige ACTIVE). */
async function insertTemporaryAdmin(email: string, password: string) {
  const hash = await bcrypt.hash(password, 10);
  await getPool().query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Temp', 'Admin', $2, 'TEMPORARY', 'ADMIN', now(), now())
     ON CONFLICT (email) DO UPDATE SET status = 'TEMPORARY', role = 'ADMIN', password_hash = $2`,
    [email.toLowerCase(), hash]
  );
}

test.describe("Transiciones — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("GET /api/transitions → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/transitions`)).status()).toBe(401);
  });

  test("POST /api/transitions → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/transitions`, {
      data: transitionPayload(),
      headers: JSON_HEADERS,
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/transitions/[id] → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/transitions/${UUID}`)).status()).toBe(401);
  });

  test("PUT /api/transitions/[id] → 401", async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/transitions/${UUID}`, {
      data: transitionPayload(),
      headers: JSON_HEADERS,
    });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/transitions/[id] → 401", async ({ request }) => {
    expect((await request.delete(`${BASE_URL}/api/transitions/${UUID}`)).status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Transiciones — 403/404 (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: COACH_A_EMAIL, password: PASSWORD });
    await createUser({ role: "ADMIN", email: COACH_B_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: PASSWORD });
    await insertTemporaryAdmin(TEMP_ADMIN_EMAIL, PASSWORD);
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM coach_transitions WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`,
      [[COACH_A_EMAIL, COACH_B_EMAIL, TEMP_ADMIN_EMAIL]]
    );
    for (const email of [COACH_A_EMAIL, COACH_B_EMAIL, USER_EMAIL, TEMP_ADMIN_EMAIL]) {
      await deleteUserByEmail(email);
    }
  });

  test("USER + ACTIVE en los 5 endpoints → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, PASSWORD);
    try {
      expect((await ctx.get("/api/transitions")).status()).toBe(403);
      const post = await ctx.post("/api/transitions", {
        data: transitionPayload(),
        headers: JSON_HEADERS,
      });
      expect(post.status()).toBe(403);
      expect((await ctx.get(`/api/transitions/${UUID}`)).status()).toBe(403);
      const put = await ctx.put(`/api/transitions/${UUID}`, {
        data: transitionPayload(),
        headers: JSON_HEADERS,
      });
      expect(put.status()).toBe(403);
      expect((await ctx.delete(`/api/transitions/${UUID}`)).status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("ADMIN + TEMPORARY en los 5 endpoints → 403 (email no verificado)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(TEMP_ADMIN_EMAIL, PASSWORD);
    try {
      expect((await ctx.get("/api/transitions")).status()).toBe(403);
      const post = await ctx.post("/api/transitions", {
        data: transitionPayload(),
        headers: JSON_HEADERS,
      });
      expect(post.status()).toBe(403);
      expect((await ctx.get(`/api/transitions/${UUID}`)).status()).toBe(403);
      const put = await ctx.put(`/api/transitions/${UUID}`, {
        data: transitionPayload(),
        headers: JSON_HEADERS,
      });
      expect(put.status()).toBe(403);
      expect((await ctx.delete(`/api/transitions/${UUID}`)).status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("IDOR cross-coach: coach B no puede leer, escribir ni borrar lo de A", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctxA = await createAuthedContext(COACH_A_EMAIL, PASSWORD);
    const ctxB = await createAuthedContext(COACH_B_EMAIL, PASSWORD);
    try {
      const created = await ctxA.post("/api/transitions", {
        data: transitionPayload("Solo del coach A"),
        headers: JSON_HEADERS,
      });
      expect(created.status()).toBe(201);
      const { transition } = (await created.json()) as { transition: { id: string } };
      expect(transition.id).toBeTruthy();

      // Recurso ajeno = 404 (nunca 403: no revelar existencia).
      expect((await ctxB.get(`/api/transitions/${transition.id}`)).status()).toBe(404);
      const put = await ctxB.put(`/api/transitions/${transition.id}`, {
        data: transitionPayload("Secuestrada"),
        headers: JSON_HEADERS,
      });
      expect(put.status()).toBe(404);
      expect((await ctxB.delete(`/api/transitions/${transition.id}`)).status()).toBe(404);

      // El listado de B no filtra el id de A (ownerId siempre en el WHERE).
      const listB = await ctxB.get("/api/transitions");
      expect(listB.status()).toBe(200);
      const bodyB = (await listB.json()) as { items: Array<{ id: string }> };
      expect(bodyB.items.some((item) => item.id === transition.id)).toBe(false);

      // A sigue siendo dueño (nada se borró ni mutó).
      expect((await ctxA.get(`/api/transitions/${transition.id}`)).status()).toBe(200);
    } finally {
      await ctxA.dispose();
      await ctxB.dispose();
    }
  });

  test("uuid inexistente como ADMIN → 404 (mismo código que ajeno)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(COACH_A_EMAIL, PASSWORD);
    try {
      expect((await ctx.get(`/api/transitions/${MISSING_ID}`)).status()).toBe(404);
      const put = await ctx.put(`/api/transitions/${MISSING_ID}`, {
        data: transitionPayload(),
        headers: JSON_HEADERS,
      });
      expect(put.status()).toBe(404);
      expect((await ctx.delete(`/api/transitions/${MISSING_ID}`)).status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});
