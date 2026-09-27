import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { isAdminRole, isSuperAdminRole } from "@/lib/auth/role-utils"

export async function validateUser() {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  if (session.user.status === 'LOCKED') {
    redirect("/login")
  }

  return session
}

export async function validateAdmin() {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  if (!isAdminRole(session.user.role) || session.user.status !== 'ACTIVE') {
    console.warn(`[Security] Intento de acceso administrativo bloqueado para usuario ${session.user.email} con status ${session.user.status}`);
    redirect("/dashboard")
  }

  return session
}

/**
 * Guard server-side para layouts/páginas exclusivas de SUPER_ADMIN
 * (ej: /admin/admins, /admin/platform). Redirige a /dashboard si no aplica.
 */
export async function validateSuperAdmin() {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  if (!isSuperAdminRole(session.user.role) || session.user.status !== 'ACTIVE') {
    console.warn(`[Security] Intento de acceso super-admin bloqueado para usuario ${session.user.email} con status ${session.user.status}`);
    redirect("/dashboard")
  }

  return session
}

export function guardUser(session: any): NextResponse | null {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }
  if (session.user.status === 'LOCKED') {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }
  if (session.user.status === 'TEMPORARY') {
    return NextResponse.json({ error: "Email no verificado", code: "TEMPORARY" }, { status: 403 })
  }
  return null
}

export function guardAdmin(session: any): NextResponse | null {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }
  if (!isAdminRole(session.user.role) || session.user.status !== 'ACTIVE') {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }
  return null
}

/**
 * Guard exclusivo de SUPER_ADMIN (endpoints de plataforma: promote/demote,
 * admins, audit-logs, academias globales). Síncrono — null = OK.
 */
export function guardSuperAdmin(session: any): NextResponse | null {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }
  if (!isSuperAdminRole(session.user.role) || session.user.status !== 'ACTIVE') {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }
  return null
}