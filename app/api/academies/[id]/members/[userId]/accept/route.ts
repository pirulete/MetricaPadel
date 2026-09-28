import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { acceptMembership } from "@/lib/db/queries/padel/academies";
import { padelIdParamsSchema } from "@/lib/validations/padel";
import {
  ACADEMY_INVITE_MAX,
  ACADEMY_INVITE_WINDOW_MS,
  checkPublicRateLimit,
  extractIP,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/academies/[id]/members/[userId]/accept
 * Acepta invitación (guardUser, solo self: userId debe ser la sesión).
 * Marca la membresía active (idempotente si ya está active). 404 si la
 * membresía no existe o fue removida. Audita UPDATE.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    // Rate limit por IP (10/min, key compartida con invite).
    const ip = extractIP(request);
    const rate = checkPublicRateLimit(`academy-invite:${ip}`, {
      windowMs: ACADEMY_INVITE_WINDOW_MS,
      max: ACADEMY_INVITE_MAX,
    });
    if (!rate.allowed) {
      return rateLimitedResponse(rate.resetTime, ACADEMY_INVITE_MAX);
    }

    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;

    const { id, userId } = padelIdParamsSchema.extend({ userId: z.string().uuid("userId debe ser un uuid válido") }).parse(await params);

    // Solo self: un usuario solo puede aceptar su propia invitación.
    if (userId !== session!.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const membership = await acceptMembership(userId, id);
    if (!membership) {
      return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 });
    }

    await auditUpdate(
      "academy_memberships",
      membership.id,
      { status: "pending" },
      { status: membership.status, academyId: id },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ membership }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/members/[userId]/accept] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}