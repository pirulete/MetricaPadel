import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { getUnreadCount } from "@/lib/db/queries/notifications";

export const runtime = "nodejs";

/**
 * GET /api/user/notifications/unread-count
 * Count de no leídas (read = 0, excluye soft-deleted). 200 { count }.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const count = await getUnreadCount(session!.user.id as string);

    return NextResponse.json(
      { count },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[user/notifications/unread-count] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}