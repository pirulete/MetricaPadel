import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getUserByEmail,
  getEmailVerification,
  verifyUserEmail,
  deleteEmailVerification,
} from "@/lib/db/queries";
import { verifyEmailSchema } from "@/lib/auth/schemas";
import { checkAuthRateLimit } from "@/lib/rate-limit";
import { auditVerifyEmail } from "@/lib/audit/helpers";

export const runtime = "nodejs";

/**
 * POST /api/auth/verify-email
 * Verifica el email del usuario usando un código OTP
 * Cambia el estado del usuario de TEMPORARY a ACTIVE
 */
export async function POST(req: NextRequest) {
  try {
    const rl = checkAuthRateLimit(req, 'verify-email');
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes. Intente nuevamente más tarde." }, {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter) },
      });
    }

    const body = await req.json();
    const { email, code } = verifyEmailSchema.parse(body);

    // Obtener verificación de email
    const verification = await getEmailVerification(email, code);

    if (!verification) {
      return NextResponse.json(
        { error: "Código de verificación inválido o expirado" },
        { status: 400 }
      );
    }

    // Verificar que el código no haya expirado
    if (verification.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "El código de verificación ha expirado" },
        { status: 400 }
      );
    }

    // Obtener el usuario
    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Actualizar el estado del usuario a ACTIVE
    await verifyUserEmail(user.id);

    await deleteEmailVerification(email);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
    await auditVerifyEmail(user.id, email, ipAddress);

    return NextResponse.json(
      {
        success: true,
        message: "Email verificado exitosamente",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          status: "ACTIVE",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validación fallida", details: error.errors },
        { status: 400 }
      );
    }

    console.error("[auth] Error en verify-email:", error);
    return NextResponse.json(
      { error: "Error al verificar email" },
      { status: 500 }
    );
  }
}
