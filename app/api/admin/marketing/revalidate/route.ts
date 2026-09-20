import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditAdminAction, extractRequestContext } from "@/lib/audit/helpers";
import { CACHE_TAGS, revalidateMarketing } from "@/lib/marketing/cache";

export const runtime = "nodejs";

const revalidateSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  all: z.boolean().optional(),
});

const ALLOWED_BASE_TAGS = new Set<string>(Object.values(CACHE_TAGS));

/** Whitelist: pages:<slug> | posts | products | settings | navigation. */
function isValidRevalidateTag(tag: string): boolean {
  if (ALLOWED_BASE_TAGS.has(tag)) return true;
  return /^pages:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag);
}

/**
 * POST /api/admin/marketing/revalidate
 * Invalidación manual de tags de caché. Body: { tags: string[] } o { all: true }.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = revalidateSchema.parse(body);

    let tags: string[];
    if (validated.all) {
      tags = Object.values(CACHE_TAGS);
    } else if (validated.tags && validated.tags.length > 0) {
      const invalid = validated.tags.filter((t) => !isValidRevalidateTag(t));
      if (invalid.length > 0) {
        return NextResponse.json({ error: `Tags no permitidos: ${invalid.join(', ')}` }, { status: 400 });
      }
      tags = validated.tags;
    } else {
      return NextResponse.json({ error: "Indica 'tags' o 'all'" }, { status: 400 });
    }

    revalidateMarketing(tags);

    await auditAdminAction(
      session!.user.id as string,
      'REVALIDATE',
      'marketing_cache',
      'all',
      { tags },
      extractRequestContext(request).ipAddress
    );

    return NextResponse.json({ revalidated: tags }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/marketing/revalidate] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
