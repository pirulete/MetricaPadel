import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin, guardSuperAdmin } from "@/lib/auth/admin-guard";
import { auditAccessRequestCreated } from "@/lib/audit/academy";
import { extractRequestContext } from "@/lib/audit/helpers";
import {
  createAccessRequest,
  listAccessRequests,
} from "@/lib/db/queries/padel/academy-requests";
import { getAcademyById } from "@/lib/db/queries/padel/academies";
import { buildRequestAuditPayload, validateRequestPayload } from "@/lib/padel/academy-requests";
import {
  ACADEMY_REQUEST_MAX,
  ACADEMY_REQUEST_WINDOW_MS,
  checkPublicRateLimit,
  extractIP,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { academyRequestCreateSchema, academyRequestQuerySchema } from "@/lib/validations/academy";

export const runtime = "nodejs";

/**
 * POST /api/academy-requests
 * Crea solicitud de acceso (join_academy | create_academy). guardAdmin (coach
 * global, ACTIVE). Rate limit por IP ANTES del guard (patrón invite): key
 * `academy-request:{ip}`, 10/min. 400 academia archivada (join), 404 academia
 * inexistente (join), 409 duplicado pendiente / ya miembro / slug existe.
 * Audita REQUEST_CREATED.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit por IP (10/min, key academy-request:{ip}).
    const ip = extractIP(request);
    const rate = checkPublicRateLimit(`academy-request:${ip}`, {
      windowMs: ACADEMY_REQUEST_WINDOW_MS,
      max: ACADEMY_REQUEST_MAX,
    });
    if (!rate.allowed) {
      return rateLimitedResponse(rate.resetTime, ACADEMY_REQUEST_MAX);
    }

    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = academyRequestCreateSchema.parse(body);

    if (validated.type === "join_academy") {
      const academy = await getAcademyById(validated.academyId);
      if (!academy) {
        return NextResponse.json({ error: "Academia no encontrada" }, { status: 404 });
      }
      if (academy.status !== "active") {
        return NextResponse.json({ error: "La academia está archivada" }, { status: 400 });
      }
    }

    const payload =
      validated.type === "create_academy"
        ? { name: validated.name, slug: validated.slug, ...(validated.primaryColor ? { primaryColor: validated.primaryColor } : {}) }
        : {};

    const payloadError = validateRequestPayload(validated.type, payload);
    if (payloadError) {
      return NextResponse.json({ error: payloadError }, { status: 400 });
    }

    const result = await createAccessRequest({
      userId: session!.user.id as string,
      type: validated.type,
      academyId: validated.type === "join_academy" ? validated.academyId : null,
      requestedRole: validated.type === "join_academy" ? validated.requestedRole : "OWNER",
      payload,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Ya tienes una solicitud pendiente de este tipo" }, { status: 409 });
    }

    await auditAccessRequestCreated(
      result.request.id,
      {
        userId: result.request.userId,
        type: result.request.type,
        academyId: result.request.academyId,
        requestedRole: result.request.requestedRole,
        payload: buildRequestAuditPayload(result.request.type, payload),
      },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ request: result.request }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academy-requests] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * GET /api/academy-requests
 * Lista solicitudes con requester + academia (guardSuperAdmin). Filtros
 * opcionales status/type. Sin auditoría (lectura).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardSuperAdmin(session);
    if (guardError) return guardError;

    const url = new URL(request.url);
    const query = academyRequestQuerySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    });

    const requests = await listAccessRequests(query);
    return NextResponse.json({ requests }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academy-requests] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}