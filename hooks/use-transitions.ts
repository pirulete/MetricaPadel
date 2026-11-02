"use client"

import * as React from "react"
import type { Paso } from "@/lib/padel/court/types"

/** Resumen del listado (`GET /api/transitions`). */
export type TransitionSummaryDto = {
  id: string
  title: string
  stepCount: number
  createdAt: string
  updatedAt: string
}

/** Documento completo (`GET/POST/PUT /api/transitions/[id]`). */
export type TransitionDocument = {
  id: string
  title: string
  initialStepIndex: number
  steps: Paso[]
  createdAt: string
  updatedAt: string
}

/** Body de escritura (D-06: PUT reemplaza el documento completo). */
export type TransitionPayload = {
  title: string
  initialStepIndex: number
  steps: Paso[]
}

type TransitionResult = { ok: true; transition: TransitionDocument } | { ok: false; error: string }

function messageFor(data: { error?: string }, status: number, fallback: string): string {
  if (status === 404) return "Transición no encontrada"
  return data.error ?? fallback
}

/**
 * Listado paginado + escritura (create/update) de transiciones del coach contra
 * `/api/transitions`.
 *
 * Sin lógica de autorización: el server (`guardAdmin`) es la única autoridad;
 * aquí sólo se traducen respuestas a estados de UI. Cada mutación devuelve
 * `{ ok } | { ok: false, error }` para feedback con Sonner.
 */
export function useTransitions() {
  const [transitions, setTransitions] = React.useState<TransitionSummaryDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/transitions", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        setError(messageFor(data, res.status, "Error al cargar transiciones"))
        return
      }
      setTransitions((data.items ?? []) as TransitionSummaryDto[])
      setNextCursor((data.nextCursor ?? null) as string | null)
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

  const loadMore = React.useCallback(async () => {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/transitions?cursor=${encodeURIComponent(nextCursor)}`, {
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) {
        setError(messageFor(data, res.status, "Error al cargar más transiciones"))
        return
      }
      setTransitions((prev) => [...prev, ...((data.items ?? []) as TransitionSummaryDto[])])
      setNextCursor((data.nextCursor ?? null) as string | null)
    } catch {
      setError("Error de conexión")
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor])

  const create = React.useCallback(
    async (input: TransitionPayload): Promise<TransitionResult> => {
      try {
        const res = await fetch("/api/transitions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        })
        const data = await res.json()
        if (!res.ok) {
          return { ok: false, error: messageFor(data, res.status, "No se pudo crear la transición") }
        }
        return { ok: true, transition: data.transition as TransitionDocument }
      } catch {
        return { ok: false, error: "Error de conexión" }
      }
    },
    []
  )

  const update = React.useCallback(
    async (id: string, input: TransitionPayload): Promise<TransitionResult> => {
      try {
        const res = await fetch(`/api/transitions/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        })
        const data = await res.json()
        if (!res.ok) {
          return {
            ok: false,
            error: messageFor(data, res.status, "No se pudo guardar la transición"),
          }
        }
        return { ok: true, transition: data.transition as TransitionDocument }
      } catch {
        return { ok: false, error: "Error de conexión" }
      }
    },
    []
  )

  return {
    transitions,
    loading,
    loadingMore,
    error,
    hasMore: nextCursor !== null,
    reload,
    loadMore,
    create,
    update,
  }
}
