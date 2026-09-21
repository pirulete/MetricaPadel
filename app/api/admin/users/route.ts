import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { createActiveUser, listPlayers } from "@/lib/db/queries/padel";
import { generateRandomPassword } from "@/lib/padel/password";
import { adminCreateUserSchema, adminUserQuerySchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: string; message?: string; cause?: { code?: string } };
  return (
    e.code === "23505" ||
    e.cause?.code === "23505" ||
    (typeof e.message === "string" && e.message.includes("unique constraint"))
  );
}

/**
 * GET /api/admin/users
 * Lista jugadores (solo role USER) para el picker de P09. Query: ?search=.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const query = adminUserQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const users = await listPlayers(query.search);
    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/users] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/admin/users
 * Crea usuario jugador (role USER, status=ACTIVE directo, sin verificación de
 * email — D5). Email duplicado → 409. Audita CREATE.
 * G4: password opcional — si no viene, se genera una segura y se devuelve UNA
 * vez en `generatedPassword` (nunca se persiste en claro ni se audita).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = adminCreateUserSchema.parse(body);

    const generatedPassword = validated.password ?? generateRandomPassword();
    const user = await createActiveUser({
      email: validated.email,
      firstName: validated.firstName,
      lastName: validated.lastName,
      password: generatedPassword,
    });

    await auditCreate(
      "user",
      user.id,
      { email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
        },
        ...(validated.password ? {} : { generatedPassword }),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
    }
    console.error("[admin/users] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}