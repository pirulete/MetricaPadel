import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserById, updateUserProfile } from "@/lib/db/queries";
import { guardUser } from "@/lib/auth/admin-guard";
import { updateProfileSchema } from "@/lib/auth/schemas";
import { auditUpdate } from "@/lib/audit/helpers";
import { z } from "zod";

export const runtime = "nodejs";

/**
 * GET /api/user/profile
 * Lee el perfil propio
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;

    const user = await getUserById(session!.user.id as string);

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          status: user.status,
          emailVerifiedAt: user.emailVerifiedAt,
          createdAt: user.createdAt,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[profile] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/user/profile
 * Actualiza el perfil propio (email inmutable)
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = updateProfileSchema.parse(body);

    const oldUser = await getUserById(session!.user.id as string);
    if (!oldUser) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    await updateUserProfile(oldUser.id, validated);

    await auditUpdate(
      "user",
      oldUser.id,
      { firstName: oldUser.firstName, lastName: oldUser.lastName, phone: oldUser.phone },
      validated,
      {
        userId: oldUser.id,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
      }
    );

    const freshUser = await getUserById(oldUser.id);

    return NextResponse.json(
      {
        success: true,
        user: {
          id: freshUser!.id,
          email: freshUser!.email,
          firstName: freshUser!.firstName,
          lastName: freshUser!.lastName,
          phone: freshUser!.phone,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("[profile] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
