/**
 * Academy Guards — RBAC por academia (multi-tenant, SPEC-EPIC-01 Fase B).
 *
 * El `user_role` global (USER/ADMIN) NO se toca. El rol por academia vive en
 * `academy_memberships` (OWNER/ADMIN/COACH). Estos guards son DB-backed:
 * consultan la membresía activa + el status de la academia en cada request
 * (nunca confían en claims del JWT para el rol de academia).
 *
 * Patrón: `async function guardX(session, id): Promise<NextResponse | null>`
 *   - null = OK (membresía activa y rol suficiente)
 *   - NextResponse = error:
 *       - 401 no autenticado
 *       - 403 LOCKED / TEMPORARY / rol insuficiente
 *       - 404 anti-IDOR: membresía inexistente o academia archivada (no 403)
 *
 * Estados de usuario: NUNCA LOCKED. TEMPORARY solo si explícitamente declarado
 * (los guards de academia exigen ACTIVE).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { academyMemberships, academies } from "@/lib/db/schema";
import type { AcademyMembershipRole } from "@/lib/db/schema";
import { isSuperAdminRole } from "@/lib/auth/role-utils";

export interface AcademyMembershipResult {
  membership: typeof academyMemberships.$inferSelect;
  academyStatus: string;
}

/**
 * Consulta la membresía ACTIVA del usuario en la academia + el status de la
 * academia. Retorna null si no existe membresía activa o la academia está
 * archivada (anti-IDOR: el caller responde 404).
 */
export async function getAcademyMembership(
  userId: string,
  academyId: string
): Promise<AcademyMembershipResult | null> {
  const membership = await db.query.academyMemberships.findFirst({
    where: and(
      eq(academyMemberships.academyId, academyId),
      eq(academyMemberships.userId, userId),
      eq(academyMemberships.status, 'active')
    ),
    with: {
      academy: true,
    },
  });

  if (!membership || membership.academy.status !== 'active') {
    return null;
  }

  return {
    membership,
    academyStatus: membership.academy.status,
  };
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "No autenticado" }, { status: 401 });
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}

function notFound(): NextResponse {
  return NextResponse.json({ error: "No encontrado" }, { status: 404 });
}

/** Gate de sesión común: 401 sin id, 403 si LOCKED o TEMPORARY. */
function sessionGate(session: any): NextResponse | null {
  if (!session?.user?.id) {
    return unauthorized();
  }
  if (session.user.status === 'LOCKED' || session.user.status === 'TEMPORARY') {
    return forbidden();
  }
  return null;
}

const OWNER: AcademyMembershipRole = 'OWNER';
const ADMIN: AcademyMembershipRole = 'ADMIN';
const COACH: AcademyMembershipRole = 'COACH';

/** Guard genérico por roles de academia. */
async function guardAcademyRole(
  session: any,
  academyId: string,
  allowedRoles: AcademyMembershipRole[]
): Promise<NextResponse | null> {
  const gate = sessionGate(session);
  if (gate) return gate;

  const result = await getAcademyMembership(session.user.id, academyId);
  if (!result) return notFound();

  if (!allowedRoles.includes(result.membership.role)) return forbidden();
  return null;
}

/** Solo OWNER. Uso: archivar academia, remover miembros, transferir ownership. */
export const guardAcademyOwner = (s: any, id: string) => guardAcademyRole(s, id, [OWNER]);

/** OWNER o ADMIN. Uso: actualizar branding, invitar miembros, gestionar rúbricas institucionales. */
export const guardAcademyAdmin = (s: any, id: string) => guardAcademyRole(s, id, [OWNER, ADMIN]);

/** OWNER/ADMIN/COACH activos. Uso: lectura de academia, operaciones de coach. */
export const guardAcademyCoach = (s: any, id: string) => guardAcademyRole(s, id, [OWNER, ADMIN, COACH]);

/**
 * Guard compuesto: SUPER_ADMIN (global, plataforma) O rol de academia (v0.9).
 * - Path SUPER_ADMIN: verifica que la academia EXISTE (404 anti-IDOR si no);
 *   permite academias archivadas (visibilidad plataforma, D4).
 * - Path no-SA: delega en guardAcademyRole (membresía activa + academia activa).
 *
 * sessionGate corre primero: 401 sin sesión, 403 LOCKED/TEMPORARY — el bypass
 * SUPER_ADMIN NUNCA opera sin verificar la existencia del recurso (404).
 */
async function guardSuperAdminOrAcademyRole(
  session: any,
  academyId: string,
  allowedRoles: AcademyMembershipRole[]
): Promise<NextResponse | null> {
  const gate = sessionGate(session);
  if (gate) return gate;

  if (isSuperAdminRole(session.user.role) && session.user.status === 'ACTIVE') {
    const academy = await db.query.academies.findFirst({ where: eq(academies.id, academyId) });
    if (!academy) return notFound();
    return null;
  }
  return guardAcademyRole(session, academyId, allowedRoles);
}

/** SUPER_ADMIN o OWNER. Uso: archivar academia, transferir ownership, remover miembros. */
export const guardSuperAdminOrAcademyOwner = (s: any, id: string) => guardSuperAdminOrAcademyRole(s, id, [OWNER]);

/** SUPER_ADMIN o OWNER/ADMIN. Uso: branding, invitar, gestionar rúbricas institucionales. */
export const guardSuperAdminOrAcademyAdmin = (s: any, id: string) => guardSuperAdminOrAcademyRole(s, id, [OWNER, ADMIN]);

/** SUPER_ADMIN o OWNER/ADMIN/COACH activos. Uso: lectura de academia. */
export const guardSuperAdminOrAcademyCoach = (s: any, id: string) => guardSuperAdminOrAcademyRole(s, id, [OWNER, ADMIN, COACH]);