import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardSuperAdminOrAcademyAdmin } from "@/lib/auth/academy-guard";
import { auditMemberRemoved, extractRequestContext } from "@/lib/audit/helpers";
import { auditMemberRoleAssigned } from "@/lib/audit/academy";
import { assignMemberRole, removeMember } from "@/lib/db/queries/padel/academies";
import { canAssignAcademyRole } from "@/lib/padel/academy-requests";
import { isSuperAdminRole } from "@/lib/auth/role-utils";
import { roleAssignSchema } from "@/lib/validations/academy";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * DELETE /api/academies/[id]/members/[userId]
 * Remueve miembro (soft, status=removed). guardSuperAdminOrAcademyAdmin:
 * OWNER/ADMIN o SUPER_ADMIN. 400 si se intenta remover al último OWNER activo.
 * 404 si no existe. Audita DELETE.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await auth();
    const { id, userId } = padelIdParamsSchema.extend({ userId: z.string().uuid("userId debe ser un uuid válido") }).parse(await params);
    const guardError = await guardSuperAdminOrAcademyAdmin(session, id);
    if (guardError) return guardError;

    const result = await removeMember(id, userId);
    if (!result.ok) {
      if (result.reason === "last_owner") {
        return NextResponse.json({ error: "No se puede remover al último OWNER de la academia" }, { status: 400 });
      }
      return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
    }

    await auditMemberRemoved(
      id,
      result.membership.id,
      { userId, role: result.membership.role, status: result.membership.status },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ membership: { id: result.membership.id, status: result.membership.status } }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/members/[userId]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/academies/[id]/members/[userId]
 * Asigna rol a miembro ACTIVO (v0.9). guardSuperAdminOrAcademyAdmin + regla de
 * negocio: role=OWNER solo lo puede asignar SUPER_ADMIN (canAssignAcademyRole).
 * 400 si se demueve al último OWNER activo. 404 si academia/miembro inexistente.
 * Audita MEMBER_ROLE_ASSIGNED.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await auth();
    const { id, userId } = padelIdParamsSchema.extend({ userId: z.string().uuid("userId debe ser un uuid válido") }).parse(await params);
    const guardError = await guardSuperAdminOrAcademyAdmin(session, id);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = roleAssignSchema.parse(body);

    // Regla de negocio (D6): role=OWNER solo lo asigna SUPER_ADMIN. El guard
    // ya garantiza OWNER/ADMIN de academia o SUPER_ADMIN; para el resto de
    // roles (ADMIN/COACH) ambos pueden asignar.
    const actorRole = isSuperAdminRole(session!.user.role) ? "SUPER_ADMIN" : "ADMIN";
    if (!canAssignAcademyRole(actorRole, validated.role)) {
      return NextResponse.json({ error: "No autorizado para asignar ese rol" }, { status: 403 });
    }

    const result = await assignMemberRole(id, userId, validated.role);
    if (!result.ok) {
      if (result.reason === "last_owner") {
        return NextResponse.json({ error: "No se puede demover al último OWNER de la academia" }, { status: 400 });
      }
      return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
    }

    await auditMemberRoleAssigned(
      id,
      result.membership.id,
      { userId, role: result.membership.role, previousRole: undefined },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ membership: result.membership }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/members/[userId]] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}