import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { users } from "@/lib/db/schema";

/**
 * Promueve un usuario USER a ADMIN (G3). Filtra role='USER' para que un
 * usuario ya ADMIN o inexistente retorne null → 404 (anti-IDOR: recurso no
 * aplicable = 404, nunca 403).
 */
export async function promoteUser(id: string) {
  const [row] = await db
    .update(users)
    .set({ role: 'ADMIN', updatedAt: new Date() })
    .where(and(eq(users.id, id), eq(users.role, 'USER')))
    .returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
    });
  return row ?? null;
}