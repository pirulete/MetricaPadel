import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  getAcademyMembership,
  guardAcademyAdmin,
  guardAcademyCoach,
  guardAcademyOwner,
} from "@/lib/auth/academy-guard";
import { auditAcademyArchived, auditAcademyUpdated, extractRequestContext } from "@/lib/audit/helpers";
import { archiveAcademy, getAcademyById, updateAcademy } from "@/lib/db/queries/padel/academies";
import { academyUpdateSchema } from "@/lib/validations/academy";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/academies/[id]
 * Detalle de academia + rol del caller (myRole). guardAcademyCoach: miembro
 * activo (OWNER/ADMIN/COACH). 404 anti-IDOR si no es miembro o está archivada.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = padelIdParamsSchema.parse(await params);
    const guardError = await guardAcademyCoach(session, id);
    if (guardError) return guardError;

    const academy = await getAcademyById(id);
    if (!academy) {
      return NextResponse.json({ error: "Academia no encontrada" }, { status: 404 });
    }

    const membership = await getAcademyMembership(session!.user.id as string, id);
    return NextResponse.json({ academy, myRole: membership?.membership.role ?? null }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/academies/[id]
 * Actualiza branding (name/slug/primaryColor). guardAcademyAdmin: OWNER/ADMIN.
 * 409 si el slug nuevo ya existe. Audita UPDATE.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = padelIdParamsSchema.parse(await params);
    const guardError = await guardAcademyAdmin(session, id);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = academyUpdateSchema.parse(body);

    const previous = await getAcademyById(id);
    if (!previous) {
      return NextResponse.json({ error: "Academia no encontrada" }, { status: 404 });
    }

    const academy = await updateAcademy(id, validated);

    await auditAcademyUpdated(
      id,
      { name: previous.name, slug: previous.slug, primaryColor: previous.primaryColor },
      { name: academy?.name, slug: academy?.slug, primaryColor: academy?.primaryColor },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ academy }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    if (
      error instanceof Error &&
      ((error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505")
    ) {
      return NextResponse.json({ error: "El slug ya está en uso" }, { status: 409 });
    }
    console.error("[academies/[id]] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/academies/[id]
 * Archiva academia (soft, status=archived). guardAcademyOwner: solo OWNER.
 * Audita DELETE.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = padelIdParamsSchema.parse(await params);
    const guardError = await guardAcademyOwner(session, id);
    if (guardError) return guardError;

    const previous = await getAcademyById(id);
    if (!previous) {
      return NextResponse.json({ error: "Academia no encontrada" }, { status: 404 });
    }

    const academy = await archiveAcademy(id);

    await auditAcademyArchived(
      id,
      { name: previous.name, status: previous.status },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ academy: { id: academy?.id, status: academy?.status } }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}