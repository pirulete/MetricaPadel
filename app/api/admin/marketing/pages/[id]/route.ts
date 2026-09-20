import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import {
  countPublishedPages,
  deletePage,
  getPageById,
  getPageBySlug,
  updatePage,
} from "@/lib/db/queries/marketing";
import { listSectionsByPage } from "@/lib/db/queries/marketing";
import { pageUpdateSchema } from "@/lib/marketing/schemas/entities";
import { isReservedSlug } from "@/lib/marketing/reserved-slugs";
import { invalidateForEntity, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

function homeGuardError(): NextResponse {
  return NextResponse.json(
    { error: "No se puede quitar la única página publicada 'home'" },
    { status: 400 }
  );
}

/**
 * GET /api/admin/marketing/pages/[id]
 * Devuelve la página con sus secciones ordenadas.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const page = await getPageById(id);
    if (!page) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }
    const sections = await listSectionsByPage(id);

    return NextResponse.json({ page, sections }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/pages/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/marketing/pages/[id]
 * Actualiza campos de la página. Revalida caché de slug viejo y nuevo.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const oldPage = await getPageById(id);
    if (!oldPage) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const validated = pageUpdateSchema.parse(body);

    if (validated.slug) {
      if (isReservedSlug(validated.slug)) {
        return NextResponse.json({ error: "Slug reservado para rutas del sistema" }, { status: 400 });
      }
      const existing = await getPageBySlug(validated.slug);
      if (existing && existing.page.id !== id) {
        return NextResponse.json({ error: "Ya existe una página con ese slug" }, { status: 409 });
      }
      // Home guard: no renombrar 'home' si es la única página publicada
      if (oldPage.slug === 'home' && oldPage.status === 'published' && validated.slug !== 'home') {
        const published = await countPublishedPages();
        if (published <= 1) return homeGuardError();
      }
    }

    const page = await updatePage(id, validated);

    await auditUpdate(
      "marketing_page",
      id,
      { slug: oldPage.slug, title: oldPage.title, status: oldPage.status } as Record<string, any>,
      validated as unknown as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    const tags = new Set<string>([
      ...invalidateForEntity('page', oldPage.slug),
      ...invalidateForEntity('page', page.slug),
      ...(oldPage.slug === 'home' || page.slug === 'home' ? invalidateForEntity('navigation') : []),
    ]);
    revalidateMarketing([...tags]);

    return NextResponse.json({ page }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/pages/[id]] Error en PATCH:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/marketing/pages/[id]
 * Borra la página (las secciones caen en cascada). Home guard: no borrar
 * la única página publicada 'home'.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const oldPage = await getPageById(id);
    if (!oldPage) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }

    if (oldPage.slug === 'home' && oldPage.status === 'published') {
      const published = await countPublishedPages();
      if (published <= 1) return homeGuardError();
    }

    await deletePage(id);

    await auditDelete(
      "marketing_page",
      id,
      { slug: oldPage.slug, title: oldPage.title, status: oldPage.status } as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(_request) }
    );

    revalidateMarketing([
      ...invalidateForEntity('page', oldPage.slug),
      ...(oldPage.slug === 'home' ? invalidateForEntity('navigation') : []),
    ]);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/pages/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
