import { db } from "@/lib/db";
import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import bcrypt from "bcryptjs";

/**
 * Crea usuario jugador (role USER) con status ACTIVE directo (D5): el alumno
 * debe poder loguearse sin verificación de email (flujo admin). Email duplicado
 * lanza error de constraint UNIQUE (el API lo traduce a 409).
 */
export async function createActiveUser(data: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}) {
  const normalizedEmail = data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(data.password, 10);

  const [row] = await db.insert(users).values({
    email: normalizedEmail,
    firstName: data.firstName,
    lastName: data.lastName,
    passwordHash,
    status: 'ACTIVE',
    role: 'USER',
  }).returning();

  return row;
}

/**
 * Detalle de jugador por id (solo role USER). Retorna null si no existe o
 * no es role USER (404, no 403).
 */
export async function getPlayerById(id: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, 'USER')))
    .limit(1);
  return row ?? null;
}

/**
 * Lista jugadores (solo role USER) para el picker de P09. search opcional
 * filtra por firstName/lastName/email (ILIKE).
 */
export async function listPlayers(search?: string) {
  const conditions: SQL[] = [eq(users.role, 'USER')];
  if (search) {
    conditions.push(or(
      ilike(users.firstName, `%${search}%`),
      ilike(users.lastName, `%${search}%`),
      ilike(users.email, `%${search}%`),
    ) as SQL);
  }

  return await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      status: users.status,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(users.createdAt);
}