import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCachedProducts, PUBLIC_CACHE_HEADERS } from "@/lib/marketing/cache";

export const runtime = "nodejs";

const querySchema = z.object({
  category: z.string().trim().max(200).optional(),
});

/** GET /api/public/products?category=<slug> — productos publicados (caché tag `products`). */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const categorySlug = parsed.success ? parsed.data.category : undefined;

  const products = await getCachedProducts({ categorySlug });
  return NextResponse.json({ products }, { headers: PUBLIC_CACHE_HEADERS });
}
