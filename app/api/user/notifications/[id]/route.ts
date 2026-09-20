import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import {
  markAsRead,
  setNotificationsRead,
  softDeleteNotification,
} from "@/lib/db/queries/notifications";
import {
  markSingleReadSchema,
  notificationIdParamsSchema,
} from "@/lib/validations/notifications";
import { auditNotificationHidden, extractRequestContext } from "@/lib/audit/helpers";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/user/notifications/[id]
 * Marca una notificación como leída (o no leída). 200 { ok: true }.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = notificationIdParamsSchema.parse(await params);
    const body = await request.json();
    const validated = markSingleReadSchema.parse(body);
    const userId = session!.user.id as string;

    const updated = validated.read
      ? await markAsRead(userId, id)
      : (await setNotificationsRead(userId, [id], false)) > 0 ? { id } : null;

    if (!updated) {
      return NextResponse.json({ error: "Notificación no encontrada" }, { status: 404 });
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[user/notifications/[id]] Error en PATCH:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/user/notifications/[id]
 * Soft delete (deletedAt) — nunca DELETE físico. Audita NOTIFICATION_HIDDEN.
 * 200 { ok: true }.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = notificationIdParamsSchema.parse(await params);
    const userId = session!.user.id as string;

    const deleted = await softDeleteNotification(userId, id);
    if (!deleted) {
      return NextResponse.json({ error: "Notificación no encontrada" }, { status: 404 });
    }

    await auditNotificationHidden(id, userId, deleted.category, {
      userId,
      ...extractRequestContext(request),
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[user/notifications/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}