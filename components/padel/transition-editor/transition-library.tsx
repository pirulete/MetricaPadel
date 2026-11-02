"use client"

/**
 * Biblioteca de transiciones del coach (página `/transiciones`).
 *
 * Presentacional: recibe la lista y los estados desde la página (T11), que usa
 * `use-transitions` para el fetch. Cubre loading (skeletons), error (con
 * reintento), vacío (`EmptyState`) y listado con paginación por cursor.
 */

import Link from "next/link"
import { ChevronRight, Loader2, Plus, RefreshCw, TriangleAlert } from "lucide-react"
import { EmptyState } from "@/components/padel/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { TransitionSummaryDto } from "@/hooks/use-transitions"

const DATE_FORMAT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
})

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date)
}

export type TransitionLibraryProps = {
  transitions: TransitionSummaryDto[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}

function LoadingList() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Cargando transiciones">
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-[68px] animate-pulse rounded-xl border bg-muted/60" />
      ))}
    </div>
  )
}

export function TransitionLibrary({
  transitions,
  loading = false,
  error = null,
  onRetry,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: TransitionLibraryProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Transiciones</h2>
          <p className="text-xs text-muted-foreground">Tus jugadas guardadas</p>
        </div>
        <Button asChild className="h-11">
          <Link href="/transiciones/nueva">
            <Plus className="size-4" /> Nueva
          </Link>
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="flex-1">{error}</span>
          {onRetry && (
            <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={onRetry}>
              <RefreshCw className="size-3.5" /> Reintentar
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <LoadingList />
      ) : transitions.length === 0 ? (
        <EmptyState
          title="Aún no tienes transiciones"
          description="Crea tu primera jugada y guárdala para mostrarla en clase."
          action={
            <Button asChild size="sm">
              <Link href="/transiciones/nueva">
                <Plus className="size-4" /> Nueva transición
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {transitions.map((transition) => (
            <Link
              key={transition.id}
              href={`/transiciones/${transition.id}`}
              className="block rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{transition.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Actualizado {formatDate(transition.updatedAt)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {transition.stepCount} {transition.stepCount === 1 ? "paso" : "pasos"}
                  </Badge>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </CardContent>
              </Card>
            </Link>
          ))}

          {hasMore && onLoadMore && (
            <Button
              variant="outline"
              className="h-11 w-full"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              Cargar más
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
