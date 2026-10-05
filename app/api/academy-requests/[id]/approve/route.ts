import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardSuperAdmin } from "@/lib/auth/admin-guard";
import { auditAccessRequestApproved, auditMemberRoleAssigned } from "@/lib/audit/academy";
import { auditAcademyCreated, extractRequestContext } from "@/lib/audit/helpers";
import {
  approveCreateRequest,
  approveJoinRequest,
  getAccessRequestById,
} from "@/lib/db/queries/padel/academy-requests";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/academy-requests/[id]/approve
 * Aprueba solicitud (solo SUPER_ADMIN, v0.9). join → membresía active con
 * requestedRole; create → academia + OWNER=requester. 400 ya revisada.
 * 404 inexistente. 409 ya miembro activo (join) / slug colisiona (create).
 * Audita REQUEST_APPROVED + MEMBER_ROLE_ASSIGNED (join) o ACADEMY_CREATED (create).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardSuperAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const existing = await getAccessRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json({ error: "La solicitud ya fue revisada" }, { status: 400 });
    }

    const actorId = session!.user.id as string;

    if (existing.type === "join_academy") {
      const result = await approveJoinRequest(id, actorId);
      if (!result.ok) {
        if (result.reason === "already_reviewed") {
          return NextResponse.json({ error: "La solicitud ya fue revisada" }, { status: 400 });
        }
        if (result.reason === "academy_archived") {
          return NextResponse.json({ error: "La academia está archivada" }, { status: 400 });
        }
        if (result.reason === "already_member") {
          return NextResponse.json({ error: "El usuario ya es miembro activo de la academia" }, { status: 409 });
        }
        return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
      }

      await auditAccessRequestApproved(
        result.request.id,
        {
          userId: result.request.userId,
          type: result.request.type,
          academyId: result.request.academyId,
          requestedRole: result.request.requestedRole,
          reviewedBy: actorId,
        },
        { userId: actorId, ...extractRequestContext(request) }
      );
      await auditMemberRoleAssigned(
        result.membership.academyId,
        result.membership.id,
        { userId: result.membership.userId, role: result.membership.role },
        { userId: actorId, ...extractRequestContext(request) }
      );

      return NextResponse.json({ request: result.request, membership: result.membership }, { status: 200 });
    }

    // create_academy
    const result = await approveCreateRequest(id, actorId);
    if (!result.ok) {
      if (result.reason === "already_reviewed") {
        return NextResponse.json({ error: "La solicitud ya fue revisada" }, { status: 400 });
      }
      if (result.reason === "slug_exists") {
        return NextResponse.json({ error: "El slug ya está en uso" }, { status: 409 });
      }
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    await auditAccessRequestApproved(
      result.request.id,
      {
        userId: result.request.userId,
        type: result.request.type,
        academyId: result.request.academyId,
        requestedRole: result.request.requestedRole,
        reviewedBy: actorId,
      },
      { userId: actorId, ...extractRequestContext(request) }
    );
    await auditAcademyCreated(
      result.academy.id,
      { name: result.academy.name, slug: result.academy.slug, ownerId: result.academy.ownerId },
      { userId: actorId, ...extractRequestContext(request) }
    );

    return NextResponse.json({ request: result.request, academy: result.academy }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academy-requests/[id]/approve] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}