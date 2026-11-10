"use client"

import * as React from "react"
import Link from "next/link"
import {
  CalendarIcon,
  ClipboardListIcon,
  UsersIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/padel/empty-state"

/** Contrato de `GET /api/torneos` (technical-design §6.2). */
export type TournamentListItem = {
  id: string
  name: string
  status: "draft" | "agenda_draft" | "archived"
  startDate: string
  endDate: string
  courts: number
  blockMinutes: number
  updatedAt: string
  counts: { categories: number; teams: number; matches: number }
}

const STATUS_META: Record<
  TournamentListItem["status"],
  { label: string; variant: "outline" | "secondary" | "default" }
> = {
  draft: { label: "Borrador", variant: "outline" },
  agenda_draft: { label: "Agenda generada", variant: "default" },
  archived: { label: "Archivado", variant: "secondary" },
}

const PAGE_SIZE = 20

/** Evento emitido por el modal de import para recargar la lista sin remontar. */
export const TOURNAMENTS_UPDATED_EVENT = "torneos:updated"

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-ES")
}

/** Lista de torneos del coach (F4a): cards + paginación por cursor (G15). */
export function TournamentList({ emptyAction }: { emptyAction?: React.ReactNode }) {
  const [tournaments, setTournaments] = React.useState<TournamentListItem[]>([])
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/torneos?limit=${PAGE_SIZE}`, { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "No se pudieron cargar los torneos")
      setTournaments(body.items ?? [])
      setNextCursor(body.nextCursor ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar torneos")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), cursor: nextCursor })
      const res = await fetch(`/api/torneos?${params.toString()}`, { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "No se pudieron cargar más torneos")
      setTournaments((prev) => [...prev, ...(body.items ?? [])])
      setNextCursor(body.nextCursor ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar más torneos")
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const onUpdated = () => void load()
    window.addEventListener(TOURNAMENTS_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(TOURNAMENTS_UPDATED_EVENT, onUpdated)
  }, [load])

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Cargando torneos…</p>
  }

  if (error) {
    return (
      <div role="alert" className="space-y-3 py-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (tournaments.length === 0) {
    return (
      <EmptyState
        title="No hay torneos"
        description="Importa el JSON de un torneo para generar su agenda."
        action={emptyAction}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tournaments.map((tournament) => {
          const status = STATUS_META[tournament.status]
          return (
            <Card key={tournament.id} className="gap-3">
              <CardHeader className="gap-1">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{tournament.name}</CardTitle>
                  <Badge variant={status.variant} className="shrink-0">
                    {status.label}
                  </Badge>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarIcon className="size-3.5" aria-hidden />
                  {formatDate(tournament.startDate)} – {formatDate(tournament.endDate)}
                </p>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <ClipboardListIcon className="size-4" aria-hidden />
                  {tournament.counts.categories} categorías · {tournament.counts.matches} partidos
                </p>
                <p className="flex items-center gap-1.5">
                  <UsersIcon className="size-4" aria-hidden />
                  {tournament.counts.teams} parejas · {tournament.courts} canchas
                </p>
                <p className="text-xs">
                  Actualizado el {new Date(tournament.updatedAt).toLocaleDateString("es-ES")}
                </p>
              </CardContent>
              <CardFooter>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href={`/torneos/${tournament.id}`}>Ver detalle</Link>
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
      {nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Cargando…" : "Cargar más"}
          </Button>
        </div>
      )}
    </div>
  )
}
