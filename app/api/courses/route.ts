import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { createCourse, listCourses } from "@/lib/db/queries/padel";
import { courseCreateSchema } from "@/lib/validations/padel";
import { generateInviteCode } from "@/lib/padel/course-code";

export const runtime = "nodejs";

const MAX_INVITE_RETRIES = 5;

/**
 * GET /api/courses — lista cursos del coach (P05). Scoped al owner.
 */
export async function GET() {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const courses = await listCourses(session!.user.id as string);
    return NextResponse.json({ courses }, { status: 200 });
  } catch (error) {
    console.error("[courses] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/courses — crea curso activo con inviteCode PAD-XXXX (P06).
 * Reintenta hasta 5 veces si el código colisiona (UNIQUE en DB, D4).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = courseCreateSchema.parse(body);

    let course = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_INVITE_RETRIES; attempt++) {
      try {
        course = await createCourse({
          ownerId: session!.user.id as string,
          name: validated.name,
          level: validated.level,
          schedule: validated.schedule ?? null,
          days: validated.days ?? [],
          inviteCode: generateInviteCode(),
        });
        break;
      } catch (error) {
        lastError = error;
        // Solo reintenta si es colisión de inviteCode (23505 unique_violation)
        if (!(error instanceof Error) || (error as { code?: string }).code !== '23505') throw error;
      }
    }
    if (!course) {
      console.error("[courses] Colisión de inviteCode tras retries:", lastError);
      return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }

    await auditCreate(
      "course",
      course.id,
      { name: course.name, level: course.level, inviteCode: course.inviteCode },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ course }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}