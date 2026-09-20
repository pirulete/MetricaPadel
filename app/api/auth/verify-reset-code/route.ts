import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEmailVerification, deleteEmailVerification } from "@/lib/db/queries";
import { emailSchema } from "@/lib/auth/schemas";
import { checkAuthRateLimit } from "@/lib/rate-limit";

const verifyCodeSchema = z.object({
  email: emailSchema,
  code: z.string().length(6, "El código de verificación debe tener 6 dígitos"),
});

export async function POST(request: NextRequest) {
  try {
    const rl = checkAuthRateLimit(request, 'verify-reset-code');
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes. Intente nuevamente más tarde." }, {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter) },
      });
    }

    const body = await request.json();
    const validatedData = verifyCodeSchema.parse(body);

    console.log("[auth] Verificando código para:", validatedData.email);

    // 1. Find the verification code in the database
    const verificationRecord = await getEmailVerification(validatedData.email, validatedData.code);

    if (!verificationRecord) {
      console.log("[auth] Código de verificación inválido o expirado para:", validatedData.email);
      return NextResponse.json({ error: "Código de verificación inválido o expirado." }, { status: 400 });
    }

    // 2. Check if the code has expired
    if (new Date(verificationRecord.expiresAt) < new Date()) {
      console.log("[auth] Código de verificación expirado para:", validatedData.email);
      await deleteEmailVerification(validatedData.email);
      return NextResponse.json({ error: "El código de verificación ha expirado." }, { status: 400 });
    }

    console.log("[auth] Código de verificación válido para:", validatedData.email);

    // 3. Delete the used verification code
    await deleteEmailVerification(validatedData.email);

    // Return success response, indicating the code is valid and ready for password reset
    return NextResponse.json({
      success: true,
      message: "Código verificado correctamente. Ahora puedes establecer tu nueva contraseña.",
      email: validatedData.email,
    }, { status: 200 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[auth] Validación fallida:", error.errors);
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }

    console.error("[auth] Error al verificar código:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: "Error al verificar el código", details: errorMessage }, { status: 500 });
  }
}
