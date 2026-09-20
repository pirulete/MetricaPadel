import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/queries";
import { getSessionByToken, updateSessionExpiresAt } from "@/lib/db/session-audit-queries";
import { createAuditLog } from "@/lib/db/session-audit-queries";

export const runtime = "nodejs";

const REFRESH_COOLDOWN_MS = 60 * 1000;

async function getClientInfo(request: NextRequest) {
  return {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown",
    userAgent: request.headers.get("user-agent") ?? "unknown",
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No hay sesión activa" },
        { status: 401 }
      );
    }

    const token = session.user as any;
    const sessionToken = token?.sessionToken as string | undefined;

    if (sessionToken) {
      const dbSession = await getSessionByToken(sessionToken);

      if (dbSession) {
        const lastActivity = dbSession.lastActivityAt?.getTime() ?? 0;
        const timeSinceLastRefresh = Date.now() - lastActivity;

        if (timeSinceLastRefresh < REFRESH_COOLDOWN_MS) {
          const remainingSeconds = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLastRefresh) / 1000);
          return NextResponse.json(
            { error: "Demasiadas solicitudes", remainingSeconds },
            { status: 429 }
          );
        }

        await updateSessionExpiresAt(sessionToken);
      }
    }

    const freshUser = await getUserById(session.user.id);

    if (!freshUser) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const { ipAddress, userAgent } = await getClientInfo(request);

    await createAuditLog(
      "SESSION_REFRESH",
      "session",
      sessionToken ?? session.user.id,
      {
        userId: session.user.id,
        ipAddress,
        userAgent,
        metadata: { email: freshUser.email },
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: "Sesión refrescada",
        user: {
          id: freshUser.id,
          email: freshUser.email,
          firstName: freshUser.firstName,
          lastName: freshUser.lastName,
          status: freshUser.status,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[auth] Error refrescando sesión:", error);
    return NextResponse.json(
      { error: "Error al refrescar sesión" },
      { status: 500 }
    );
  }
}
