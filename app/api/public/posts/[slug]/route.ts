import { NextRequest, NextResponse } from "next/server";

import { getCachedPosts, PUBLIC_CACHE_HEADERS } from "@/lib/marketing/cache";

export const runtime = "nodejs";

/** GET /api/public/posts/[slug] — post publicado (caché tag `posts`). 404 si no existe. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const posts = await getCachedPosts(100);
  const post = posts.find((p) => p.slug === slug);
  if (!post) {
    return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ post }, { headers: PUBLIC_CACHE_HEADERS });
}
