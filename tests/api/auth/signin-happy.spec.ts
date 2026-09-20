/**
 * Happy-path del signin con SQL real contra NeonDB.
 * Crea usuario de prueba con INSERT de columnas base (compatible sin migración
 * 0001), hace signin, verifica respuesta y auditoría LOGIN, y limpia.
 * Skip graceful sin DATABASE_URL o sin servidor.
 * @group api
 */
import { test, expect } from "@playwright/test";
import { BASE_URL, HAS_DB, cleanupTestUser, getPool, insertUser, serverUp, uniqueIp } from "./helpers";

const EMAIL = `signin-happy-${Date.now()}@test.local`;
const PASSWORD = "HappyPass123!";

let userId: string | undefined;

test.describe("POST /api/auth/signin — happy-path con SQL real", () => {
  test.skip(!HAS_DB, "Requiere DATABASE_URL (SQL real contra NeonDB)");

  let ready = false;

  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    if (!ready) {
      userId = await insertUser({ email: EMAIL, password: PASSWORD, status: "ACTIVE" });
      ready = true;
    }
  });

  test.afterAll(async () => {
    if (!HAS_DB) return;
    await cleanupTestUser(EMAIL, userId);
  });

  test("signin exitoso → 200, datos del usuario y auditoría LOGIN", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/signin`, {
      data: { email: EMAIL, password: PASSWORD },
      headers: { "x-forwarded-for": uniqueIp() },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.id).toBe(userId);
    expect(body.user.email).toBe(EMAIL);
    expect(body.user.status).toBe("ACTIVE");

    // Auditoría registrada en audit_logs (SQL real)
    const audit = await getPool().query(
      `SELECT action_type, metadata FROM audit_logs
       WHERE action_type = 'LOGIN' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows[0].metadata?.success).toBe(true);
  });
});
