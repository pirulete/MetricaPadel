/**
 * API tests de guards y errores del módulo Torneos (M1):
 * 401 sin sesión · 403 `USER` · 404 anti-IDOR (torneo de otro coach) ·
 * 409 archivado (doble POST archive + agenda sobre archivado) ·
 * 422 ocupación imposible (`infeasible_occupancy`, sin crear run) ·
 * 400 regla del cargador (pareja en 2 grupos de la misma categoría).
 *
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
import miniFixture from "../../fixtures/torneo/mini.json";

const ADMIN_A_EMAIL = `torneo-guard-a-${Date.now()}@test.local`;
const ADMIN_B_EMAIL = `torneo-guard-b-${Date.now()}@test.local`;
const USER_EMAIL = `torneo-guard-user-${Date.now()}@test.local`;
const PASSWORD = "TestPass123!";

const MISSING_ID = "00000000-0000-0000-0000-000000000000";
const MISSING_RUN_ID = "00000000-0000-0000-0000-000000000001";

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

/** Copia mutable del fixture mini (el import original no se toca). */
function cloneFixture(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(miniFixture)) as Record<string, unknown>;
}

test.describe("Torneos — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("todas las rutas de torneos → 401", async ({ request }) => {
    const post = (url: string, data?: unknown) =>
      request.post(`${BASE_URL}${url}`, {
        data,
        headers: { "Content-Type": "application/json" },
      });
    const get = (url: string) => request.get(`${BASE_URL}${url}`);

    expect((await get("/api/torneos")).status()).toBe(401);
    expect((await post("/api/torneos", miniFixture)).status()).toBe(401);
    expect((await get(`/api/torneos/${MISSING_ID}`)).status()).toBe(401);
    expect((await get(`/api/torneos/${MISSING_ID}/instancia`)).status()).toBe(401);
    expect((await post(`/api/torneos/${MISSING_ID}/agenda`, {})).status()).toBe(401);
    expect((await get(`/api/torneos/${MISSING_ID}/runs/${MISSING_RUN_ID}`)).status()).toBe(401);
    expect((await post(`/api/torneos/${MISSING_ID}/archive`)).status()).toBe(401);
  });
});

test.describe("Torneos — 403/404/409/422/400 (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_A_EMAIL, password: PASSWORD });
    await createUser({ role: "ADMIN", email: ADMIN_B_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    const emails = [ADMIN_A_EMAIL, ADMIN_B_EMAIL];
    await pool.query(
      `DELETE FROM tournaments WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [emails]
    );
    await pool.query(
      `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [emails]
    );
    for (const email of [...emails, USER_EMAIL]) await deleteUserByEmail(email);
  });

  test("403: USER (no admin) no opera torneos", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, PASSWORD);
    try {
      const importRes = await ctx.post("/api/torneos", {
        data: miniFixture,
        headers: { "Content-Type": "application/json" },
      });
      expect(importRes.status()).toBe(403);
      expect((await ctx.get("/api/torneos")).status()).toBe(403);
      expect((await ctx.get(`/api/torneos/${MISSING_ID}`)).status()).toBe(403);
      const agenda = await ctx.post(`/api/torneos/${MISSING_ID}/agenda`, {
        data: {},
        headers: { "Content-Type": "application/json" },
      });
      expect(agenda.status()).toBe(403);
      expect((await ctx.post(`/api/torneos/${MISSING_ID}/archive`)).status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("404: torneo de otro coach (anti-IDOR, nunca 403)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctxA = await createAuthedContext(ADMIN_A_EMAIL, PASSWORD);
    const ctxB = await createAuthedContext(ADMIN_B_EMAIL, PASSWORD);
    try {
      const importRes = await ctxA.post("/api/torneos", {
        data: miniFixture,
        headers: { "Content-Type": "application/json" },
      });
      expect(importRes.status()).toBe(201);
      const tournamentId = (await importRes.json()).tournamentId as string;

      // El dueño sí lo ve
      expect((await ctxA.get(`/api/torneos/${tournamentId}`)).status()).toBe(200);

      // Otro coach: 404 en todas las rutas del recurso
      expect((await ctxB.get(`/api/torneos/${tournamentId}`)).status()).toBe(404);
      expect((await ctxB.get(`/api/torneos/${tournamentId}/instancia`)).status()).toBe(404);
      const agenda = await ctxB.post(`/api/torneos/${tournamentId}/agenda`, {
        data: {},
        headers: { "Content-Type": "application/json" },
      });
      expect(agenda.status()).toBe(404);
      expect((await ctxB.post(`/api/torneos/${tournamentId}/archive`)).status()).toBe(404);

      // La lista de B no lo incluye
      const listB = await ctxB.get("/api/torneos?limit=50");
      expect(listB.status()).toBe(200);
      const idsB = (await listB.json()).items.map((item: { id: string }) => item.id);
      expect(idsB).not.toContain(tournamentId);
    } finally {
      await ctxA.dispose();
      await ctxB.dispose();
    }
  });

  test("409: archivado (doble POST archive + agenda bloqueada)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_A_EMAIL, PASSWORD);
    try {
      const importRes = await ctx.post("/api/torneos", {
        data: miniFixture,
        headers: { "Content-Type": "application/json" },
      });
      expect(importRes.status()).toBe(201);
      const tournamentId = (await importRes.json()).tournamentId as string;

      const first = await ctx.post(`/api/torneos/${tournamentId}/archive`);
      expect(first.status()).toBe(200);
      expect(await first.json()).toEqual({ archived: true });

      const second = await ctx.post(`/api/torneos/${tournamentId}/archive`);
      expect(second.status()).toBe(409);
      expect((await second.json()).code).toBe("already_archived");

      const agenda = await ctx.post(`/api/torneos/${tournamentId}/agenda`, {
        data: {},
        headers: { "Content-Type": "application/json" },
      });
      expect(agenda.status()).toBe(409);
      expect((await agenda.json()).code).toBe("archived");
    } finally {
      await ctx.dispose();
    }
  });

  test("422: ocupación imposible (capacity 0 en previa) sin crear run", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_A_EMAIL, PASSWORD);
    const pool = getPool();
    try {
      const payload = cloneFixture();
      const previaBlocks: Record<string, number> = {};
      // 8 bloques de previa en mini.json (idx 0..7) ⇒ capacidad 0 ⇒ ρ = ∞
      for (let idx = 0; idx < 8; idx += 1) previaBlocks[String(idx)] = 0;
      payload.capacidad_especial = previaBlocks;

      const importRes = await ctx.post("/api/torneos", {
        data: payload,
        headers: { "Content-Type": "application/json" },
      });
      expect(importRes.status()).toBe(201);
      const tournamentId = (await importRes.json()).tournamentId as string;

      const agenda = await ctx.post(`/api/torneos/${tournamentId}/agenda`, {
        data: { force: false },
        headers: { "Content-Type": "application/json" },
      });
      expect(agenda.status()).toBe(422);
      const body = await agenda.json();
      expect(body.code).toBe("infeasible_occupancy");
      expect(body.semaforo.previa.color).toBe("rojo");

      // EC-01: el pre-check no crea run
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM tournament_runs WHERE tournament_id = $1`,
        [tournamentId]
      );
      expect(rows[0].n).toBe(0);
    } finally {
      await ctx.dispose();
    }
  });

  test("400: regla del cargador (pareja en 2 grupos de la misma categoría)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_A_EMAIL, PASSWORD);
    const pool = getPool();
    try {
      const payload = cloneFixture();
      const invalidName = `Mini inválido ${Date.now()}`;
      (payload.meta as { name: string }).name = invalidName;
      const categorias = payload.categorias as Record<
        string,
        { grupos: Record<string, string[]> }
      >;
      // 1ra-G1-A aparece en G1 y otra vez en G2 ⇒ duplicate_team (R1)
      categorias["1ra"].grupos.G2 = ["1ra-G1-A", "1ra-G2-B", "1ra-G2-C"];

      const res = await ctx.post("/api/torneos", {
        data: payload,
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("invalid_instance");
      const codes = (body.details as Array<{ code: string; path: string }>).map(
        (error) => error.code
      );
      expect(codes).toContain("duplicate_team");
      expect(
        (body.details as Array<{ code: string; path: string }>).some(
          (error) => error.path === "categorias[1ra].grupos[G2][0]"
        )
      ).toBe(true);

      // Rollback total (AC-02): el torneo inválido no deja ninguna fila
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM tournaments
          WHERE name = $1 AND owner_id IN (SELECT id FROM users WHERE email = $2)`,
        [invalidName, ADMIN_A_EMAIL]
      );
      expect(rows[0].n).toBe(0);
    } finally {
      await ctx.dispose();
    }
  });
});
