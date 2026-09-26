import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin, guardUser } from "@/lib/auth/admin-guard";
import { auditAcademyCreated, extractRequestContext } from "@/lib/audit/helpers";
import { createAcademy, listUserAcademies } from "@/lib/db/queries/padel/academies";
import { academyCreateSchema } from "@/lib/validations/academy";

export const runtime = "nodejs";

/**
 * GET /api/academies
 * Lista academias donde el usuario es miembro ACTIVO (cualquier rol) y la
 * academia está activa. guardUser: cualquier usuario autenticado (coach o
 * alumno) puede ver sus academias.
 */
export async function GET() {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;

    const academies = await listUserAcademies(session!.user.id as string);
    return NextResponse.json({ academies }, { status: 200 });
  } catch (error) {
    console.error("[academies] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/academies
 * Crea academia (guardAdmin = coach) + inserta membresía OWNER activa en la
 * misma transacción. 409 si el slug ya existe (UNIQUE). Audita CREATE.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = academyCreateSchema.parse(body);

    const academy = await createAcademy({
      ownerId: session!.user.id as string,
      name: validated.name,
      slug: validated.slug,
      primaryColor: validated.primaryColor,
    });

    await auditAcademyCreated(
      academy.id,
      { name: academy.name, slug: academy.slug, ownerId: academy.ownerId },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ academy }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    if (
      error instanceof Error &&
      ((error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505")
    ) {
      return NextResponse.json({ error: "El slug ya está en uso" }, { status: 409 });
    }
    console.error("[academies] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}