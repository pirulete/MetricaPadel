import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { createCategory, getCategoryBySlug, listCategories } from "@/lib/db/queries/marketing";
import { categorySchema } from "@/lib/marketing/schemas/entities";
import { CACHE_TAGS, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

/**
 * GET /api/admin/marketing/categories
 * Lista categorías con productCount.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const categories = await listCategories();
    return NextResponse.json({ categories }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/categories] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/admin/marketing/categories
 * Crea una categoría. Slug duplicado → 409.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = categorySchema.parse(body);

    const existing = await getCategoryBySlug(validated.slug);
    if (existing) {
      return NextResponse.json({ error: "Ya existe una categoría con ese slug" }, { status: 409 });
    }

    const category = await createCategory(validated);

    await auditCreate(
      "marketing_category",
      category.id,
      validated as unknown as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    revalidateMarketing([CACHE_TAGS.products]);

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/categories] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
