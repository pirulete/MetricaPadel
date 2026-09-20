import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { createPage, getPageBySlug, listPages } from "@/lib/db/queries/marketing";
import { pageSchema } from "@/lib/marketing/schemas/entities";
import { isReservedSlug } from "@/lib/marketing/reserved-slugs";
import { invalidateForEntity, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

/**
 * GET /api/admin/marketing/pages
 * Lista todas las páginas (todos los status) con sectionCount.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const pages = await listPages();
    return NextResponse.json({ pages }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/pages] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/admin/marketing/pages
 * Crea una página. Valida slug reservado (400) y duplicado (409).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = pageSchema.parse(body);

    if (isReservedSlug(validated.slug)) {
      return NextResponse.json({ error: "Slug reservado para rutas del sistema" }, { status: 400 });
    }

    const existing = await getPageBySlug(validated.slug);
    if (existing) {
      return NextResponse.json({ error: "Ya existe una página con ese slug" }, { status: 409 });
    }

    const page = await createPage(validated);

    await auditCreate(
      "marketing_page",
      page.id,
      validated as unknown as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    if (validated.status === 'published') {
      revalidateMarketing(invalidateForEntity('page', validated.slug));
    }

    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/pages] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
