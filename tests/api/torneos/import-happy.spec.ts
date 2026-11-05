/**
 * Happy-path API tests del import de torneos (M1) con SQL real:
 * POST mini.json → filas persistidas → GET detalle (counts) → GET instancia
 * (round-trip AC-04) → auditoría CREATE.
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

const ADMIN_EMAIL = `torneo-import-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";

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

/** Conteos esperados del fixture mini (2 grupos de 3 ⇒ 6 previa + 3 de cuadro). */
const EXPECTED = {
  blocks: 18,
  categories: 1,
  groups: 2,
  teams: 6,
  persons: 12,
  matchesPrevia: 6,
  matchesFinal: 3,
  matches: 9,
} as const;

test.describe("Torneos — import happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    // tournaments cascade → bloques, categorías, grupos, personas, parejas,
    // partidos, runs y slots (schema.ts §torneos).
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

  test("import → detalle → instancia (round-trip) con SQL real", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // --- import (AC-02) ---------------------------------------------------
      const res = await ctx.post("/api/torneos", {
        data: miniFixture,
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(201);
      const created = await res.json();
      const tournamentId = created.tournamentId as string;
      expect(tournamentId).toBeTruthy();
      expect(created.counts).toMatchObject(EXPECTED);

      // SQL real: el import escribió exactamente lo declarado
      const { rows: tournamentRows } = await pool.query(
        `SELECT status, courts, block_minutes FROM tournaments WHERE id = $1`,
        [tournamentId]
      );
      expect(tournamentRows).toHaveLength(1);
      expect(tournamentRows[0].status).toBe("draft");
      expect(tournamentRows[0].courts).toBe(2);

      const { rows: rowCounts } = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM tournament_blocks WHERE tournament_id = $1) AS blocks,
           (SELECT count(*)::int FROM tournament_categories WHERE tournament_id = $1) AS categories,
           (SELECT count(*)::int FROM tournament_groups WHERE tournament_id = $1) AS groups,
           (SELECT count(*)::int FROM tournament_teams WHERE tournament_id = $1) AS teams,
           (SELECT count(*)::int FROM tournament_persons WHERE tournament_id = $1) AS persons,
           (SELECT count(*)::int FROM tournament_matches WHERE tournament_id = $1 AND phase = 'previa') AS previa,
           (SELECT count(*)::int FROM tournament_matches WHERE tournament_id = $1 AND phase = 'final') AS final,
           (SELECT count(*)::int FROM tournament_matches WHERE tournament_id = $1) AS matches`,
        [tournamentId]
      );
      const counts = rowCounts[0];
      expect(counts.blocks).toBe(EXPECTED.blocks);
      expect(counts.categories).toBe(EXPECTED.categories);
      expect(counts.groups).toBe(EXPECTED.groups);
      expect(counts.teams).toBe(EXPECTED.teams);
      expect(counts.persons).toBe(EXPECTED.persons);
      expect(counts.previa).toBe(EXPECTED.matchesPrevia);
      expect(counts.final).toBe(EXPECTED.matchesFinal);
      expect(counts.matches).toBe(EXPECTED.matches);

      // Auditoría CREATE del import
      const { rows: auditRows } = await pool.query(
        `SELECT new_values FROM audit_logs
          WHERE action_type = 'CREATE' AND entity_name = 'tournament' AND entity_id = $1`,
        [tournamentId]
      );
      expect(auditRows).toHaveLength(1);

      // --- detalle (AC-02/AC-08) -------------------------------------------
      const detailRes = await ctx.get(`/api/torneos/${tournamentId}`);
      expect(detailRes.status()).toBe(200);
      const detail = await detailRes.json();
      expect(detail.tournament.id).toBe(tournamentId);
      expect(detail.tournament.name).toBe(miniFixture.meta.name);
      expect(detail.tournament.status).toBe("draft");
      expect(detail.counts).toMatchObject({
        blocks: EXPECTED.blocks,
        categories: EXPECTED.categories,
        groups: EXPECTED.groups,
        teams: EXPECTED.teams,
        matches: EXPECTED.matches,
        matchesPrevia: EXPECTED.matchesPrevia,
        matchesFinal: EXPECTED.matchesFinal,
      });
      expect(detail.blocks).toHaveLength(EXPECTED.blocks);
      expect(detail.blocks[0]).toMatchObject({ idx: 0, dayLabel: "Sab", startTime: "08:00", phase: "previa" });
      expect(detail.blocks[detail.blocks.length - 1].idx).toBe(EXPECTED.blocks - 1);
      expect(detail.activeRun).toBeNull();
      expect(detail.currentRun).toBeNull();

      // La lista del coach incluye el torneo recién importado
      const listRes = await ctx.get("/api/torneos?limit=50");
      expect(listRes.status()).toBe(200);
      const list = await listRes.json();
      expect(list.items.map((item: { id: string }) => item.id)).toContain(tournamentId);

      // --- instancia espejo (AC-04 round-trip) -----------------------------
      const instRes = await ctx.get(`/api/torneos/${tournamentId}/instancia`);
      expect(instRes.status()).toBe(200);
      const { instancia } = await instRes.json();

      expect(instancia.nCanchas).toBe(miniFixture.meta.courts);
      expect(instancia.bloques).toHaveLength(EXPECTED.blocks);
      expect(instancia.bloques[0]).toMatchObject({
        idx: 0,
        dayLabel: "Sab",
        startTime: "08:00",
        phase: "previa",
        capacity: miniFixture.meta.courts,
      });
      expect(instancia.categorias["1ra"].sex).toBe("H");
      expect(instancia.categorias["1ra"].level).toBe(1);
      expect(instancia.categorias["1ra"].grupos).toEqual(["1ra-G1", "1ra-G2"]);

      // Grupos y parejas: mismos códigos y mismo orden que el JSON de entrada
      for (const [groupKey, teamCodes] of Object.entries(miniFixture.categorias["1ra"].grupos)) {
        const groupCode = `1ra-${groupKey}`;
        expect(instancia.grupos[groupCode].categoria).toBe("1ra");
        expect(instancia.grupos[groupCode].tam).toBe(3);
        expect(instancia.grupos[groupCode].parejas).toEqual(teamCodes);
      }
      expect(Object.keys(instancia.parejas)).toHaveLength(EXPECTED.teams);
      for (const [teamCode, team] of Object.entries(miniFixture.parejas)) {
        expect(instancia.parejas[teamCode].personas).toEqual([...team.personas].sort());
      }
      expect(Object.keys(instancia.personas)).toHaveLength(EXPECTED.persons);
      expect(instancia.personas.P101.parejas).toEqual(["1ra-G1-A"]);
      expect(instancia.personas.P112.parejas).toEqual(["1ra-G2-C"]);

      // Partidos: previa con parejas concretas, cuadro con alimentadores
      const partidos = Object.values(instancia.partidos) as Array<{
        id: string;
        phase: string;
        ronda: string;
        grupo: string | null;
        parejas: string[] | null;
        gruposOrigen: string[];
        alimentadores: string[];
      }>;
      expect(partidos).toHaveLength(EXPECTED.matches);
      const previa = partidos.filter((partido) => partido.phase === "previa");
      const final = partidos.filter((partido) => partido.phase === "final");
      expect(previa).toHaveLength(EXPECTED.matchesPrevia);
      expect(final).toHaveLength(EXPECTED.matchesFinal);
      for (const partido of previa) {
        expect(partido.ronda).toBe("grupo");
        expect(partido.grupo).toMatch(/^1ra-G[12]$/);
        expect(partido.parejas).toHaveLength(2);
        expect(partido.alimentadores).toEqual([]);
      }
      // 2 grupos ⇒ cuadro de 4: 2 semifinales + 1 final, con feeders acíclicos
      expect(final.filter((partido) => partido.ronda === "semi")).toHaveLength(2);
      expect(final.filter((partido) => partido.ronda === "final")).toHaveLength(1);
      const finalMatch = final.find((partido) => partido.ronda === "final");
      expect(finalMatch?.parejas).toBeNull();
      expect(finalMatch?.alimentadores).toHaveLength(2);
      expect(finalMatch?.gruposOrigen).toEqual(["1ra-G1", "1ra-G2"]);
    } finally {
      await ctx.dispose();
    }
  });
});
