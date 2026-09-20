import { NextRequest, NextResponse } from "next/server";

import { getCachedProducts, PUBLIC_CACHE_HEADERS } from "@/lib/marketing/cache";

export const runtime = "nodejs";

/** GET /api/public/products/[slug] — producto publicado (caché tag `products`). 404 si no existe. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const products = await getCachedProducts();
  const product = products.find((p) => p.slug === slug);
  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ product }, { headers: PUBLIC_CACHE_HEADERS });
}
