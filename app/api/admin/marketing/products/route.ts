import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { createProduct, getCategoryById, getProductBySlug, listProducts } from "@/lib/db/queries/marketing";
import { productSchema } from "@/lib/marketing/schemas/entities";
import { CACHE_TAGS, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

/**
 * GET /api/admin/marketing/products
 * Lista todos los productos (todos los status) con categoryName.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const products = await listProducts();
    return NextResponse.json({ products }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/products] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/admin/marketing/products
 * Crea un producto. Slug duplicado → 409; categoría inexistente → 400.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = productSchema.parse(body);

    if (validated.categoryId) {
      const category = await getCategoryById(validated.categoryId);
      if (!category) {
        return NextResponse.json({ error: "La categoría indicada no existe" }, { status: 400 });
      }
    }

    const existing = await getProductBySlug(validated.slug);
    if (existing) {
      return NextResponse.json({ error: "Ya existe un producto con ese slug" }, { status: 409 });
    }

    const product = await createProduct(validated);

    await auditCreate(
      "marketing_product",
      product.id,
      validated as unknown as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    if (validated.status === 'published') {
      revalidateMarketing([CACHE_TAGS.products]);
    }

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/products] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
