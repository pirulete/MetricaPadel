/**
 * Happy-path API tests de miembros de academia (invite → accept → list → remove)
 * con SQL real. Cubre multi-academia y el guard de último OWNER.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const OWNER_EMAIL = `member-owner-${Date.now()}@test.local`;
const OWNER_PASSWORD = "TestPass123!";
const INVITED_EMAIL = `member-invited-${Date.now()}@test.local`;
const INVITED_PASSWORD = "TestPass123!";

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

test.describe("Academy members — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: OWNER_EMAIL, password: OWNER_PASSWORD });
    await createUser({ role: "ADMIN", email: INVITED_EMAIL, password: INVITED_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [OWNER_EMAIL]
    );
    await pool.query(
      `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [OWNER_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[OWNER_EMAIL, INVITED_EMAIL]]);
  });

  test("invite → accept → list → remove + último OWNER 400", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ownerCtx = await createAuthedContext(OWNER_EMAIL, OWNER_PASSWORD);
    const invitedCtx = await createAuthedContext(INVITED_EMAIL, INVITED_PASSWORD);
    const pool = getPool();
    const slug = `member-academy-${Date.now()}`;
    try {
      // OWNER crea academia
      const post = await ownerCtx.post("/api/academies", {
        data: { name: "Academia Miembros", slug },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const academyId = (await post.json()).academy.id;

      // Invitado NO ve la academia antes de aceptar (membresía pending)
      const beforeAccept = await invitedCtx.get("/api/academies");
      const beforeAcceptBody = await beforeAccept.json();
      expect(beforeAcceptBody.academies.find((a: { id: string }) => a.id === academyId)).toBeFalsy();

      // OWNER invita al segundo ADMIN
      const invite = await ownerCtx.post(`/api/academies/${academyId}/members/invite`, {
        data: { email: INVITED_EMAIL },
        headers: { "Content-Type": "application/json" },
      });
      expect(invite.status()).toBe(201);
      const inviteBody = await invite.json();
      expect(inviteBody.membership.status).toBe("pending");
      expect(inviteBody.membership.role).toBe("COACH");

      // Verificación SQL real: membresía pending
      const { rows: pendingRows } = await pool.query(
        `SELECT status FROM academy_memberships WHERE academy_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)`,
        [academyId, INVITED_EMAIL]
      );
      expect(pendingRows[0].status).toBe("pending");

      // Re-invitar → 409
      const reInvite = await ownerCtx.post(`/api/academies/${academyId}/members/invite`, {
        data: { email: INVITED_EMAIL },
        headers: { "Content-Type": "application/json" },
      });
      expect(reInvite.status()).toBe(409);

      // Invitado acepta (solo self)
      const invitedUserId = (
        await pool.query(`SELECT id FROM users WHERE email = $1`, [INVITED_EMAIL])
      ).rows[0].id as string;
      const accept = await invitedCtx.post(`/api/academies/${academyId}/members/${invitedUserId}/accept`);
      expect(accept.status()).toBe(200);
      const acceptBody = await accept.json();
      expect(acceptBody.membership.status).toBe("active");

      // Invitado ya ve la academia
      const afterAccept = await invitedCtx.get("/api/academies");
      const afterAcceptBody = await afterAccept.json();
      expect(afterAcceptBody.academies.find((a: { id: string }) => a.id === academyId)).toBeTruthy();

      // Lista de miembros (COACH puede leer)
      const members = await invitedCtx.get(`/api/academies/${academyId}/members`);
      expect(members.status()).toBe(200);
      const membersBody = await members.json();
      expect(membersBody.members).toHaveLength(2);
      const invitedMember = membersBody.members.find((m: { email: string }) => m.email === INVITED_EMAIL);
      expect(invitedMember.role).toBe("COACH");
      expect(invitedMember.status).toBe("active");

      // Remover al último OWNER → 400
      const ownerUserId = (
        await pool.query(`SELECT id FROM users WHERE email = $1`, [OWNER_EMAIL])
      ).rows[0].id as string;
      const removeOwner = await ownerCtx.delete(`/api/academies/${academyId}/members/${ownerUserId}`);
      expect(removeOwner.status()).toBe(400);

      // Remover al COACH → 200 (soft)
      const removeCoach = await ownerCtx.delete(`/api/academies/${academyId}/members/${invitedUserId}`);
      expect(removeCoach.status()).toBe(200);
      const removeBody = await removeCoach.json();
      expect(removeBody.membership.status).toBe("removed");

      // Verificación SQL real: status removed
      const { rows: removedRows } = await pool.query(
        `SELECT status FROM academy_memberships WHERE academy_id = $1 AND user_id = $2`,
        [academyId, invitedUserId]
      );
      expect(removedRows[0].status).toBe("removed");

      // El removido ya no ve la academia
      const afterRemove = await invitedCtx.get("/api/academies");
      const afterRemoveBody = await afterRemove.json();
      expect(afterRemoveBody.academies.find((a: { id: string }) => a.id === academyId)).toBeFalsy();
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
        [OWNER_EMAIL]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
        [OWNER_EMAIL]
      );
    }
  });

  test("invite crea usuario TEMPORARY si el email no existe", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ownerCtx = await createAuthedContext(OWNER_EMAIL, OWNER_PASSWORD);
    const pool = getPool();
    const slug = `member-new-${Date.now()}`;
    const newEmail = `brand-new-${Date.now()}@test.local`;
    try {
      const post = await ownerCtx.post("/api/academies", {
        data: { name: "Academia Nueva", slug },
        headers: { "Content-Type": "application/json" },
      });
      const academyId = (await post.json()).academy.id;

      const invite = await ownerCtx.post(`/api/academies/${academyId}/members/invite`, {
        data: { email: newEmail },
        headers: { "Content-Type": "application/json" },
      });
      expect(invite.status()).toBe(201);

      // Verificación SQL real: usuario TEMPORARY + membresía pending
      const { rows: userRows } = await pool.query(
        `SELECT status FROM users WHERE email = $1`,
        [newEmail]
      );
      expect(userRows[0].status).toBe("TEMPORARY");
      const { rows: memberRows } = await pool.query(
        `SELECT status FROM academy_memberships WHERE academy_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)`,
        [academyId, newEmail]
      );
      expect(memberRows[0].status).toBe("pending");
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
        [OWNER_EMAIL]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
        [OWNER_EMAIL]
      );
      await pool2.query(`DELETE FROM users WHERE email = $1`, [newEmail]);
    }
  });
});