"use client"

import * as React from "react"

export type AcademyListItem = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  primaryColor: string
  status: "active" | "archived"
  createdAt: string
  role: "OWNER" | "ADMIN" | "COACH"
  memberCount: number
}

export type AcademyDetail = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  primaryColor: string
  status: "active" | "archived"
  ownerId: string
  createdAt: string
  updatedAt: string
}

export type AcademyMember = {
  id: string
  userId: string
  role: "OWNER" | "ADMIN" | "COACH"
  status: "pending" | "active" | "removed"
  invitedBy: string | null
  createdAt: string
  firstName: string | null
  lastName: string | null
  email: string
}

export type AcademyRubricListItem = {
  id: string
  title: string
  category: string
  status: "draft" | "active" | "archived"
  scope: "personal" | "institutional"
  createdAt: string
  updatedAt: string
  criteriaCount: number
}

/**
 * Hook de academias (SPEC-EPIC-01 Fase E): fetch de la lista del usuario +
 * helpers CRUD (crear, actualizar, archivar, logo, invitar, aceptar, remover).
 * Cada mutación retorna { ok, error? } para feedback con Sonner en la UI.
 */
export function useAcademies() {
  const [academies, setAcademies] = React.useState<AcademyListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    try {
      const res = await fetch("/api/academies", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Error al cargar academias")
        return
      }
      setAcademies(data.academies ?? [])
      setError(null)
    } catch {
      setError("Error de conexión")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const create = React.useCallback(async (input: { name: string; slug: string; primaryColor?: string }) => {
    try {
      const res = await fetch("/api/academies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "No se pudo crear la academia" }
      await reload()
      return { ok: true as const, academy: data.academy as AcademyDetail }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [reload])

  const update = React.useCallback(async (id: string, input: { name?: string; slug?: string; primaryColor?: string }) => {
    try {
      const res = await fetch(`/api/academies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "No se pudo actualizar la academia" }
      return { ok: true as const, academy: data.academy as AcademyDetail }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [])

  const archive = React.useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/academies/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "No se pudo archivar la academia" }
      await reload()
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [reload])

  const uploadLogo = React.useCallback(async (id: string, file: File) => {
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/academies/${id}/logo`, { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "No se pudo subir el logo" }
      return { ok: true as const, academy: data.academy as AcademyDetail }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [])

  const invite = React.useCallback(async (id: string, email: string) => {
    try {
      const res = await fetch(`/api/academies/${id}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "No se pudo invitar" }
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [])

  const accept = React.useCallback(async (academyId: string, userId: string) => {
    try {
      const res = await fetch(`/api/academies/${academyId}/members/${userId}/accept`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "No se pudo aceptar la invitación" }
      await reload()
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [reload])

  const removeMember = React.useCallback(async (academyId: string, userId: string) => {
    try {
      const res = await fetch(`/api/academies/${academyId}/members/${userId}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "No se pudo remover al miembro" }
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [])

  return {
    academies,
    loading,
    error,
    reload,
    create,
    update,
    archive,
    uploadLogo,
    invite,
    accept,
    removeMember,
  }
}