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
 * Detalle completo (rubric + levels + criteria + descriptors). Acceso:
 * personal → owner; institucional → miembro activo (COACH+) de la academia.
 * 404 si no existe o sin acceso (anti-IDOR).
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
 * (delete + reinsert en transacción). Guard extendido: institucional solo
 * OWNER/ADMIN de la academia (COACH → 403). Audita UPDATE.
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

    const result = await updateRubric(session!.user.id as string, id, validated);
    if (!result.ok) {
      if (result.reason === "forbidden") {
        return NextResponse.json({ error: "No autorizado para editar esta rúbrica" }, { status: 403 });
      }
      return NextResponse.json({ error: "Rúbrica no encontrada" }, { status: 404 });
    }

    await auditUpdate(
      "rubric",
      id,
      { title: result.rubric.title, category: result.rubric.category },
      validated as unknown as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ rubric: result.rubric }, { status: 200 });
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
 * la referencian. Guard extendido: institucional solo OWNER/ADMIN (COACH → 403).
 * Audita DELETE.
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

    const result = await archiveRubric(session!.user.id as string, id);
    if (!result.ok) {
      if (result.reason === "forbidden") {
        return NextResponse.json({ error: "No autorizado para archivar esta rúbrica" }, { status: 403 });
      }
      return NextResponse.json({ error: "Rúbrica no encontrada" }, { status: 404 });
    }

    await auditDelete(
      "rubric",
      id,
      { title: result.rubric.title, status: result.rubric.status },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ rubric: { id: result.rubric.id, status: result.rubric.status } }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[rubrics/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}