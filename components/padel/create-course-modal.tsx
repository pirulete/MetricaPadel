"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const DAY_OPTIONS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

/** Modal de creación de curso (P06). POST /api/courses. */
export function CreateCourseModal() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [name, setName] = React.useState("")
  const [level, setLevel] = React.useState<"iniciacion" | "intermedio" | "avanzado">("iniciacion")
  const [schedule, setSchedule] = React.useState("")
  const [days, setDays] = React.useState<string[]>([])

  const toggleDay = (day: string) => {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), level, schedule: schedule.trim() || undefined, days }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Error al crear el curso")
        return
      }
      toast.success(`Curso creado · Código ${data.course.inviteCode}`)
      setOpen(false)
      setName("")
      setSchedule("")
      setDays([])
      router.refresh()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Crear curso</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear curso</DialogTitle>
          <DialogDescription>
            Se generará un código de invitación PAD-XXXX para que tus alumnos se unan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="course-name">Nombre</Label>
            <Input
              id="course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Pádel iniciación martes"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="course-level">Nivel</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
              <SelectTrigger id="course-level">
                <SelectValue placeholder="Selecciona nivel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="iniciacion">Iniciación</SelectItem>
                <SelectItem value="intermedio">Intermedio</SelectItem>
                <SelectItem value="avanzado">Avanzado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="course-schedule">Horario</Label>
            <Input
              id="course-schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="Ej: 18:00 - 19:30"
            />
          </div>
          <div className="space-y-2">
            <Label>Días de clase</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_OPTIONS.map((day) => (
                <Button
                  key={day}
                  type="button"
                  size="sm"
                  variant={days.includes(day) ? "default" : "outline"}
                  onClick={() => toggleDay(day)}
                  aria-pressed={days.includes(day)}
                >
                  {day}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Creando…" : "Crear curso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}