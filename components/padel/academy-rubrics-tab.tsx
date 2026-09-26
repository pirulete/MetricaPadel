"use client"

import * as React from "react"
import { toast } from "sonner"
import { BookOpenIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/padel/empty-state"
import type { AcademyRubricListItem } from "@/hooks/use-academies"

const CATEGORY_OPTIONS = [
  { value: "reglas", label: "Reglas" },
  { value: "tecnica_basica", label: "Técnica Básica" },
  { value: "tecnica_especifica", label: "Técnica Específica" },
  { value: "tactica", label: "Táctica" },
  { value: "fisica", label: "Física" },
  { value: "actitud_equipo", label: "Actitud y Trabajo en Equipo" },
] as const

const LEVEL_NAMES = ["Excelente", "Bueno", "Aceptable", "En desarrollo"]

type CriterionDraft = { name: string; descriptors: string[] }

/**
 * Tab de rúbricas institucionales (SPEC-EPIC-01 Fase E).
 * GET /api/academies/[id]/rubrics + POST (scope forzado institutional).
 * COACH lee; solo OWNER/ADMIN crea (canManage).
 */
export function AcademyRubricsTab({
  academyId,
  rubrics,
  canManage,
  onCreated,
}: {
  academyId: string
  rubrics: AcademyRubricListItem[]
  canManage: boolean
  onCreated?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [category, setCategory] = React.useState<(typeof CATEGORY_OPTIONS)[number]["value"]>("tecnica_basica")
  const [criteria, setCriteria] = React.useState<CriterionDraft[]>([
    { name: "", descriptors: ["", "", "", ""] },
  ])

  const updateCriterion = (index: number, patch: Partial<CriterionDraft>) => {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  const updateDescriptor = (cIndex: number, dIndex: number, value: string) => {
    setCriteria((prev) =>
      prev.map((c, i) =>
        i === cIndex ? { ...c, descriptors: c.descriptors.map((d, j) => (j === dIndex ? value : d)) } : c
      )
    )
  }

  const addCriterion = () => setCriteria((prev) => [...prev, { name: "", descriptors: ["", "", "", ""] }])
  const removeCriterion = (index: number) => setCriteria((prev) => prev.filter((_, i) => i !== index))

  const isValid =
    title.trim().length > 0 &&
    criteria.length > 0 &&
    criteria.every((c) => c.name.trim().length > 0 && c.descriptors.every((d) => d.trim().length > 0))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    setLoading(true)
    try {
      const res = await fetch(`/api/academies/${academyId}/rubrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          criteria: criteria.map((c) => ({ name: c.name.trim(), descriptors: c.descriptors.map((d) => d.trim()) })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo crear la rúbrica")
        return
      }
      toast.success("Rúbrica institucional creada")
      setOpen(false)
      setTitle("")
      setCriteria([{ name: "", descriptors: ["", "", "", ""] }])
      onCreated?.()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusIcon className="size-4" />
                Nueva rúbrica
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nueva rúbrica institucional</DialogTitle>
                <DialogDescription>
                  La rúbrica queda disponible para todos los profesores de la academia (scope institucional).
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rubric-title">Título</Label>
                  <Input
                    id="rubric-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej: Evaluación de saque"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rubric-category">Categoría</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                    <SelectTrigger id="rubric-category">
                      <SelectValue placeholder="Selecciona categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Criterios (4 niveles cada uno)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addCriterion}>
                      <PlusIcon className="size-3.5" />
                      Agregar criterio
                    </Button>
                  </div>
                  {criteria.map((c, i) => (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Input
                          value={c.name}
                          onChange={(e) => updateCriterion(i, { name: e.target.value })}
                          placeholder={`Criterio ${i + 1}`}
                          className="flex-1"
                        />
                        {criteria.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeCriterion(i)}
                            aria-label={`Eliminar criterio ${i + 1}`}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {LEVEL_NAMES.map((level, j) => (
                          <Input
                            key={j}
                            value={c.descriptors[j]}
                            onChange={(e) => updateDescriptor(i, j, e.target.value)}
                            placeholder={`${level}: descriptor`}
                            className="text-xs"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading || !isValid}>
                    {loading ? "Creando…" : "Crear rúbrica"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}
      {rubrics.length === 0 ? (
        <EmptyState
          title="Sin rúbricas institucionales"
          description="Crea rúbricas compartidas para estandarizar la evaluación entre profesores."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenIcon className="size-4" />
              {rubrics.length} rúbricas institucionales
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {rubrics.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.criteriaCount} criterios · {r.category.replace(/_/g, " ")}
                  </p>
                </div>
                <Badge variant={r.status === "active" ? "secondary" : "outline"} className="text-[10px]">
                  {r.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}