"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const CATEGORIES = [
  { value: "reglas", label: "Reglas" },
  { value: "tecnica_basica", label: "Técnica Básica" },
  { value: "tecnica_especifica", label: "Técnica Específica" },
  { value: "tactica", label: "Táctica" },
  { value: "fisica", label: "Física" },
  { value: "actitud_equipo", label: "Actitud y Trabajo en Equipo" },
] as const

const LEVEL_NAMES = ["Excelente", "Bueno", "Aceptable", "En desarrollo"]

type CriterionDraft = { name: string; descriptors: string[] }

function emptyCriterion(): CriterionDraft {
  return { name: "", descriptors: ["", "", "", ""] }
}

interface RubricEditorProps {
  rubricId?: string
}

/** Editor de rúbrica P03: matriz de criterios × 4 descriptores (niveles fijos). */
export function RubricEditor({ rubricId }: RubricEditorProps) {
  const router = useRouter()
  const [title, setTitle] = React.useState("")
  const [category, setCategory] = React.useState<string>("reglas")
  const [criteria, setCriteria] = React.useState<CriterionDraft[]>([emptyCriterion()])
  const [loading, setLoading] = React.useState(Boolean(rubricId))
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!rubricId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/rubrics/${rubricId}`, { cache: "no-store" })
        if (!res.ok) throw new Error("No se pudo cargar la rúbrica")
        const body = await res.json()
        if (cancelled) return
        setTitle(body.rubric.title)
        setCategory(body.rubric.category)
        setCriteria(
          body.criteria.map((c: { id: string; name: string }) => ({
            name: c.name,
            descriptors: body.levels.map((l: { id: string }) => {
              const d = body.descriptors.find(
                (desc: { criteriaId: string; levelId: string }) =>
                  desc.criteriaId === c.id && desc.levelId === l.id
              )
              return d?.text ?? ""
            }),
          }))
        )
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Error al cargar")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [rubricId])

  const updateCriterion = (index: number, patch: Partial<CriterionDraft>) => {
    setCriteria((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c))
    )
  }

  const updateDescriptor = (cIndex: number, dIndex: number, value: string) => {
    setCriteria((prev) =>
      prev.map((c, i) =>
        i === cIndex
          ? { ...c, descriptors: c.descriptors.map((d, j) => (j === dIndex ? value : d)) }
          : c
      )
    )
  }

  const addCriterion = () => setCriteria((prev) => [...prev, emptyCriterion()])
  const removeCriterion = (index: number) =>
    setCriteria((prev) => prev.filter((_, i) => i !== index))

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("El título es requerido")
      return
    }
    if (criteria.some((c) => !c.name.trim() || c.descriptors.some((d) => !d.trim()))) {
      toast.error("Completa nombre y los 4 descriptores de cada criterio")
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        category,
        criteria: criteria.map((c) => ({
          name: c.name.trim(),
          descriptors: c.descriptors.map((d) => d.trim()),
        })),
      }
      const res = rubricId
        ? await fetch(`/api/rubrics/${rubricId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/rubrics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? "No se pudo guardar la rúbrica")
      }
      toast.success(rubricId ? "Rúbrica actualizada" : "Rúbrica creada")
      router.push("/rubricas")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {rubricId ? "Editar rúbrica" : "Nueva rúbrica"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Niveles fijos: Excelente (4) · Bueno (3) · Aceptable (2) · En desarrollo (1).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="rubric-title">Título</Label>
          <Input
            id="rubric-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Saque de padel"
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rubric-category">Categoría</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="rubric-category">
              <SelectValue placeholder="Selecciona categoría" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Criterios</h2>
          <Button type="button" variant="outline" size="sm" onClick={addCriterion}>
            <PlusIcon className="size-4" />
            Añadir criterio
          </Button>
        </div>

        {criteria.map((criterion, cIndex) => (
          <div
            key={cIndex}
            className="space-y-3 rounded-xl border border-border p-4"
          >
            <div className="flex items-center gap-2">
              <Input
                value={criterion.name}
                onChange={(e) => updateCriterion(cIndex, { name: e.target.value })}
                placeholder={`Criterio ${cIndex + 1} (ej: Precisión)`}
                maxLength={200}
                aria-label={`Nombre del criterio ${cIndex + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeCriterion(cIndex)}
                disabled={criteria.length === 1}
                aria-label={`Eliminar criterio ${cIndex + 1}`}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {criterion.descriptors.map((descriptor, dIndex) => (
                <div key={dIndex} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {LEVEL_NAMES[dIndex]} ({4 - dIndex})
                  </Label>
                  <Textarea
                    value={descriptor}
                    onChange={(e) => updateDescriptor(cIndex, dIndex, e.target.value)}
                    placeholder={`Descriptor nivel ${LEVEL_NAMES[dIndex]}`}
                    maxLength={1000}
                    rows={2}
                    aria-label={`Descriptor ${LEVEL_NAMES[dIndex]} del criterio ${cIndex + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : rubricId ? "Guardar cambios" : "Crear rúbrica"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/rubricas")}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}