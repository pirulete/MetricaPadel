import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import {
  getNotificationsByUserId,
  getUnreadCount,
  markAllAsRead,
  setNotificationsRead,
} from "@/lib/db/queries/notifications";
import { markReadSchema, notificationQuerySchema } from "@/lib/validations/notifications";

export const runtime = "nodejs";

/**
 * GET /api/user/notifications
 * Lista paginada por cursor (createdAt desc), excluye soft-deleted.
 * Query: category, unread, limit (1-50), cursor. Respuesta { items, nextCursor, unread }.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const query = notificationQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const userId = session!.user.id as string;
    const [result, unread] = await Promise.all([
      getNotificationsByUserId(userId, {
        category: query.category,
        unread: query.unread,
        limit: query.limit,
        cursor: query.cursor,
      }),
      getUnreadCount(userId),
    ]);

    return NextResponse.json(
      { items: result.items, nextCursor: result.nextCursor, unread },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[user/notifications] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PATCH /api/user/notifications
 * Batch mark-read. Body { ids?: string[], read?: boolean }.
 * Con ids → marca esos ids; sin ids → marca todas las no leídas. 200 { updated }.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const validated = markReadSchema.parse(body);
    const userId = session!.user.id as string;

    const updated = validated.ids && validated.ids.length > 0
      ? await setNotificationsRead(userId, validated.ids, validated.read)
      : validated.read
        ? await markAllAsRead(userId)
        : 0;

    return NextResponse.json(
      { updated },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[user/notifications] Error en PATCH:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}