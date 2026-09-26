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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AcademyDetail } from "@/hooks/use-academies"

const SLUG_REGEX = /^[a-z0-9-]{3,50}$/
const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/

/**
 * Formulario crear/editar academia (SPEC-EPIC-01 Fase E).
 * Modo create: POST /api/academies. Modo edit: PUT /api/academies/[id].
 */
export function AcademyForm({
  academy,
  onSaved,
  trigger,
}: {
  academy?: AcademyDetail
  onSaved?: () => void
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [name, setName] = React.useState(academy?.name ?? "")
  const [slug, setSlug] = React.useState(academy?.slug ?? "")
  const [primaryColor, setPrimaryColor] = React.useState(academy?.primaryColor ?? "#3b82f6")

  // Al abrir en modo edit, sincroniza el form con la academia actual.
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && academy) {
      setName(academy.name)
      setSlug(academy.slug)
      setPrimaryColor(academy.primaryColor)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !SLUG_REGEX.test(slug)) return
    if (!HEX_REGEX.test(primaryColor)) return
    setLoading(true)
    try {
      const payload = { name: name.trim(), slug, primaryColor }
      const res = await fetch(academy ? `/api/academies/${academy.id}` : "/api/academies", {
        method: academy ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar la academia")
        return
      }
      toast.success(academy ? "Academia actualizada" : "Academia creada")
      setOpen(false)
      onSaved?.()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? <Button>{academy ? "Editar" : "Crear academia"}</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{academy ? "Editar academia" : "Crear academia"}</DialogTitle>
          <DialogDescription>
            {academy
              ? "Actualiza el nombre, slug o color institucional."
              : "Crea tu academia para estandarizar rúbricas y emitir informes con tu branding."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="academy-name">Nombre</Label>
            <Input
              id="academy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Academia Pádel Norte"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="academy-slug">Slug</Label>
            <Input
              id="academy-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="Ej: padel-norte"
              pattern="[a-z0-9-]{3,50}"
              required
            />
            <p className="text-xs text-muted-foreground">3-50 caracteres: minúsculas, dígitos y guiones.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="academy-color">Color institucional</Label>
            <div className="flex items-center gap-2">
              <Input
                id="academy-color"
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="size-10 w-14 cursor-pointer p-1"
                aria-label="Color primario"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#3b82f6"
                pattern="^#[0-9A-Fa-f]{6}$"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !name.trim() || !SLUG_REGEX.test(slug) || !HEX_REGEX.test(primaryColor)}>
              {loading ? "Guardando…" : academy ? "Guardar cambios" : "Crear academia"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}