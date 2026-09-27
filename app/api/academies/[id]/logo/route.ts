import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAcademyAdmin } from "@/lib/auth/academy-guard";
import { auditAcademyUpdated, extractRequestContext } from "@/lib/audit/helpers";
import { getAcademyById, updateAcademyLogo } from "@/lib/db/queries/padel/academies";
import { validateLogoUpload } from "@/lib/padel/logo";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/academies/[id]/logo
 * Upload de logo (multipart/form-data, campo `file`). guardAcademyAdmin.
 * Valida MIME (PNG/SVG), ≤2MB, dims ≤1024×1024 y sanitiza SVG (lib/padel/logo).
 * Persiste data-URL en academies.logoUrl. Audita UPDATE (logo).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = padelIdParamsSchema.parse(await params);
    const guardError = await guardAcademyAdmin(session, id);
    if (guardError) return guardError;

    const previous = await getAcademyById(id);
    if (!previous) {
      return NextResponse.json({ error: "Academia no encontrada" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Campo `file` requerido (multipart/form-data)" }, { status: 400 });
    }

    const result = await validateLogoUpload(file);
    if (!result.valid || !result.dataUrl) {
      return NextResponse.json({ error: result.error ?? "Logo inválido" }, { status: 400 });
    }

    const academy = await updateAcademyLogo(id, result.dataUrl);

    await auditAcademyUpdated(
      id,
      { logoUrl: previous.logoUrl ?? null },
      { logoUrl: "data:image/* (logo actualizado)" },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ academy }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/logo] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}