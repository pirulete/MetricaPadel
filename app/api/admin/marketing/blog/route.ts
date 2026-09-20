import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { createPost, getPostBySlug, listPosts } from "@/lib/db/queries/marketing";
import { postSchema } from "@/lib/marketing/schemas/entities";
import { CACHE_TAGS, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

function toDateValue(value: string | null | undefined): Date | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return new Date(value);
}

/**
 * GET /api/admin/marketing/blog
 * Lista todos los posts (todos los status).
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const posts = await listPosts();
    return NextResponse.json({ posts }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/blog] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/admin/marketing/blog
 * Crea un post. Slug duplicado → 409.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = postSchema.parse(body);

    const existing = await getPostBySlug(validated.slug);
    if (existing) {
      return NextResponse.json({ error: "Ya existe un post con ese slug" }, { status: 409 });
    }

    const post = await createPost({
      ...validated,
      publishedAt: toDateValue(validated.publishedAt ?? null),
    });

    await auditCreate(
      "marketing_post",
      post.id,
      validated as unknown as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    if (validated.status === 'published') {
      revalidateMarketing([CACHE_TAGS.posts]);
    }

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/blog] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
