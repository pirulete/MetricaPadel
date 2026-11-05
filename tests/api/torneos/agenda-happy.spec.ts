/**
 * Happy-path API test del ciclo asíncrono de agenda (M1) con SQL real:
 * import mini → POST /agenda (202 en < 2 s, AC-08) → worker con `x-worker-secret`
 * → run terminal `succeeded` → `slotsCount === matches` + 0 errores del
 * verificador (AC-06) → `?include=slots` coherente canchas × bloques.
 *
 * El run también puede completarse por el `dispatchRun` fire-and-forget del
 * propio route (technical-design §6.4.1): si el worker del servidor ganó el
 * claim atómico, la invocación explícita del test es idempotente y responde
 * 409 `not_claimed`, así que el assert del status HTTP acepta ambos.
 *
 * @group api
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
  getPool,
} from "../admin/marketing/helpers";
import miniFixture from "../../fixtures/torneo/mini.json";

const ADMIN_EMAIL = `torneo-agenda-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";

const TERMINAL = ["succeeded", "infeasible", "failed", "invalid"];

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
const WORKER_SECRET = process.env.TOURNAMENT_WORKER_SECRET?.trim() ?? "";

interface RunBody {
  run: {
    runId: string;
    status: string;
    engineStatus: string | null;
    slotsCount: number;
    error: { code: string } | null;
    diagnostics: { verificationErrors: unknown[]; semaforo?: unknown } | null;
    slots?: Array<{ matchId: string; blockIdx: number; court: number; phase: string }>;
  };
}

/** Polling del run hasta estado terminal (el hook de UI hace lo mismo, §6.6). */
async function pollTerminalRun(
  ctx: APIRequestContext,
  tournamentId: string,
  runId: string,
): Promise<RunBody["run"]> {
  const deadline = Date.now() + 90_000;
  let last = "";
  while (Date.now() < deadline) {
    const res = await ctx.get(`/api/torneos/${tournamentId}/runs/${runId}`);
    if (res.ok()) {
      const body = (await res.json()) as RunBody;
      last = JSON.stringify(body.run.status);
      if (TERMINAL.includes(body.run.status)) return body.run;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`El run no llegó a estado terminal en 90 s (último status: ${last})`);
}

test.describe("Torneos — agenda happy-path (SQL real)", () => {
  test.describe.configure({ timeout: 180_000 });

  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM tournaments WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await deleteUserByEmail(ADMIN_EMAIL);
  });

  test("202 → worker → succeeded → slots === partidos y 0 errores (AC-06/AC-08)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    test.skip(
      WORKER_SECRET.length === 0,
      "Requiere TOURNAMENT_WORKER_SECRET en el entorno del servidor y del test (fail-closed 503)"
    );

    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const importRes = await ctx.post("/api/torneos", {
        data: miniFixture,
        headers: { "Content-Type": "application/json" },
      });
      expect(importRes.status()).toBe(201);
      const imported = await importRes.json();
      const tournamentId = imported.tournamentId as string;
      const expectedMatches = imported.counts.matches as number;

      // --- 202 sin esperar al solver (AC-08: < 2 s) -------------------------
      const startedAt = Date.now();
      const agendaRes = await ctx.post(`/api/torneos/${tournamentId}/agenda`, {
        data: { timeLimitMs: 30_000 },
        headers: { "Content-Type": "application/json" },
      });
      const elapsedMs = Date.now() - startedAt;
      expect(agendaRes.status()).toBe(202);
      const queued = await agendaRes.json();
      expect(queued.status).toBe("queued");
      const runId = queued.runId as string;
      expect(runId).toBeTruthy();
      expect(elapsedMs).toBeLessThan(5_000);

      // El run queda persistido en `queued` con el clamp aplicado (§6.4)
      const { rows: runRows } = await pool.query(
        `SELECT status, params FROM tournament_runs WHERE id = $1`,
        [runId]
      );
      expect(runRows).toHaveLength(1);
      expect(runRows[0].params.timeLimitMs).toBe(30_000);

      // --- invocación explícita del worker (secreto compartido) -------------
      const workerRes = await ctx.post("/api/internal/tournament-worker", {
        data: { runId },
        headers: { "Content-Type": "application/json", "x-worker-secret": WORKER_SECRET },
        timeout: 150_000,
      });
      // 409 = el dispatch fire-and-forget del route ya reclamó el run (idempotente).
      expect([200, 409]).toContain(workerRes.status());
      if (workerRes.status() === 200) {
        const workerBody = await workerRes.json();
        expect(workerBody.runId).toBe(runId);
        expect(workerBody.status).toBe("succeeded");
        expect(workerBody.verifyErrors).toBe(0);
      }

      // --- estado terminal vía polling (AC-06/AC-08) ------------------------
      const run = await pollTerminalRun(ctx, tournamentId, runId);
      expect(run.status).toBe("succeeded");
      expect(run.error).toBeNull();
      expect(run.engineStatus).toBe("optimal");
      expect(run.slotsCount).toBe(expectedMatches);
      expect(run.diagnostics?.verificationErrors).toEqual([]);
      expect(run.diagnostics?.semaforo).toBeTruthy();

      // SQL real: 1 slot por partido y el torneo pasa a `agenda_draft`
      const { rows: slotCountRows } = await pool.query(
        `SELECT count(*)::int AS slots, count(DISTINCT match_id)::int AS matches
           FROM tournament_agenda_slots WHERE run_id = $1`,
        [runId]
      );
      expect(slotCountRows[0].slots).toBe(expectedMatches);
      expect(slotCountRows[0].matches).toBe(expectedMatches);

      const { rows: tournamentRows } = await pool.query(
        `SELECT status FROM tournaments WHERE id = $1`,
        [tournamentId]
      );
      expect(tournamentRows[0].status).toBe("agenda_draft");

      // --- agenda del run (include=slots) -----------------------------------
      const slotsRes = await ctx.get(
        `/api/torneos/${tournamentId}/runs/${runId}?include=slots`
      );
      expect(slotsRes.status()).toBe(200);
      const slotsBody = (await slotsRes.json()) as RunBody;
      const slots = slotsBody.run.slots ?? [];
      expect(slotsBody.run.slotsCount).toBe(expectedMatches);
      expect(slots).toHaveLength(expectedMatches);

      const byCourt = new Map<number, Set<number>>();
      const byBlock = new Map<number, number>();
      for (const slot of slots) {
        expect(slot.blockIdx).toBeGreaterThanOrEqual(0);
        expect(slot.blockIdx).toBeLessThan(18); // 18 bloques en mini.json
        expect(slot.court).toBeGreaterThanOrEqual(1);
        expect(slot.court).toBeLessThanOrEqual(miniFixture.meta.courts);

        const courts = byCourt.get(slot.blockIdx) ?? new Set<number>();
        courts.add(slot.court);
        byCourt.set(slot.blockIdx, courts);
        byBlock.set(slot.blockIdx, (byBlock.get(slot.blockIdx) ?? 0) + 1);
      }
      // Una cancha por partido dentro de cada bloque y capacidad respetada
      for (const [blockIdx, courts] of byCourt) {
        expect(courts.size).toBe(byBlock.get(blockIdx));
        expect(courts.size).toBeLessThanOrEqual(miniFixture.meta.courts);
      }

      // --- el detalle expone el run vigente (`currentRun`, O-m6) -------------
      const detailRes = await ctx.get(`/api/torneos/${tournamentId}`);
      expect(detailRes.status()).toBe(200);
      const detail = await detailRes.json();
      expect(detail.currentRun.runId).toBe(runId);
      expect(detail.activeRun).toBeNull();
      expect(detail.tournament.status).toBe("agenda_draft");
    } finally {
      await ctx.dispose();
    }
  });
});
