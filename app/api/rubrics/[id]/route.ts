import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { archiveRubric, getRubricById, updateRubric } from "@/lib/db/queries/padel";
import { padelIdParamsSchema, rubricUpdateSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/rubrics/[id]
 * Detalle completo (rubric + levels + criteria + descriptors). Ownership:
 * 404 si no pertenece al coach (anti-IDOR).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);

    const result = await getRubricById(session!.user.id as string, id);
    if (!result) {
      return NextResponse.json({ error: "Rúbrica no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[rubrics/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/rubrics/[id]
 * Actualiza title/category y, si viene criteria, reemplaza el set completo
 * (delete + reinsert en transacción). Audita UPDATE.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const body = await request.json();
    const validated = rubricUpdateSchema.parse(body);

    const rubric = await updateRubric(session!.user.id as string, id, validated);
    if (!rubric) {
      return NextResponse.json({ error: "Rúbrica no encontrada" }, { status: 404 });
    }

    await auditUpdate(
      "rubric",
      id,
      { title: rubric.title, category: rubric.category },
      validated as unknown as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ rubric }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[rubrics/[id]] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/rubrics/[id]
 * Archiva rúbrica (soft, status=archived). Nunca hard delete: las evaluaciones
 * la referencian. Audita DELETE.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);

    const rubric = await archiveRubric(session!.user.id as string, id);
    if (!rubric) {
      return NextResponse.json({ error: "Rúbrica no encontrada" }, { status: 404 });
    }

    await auditDelete(
      "rubric",
      id,
      { title: rubric.title, status: rubric.status },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ rubric: { id: rubric.id, status: rubric.status } }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[rubrics/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}