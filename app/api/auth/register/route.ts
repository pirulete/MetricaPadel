import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail, createUser } from "@/lib/db/queries";
import { checkRegistrationRateLimit, getRateLimitHeaders, RATE_LIMIT_CONFIG } from "@/lib/rate-limit";
import { emailSchema } from "@/lib/auth/schemas";

// Requerido para que bcryptjs funcione correctamente en queries de BD
export const runtime = "nodejs";

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  firstName: z.string().min(1, "El nombre es requerido"),
  lastName: z.string().min(1, "El apellido es requerido"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    console.log("[auth] Iniciando registro para:", validatedData.email);

    // Verificar rate limit
    const rateLimitResult = checkRegistrationRateLimit(request, validatedData.email);
    if (!rateLimitResult.allowed) {
      console.log("[auth] Rate limit excedido para:", validatedData.email);
      const response = NextResponse.json(
        {
          error: rateLimitResult.error,
          retryAfter: rateLimitResult.retryAfter,
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining
        },
        { status: 429 }
      );

      const headers = getRateLimitHeaders(rateLimitResult);
      headers.forEach((value, key) => {
        response.headers.set(key, value);
      });

      return response;
    }

    try {
      const existingUser = await getUserByEmail(validatedData.email);
      if (existingUser) {
        console.log("[auth] Email ya registrado:", validatedData.email);
        return NextResponse.json(
          { error: "Este email ya está registrado" },
          { status: 400 }
        );
      }
    } catch {
      console.error("[auth] Error al verificar email existente:");
      return NextResponse.json(
        { error: "Error al verificar email" },
        { status: 500 }
      );
    }

    // Crear usuario en estado TEMPORARY (requiere verificación de email)
    try {
      console.log("[auth] Creando usuario...");
      await createUser(
        validatedData.email,
        validatedData.firstName,
        validatedData.lastName,
        validatedData.password
      );
      console.log("[auth] Usuario creado exitosamente con estado TEMPORARY");
    } catch {
      console.error("[auth] Error al crear usuario:");
      return NextResponse.json(
        { error: "Error al crear usuario en la base de datos" },
        { status: 500 }
      );
    }

    console.log("[auth] Registro completado exitosamente para:", validatedData.email);

    return NextResponse.json(
      {
        success: true,
        message: "Usuario registrado exitosamente. Verifica tu email.",
        email: validatedData.email,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[auth] Validación fallida:", error.errors);
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }

    console.error("[auth] Error no esperado:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: "Error al registrar usuario", details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * HEAD /api/auth/register
 * Consulta información de rate limit sin consumir recursos
 */
export async function HEAD(_request: NextRequest) {
  const rateLimitResult = {
    allowed: true,
    limit: RATE_LIMIT_CONFIG.maxRegistrationsPerHour,
    remaining: RATE_LIMIT_CONFIG.maxRegistrationsPerHour,
    resetTime: Date.now() + RATE_LIMIT_CONFIG.windowMs
  };

  const response = new NextResponse(null, { status: 200 });

  response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
  response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetTime / 1000).toString());

  return response;
}
