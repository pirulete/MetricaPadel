import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { changePasswordSchema } from "@/lib/auth/schemas";
import { comparePassword } from "@/lib/auth/password";
import { getUserById } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auditChangePassword, extractRequestContext } from "@/lib/audit/helpers";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

/**
 * PUT /api/user/password
 * Cambia la contraseña del usuario autenticado (G5). Requiere ACTIVE.
 * Valida la contraseña actual contra el hash almacenado antes de actualizar.
 * Audita CHANGE_PASSWORD (nunca se loggea la contraseña).
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const validated = changePasswordSchema.parse(body);

    const user = await getUserById(session!.user.id as string);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const isValid = await comparePassword(validated.currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "La contraseña actual no es correcta" },
        { status: 400 }
      );
    }

    const newHash = await bcrypt.hash(validated.newPassword, 10);

    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const { ipAddress, userAgent } = extractRequestContext(request);
    await auditChangePassword(user.id, ipAddress, userAgent);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("[user/password] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}