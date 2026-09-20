import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import {
  deleteCategory,
  getCategoryById,
  getCategoryBySlug,
  updateCategory,
} from "@/lib/db/queries/marketing";
import { categoryUpdateSchema } from "@/lib/marketing/schemas/entities";
import { CACHE_TAGS, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

/**
 * GET /api/admin/marketing/categories/[id]
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const category = await getCategoryById(id);
    if (!category) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ category }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/categories/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/marketing/categories/[id]
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const oldCategory = await getCategoryById(id);
    if (!oldCategory) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const validated = categoryUpdateSchema.parse(body);

    if (validated.slug) {
      const existing = await getCategoryBySlug(validated.slug);
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "Ya existe una categoría con ese slug" }, { status: 409 });
      }
    }

    const category = await updateCategory(id, validated);

    await auditUpdate(
      "marketing_category",
      id,
      { slug: oldCategory.slug, name: oldCategory.name } as Record<string, any>,
      validated as unknown as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    revalidateMarketing([CACHE_TAGS.products]);

    return NextResponse.json({ category }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/categories/[id]] Error en PATCH:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/marketing/categories/[id]
 * Borra la categoría; los productos quedan con categoryId NULL (FK SET NULL).
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const oldCategory = await getCategoryById(id);
    if (!oldCategory) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
    }

    await deleteCategory(id);

    await auditDelete(
      "marketing_category",
      id,
      { slug: oldCategory.slug, name: oldCategory.name } as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(_request) }
    );

    revalidateMarketing([CACHE_TAGS.products]);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/categories/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
