import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAcademyAdmin } from "@/lib/auth/academy-guard";
import { auditMemberInvited, extractRequestContext } from "@/lib/audit/helpers";
import { getAcademyById, inviteMember } from "@/lib/db/queries/padel/academies";
import { triggerAcademyInvite } from "@/lib/notifications/triggers";
import { memberInviteSchema } from "@/lib/validations/academy";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/academies/[id]/members/invite
 * Invita por email (guardAcademyAdmin). Crea usuario TEMPORARY con password
 * generado (patrón G4) si no existe, o reutiliza el existente; crea membresía
 * COACH status=pending; dispara triggerAcademyInvite (inbox). 409 si ya es
 * miembro. Audita CREATE.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = padelIdParamsSchema.parse(await params);
    const guardError = await guardAcademyAdmin(session, id);
    if (guardError) return guardError;

    const academy = await getAcademyById(id);
    if (!academy) {
      return NextResponse.json({ error: "Academia no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const validated = memberInviteSchema.parse(body);

    const result = await inviteMember(id, validated.email, session!.user.id as string);
    if (!result.ok) {
      return NextResponse.json({ error: "El usuario ya es miembro de esta academia" }, { status: 409 });
    }

    await auditMemberInvited(
      id,
      result.membership.id,
      { userId: result.user.id, role: result.membership.role, invitedBy: session!.user.id as string },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    // Inbox notification (dedup por groupId=membershipId, 1h).
    await triggerAcademyInvite(result.user.id, academy.name, result.membership.id);

    return NextResponse.json({ membership: result.membership }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/members/invite] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}