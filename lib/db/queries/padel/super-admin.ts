/**
 * Queries de Super Admin (plataforma): listar admins, demote transaccional,
 * audit logs paginados, academias globales y métricas de plataforma.
 * Todas requieren guardSuperAdmin en el API (nunca se exponen a roles inferiores).
 */
import { db } from "@/lib/db";
import { and, count as drizzleCount, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { academies, auditLogs, evaluations, courses, users } from "@/lib/db/schema";
import { assertNotLastSuperAdmin } from "@/lib/padel/super-admin";

export type DemoteResult =
  | { ok: true; user: { id: string; email: string; firstName: string | null; lastName: string | null; role: string; status: string } }
  | { ok: false; reason: "not_found" | "not_admin" | "last_super_admin" };

/**
 * Lista usuarios con role ADMIN o SUPER_ADMIN (GET /api/admin/admins).
 * search opcional filtra por firstName/lastName/email (ILIKE).
 */
export async function listAdmins(search?: string) {
  const conditions: SQL[] = [inArray(users.role, ["ADMIN", "SUPER_ADMIN"])];
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
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(desc(users.createdAt));
}

/** Cuenta SUPER_ADMINs activos (invariante de plataforma, D5). */
export async function countActiveSuperAdmins() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE")));
  return count;
}

/**
 * Demota ADMIN → USER en una transacción. Reglas:
 * - invariante de plataforma (D5): si no hay ≥1 SUPER_ADMIN activo → last_super_admin
 *   (defensa en profundidad; por construcción el API rechaza targets SUPER_ADMIN)
 * - target inexistente → not_found (404)
 * - target no es ADMIN → not_admin (400; incluye SUPER_ADMIN y USER)
 */
export async function demoteUser(id: string): Promise<DemoteResult> {
  return await db.transaction(async (tx) => {
    // Invariante de plataforma: siempre debe existir ≥1 SUPER_ADMIN activo.
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE")));
    const invariantError = assertNotLastSuperAdmin(count);
    if (invariantError) return { ok: false as const, reason: "last_super_admin" as const };

    const [target] = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!target) return { ok: false as const, reason: "not_found" as const };

    if (target.role !== "ADMIN") return { ok: false as const, reason: "not_admin" as const };

    const [row] = await tx
      .update(users)
      .set({ role: "USER", updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
      });
    return { ok: true as const, user: row };
  });
}

export type AuditLogsQuery = {
  page?: number;
  pageSize?: number;
  actionType?: string;
  userId?: string;
};

/**
 * Lista audit_logs paginados con usuario asociado (GET /api/admin/audit-logs).
 * Filtros opcionales: actionType, userId. Orden createdAt desc.
 */
export async function listAuditLogsPaginated(query: AuditLogsQuery) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

  const conditions: SQL[] = [];
  if (query.actionType) conditions.push(eq(auditLogs.actionType, query.actionType));
  if (query.userId) conditions.push(eq(auditLogs.userId, query.userId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(where);

  const logs = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      actionType: auditLogs.actionType,
      entityName: auditLogs.entityName,
      entityId: auditLogs.entityId,
      oldValues: auditLogs.oldValues,
      newValues: auditLogs.newValues,
      metadata: auditLogs.metadata,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
      userEmail: users.email,
      userFirstName: users.firstName,
      userLastName: users.lastName,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    logs,
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: Math.ceil(count / pageSize),
    },
  };
}

/**
 * Lista TODAS las academias (activas y archivadas) con owner y métricas
 * (GET /api/admin/academies, visibilidad global de plataforma, D6).
 */
export async function listAllAcademies() {
  return await db
    .select({
      id: academies.id,
      name: academies.name,
      slug: academies.slug,
      status: academies.status,
      primaryColor: academies.primaryColor,
      ownerId: academies.ownerId,
      createdAt: academies.createdAt,
      ownerEmail: users.email,
      ownerFirstName: users.firstName,
      ownerLastName: users.lastName,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM academy_memberships am
        WHERE am.academy_id = ${academies.id} AND am.status = 'active'
      )`,
      rubricCount: sql<number>`(
        SELECT count(*)::int FROM rubrics r
        WHERE r.academy_id = ${academies.id}
      )`,
    })
    .from(academies)
    .leftJoin(users, eq(users.id, academies.ownerId))
    .orderBy(desc(academies.createdAt));
}

/**
 * Métricas globales de plataforma para el home del super admin.
 * Retorna contadores: usuarios totales/activos/admins/super_admins,
 * academias activas, evaluaciones publicadas, cursos activos.
 */
export async function getPlatformStats() {
  const [userStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where status = 'ACTIVE')::int`,
      admins: sql<number>`count(*) filter (where role IN ('ADMIN','SUPER_ADMIN'))::int`,
      superAdmins: sql<number>`count(*) filter (where role = 'SUPER_ADMIN')::int`,
    })
    .from(users);

  const [academyStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where status = 'active')::int`,
    })
    .from(academies);

  const [evalStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where status = 'published')::int`,
    })
    .from(evaluations);

  const [courseStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where status = 'active')::int`,
    })
    .from(courses);

  return {
    users: userStats,
    academies: academyStats,
    evaluations: evalStats,
    courses: courseStats,
  };
}