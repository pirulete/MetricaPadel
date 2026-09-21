"use client"

import * as React from "react"
import { toast } from "sonner"
import { SearchIcon, UserPlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/padel/empty-state"

type Candidate = {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
}

/** Modal de búsqueda y alta de alumno en curso (G12). POST /api/courses/[id]/students. */
export function AddStudentModal({
  courseId,
  onAdded,
}: {
  courseId: string
  onAdded: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [candidates, setCandidates] = React.useState<Candidate[]>([])
  const [searching, setSearching] = React.useState(false)
  const [addingId, setAddingId] = React.useState<string | null>(null)

  const search = React.useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setCandidates([])
        return
      }
      setSearching(true)
      try {
        const res = await fetch(
          `/api/courses/${courseId}/students/search?q=${encodeURIComponent(q.trim())}`,
          { cache: "no-store" }
        )
        const data = await res.json()
        if (res.ok) setCandidates(data.candidates ?? [])
        else toast.error(data.error ?? "Error al buscar alumnos")
      } catch {
        toast.error("Error de conexión")
      } finally {
        setSearching(false)
      }
    },
    [courseId]
  )

  // Debounce 300ms
  React.useEffect(() => {
    const t = setTimeout(() => void search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setQuery("")
      setCandidates([])
    }
  }

  const handleAdd = async (studentId: string) => {
    setAddingId(studentId)
    try {
      const res = await fetch(`/api/courses/${courseId}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo agregar al alumno")
        return
      }
      toast.success("Alumno agregado al curso")
      setCandidates((prev) => prev.filter((c) => c.id !== studentId))
      onAdded()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setAddingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlusIcon className="size-4" />
          Agregar alumno
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar alumno</DialogTitle>
          <DialogDescription>
            Busca por nombre o email y agrega al curso. Solo se muestran alumnos activos no inscritos.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="pl-9"
            aria-label="Buscar alumnos"
          />
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {searching ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Buscando…</p>
          ) : query.trim() === "" ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Escribe para buscar alumnos.
            </p>
          ) : candidates.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              description="No hay alumnos activos no inscritos que coincidan."
            />
          ) : (
            candidates.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {c.firstName} {c.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleAdd(c.id)}
                  disabled={addingId === c.id}
                >
                  {addingId === c.id ? "Agregando…" : "Agregar"}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}