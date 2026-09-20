import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCachedPosts, PUBLIC_CACHE_HEADERS } from "@/lib/marketing/cache";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** GET /api/public/posts?limit=20 — posts publicados (caché tag `posts`). */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const limit = parsed.success ? parsed.data.limit : 20;

  const posts = await getCachedPosts(limit);
  return NextResponse.json({ posts }, { headers: PUBLIC_CACHE_HEADERS });
}
