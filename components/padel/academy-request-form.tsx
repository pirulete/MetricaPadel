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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAcademyRequests, type AvailableAcademy } from "@/hooks/use-academy-requests"

const SLUG_REGEX = /^[a-z0-9-]{3,50}$/
const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/

/**
 * Modal de solicitud de acceso a academia (v0.9) — reemplaza AcademyForm para
 * el ADMIN global (que ya no crea academias; guardSuperAdmin).
 * 2 tabs: "Unirme a academia" (join, select academias activas + rol) y
 * "Crear academia para mí" (create, rol OWNER implícito). Feedback con Sonner.
 */
export function AcademyRequestForm({
  onSaved,
  trigger,
}: {
  onSaved?: () => void
  trigger?: React.ReactNode
}) {
  const { createRequest, listAvailableAcademies } = useAcademyRequests()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [tab, setTab] = React.useState<"join" | "create">("join")

  // join
  const [academies, setAcademies] = React.useState<AvailableAcademy[]>([])
  const [academyId, setAcademyId] = React.useState("")
  const [joinRole, setJoinRole] = React.useState<"ADMIN" | "COACH">("COACH")

  // create
  const [name, setName] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [primaryColor, setPrimaryColor] = React.useState("#3b82f6")

  const handleOpenChange = async (next: boolean) => {
    setOpen(next)
    if (next) {
      const res = await listAvailableAcademies()
      if (res.ok) setAcademies(res.academies)
    }
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!academyId) return
    setLoading(true)
    try {
      const res = await createRequest({ type: "join_academy", academyId, requestedRole: joinRole })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Solicitud enviada. El administrador de la plataforma la revisará.")
      setOpen(false)
      onSaved?.()
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !SLUG_REGEX.test(slug) || !HEX_REGEX.test(primaryColor)) return
    setLoading(true)
    try {
      const res = await createRequest({
        type: "create_academy",
        name: name.trim(),
        slug,
        primaryColor,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Solicitud enviada. El administrador de la plataforma la revisará.")
      setOpen(false)
      onSaved?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? <Button>Solicitar acceso</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar acceso a academia</DialogTitle>
          <DialogDescription>
            Únete a una academia existente o pide que se cree una para ti. Un administrador de la plataforma revisará tu solicitud.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "join" | "create")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="join">Unirme a academia</TabsTrigger>
            <TabsTrigger value="create">Crear academia para mí</TabsTrigger>
          </TabsList>

          <TabsContent value="join">
            <form onSubmit={handleJoin} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="req-academy">Academia</Label>
                <Select value={academyId} onValueChange={setAcademyId}>
                  <SelectTrigger id="req-academy">
                    <SelectValue placeholder="Selecciona una academia" />
                  </SelectTrigger>
                  <SelectContent>
                    {academies.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="req-role">Rol solicitado</Label>
                <Select value={joinRole} onValueChange={(v) => setJoinRole(v as "ADMIN" | "COACH")}>
                  <SelectTrigger id="req-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COACH">Coach</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading || !academyId}>
                  {loading ? "Enviando…" : "Enviar solicitud"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="create">
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="req-name">Nombre</Label>
                <Input
                  id="req-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Academia Pádel Norte"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="req-slug">Slug</Label>
                <Input
                  id="req-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="Ej: padel-norte"
                  pattern="[a-z0-9-]{3,50}"
                  required
                />
                <p className="text-xs text-muted-foreground">3-50 caracteres: minúsculas, dígitos y guiones.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="req-color">Color institucional</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="req-color"
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
                  {loading ? "Enviando…" : "Enviar solicitud"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}