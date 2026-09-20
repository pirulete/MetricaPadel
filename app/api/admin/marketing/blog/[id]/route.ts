import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { deletePost, getPostById, getPostBySlug, updatePost } from "@/lib/db/queries/marketing";
import { postUpdateSchema } from "@/lib/marketing/schemas/entities";
import { CACHE_TAGS, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

function toDateValue(value: string | null | undefined): Date | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return new Date(value);
}

/**
 * GET /api/admin/marketing/blog/[id]
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const post = await getPostById(id);
    if (!post) {
      return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ post }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/blog/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/marketing/blog/[id]
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const oldPost = await getPostById(id);
    if (!oldPost) {
      return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const validated = postUpdateSchema.parse(body);

    if (validated.slug) {
      const existing = await getPostBySlug(validated.slug);
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "Ya existe un post con ese slug" }, { status: 409 });
      }
    }

    const updateData: Record<string, unknown> = { ...validated };
    if ('publishedAt' in validated) {
      updateData.publishedAt = toDateValue(validated.publishedAt ?? null);
    }
    const post = await updatePost(id, updateData);

    await auditUpdate(
      "marketing_post",
      id,
      { slug: oldPost.slug, title: oldPost.title, status: oldPost.status } as Record<string, any>,
      validated as unknown as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    revalidateMarketing([CACHE_TAGS.posts]);

    return NextResponse.json({ post }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/blog/[id]] Error en PATCH:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/marketing/blog/[id]
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const oldPost = await getPostById(id);
    if (!oldPost) {
      return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });
    }

    await deletePost(id);

    await auditDelete(
      "marketing_post",
      id,
      { slug: oldPost.slug, title: oldPost.title, status: oldPost.status } as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(_request) }
    );

    revalidateMarketing([CACHE_TAGS.posts]);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/blog/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
