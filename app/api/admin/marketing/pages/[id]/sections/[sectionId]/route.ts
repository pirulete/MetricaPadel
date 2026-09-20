import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import {
  deleteSection,
  getPageById,
  getSectionById,
  updateSection,
} from "@/lib/db/queries/marketing";
import { BLOCK_TYPE_REGISTRY, parseBlockConfig, type BlockType } from "@/lib/marketing/schemas/blocks";
import { invalidateForEntity, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

const BLOCK_TYPES = Object.keys(BLOCK_TYPE_REGISTRY) as BlockType[];

const patchSectionSchema = z.object({
  blockType: z.enum(BLOCK_TYPES as [BlockType, ...BlockType[]]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

type RouteParams = Promise<{ id: string; sectionId: string }>;

/**
 * PATCH /api/admin/marketing/pages/[id]/sections/[sectionId]
 * Actualiza blockType y/o config de una sección (config validada contra el blockType resultante).
 */
export async function PATCH(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id, sectionId } = await params;
    const page = await getPageById(id);
    if (!page) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }

    const oldSection = await getSectionById(sectionId);
    if (!oldSection || oldSection.pageId !== id) {
      return NextResponse.json({ error: "Sección no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const validated = patchSectionSchema.parse(body);

    const nextBlockType: BlockType = validated.blockType ?? oldSection.blockType;
    const updateData: Record<string, unknown> = { blockType: nextBlockType };
    if (validated.config !== undefined) {
      const parsed = parseBlockConfig(nextBlockType, validated.config);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      updateData.config = parsed.data;
    }

    const section = await updateSection(sectionId, updateData);

    await auditUpdate(
      "marketing_section",
      sectionId,
      { blockType: oldSection.blockType, config: oldSection.config } as Record<string, any>,
      { blockType: section.blockType, config: section.config } as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    revalidateMarketing(invalidateForEntity('page', page.slug));

    return NextResponse.json({ section }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/sections/[sectionId]] Error en PATCH:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/marketing/pages/[id]/sections/[sectionId]
 */
export async function DELETE(_request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id, sectionId } = await params;
    const page = await getPageById(id);
    if (!page) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }

    const oldSection = await getSectionById(sectionId);
    if (!oldSection || oldSection.pageId !== id) {
      return NextResponse.json({ error: "Sección no encontrada" }, { status: 404 });
    }

    await deleteSection(sectionId);

    await auditDelete(
      "marketing_section",
      sectionId,
      { blockType: oldSection.blockType, config: oldSection.config } as Record<string, any>,
      { userId: session!.user.id, ...extractRequestContext(_request) }
    );

    revalidateMarketing(invalidateForEntity('page', page.slug));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[admin/marketing/sections/[sectionId]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
