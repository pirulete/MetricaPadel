import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { getSetting, upsertSetting } from "@/lib/db/queries/marketing";
import { adminNotificationSettingsSchema } from "@/lib/validations/notifications";
import { CACHE_TAGS, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

const PUSH_ENABLED_KEY = "notifications.pushEnabled";
const INBOX_ENABLED_KEY = "notifications.inboxEnabled";

/** Default de pushEnabled: true solo si VAPID está configurado (env server-only). */
function hasVapidKeys(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

/**
 * GET /api/admin/notifications/settings
 * Toggles globales del sistema de notificaciones. 200 { pushEnabled, inboxEnabled }.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const [storedPush, storedInbox] = await Promise.all([
      getSetting(PUSH_ENABLED_KEY),
      getSetting(INBOX_ENABLED_KEY),
    ]);

    return NextResponse.json(
      {
        pushEnabled: storedPush === null ? hasVapidKeys() : Boolean(storedPush),
        inboxEnabled: storedInbox === null ? true : Boolean(storedInbox),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[admin/notifications/settings] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/notifications/settings
 * Actualiza pushEnabled/inboxEnabled (marketing_settings). Audita por key y
 * revalida el tag `settings`. 200 { ok: true }.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = adminNotificationSettingsSchema.parse(body);

    const context = { userId: session!.user.id, ...extractRequestContext(request) };
    const entries: Array<[string, boolean]> = [];
    if (validated.pushEnabled !== undefined) entries.push([PUSH_ENABLED_KEY, validated.pushEnabled]);
    if (validated.inboxEnabled !== undefined) entries.push([INBOX_ENABLED_KEY, validated.inboxEnabled]);

    for (const [key, value] of entries) {
      const oldValue = await getSetting(key);
      await upsertSetting(key, value);
      await auditUpdate(
        "notification_settings",
        key,
        oldValue === null ? {} : { value: oldValue },
        { value },
        context
      );
    }

    revalidateMarketing([CACHE_TAGS.settings]);

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/notifications/settings] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}