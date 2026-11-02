/**
 * Happy-path API tests de /api/transitions (CRUD del coach) con SQL real.
 *
 * Cubre AC-05 / EC-03: POST 201 + fila real en `coach_transitions` + auditoría
 * `CREATE`, GET lista/detalle, PUT con auditoría `UPDATE`, DELETE hard con
 * auditoría `DELETE` (F14: 3 SELECT a `audit_logs`) y **IDOR cross-coach → 404**
 * con dos ADMINs distintos (nunca 403 por recurso ajeno).
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

const COACH_A = `padel-coach-a-transitions-${Date.now()}@test.local`;
const COACH_B = `padel-coach-b-transitions-${Date.now()}@test.local`;
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

/** Paso mínimo válido: 4 jugadores en cancha (0..10 × 0..20) y sin tiro. */
function step(id: number, label: string) {
  return {
    id,
    label,
    positions: {
      A: { x: 3, y: 4 },
      B: { x: 7, y: 4 },
      C: { x: 3, y: 16 },
      D: { x: 7, y: 16 },
    },
    shot: null,
  };
}

test.describe("Transitions — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: COACH_A, password: PASSWORD });
    await createUser({ role: "ADMIN", email: COACH_B, password: PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    const emails = [COACH_A, COACH_B];
    await pool.query(
      `DELETE FROM audit_logs WHERE entity_name = 'coach_transition'
         AND user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [emails]
    );
    await pool.query(
      `DELETE FROM coach_transitions WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [emails]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
    await pool.end();
  });

  test("POST + GET + PUT + DELETE con auditoría y IDOR cross-coach → 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctxA = await createAuthedContext(COACH_A, PASSWORD);
    const ctxB = await createAuthedContext(COACH_B, PASSWORD);
    const pool = getPool();
    try {
      const { rows: coachRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH_A]);
      const coachAId = coachRows[0].id as string;

      // POST crea transición (1 paso)
      const post = await ctxA.post("/api/transitions", {
        data: { title: "Transición E2E", initialStepIndex: 0, steps: [step(1, "Paso 1")] },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const created = await post.json();
      const transitionId = created.transition.id as string;
      expect(transitionId).toBeTruthy();
      expect(created.transition.steps).toHaveLength(1);

      // Verificación SQL real: fila persistida con ownerId de la sesión
      const { rows: rowCheck } = await pool.query(
        `SELECT owner_id, title, jsonb_array_length(scenario -> 'steps')::int AS n
           FROM coach_transitions WHERE id = $1`,
        [transitionId]
      );
      expect(rowCheck).toHaveLength(1);
      expect(rowCheck[0].owner_id).toBe(coachAId);
      expect(rowCheck[0].title).toBe("Transición E2E");
      expect(rowCheck[0].n).toBe(1);

      // F14: auditoría CREATE con usuario real y payload acotado
      const { rows: createAudit } = await pool.query(
        `SELECT action_type, user_id, new_values FROM audit_logs
          WHERE entity_name = 'coach_transition' AND entity_id = $1`,
        [transitionId]
      );
      expect(createAudit.map((r) => r.action_type)).toContain("CREATE");
      const createRow = createAudit.find((r) => r.action_type === "CREATE");
      expect(createRow.user_id).toBe(coachAId);
      expect(createRow.new_values.stepCount).toBe(1);

      // GET lista la contiene con stepCount calculado en SQL (F11)
      const list = await ctxA.get("/api/transitions");
      expect(list.status()).toBe(200);
      const listBody = await list.json();
      const found = listBody.items.find((item: { id: string }) => item.id === transitionId);
      expect(found).toBeTruthy();
      expect(found.stepCount).toBe(1);

      // GET detalle 200
      const detail = await ctxA.get(`/api/transitions/${transitionId}`);
      expect(detail.status()).toBe(200);
      const detailBody = await detail.json();
      expect(detailBody.transition.title).toBe("Transición E2E");

      // PUT reemplazo completo (2 pasos) + auditoría UPDATE
      const put = await ctxA.put(`/api/transitions/${transitionId}`, {
        data: {
          title: "Transición editada",
          initialStepIndex: 1,
          steps: [step(1, "Paso 1"), step(2, "Paso 2")],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(put.status()).toBe(200);
      const putBody = await put.json();
      expect(putBody.transition.title).toBe("Transición editada");
      expect(putBody.transition.steps).toHaveLength(2);

      const { rows: updatedRows } = await pool.query(
        `SELECT title, jsonb_array_length(scenario -> 'steps')::int AS n
           FROM coach_transitions WHERE id = $1`,
        [transitionId]
      );
      expect(updatedRows[0].title).toBe("Transición editada");
      expect(updatedRows[0].n).toBe(2);

      const { rows: updateAudit } = await pool.query(
        `SELECT action_type, old_values, new_values FROM audit_logs
          WHERE entity_name = 'coach_transition' AND entity_id = $1 AND action_type = 'UPDATE'`,
        [transitionId]
      );
      expect(updateAudit).toHaveLength(1);
      expect(updateAudit[0].old_values.stepCount).toBe(1);
      expect(updateAudit[0].new_values.stepCount).toBe(2);

      // IDOR cross-coach: coach B → 404 en GET/PUT/DELETE (nunca 403)
      expect((await ctxB.get(`/api/transitions/${transitionId}`)).status()).toBe(404);
      expect(
        (
          await ctxB.put(`/api/transitions/${transitionId}`, {
            data: { title: "Robada", initialStepIndex: 0, steps: [step(1, "X")] },
            headers: { "Content-Type": "application/json" },
          })
        ).status()
      ).toBe(404);
      const listB = await ctxB.get("/api/transitions");
      expect(listB.status()).toBe(200);
      const listBBody = await listB.json();
      expect(listBBody.items.some((item: { id: string }) => item.id === transitionId)).toBe(false);

      // DELETE hard + auditoría DELETE (F14)
      const del = await ctxB.delete(`/api/transitions/${transitionId}`);
      expect(del.status()).toBe(404);

      const deleted = await ctxA.delete(`/api/transitions/${transitionId}`);
      expect(deleted.status()).toBe(200);
      expect(await deleted.json()).toEqual({ deleted: true, id: transitionId });

      const { rows: goneRows } = await pool.query(
        `SELECT count(*)::int AS n FROM coach_transitions WHERE id = $1`,
        [transitionId]
      );
      expect(goneRows[0].n).toBe(0);

      const { rows: deleteAudit } = await pool.query(
        `SELECT action_type, old_values FROM audit_logs
          WHERE entity_name = 'coach_transition' AND entity_id = $1 AND action_type = 'DELETE'`,
        [transitionId]
      );
      expect(deleteAudit).toHaveLength(1);
      expect(deleteAudit[0].old_values.stepCount).toBe(2);
    } finally {
      await ctxA.dispose();
      await ctxB.dispose();
    }
  });
});
