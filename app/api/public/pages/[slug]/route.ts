import { NextRequest, NextResponse } from "next/server";

import { getCachedPage, PUBLIC_CACHE_HEADERS } from "@/lib/marketing/cache";
import { isReservedSlug } from "@/lib/marketing/reserved-slugs";
import { slugSchema } from "@/lib/marketing/schemas";

export const runtime = "nodejs";

/**
 * GET /api/public/pages/[slug]
 * Página publicada + secciones ordenadas (caché tag `pages:${slug}`, TTL 300).
 * Drafts → 404 (doble check server-side: query publishedOnly + reservados).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (isReservedSlug(slug) || !slugSchema.safeParse(slug).success) {
    return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
  }

  const data = await getCachedPage(slug);
  if (!data) {
    return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
  }

  const { page, sections } = data;
  return NextResponse.json(
    {
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        status: page.status,
        sortOrder: page.sortOrder,
      },
      sections: sections.map((section) => ({
        id: section.id,
        blockType: section.blockType,
        config: section.config,
        sortOrder: section.sortOrder,
      })),
    },
    { headers: PUBLIC_CACHE_HEADERS }
  );
}
