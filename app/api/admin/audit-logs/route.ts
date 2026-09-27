import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardSuperAdmin } from "@/lib/auth/admin-guard";
import { listAuditLogsPaginated } from "@/lib/db/queries/padel";

export const runtime = "nodejs";

/** Query de GET /api/admin/audit-logs: paginación + filtros opcionales. */
const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  actionType: z.string().trim().max(50).optional(),
  userId: z.string().uuid("userId debe ser un uuid válido").optional(),
});

/**
 * GET /api/admin/audit-logs
 * Lista audit_logs paginados con usuario asociado. Exclusivo de SUPER_ADMIN.
 * Query: ?page=&pageSize=&actionType=&userId=. Sin auditoría (lectura).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardSuperAdmin(session);
    if (guardError) return guardError;

    const query = auditLogsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const result = await listAuditLogsPaginated({
      page: query.page,
      pageSize: query.pageSize,
      actionType: query.actionType,
      userId: query.userId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/audit-logs] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}