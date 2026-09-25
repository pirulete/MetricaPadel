import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"

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

  if (session.user.role !== 'ADMIN' || session.user.status !== 'ACTIVE') {
    console.warn(`[Security] Intento de acceso administrativo bloqueado para usuario ${session.user.email} con status ${session.user.status}`);
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
  if (session.user.role !== 'ADMIN' || session.user.status !== 'ACTIVE') {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }
  return null
}
