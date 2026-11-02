"use client"

import * as React from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { parseAdminError } from "@/hooks/use-admin-fetch"

const SLUG_REGEX = /^[a-z0-9-]{3,50}$/
const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/

export function AcademyCreateModal({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved?: () => void
}) {
  const [loading, setLoading] = React.useState(false)
  const [name, setName] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [primaryColor, setPrimaryColor] = React.useState("#3b82f6")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !SLUG_REGEX.test(slug) || !HEX_REGEX.test(primaryColor)) {
      toast.error("Completá nombre, slug (a-z0-9-, 3-50) y color HEX válido")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/academies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug, primaryColor }),
      })
      if (!res.ok) throw new Error(await parseAdminError(res))
      toast.success("Academia creada")
      setName("")
      setSlug("")
      setPrimaryColor("#3b82f6")
      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la academia")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          Crear academia
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear academia</DialogTitle>
          <DialogDescription>
            Solo SUPER_ADMIN crea academias. El owner por defecto sos vos; podés asignarlo a otro admin después.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="academy-name">Nombre</Label>
            <Input id="academy-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="academy-slug">Slug</Label>
            <Input
              id="academy-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="mi-academia"
              required
            />
            <p className="text-xs text-muted-foreground">minúsculas, dígitos y guiones, 3-50 caracteres</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="academy-color">Color primario</Label>
            <Input
              id="academy-color"
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-20"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? "Creando…" : "Crear"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
