"use client"

import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/padel/empty-state"

type RubricOption = {
  id: string
  title: string
  category: "reglas" | "tecnica_basica" | "tecnica_especifica" | "tactica" | "fisica" | "actitud_equipo"
  status: "draft" | "active" | "archived"
}

const CATEGORY_LABELS: Record<RubricOption["category"], string> = {
  reglas: "Reglas",
  tecnica_basica: "Técnica Básica",
  tecnica_especifica: "Técnica Específica",
  tactica: "Táctica",
  fisica: "Física",
  actitud_equipo: "Actitud y Trabajo en Equipo",
}

/** Modal de asignación de rúbrica a curso (P08). POST /api/courses/[id]/rubrics. */
export function AssignRubricModal({
  courseId,
  onAssigned,
}: {
  courseId: string
  onAssigned: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [rubrics, setRubrics] = React.useState<RubricOption[]>([])
  const [selected, setSelected] = React.useState<string | null>(null)

  const loadRubrics = async () => {
    try {
      const res = await fetch("/api/rubrics?status=active", { cache: "no-store" })
      const data = await res.json()
      if (res.ok) setRubrics(data.rubrics ?? [])
    } catch {
      toast.error("Error al cargar rúbricas")
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSelected(null)
      void loadRubrics()
    }
  }

  const handleAssign = async () => {
    if (!selected) return
    setLoading(true)
    try {
      const res = await fetch(`/api/courses/${courseId}/rubrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubricId: selected }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo asignar la rúbrica")
        return
      }
      toast.success("Rúbrica asignada al curso")
      setOpen(false)
      onAssigned()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Asignar rúbrica</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar rúbrica</DialogTitle>
          <DialogDescription>
            Selecciona una rúbrica activa para evaluar a los alumnos de este curso.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {rubrics.length === 0 ? (
            <EmptyState
              title="No hay rúbricas activas"
              description="Crea y activa una rúbrica en la biblioteca primero."
            />
          ) : (
            rubrics.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id)}
                aria-pressed={selected === r.id}
                className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent data-[pressed=true]:border-primary"
              >
                <span className="text-sm font-medium">{r.title}</span>
                <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[r.category]}</span>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleAssign} disabled={loading || !selected}>
            {loading ? "Asignando…" : "Asignar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}