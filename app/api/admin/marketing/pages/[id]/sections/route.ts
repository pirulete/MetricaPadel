import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import {
  createSection,
  getPageById,
  reorderSections,
  sectionIdsBelongToPage,
} from "@/lib/db/queries/marketing";
import { BLOCK_TYPE_REGISTRY, parseBlockConfig, type BlockType } from "@/lib/marketing/schemas/blocks";
import { invalidateForEntity, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

const BLOCK_TYPES = Object.keys(BLOCK_TYPE_REGISTRY) as BlockType[];

const createSectionSchema = z.object({
  blockType: z.enum(BLOCK_TYPES as [BlockType, ...BlockType[]]),
  config: z.record(z.string(), z.unknown()),
  sortOrder: z.number().int().min(0).optional(),
});

const reorderSchema = z.object({
  sectionIds: z.array(z.string().uuid()).min(1, 'Lista de secciones requerida'),
});

/**
 * POST /api/admin/marketing/pages/[id]/sections
 * Agrega una sección a la página. Config validada contra el schema del blockType.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const page = await getPageById(id);
    if (!page) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const validated = createSectionSchema.parse(body);

    const parsed = parseBlockConfig(validated.blockType, validated.config);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const section = await createSection(id, {
      blockType: validated.blockType,
      config: parsed.data,
      sortOrder: validated.sortOrder ?? 0,
    });

    await auditCreate(
      "marketing_section",
      section.id,
      { blockType: validated.blockType, config: parsed.data } as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    revalidateMarketing(invalidateForEntity('page', page.slug));

    return NextResponse.json({ section }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/sections] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/marketing/pages/[id]/sections
 * Reordena todas las secciones de la página (batch UPDATE con paso 1024).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = await params;
    const page = await getPageById(id);
    if (!page) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const validated = reorderSchema.parse(body);

    const knownIds = await sectionIdsBelongToPage(id, validated.sectionIds);
    if (knownIds.size !== validated.sectionIds.length) {
      return NextResponse.json({ error: "Algunas secciones no pertenecen a la página" }, { status: 400 });
    }

    const sections = await reorderSections(id, validated.sectionIds);

    await auditUpdate(
      "marketing_page",
      id,
      { sortOrders: [] } as Record<string, any>,
      { sortOrders: validated.sectionIds } as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request), metadata: { action: 'reorder_sections' } }
    );

    revalidateMarketing(invalidateForEntity('page', page.slug));

    return NextResponse.json({ sections }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/sections] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
