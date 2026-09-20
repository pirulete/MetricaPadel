import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUserByEmail, createEmailVerification } from "@/lib/db/queries";
import { emailSchema } from "@/lib/auth/schemas";
import { checkAuthRateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/email/send-verification";

export const runtime = "nodejs";

const resendSchema = z.object({
  email: emailSchema,
});

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST /api/auth/resend-code
 * Reenvía un nuevo código de verificación al email del usuario
 */
export async function POST(request: NextRequest) {
  try {
    const rl = checkAuthRateLimit(request, 'resend-code');
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes. Intente nuevamente más tarde." }, {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter) },
      });
    }

    const body = await request.json();
    const { email } = resendSchema.parse(body);

    // Verificar que el usuario existe
    const user = await getUserByEmail(email);

    if (!user) {
      console.log("[auth] Usuario no encontrado:", email);
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Buscar código existente válido del día actual
    const existingVerification = await db.query.emailVerifications.findFirst({
      where: (table, { and, eq, gte }) => and(
        eq(table.email, email),
        gte(table.expiresAt, new Date()) // No expirado
      ),
    });

    let code: string;
    let expiresAt: Date;
    let isExistingCode = false;

    if (existingVerification) {
      // Verificar si el código fue creado hoy
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const codeDate = new Date(existingVerification.createdAt);
      codeDate.setHours(0, 0, 0, 0);

      if (codeDate.getTime() === today.getTime()) {
        // Reutilizar código existente del día
        console.log("[auth] ✓ Reutilizando código existente del día:", existingVerification.code);
        code = existingVerification.code;
        expiresAt = existingVerification.expiresAt;
        isExistingCode = true;
      } else {
        // Código de días anteriores, crear nuevo
        console.log("[auth] Código existente expirado o de día anterior, generando nuevo...");
        code = generateVerificationCode();
        expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
      }
    } else {
      // No hay código existente, crear nuevo
      console.log("[auth] No hay código existente, generando nuevo...");
      code = generateVerificationCode();
      expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
    }

    // Solo guardar si no es un código existente
    if (!isExistingCode) {
      try {
        await createEmailVerification(email, code, expiresAt);
      } catch {
        return NextResponse.json(
          { error: "Error al generar código de verificación" },
          { status: 500 }
        );
      }
    }

    // Enviar email usando el wrapper compartido
    if (!isExistingCode) {
      const result = await sendVerificationEmail(email, code, user.firstName || undefined)
      if (!result.success) {
        console.error("[auth] ✗ Error al enviar email:", result.error)
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: isExistingCode ? "Código del día reutilizado" : "Código reenviado a tu email",
        code: process.env.NODE_ENV === "development" ? code : undefined,
        isExistingCode,
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

    console.error("[auth] Error en resend-code:", error);
    return NextResponse.json(
      { error: "Error al reenviar código" },
      { status: 500 }
    );
  }
}
