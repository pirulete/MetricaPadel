import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { logClickEvent } from "@/lib/db/queries/push";
import { clickSchema } from "@/lib/validations/notifications";
import {
  checkPublicRateLimit,
  extractIP,
  rateLimitedResponse,
  rateLimitSuccessHeaders,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/user/push/click
 * Registra un click en notificación push (CTR analytics). Rate limit por IP.
 * 201 { ok: true }.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = extractIP(request);
    const rate = checkPublicRateLimit(ip);
    if (!rate.allowed) return rateLimitedResponse(rate.resetTime);

    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const validated = clickSchema.parse(body);

    await logClickEvent(
      session!.user.id as string,
      validated.endpoint,
      validated.url,
      validated.eventType
    );

    return NextResponse.json(
      { ok: true },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", ...rateLimitSuccessHeaders(rate.remaining, rate.resetTime) },
      }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[user/push/click] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}