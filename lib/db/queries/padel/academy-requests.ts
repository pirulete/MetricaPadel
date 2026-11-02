import { db } from "@/lib/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  academyAccessRequests,
  academyMemberships,
  academies,
  users,
  academyRequestTypeEnum,
  academyRequestStatusEnum,
  academyMembershipRoleEnum,
} from "@/lib/db/schema";

export type AcademyRequestType = (typeof academyRequestTypeEnum.enumValues)[number];
export type AcademyRequestStatus = (typeof academyRequestStatusEnum.enumValues)[number];
export type AcademyRequestRole = (typeof academyMembershipRoleEnum.enumValues)[number];

export type CreateAccessRequestInput = {
  userId: string;
  type: AcademyRequestType;
  academyId?: string | null;
  requestedRole: AcademyRequestRole;
  payload?: Record<string, unknown>;
};

export type CreateAccessRequestResult =
  | { ok: true; request: typeof academyAccessRequests.$inferSelect }
  | { ok: false; reason: "duplicate_pending" };

export type ApproveJoinRequestResult =
  | {
      ok: true;
      request: typeof academyAccessRequests.$inferSelect;
      membership: typeof academyMemberships.$inferSelect;
    }
  | { ok: false; reason: "not_found" | "already_reviewed" | "academy_archived" | "already_member" };

export type ApproveCreateRequestResult =
  | {
      ok: true;
      request: typeof academyAccessRequests.$inferSelect;
      academy: typeof academies.$inferSelect;
    }
  | { ok: false; reason: "not_found" | "already_reviewed" | "slug_exists" };

export type RejectRequestResult =
  | { ok: true; request: typeof academyAccessRequests.$inferSelect }
  | { ok: false; reason: "not_found" | "already_reviewed" };

export type AccessRequestWithDetails = {
  id: string;
  userId: string;
  type: AcademyRequestType;
  academyId: string | null;
  requestedRole: AcademyRequestRole;
  payload: Record<string, unknown>;
  status: AcademyRequestStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  requesterEmail: string | null;
  requesterFirstName: string | null;
  requesterLastName: string | null;
  academyName: string | null;
  academySlug: string | null;
};

/**
 * Crea una solicitud de acceso (join_academy | create_academy).
 * El 23505 de los índices parciales UNIQUE (duplicado pendiente) se mapea a
 * `duplicate_pending` → 409 en el handler.
 */
export async function createAccessRequest(input: CreateAccessRequestInput): Promise<CreateAccessRequestResult> {
  try {
    const [request] = await db.insert(academyAccessRequests).values({
      userId: input.userId,
      type: input.type,
      academyId: input.academyId ?? null,
      requestedRole: input.requestedRole,
      payload: input.payload ?? {},
      status: "pending",
    }).returning();
    return { ok: true, request };
  } catch (error: any) {
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      return { ok: false, reason: "duplicate_pending" };
    }
    throw error;
  }
}

/** Lista solicitudes con requester (users) + academia (left join). Filtros opcionales status/type. */
export async function listAccessRequests(filters: { status?: AcademyRequestStatus; type?: AcademyRequestType } = {}) {
  const conditions = [];
  if (filters.status) conditions.push(eq(academyAccessRequests.status, filters.status));
  if (filters.type) conditions.push(eq(academyAccessRequests.type, filters.type));

  return await db
    .select({
      id: academyAccessRequests.id,
      userId: academyAccessRequests.userId,
      type: academyAccessRequests.type,
academyId: academyAccessRequests.academyId,
      requestedRole: academyAccessRequests.requestedRole,
      payload: sql<Record<string, unknown>>`${academyAccessRequests.payload}`,
      status: academyAccessRequests.status,
      reviewedBy: academyAccessRequests.reviewedBy,
      reviewedAt: academyAccessRequests.reviewedAt,
      createdAt: academyAccessRequests.createdAt,
      updatedAt: academyAccessRequests.updatedAt,
      requesterEmail: users.email,
      requesterFirstName: users.firstName,
      requesterLastName: users.lastName,
      academyName: academies.name,
      academySlug: academies.slug,
    })
    .from(academyAccessRequests)
    .innerJoin(users, eq(users.id, academyAccessRequests.userId))
    .leftJoin(academies, eq(academies.id, academyAccessRequests.academyId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(academyAccessRequests.createdAt));
}

/** Detalle de una solicitud con requester + academia. Retorna null si no existe (404). */
export async function getAccessRequestById(id: string): Promise<AccessRequestWithDetails | null> {
  const [row] = await db
    .select({
      id: academyAccessRequests.id,
      userId: academyAccessRequests.userId,
      type: academyAccessRequests.type,
academyId: academyAccessRequests.academyId,
      requestedRole: academyAccessRequests.requestedRole,
      payload: sql<Record<string, unknown>>`${academyAccessRequests.payload}`,
      status: academyAccessRequests.status,
      reviewedBy: academyAccessRequests.reviewedBy,
      reviewedAt: academyAccessRequests.reviewedAt,
      createdAt: academyAccessRequests.createdAt,
      updatedAt: academyAccessRequests.updatedAt,
      requesterEmail: users.email,
      requesterFirstName: users.firstName,
      requesterLastName: users.lastName,
      academyName: academies.name,
      academySlug: academies.slug,
    })
    .from(academyAccessRequests)
    .innerJoin(users, eq(users.id, academyAccessRequests.userId))
    .leftJoin(academies, eq(academies.id, academyAccessRequests.academyId))
    .where(eq(academyAccessRequests.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Aprueba una solicitud join_academy: crea membresía activa con requestedRole.
 * Re-valida dentro de la tx (academia activa, usuario sin membresía activa) —
 * no confía en la validación del POST (pudo cambiar entre create y approve).
 */
export async function approveJoinRequest(requestId: string, actorId: string): Promise<ApproveJoinRequestResult> {
  return await db.transaction(async (tx) => {
    const request = await tx.query.academyAccessRequests.findFirst({
      where: and(
        eq(academyAccessRequests.id, requestId),
        eq(academyAccessRequests.type, "join_academy"),
      ),
    });
    if (!request) return { ok: false, reason: "not_found" as const };
    if (request.status !== "pending") return { ok: false, reason: "already_reviewed" as const };

    const academy = await tx.query.academies.findFirst({
      where: eq(academies.id, request.academyId ?? ""),
    });
    if (!academy || academy.status !== "active") return { ok: false, reason: "academy_archived" as const };

    const existing = await tx.query.academyMemberships.findFirst({
      where: and(
        eq(academyMemberships.academyId, academy.id),
        eq(academyMemberships.userId, request.userId),
        eq(academyMemberships.status, "active"),
      ),
    });
    if (existing) return { ok: false, reason: "already_member" as const };

    const [membership] = await tx.insert(academyMemberships).values({
      academyId: academy.id,
      userId: request.userId,
      role: request.requestedRole,
      invitedBy: actorId,
      status: "active",
    }).returning();

    const [updated] = await tx.update(academyAccessRequests)
      .set({ status: "approved", reviewedBy: actorId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(academyAccessRequests.id, request.id))
      .returning();

    return { ok: true, request: updated, membership };
  });
}

/**
 * Aprueba una solicitud create_academy: crea academia + membresía OWNER activa
 * del solicitante. Lógica espejo de createAcademy pero con el cliente tx (no
 * reusar createAcademy porque abre su propia transacción). Re-valida el slug
 * en el momento del approve (colisión posible entre solicitud y aprobación).
 */
export async function approveCreateRequest(requestId: string, actorId: string): Promise<ApproveCreateRequestResult> {
  return await db.transaction(async (tx) => {
    const request = await tx.query.academyAccessRequests.findFirst({
      where: and(
        eq(academyAccessRequests.id, requestId),
        eq(academyAccessRequests.type, "create_academy"),
      ),
    });
    if (!request) return { ok: false, reason: "not_found" as const };
    if (request.status !== "pending") return { ok: false, reason: "already_reviewed" as const };

    const payload = (request.payload ?? {}) as { name?: string; slug?: string; primaryColor?: string };
    const slug = payload.slug ?? "";
    const name = payload.name ?? "";

    const existing = await tx.query.academies.findFirst({ where: eq(academies.slug, slug) });
    if (existing) return { ok: false, reason: "slug_exists" as const };

    const [academy] = await tx.insert(academies).values({
      ownerId: request.userId,
      name,
      slug,
      primaryColor: payload.primaryColor ?? "#3b82f6",
      status: "active",
    }).returning();

    await tx.insert(academyMemberships).values({
      academyId: academy.id,
      userId: request.userId,
      role: "OWNER",
      status: "active",
    });

    const [updated] = await tx.update(academyAccessRequests)
      .set({ status: "approved", reviewedBy: actorId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(academyAccessRequests.id, request.id))
      .returning();

    return { ok: true, request: updated, academy };
  });
}

/** Rechaza una solicitud pendiente. Ya revisada → already_reviewed (400). */
export async function rejectRequest(requestId: string, actorId: string): Promise<RejectRequestResult> {
  const request = await db.query.academyAccessRequests.findFirst({
    where: eq(academyAccessRequests.id, requestId),
  });
  if (!request) return { ok: false, reason: "not_found" as const };
  if (request.status !== "pending") return { ok: false, reason: "already_reviewed" as const };

  const [updated] = await db.update(academyAccessRequests)
    .set({ status: "rejected", reviewedBy: actorId, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(academyAccessRequests.id, request.id))
    .returning();
  return { ok: true, request: updated };
}