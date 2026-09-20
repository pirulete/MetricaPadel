import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import {
  deleteProduct,
  getCategoryById,
  getProductById,
  getProductBySlug,
  updateProduct,
} from "@/lib/db/queries/marketing";
import { productUpdateSchema } from "@/lib/marketing/schemas/entities";
import { CACHE_TAGS, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

/**
 * GET /api/admin/marketing/products/[id]
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const product = await getProductById(id);
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ product }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/products/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/marketing/products/[id]
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const oldProduct = await getProductById(id);
    if (!oldProduct) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const validated = productUpdateSchema.parse(body);

    if (validated.slug) {
      const existing = await getProductBySlug(validated.slug);
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "Ya existe un producto con ese slug" }, { status: 409 });
      }
    }

    if (validated.categoryId !== undefined && validated.categoryId !== null) {
      const category = await getCategoryById(validated.categoryId);
      if (!category) {
        return NextResponse.json({ error: "La categoría indicada no existe" }, { status: 400 });
      }
    }

    const product = await updateProduct(id, validated);

    await auditUpdate(
      "marketing_product",
      id,
      { slug: oldProduct.slug, name: oldProduct.name, status: oldProduct.status } as Record<string, any>,
      validated as unknown as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    revalidateMarketing([CACHE_TAGS.products]);

    return NextResponse.json({ product }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/products/[id]] Error en PATCH:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/marketing/products/[id]
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const oldProduct = await getProductById(id);
    if (!oldProduct) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    await deleteProduct(id);

    await auditDelete(
      "marketing_product",
      id,
      { slug: oldProduct.slug, name: oldProduct.name, status: oldProduct.status } as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(_request) }
    );

    revalidateMarketing([CACHE_TAGS.products]);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/products/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
