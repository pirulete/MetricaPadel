import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import {
  getNotificationPreferences,
  upsertNotificationPreference,
} from "@/lib/db/queries/notifications";
import { preferenceSchema } from "@/lib/validations/notifications";

export const runtime = "nodejs";

/**
 * GET /api/user/notifications/preferences
 * Preferencias por canal/categoría del usuario. 200 { preferences: [] }.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const preferences = await getNotificationPreferences(session!.user.id as string);

    return NextResponse.json(
      { preferences },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[user/notifications/preferences] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/user/notifications/preferences
 * Upsert de preferencia { channel, category, enabled } (UNIQUE userId+channel+category).
 * 200 { ok: true }.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const validated = preferenceSchema.parse(body);

    await upsertNotificationPreference(session!.user.id as string, validated);

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[user/notifications/preferences] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}