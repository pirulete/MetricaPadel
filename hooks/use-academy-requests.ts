"use client"

import * as React from "react"

export type AcademyRequest = {
  id: string
  userId: string
  type: "join_academy" | "create_academy"
  academyId: string | null
  requestedRole: "OWNER" | "ADMIN" | "COACH"
  payload: Record<string, unknown>
  status: "pending" | "approved" | "rejected"
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  requesterEmail: string | null
  requesterFirstName: string | null
  requesterLastName: string | null
  academyName: string | null
  academySlug: string | null
}

export type AvailableAcademy = {
  id: string
  name: string
  slug: string
}

export type CreateRequestInput =
  | { type: "join_academy"; academyId: string; requestedRole: "ADMIN" | "COACH" }
  | { type: "create_academy"; name: string; slug: string; primaryColor?: string }

/**
 * Hook de solicitudes de acceso a academia (v0.9). Patrón use-academies:
 * fetch + { ok, error? } + reload. createRequest (coach), reload
 * (SUPER_ADMIN), approve/reject (SUPER_ADMIN), listAvailableAcademies (coach).
 */
export function useAcademyRequests() {
  const [requests, setRequests] = React.useState<AcademyRequest[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const reload = React.useCallback(async (filters?: { status?: string; type?: string }) => {
    try {
      const params = new URLSearchParams()
      if (filters?.status) params.set("status", filters.status)
      if (filters?.type) params.set("type", filters.type)
      const qs = params.toString()
      const res = await fetch(`/api/academy-requests${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Error al cargar solicitudes")
        return
      }
      setRequests(data.requests ?? [])
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

  const createRequest = React.useCallback(async (input: CreateRequestInput) => {
    try {
      const res = await fetch("/api/academy-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "No se pudo enviar la solicitud" }
      return { ok: true as const, request: data.request as AcademyRequest }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [])

  const approve = React.useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/academy-requests/${id}/approve`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "No se pudo aprobar la solicitud" }
      await reload()
      return { ok: true as const, request: data.request as AcademyRequest }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [reload])

  const reject = React.useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/academy-requests/${id}/reject`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "No se pudo rechazar la solicitud" }
      await reload()
      return { ok: true as const, request: data.request as AcademyRequest }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [reload])

  const listAvailableAcademies = React.useCallback(async () => {
    try {
      const res = await fetch("/api/academy-requests/available-academies", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) return { ok: false as const, error: data.error ?? "Error al cargar academias" }
      return { ok: true as const, academies: data.academies as AvailableAcademy[] }
    } catch {
      return { ok: false as const, error: "Error de conexión" }
    }
  }, [])

  return {
    requests,
    loading,
    error,
    reload,
    createRequest,
    approve,
    reject,
    listAvailableAcademies,
  }
}