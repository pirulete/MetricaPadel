import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail, updateUserPassword, updateStatus } from "@/lib/db/queries";
import { deleteUserSessions } from "@/lib/db/session-audit-queries";
import bcrypt from "bcryptjs";
import { emailSchema } from "@/lib/auth/schemas";
import { checkAuthRateLimit } from "@/lib/rate-limit";

const passwordSchema = z.string().min(8, "La contraseña debe tener al menos 8 caracteres");

const resetPasswordSchema = z.object({
  email: emailSchema,
  newPassword: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

export async function POST(request: NextRequest) {
  try {
    const rl = checkAuthRateLimit(request, 'reset-password');
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes. Intente nuevamente más tarde." }, {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter) },
      });
    }

    const body = await request.json();
    const validatedData = resetPasswordSchema.parse(body);

    console.log("[auth] Iniciando restablecimiento de contraseña para:", validatedData.email);

    // 1. Validate user exists
    const user = await getUserByEmail(validatedData.email);

    if (!user) {
      console.log("[auth] Email no encontrado:", validatedData.email);
      return NextResponse.json({ error: "Error al restablecer contraseña. Inténtalo de nuevo." }, { status: 400 });
    }

    // 2. Update user status to TEMPORARY and set the new password
    console.log("[auth] Actualizando contraseña y estado a TEMPORARY para:", validatedData.email);
    const hashedPassword = await bcrypt.hash(validatedData.newPassword, 10);
    await updateUserPassword(validatedData.email, hashedPassword);
    await updateStatus(validatedData.email, 'TEMPORARY');

    // 3. Delete all active sessions for the user to force re-login
    console.log("[auth] Eliminando sesiones activas para:", validatedData.email);
    if (user.id) {
      await deleteUserSessions(user.id);
    }

    return NextResponse.json({
      success: true,
      message: "Contraseña restablecida. Tu cuenta requiere verificación de email (estado TEMPORARY). Inicia sesión.",
      email: validatedData.email,
      status: "TEMPORARY"
    }, { status: 200 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[auth] Validación fallida:", error.errors);
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }

    console.error("[auth] Error no esperado:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: "Error al restablecer contraseña", details: errorMessage }, { status: 500 });
  }
}
