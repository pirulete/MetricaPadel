import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail, incrementFailedAttempts, resetFailedAttempts, updateStatus } from "@/lib/db/queries";
import bcrypt from "bcryptjs";
import { auditLogin, auditLoginFailure, extractRequestContext } from '@/lib/audit/helpers';
import { loginSchema } from "@/lib/auth/schemas";
import { checkAuthRateLimit } from "@/lib/rate-limit";

async function sendAccountLockedEmail(email: string) {
  console.log(`[SIMULACIÓN] Enviando email a ${email}: Tu cuenta ha sido bloqueada por múltiples intentos fallidos.`);
  // Aquí iría la integración real con Resend u otro servicio
}

export const runtime = "nodejs";

/**
 * POST /api/auth/signin
 * Valida credenciales y retorna información clara de errores
 */
export async function POST(request: NextRequest) {
  try {
    const rl = checkAuthRateLimit(request, 'signin');
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiados intentos de inicio de sesión. Intente nuevamente más tarde." }, {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter) },
      });
    }

    const body = await request.json();
    const validatedData = loginSchema.parse(body);

    const { ipAddress, userAgent } = extractRequestContext(request);

    console.log("[auth] Intentando login para:", validatedData.email);

    const user = await getUserByEmail(validatedData.email);

    if (!user) {
      console.log("[auth] Usuario no encontrado:", validatedData.email);
      await auditLoginFailure(validatedData.email, 'user_not_found', ipAddress, userAgent);
      return NextResponse.json(
        { error: "Email o contraseña inválidos" },
        { status: 401 }
      );
    }

    // Verificar si la cuenta está bloqueada
    if (user.status === 'LOCKED') {
      console.log("[auth] Intento de login en cuenta bloqueada:", validatedData.email);
      await auditLoginFailure(validatedData.email, 'account_locked', ipAddress, userAgent);
      return NextResponse.json(
        { error: "Cuenta bloqueada", code: "ACCOUNT_LOCKED" },
        { status: 403 }
      );
    }

    // Verificar contraseña
    const passwordsMatch = await bcrypt.compare(
      validatedData.password,
      user.passwordHash
    );

    if (!passwordsMatch) {
      console.log("[auth] Contraseña incorrecta para:", validatedData.email);

      const newAttempts = await incrementFailedAttempts(validatedData.email);
      console.log("[auth] cantidad intentos fallidos:", newAttempts);
      if (newAttempts && newAttempts >= 5) {
        console.log("[auth] Bloqueando cuenta por múltiples intentos fallidos:", validatedData.email);
        await updateStatus(validatedData.email, 'LOCKED');
        await sendAccountLockedEmail(validatedData.email);
        await auditLoginFailure(validatedData.email, 'account_locked_max_attempts', ipAddress, userAgent);

        return NextResponse.json(
          { error: "Cuenta bloqueada", code: "ACCOUNT_LOCKED" },
          { status: 403 }
        );
      }

      await auditLoginFailure(validatedData.email, 'invalid_password', ipAddress, userAgent);
      return NextResponse.json(
        { error: "Email o contraseña inválidos" },
        { status: 401 }
      );
    }

    console.log("[auth] Login exitoso para:", validatedData.email);

    if (user.failedAttempts > 0) {
      await resetFailedAttempts(validatedData.email);
    }

    await auditLogin(user.id, ipAddress, userAgent);

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          status: user.status,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[auth] Validación fallida:", error.errors);
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("[auth] Login error:", error);
    return NextResponse.json(
      { error: "Error al iniciar sesión", details: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
