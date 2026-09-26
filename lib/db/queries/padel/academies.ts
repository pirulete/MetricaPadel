import { db } from "@/lib/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import {
  academies,
  academyMemberships,
  rubrics,
  rubricCriteria,
  users,
  academyMembershipRoleEnum,
  academyStatusEnum,
} from "@/lib/db/schema";
import { createRubric, type RubricCategory } from "./rubrics";

export type AcademyRole = (typeof academyMembershipRoleEnum.enumValues)[number];
export type AcademyStatus = (typeof academyStatusEnum.enumValues)[number];

export type CreateAcademyInput = {
  ownerId: string;
  name: string;
  slug: string;
  primaryColor?: string;
};

export type UpdateAcademyInput = {
  name?: string;
  slug?: string;
  primaryColor?: string;
};

export type InviteMemberResult =
  | {
      ok: true;
      membership: typeof academyMemberships.$inferSelect;
      user: { id: string; email: string; status: string };
    }
  | { ok: false; reason: "already_member" };

export type RemoveMemberResult =
  | { ok: true; membership: typeof academyMemberships.$inferSelect }
  | { ok: false; reason: "not_found" | "last_owner" };

/** Password placeholder para usuarios TEMPORARY invitados (patrón G4): no pueden
 *  loguearse hasta verificar email; si lo necesitan, usan forgot-password. */
function generateRandomPassword(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Crea academia + membresía OWNER (status active) en una transacción.
 * El slug UNIQUE lo valida el API (409 en colisión 23505).
 */
export async function createAcademy(data: CreateAcademyInput) {
  return await db.transaction(async (tx) => {
    const [academy] = await tx.insert(academies).values({
      ownerId: data.ownerId,
      name: data.name,
      slug: data.slug,
      primaryColor: data.primaryColor ?? "#3b82f6",
      status: "active",
    }).returning();

    await tx.insert(academyMemberships).values({
      academyId: academy.id,
      userId: data.ownerId,
      role: "OWNER",
      status: "active",
    });

    return academy;
  });
}

/**
 * Lista academias donde el usuario es miembro ACTIVO (cualquier rol) y la
 * academia está activa. Incluye el rol del usuario y el conteo de miembros.
 */
export async function listUserAcademies(userId: string) {
  return await db
    .select({
      id: academies.id,
      name: academies.name,
      slug: academies.slug,
      logoUrl: academies.logoUrl,
      primaryColor: academies.primaryColor,
      status: academies.status,
      createdAt: academies.createdAt,
      role: academyMemberships.role,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM academy_memberships am
        WHERE am.academy_id = ${academies.id} AND am.status = 'active'
      )`,
    })
    .from(academyMemberships)
    .innerJoin(academies, eq(academies.id, academyMemberships.academyId))
    .where(and(
      eq(academyMemberships.userId, userId),
      eq(academyMemberships.status, "active"),
      eq(academies.status, "active"),
    ))
    .orderBy(desc(academies.createdAt));
}

/** Detalle de academia por id (sin scope de membresía — el guard lo valida). */
export async function getAcademyById(id: string) {
  const [row] = await db.select().from(academies).where(eq(academies.id, id)).limit(1);
  return row ?? null;
}

/** Actualiza branding (name/slug/primaryColor). Retorna null si no existe. */
export async function updateAcademy(id: string, data: UpdateAcademyInput) {
  const [row] = await db.update(academies)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.primaryColor !== undefined ? { primaryColor: data.primaryColor } : {}),
      updatedAt: new Date(),
    })
    .where(eq(academies.id, id))
    .returning();
  return row ?? null;
}

/** Archiva academia (soft, status=archived). Retorna null si no existe. */
export async function archiveAcademy(id: string) {
  const [row] = await db.update(academies)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(academies.id, id))
    .returning();
  return row ?? null;
}

/** Actualiza logoUrl (data-URL validada por lib/padel/logo.ts). */
export async function updateAcademyLogo(id: string, logoUrl: string) {
  const [row] = await db.update(academies)
    .set({ logoUrl, updatedAt: new Date() })
    .where(eq(academies.id, id))
    .returning();
  return row ?? null;
}

/**
 * Invita a un miembro por email: crea usuario TEMPORARY con password generado
 * (patrón G4) si no existe, o reutiliza el existente; crea membresía COACH
 * status=pending. 409 si ya existe membresía (cualquier status).
 */
export async function inviteMember(academyId: string, email: string, invitedBy: string): Promise<InviteMemberResult> {
  const normalizedEmail = email.toLowerCase();
  return await db.transaction(async (tx) => {
    let user = await tx.query.users.findFirst({ where: eq(users.email, normalizedEmail) });
    if (!user) {
      const passwordHash = await bcrypt.hash(generateRandomPassword(), 10);
      [user] = await tx.insert(users).values({
        email: normalizedEmail,
        passwordHash,
        status: "TEMPORARY",
        role: "USER",
      }).returning();
    }

    const existing = await tx.query.academyMemberships.findFirst({
      where: and(
        eq(academyMemberships.academyId, academyId),
        eq(academyMemberships.userId, user.id),
      ),
    });
    if (existing) return { ok: false, reason: "already_member" as const };

    const [membership] = await tx.insert(academyMemberships).values({
      academyId,
      userId: user.id,
      role: "COACH",
      invitedBy,
      status: "pending",
    }).returning();

    return { ok: true, membership, user: { id: user.id, email: user.email, status: user.status } };
  });
}

/**
 * Acepta invitación (solo self): marca la membresía active. Idempotente si ya
 * está active. Retorna null si no existe o fue removida (404).
 */
export async function acceptMembership(userId: string, academyId: string) {
  const membership = await db.query.academyMemberships.findFirst({
    where: and(
      eq(academyMemberships.academyId, academyId),
      eq(academyMemberships.userId, userId),
    ),
  });
  if (!membership || membership.status === "removed") return null;
  if (membership.status === "active") return membership;

  const [updated] = await db.update(academyMemberships)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(academyMemberships.id, membership.id))
    .returning();
  return updated;
}

/** Lista miembros de la academia con info de usuario (guardAcademyCoach). */
export async function listAcademyMembers(academyId: string) {
  return await db
    .select({
      id: academyMemberships.id,
      userId: academyMemberships.userId,
      role: academyMemberships.role,
      status: academyMemberships.status,
      invitedBy: academyMemberships.invitedBy,
      createdAt: academyMemberships.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(academyMemberships)
    .innerJoin(users, eq(users.id, academyMemberships.userId))
    .where(eq(academyMemberships.academyId, academyId))
    .orderBy(asc(academyMemberships.createdAt));
}

/**
 * Remueve miembro (soft, status=removed). Nunca se puede remover al último
 * OWNER activo (400). Retorna unión discriminada.
 */
export async function removeMember(academyId: string, userId: string): Promise<RemoveMemberResult> {
  const membership = await db.query.academyMemberships.findFirst({
    where: and(
      eq(academyMemberships.academyId, academyId),
      eq(academyMemberships.userId, userId),
    ),
  });
  if (!membership) return { ok: false, reason: "not_found" as const };

  if (membership.role === "OWNER") {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(academyMemberships)
      .where(and(
        eq(academyMemberships.academyId, academyId),
        eq(academyMemberships.role, "OWNER"),
        eq(academyMemberships.status, "active"),
      ));
    if (count <= 1) return { ok: false, reason: "last_owner" as const };
  }

  const [updated] = await db.update(academyMemberships)
    .set({ status: "removed", updatedAt: new Date() })
    .where(eq(academyMemberships.id, membership.id))
    .returning();
  return { ok: true, membership: updated };
}

/** Lista rúbricas institucionales de la academia (scope=institutional). */
export async function listInstitutionalRubrics(academyId: string) {
  return await db
    .select({
      id: rubrics.id,
      title: rubrics.title,
      category: rubrics.category,
      status: rubrics.status,
      scope: rubrics.scope,
      createdAt: rubrics.createdAt,
      updatedAt: rubrics.updatedAt,
      criteriaCount: sql<number>`count(distinct ${rubricCriteria.id})::int`,
    })
    .from(rubrics)
    .leftJoin(rubricCriteria, eq(rubricCriteria.rubricId, rubrics.id))
    .where(and(
      eq(rubrics.academyId, academyId),
      eq(rubrics.scope, "institutional"),
    ))
    .groupBy(rubrics.id)
    .orderBy(desc(rubrics.createdAt));
}

/** Crea rúbrica institucional (scope=institutional, academyId=ruta). */
export async function createInstitutionalRubric(
  academyId: string,
  ownerId: string,
  data: { title: string; category: RubricCategory; criteria: Array<{ name: string; descriptors: string[] }> }
) {
  return createRubric({
    ownerId,
    title: data.title,
    category: data.category,
    criteria: data.criteria,
    academyId,
    scope: "institutional",
  });
}

/**
 * Resuelve la academia para branding de un PDF (RF-04): prioridad
 * (1) rubric.academyId si la rúbrica es institucional, (2) primera membresía
 * activa del teacher. Retorna null si no hay academia activa.
 */
export async function resolveAcademyForEvaluation(
  rubric: { academyId: string | null },
  teacherId: string
) {
  if (rubric.academyId) {
    const academy = await db.query.academies.findFirst({
      where: and(eq(academies.id, rubric.academyId), eq(academies.status, "active")),
    });
    if (academy) return academy;
  }

  const membership = await db.query.academyMemberships.findFirst({
    where: and(
      eq(academyMemberships.userId, teacherId),
      eq(academyMemberships.status, "active"),
    ),
    with: { academy: true },
  });
  if (!membership || membership.academy.status !== "active") return null;
  return membership.academy;
}