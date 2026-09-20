import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail, updateUserPassword, updateStatus, createEmailVerification, resetFailedAttempts } from "@/lib/db/queries";
import { deleteUserSessions } from "@/lib/db/session-audit-queries";
import bcrypt from "bcryptjs";
import { sendVerificationEmail } from "@/lib/email/send-verification";
import { emailSchema } from "@/lib/auth/schemas";
import { checkAuthRateLimit } from "@/lib/rate-limit";

const passwordSchema = z.string().min(8, "La contraseña debe tener al menos 8 caracteres");

const forgotPasswordSchema = z.object({
  email: emailSchema,
  newPassword: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const rl = checkAuthRateLimit(request, 'forgot-password');
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes. Intente nuevamente más tarde." }, {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter) },
      });
    }

    const body = await request.json();
    const validatedData = forgotPasswordSchema.parse(body);

    // 1. Validar que el usuario existe
    const user = await getUserByEmail(validatedData.email);
    if (!user) {
      // Prevención de enumeración de usuarios: devolvemos éxito falso
      return NextResponse.json({ success: true, message: "Si el correo existe, se enviaron instrucciones." }, { status: 200 });
    }
    console.log("[auth] Intentando cambiar contraseña para user:", validatedData.email);

    // 2. Hashear nueva contraseña y actualizar usuario a TEMPORARY
    const hashedPassword = await bcrypt.hash(validatedData.newPassword, 10);
    await updateUserPassword(validatedData.email, hashedPassword);
    await updateStatus(validatedData.email, "TEMPORARY"); // Requiere re-verificación de email
    await resetFailedAttempts(validatedData.email);

    // 3. Borrar sesiones activas antiguas por seguridad
    if (user.id) {
      await deleteUserSessions(user.id);
    }

    // 4. Generar código y enviar email de verificación
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await createEmailVerification(validatedData.email, verificationCode, expiresAt);

    const firstName = user.firstName || "";
    await sendVerificationEmail(validatedData.email, verificationCode, firstName);

    return NextResponse.json({
      success: true,
      message: "Contraseña actualizada. Tu cuenta está en estado TEMPORARY y requiere verificación.",
    }, { status: 200 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al restablecer contraseña" }, { status: 500 });
  }
}
