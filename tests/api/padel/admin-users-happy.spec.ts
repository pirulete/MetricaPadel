/**
 * Happy-path API tests de /api/admin/users (crear/listar jugadores) con SQL real.
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

const ADMIN_EMAIL = `padel-admin-users-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const PLAYER_EMAIL = `padel-player-${Date.now()}@test.local`;

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

test.describe("Admin users — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  });

  test.afterAll(async () => {
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(PLAYER_EMAIL);
  });

  test("POST crea jugador ACTIVE + GET lista + GET [id] + 409 duplicado", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // POST crea USER ACTIVE
      const post = await ctx.post("/api/admin/users", {
        data: {
          email: PLAYER_EMAIL,
          firstName: "Lucas",
          lastName: "Pérez",
          password: "PlayerPass123!",
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const created = await post.json();
      expect(created.user.email).toBe(PLAYER_EMAIL);
      expect(created.user.role).toBe("USER");
      expect(created.user.status).toBe("ACTIVE");

      // Verificación SQL real: status ACTIVE + role USER + hash presente
      const { rows } = await pool.query(
        `SELECT status, role, password_hash FROM users WHERE email = $1`,
        [PLAYER_EMAIL]
      );
      expect(rows[0].status).toBe("ACTIVE");
      expect(rows[0].role).toBe("USER");
      expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);

      // GET lista incluye al jugador
      const list = await ctx.get("/api/admin/users");
      expect(list.status()).toBe(200);
      const listBody = await list.json();
      expect(listBody.users.some((u: { email: string }) => u.email === PLAYER_EMAIL)).toBe(true);

      // GET [id]
      const detail = await ctx.get(`/api/admin/users/${created.user.id}`);
      expect(detail.status()).toBe(200);
      const detailBody = await detail.json();
      expect(detailBody.user.email).toBe(PLAYER_EMAIL);

      // POST duplicado → 409
      const dup = await ctx.post("/api/admin/users", {
        data: {
          email: PLAYER_EMAIL,
          firstName: "Lucas",
          lastName: "Pérez",
          password: "PlayerPass123!",
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(dup.status()).toBe(409);

      // POST inválido → 400
      const bad = await ctx.post("/api/admin/users", {
        data: { email: "no-email", firstName: "", lastName: "", password: "x" },
        headers: { "Content-Type": "application/json" },
      });
      expect(bad.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });
});