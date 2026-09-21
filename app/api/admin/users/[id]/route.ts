import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { getPlayerById, lockPlayer, unlockPlayer, updatePlayer } from "@/lib/db/queries/padel";
import { getUserById } from "@/lib/db/queries/auth";
import { adminUpdateUserSchema, padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/admin/users/[id]
 * Detalle de jugador (solo role USER). 404 si no existe o no es role USER.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);

    const user = await getPlayerById(id);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/users/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/users/[id]
 * Actualiza firstName/lastName/phone de un jugador (G10). Solo role USER
 * (anti-IDOR: ADMIN/inexistente → 404). Audita UPDATE.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const body = await request.json();
    const validated = adminUpdateUserSchema.parse(body);

    const current = await getPlayerById(id);
    if (!current) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const user = await updatePlayer(id, validated);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    await auditUpdate(
      "user",
      id,
      {
        firstName: current.firstName,
        lastName: current.lastName,
        phone: current.phone ?? null,
      },
      {
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? null,
      },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/users/[id]] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Soft-lock de jugador (status='LOCKED', G10). Reglas:
 * - No puedes bloquearte a ti mismo → 400.
 * - No puedes bloquear a otro ADMIN → 403.
 * - Inexistente o no role USER → 404 (anti-IDOR).
 * Audita UPDATE (status ACTIVE/TEMPORARY → LOCKED).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);

    const target = await getUserById(id);
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    if (target.id === session!.user.id) {
      return NextResponse.json({ error: "No puedes bloquear tu propio usuario" }, { status: 400 });
    }
    if (target.role === 'ADMIN') {
      return NextResponse.json({ error: "No puedes bloquear a otro administrador" }, { status: 403 });
    }

    const user = await lockPlayer(id);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    await auditUpdate(
      "user",
      id,
      { status: target.status },
      { status: 'LOCKED' },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/users/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/admin/users/[id]/unlock
 * Desbloquea un jugador (status='ACTIVE', G10). Solo role USER (404 si ADMIN
 * o inexistente). Audita UPDATE.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);

    const current = await getPlayerById(id);
    if (!current) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const user = await unlockPlayer(id);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    await auditUpdate(
      "user",
      id,
      { status: current.status },
      { status: 'ACTIVE' },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/users/[id]] Error en POST unlock:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}