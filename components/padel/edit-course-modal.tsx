"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PencilIcon } from "lucide-react"
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

interface EditCourseModalProps {
  courseId: string
  course: {
    name: string
    level: "iniciacion" | "intermedio" | "avanzado"
    schedule: string | null
    days: string[]
  }
}

/** Modal de edición de curso (P1.1). PUT /api/courses/[id]. */
export function EditCourseModal({ courseId, course }: EditCourseModalProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [name, setName] = React.useState(course.name)
  const [level, setLevel] = React.useState(course.level)
  const [schedule, setSchedule] = React.useState(course.schedule ?? "")
  const [days, setDays] = React.useState<string[]>(course.days)

  const toggleDay = (day: string) => {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), level, schedule: schedule.trim() || undefined, days }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Error al actualizar el curso")
        return
      }
      toast.success("Curso actualizado")
      setOpen(false)
      router.refresh()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setName(course.name); setLevel(course.level); setSchedule(course.schedule ?? ""); setDays(course.days) } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon className="size-4" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar curso</DialogTitle>
          <DialogDescription>Actualiza los datos del curso.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-course-name">Nombre</Label>
            <Input
              id="edit-course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-course-level">Nivel</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
              <SelectTrigger id="edit-course-level">
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
            <Label htmlFor="edit-course-schedule">Horario</Label>
            <Input
              id="edit-course-schedule"
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
              {loading ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
