"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/padel/empty-state"
import { RubricCard, type RubricListItem } from "@/components/padel/rubric-card"

type Filter = "all" | "draft" | "active" | "archived"

const PAGE_SIZE = 20

/** Biblioteca de rúbricas P02: lista con filtro por status + archivar + paginación por cursor (G15). */
export function RubricLibrary() {
  const router = useRouter()
  const [filter, setFilter] = React.useState<Filter>("all")
  const [rubrics, setRubrics] = React.useState<RubricListItem[]>([])
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async (next: Filter) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("limit", String(PAGE_SIZE))
      if (next !== "all") params.set("status", next)
      const res = await fetch(`/api/rubrics?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) throw new Error("No se pudieron cargar las rúbricas")
      const body = await res.json()
      setRubrics(body.items ?? [])
      setNextCursor(body.nextCursor ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar rúbricas")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      params.set("limit", String(PAGE_SIZE))
      params.set("cursor", nextCursor)
      if (filter !== "all") params.set("status", filter)
      const res = await fetch(`/api/rubrics?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) throw new Error("No se pudieron cargar más rúbricas")
      const body = await res.json()
      setRubrics((prev) => [...prev, ...(body.items ?? [])])
      setNextCursor(body.nextCursor ?? null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar más rúbricas")
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore, filter])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(filter)
  }, [filter, load])

  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/rubrics/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("No se pudo archivar la rúbrica")
      toast.success("Rúbrica archivada")
      void load(filter)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al archivar")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Biblioteca de rúbricas</h1>
          <p className="text-sm text-muted-foreground">
            Crea y gestiona las rúbricas de evaluación de tus alumnos.
          </p>
        </div>
        <Button onClick={() => router.push("/rubricas/nueva")}>
          <PlusIcon className="size-4" />
          Nueva rúbrica
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="draft">Borradores</TabsTrigger>
          <TabsTrigger value="active">Activas</TabsTrigger>
          <TabsTrigger value="archived">Archivadas</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : rubrics.length === 0 ? (
        <EmptyState
          title="Todavía no hay rúbricas"
          description="Crea tu primera rúbrica para empezar a evaluar."
          action={
            <Button asChild size="sm">
              <Link href="/rubricas/nueva">Crear rúbrica</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rubrics.map((rubric) => (
              <RubricCard key={rubric.id} rubric={rubric} onArchive={handleArchive} />
            ))}
          </div>
          {nextCursor && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Cargando…" : "Cargar más"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}