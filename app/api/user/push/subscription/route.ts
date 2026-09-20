import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { upsertPushSubscription, revokePushSubscription } from "@/lib/db/queries/push";
import { subscribeSchema, unsubscribeSchema } from "@/lib/validations/notifications";
import {
  auditPushSubscriptionCreated,
  auditPushSubscriptionRevoked,
  extractRequestContext,
} from "@/lib/audit/helpers";
import {
  checkPublicRateLimit,
  extractIP,
  rateLimitedResponse,
  rateLimitSuccessHeaders,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/user/push/subscription
 * Upsert de subscripción Web Push por (userId, endpoint). Rate limit por IP.
 * 201 { id }.
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
    const validated = subscribeSchema.parse(body);

    const sub = await upsertPushSubscription(session!.user.id as string, validated);

    await auditPushSubscriptionCreated(sub.id, validated, {
      userId: session!.user.id as string,
      ...extractRequestContext(request),
    });

    return NextResponse.json(
      { id: sub.id },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", ...rateLimitSuccessHeaders(rate.remaining, rate.resetTime) },
      }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[user/push/subscription] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/user/push/subscription
 * Revoca la subscripción del endpoint indicado. 200 { ok: true }.
 */
export async function DELETE(request: NextRequest) {
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
    const validated = unsubscribeSchema.parse(body);

    const revoked = await revokePushSubscription(session!.user.id as string, validated.endpoint);

    await auditPushSubscriptionRevoked(
      {
        userId: session!.user.id as string,
        endpoint: validated.endpoint,
        revokedAll: false,
        count: revoked ? 1 : 0,
      },
      { userId: session!.user.id as string, ...extractRequestContext(request) }
    );

    return NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: { "Cache-Control": "no-store", ...rateLimitSuccessHeaders(rate.remaining, rate.resetTime) },
      }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[user/push/subscription] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}