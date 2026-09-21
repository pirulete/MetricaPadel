import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { createActiveUser, listPlayers } from "@/lib/db/queries/padel";
import { adminCreateUserSchema, adminUserQuerySchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
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
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = adminCreateUserSchema.parse(body);

    const user = await createActiveUser(validated);

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