import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardSuperAdmin } from "@/lib/auth/admin-guard";
import { auditOwnershipTransferred } from "@/lib/audit/academy";
import { extractRequestContext } from "@/lib/audit/helpers";
import { getAcademyById, transferOwnership } from "@/lib/db/queries/padel/academies";
import { transferOwnershipSchema } from "@/lib/validations/academy";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/academies/[id]/transfer-ownership
 * Transfiere el ownership de una academia a otro miembro ACTIVO (solo
 * SUPER_ADMIN, v0.9). Tx: target → OWNER, previo OWNER → ADMIN,
 * academies.ownerId → target. 404 si academia/target inexistente o target no
 * miembro activo (anti-IDOR, SPEC AC-07). 400 si self-transfer. Audita.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardSuperAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const academy = await getAcademyById(id);
    if (!academy) {
      return NextResponse.json({ error: "Academia no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const validated = transferOwnershipSchema.parse(body);

    if (validated.targetUserId === session!.user.id) {
      return NextResponse.json({ error: "No puedes transferirte el ownership a ti mismo" }, { status: 400 });
    }

    const result = await transferOwnership(id, validated.targetUserId);
    if (!result.ok) {
      if (result.reason === "self_transfer") {
        return NextResponse.json({ error: "No puedes transferirte el ownership a ti mismo" }, { status: 400 });
      }
      // target_not_found / target_not_member → 404 (anti-IDOR)
      return NextResponse.json({ error: "Usuario objetivo no encontrado o no es miembro activo" }, { status: 404 });
    }

    await auditOwnershipTransferred(
      id,
      { previousOwnerId: result.previousOwner.userId, newOwnerId: result.newOwner.userId },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json(
      { academy: result.academy, previousOwner: result.previousOwner, newOwner: result.newOwner },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/transfer-ownership] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}