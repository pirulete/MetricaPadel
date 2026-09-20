import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { getSetting, getSettingsMap, upsertSetting } from "@/lib/db/queries/marketing";
import { settingsSchema } from "@/lib/marketing/schemas/entities";
import { CACHE_TAGS, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

/**
 * GET /api/admin/marketing/settings
 * Devuelve el mapa completo key → value.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const settings = await getSettingsMap();
    return NextResponse.json({ settings }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/settings] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/marketing/settings
 * Upsert de settings. Body: { settings: { key: value } }.
 * Audita por key y revalida settings + navigation.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const rawSettings = z.record(z.string(), z.unknown()).parse(body?.settings);
    const validated = settingsSchema.partial().parse(rawSettings);

    const context = { userId: session!.user.id, ...extractRequestContext(request) };
    const applied: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(validated)) {
      const oldValue = await getSetting(key);
      await upsertSetting(key, value);
      applied[key] = value;
      await auditUpdate(
        "marketing_setting",
        key,
        oldValue === null ? {} : { value: oldValue },
        { value },
        context
      );
    }

    revalidateMarketing([CACHE_TAGS.settings, CACHE_TAGS.navigation]);

    return NextResponse.json({ settings: applied }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/settings] Error en PATCH:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
