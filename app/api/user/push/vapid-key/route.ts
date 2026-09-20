import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";

export const runtime = "nodejs";

/**
 * GET /api/user/push/vapid-key
 * Expone la VAPID public key al client (segura por diseño VAPID).
 * Si no hay keys configuradas, push está deshabilitado → 503 controlado (no 500).
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return NextResponse.json(
        { error: "Push deshabilitado" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { publicKey },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[user/push/vapid-key] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}