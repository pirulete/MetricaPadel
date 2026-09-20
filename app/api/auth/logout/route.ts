import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { deleteSessionByToken } from "@/lib/db/session-audit-queries";
import { auditLogout } from "@/lib/audit/helpers";

export const runtime = "nodejs";

/**
 * POST /api/auth/logout
 * Cierra la sesión del usuario actual
 * Limpia la sesión en DB, audita y delega cleanup de cookies a signOut() en el cliente
 * NOTA: Solo borra la sesión activa (por sessionToken), no afecta otras sesiones del mismo usuario en otros dispositivos
 */
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

    if (!token?.sub) {
      return NextResponse.json(
        { success: true, message: "No había sesión activa" },
        { status: 200 }
      );
    }

    const sessionToken = (token as any).sessionToken as string | undefined;
    if (sessionToken) {
      await deleteSessionByToken(sessionToken);
    }

    const userId = token.sub as string;
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    await auditLogout(userId, ipAddress, userAgent);

    return NextResponse.json(
      {
        success: true,
        message: "Sesión cerrada exitosamente",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[auth] Error en logout:", error);
    return NextResponse.json(
      { error: "Error al cerrar sesión" },
      { status: 500 }
    );
  }
}
