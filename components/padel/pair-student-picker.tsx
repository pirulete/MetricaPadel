"use client"

import * as React from "react"
import { UsersIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export type CourseStudent = {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
}

interface PairStudentPickerProps {
  courseId: string
  studentAId: string | null
  studentBId: string | null
  onChange: (studentAId: string | null, studentBId: string | null) => void
  onContinue: () => void
}

/**
 * Selector de dupla (SPEC-01): lista alumnos inscritos del curso
 * (GET /api/courses/[id]) y permite seleccionar exactamente 2 distintos
 * (Alumno A / Alumno B). El botón Continuar se deshabilita con 1 o 3+
 * seleccionados (con 2 slots, solo se habilita con exactamente 2).
 */
export function PairStudentPicker({
  courseId,
  studentAId,
  studentBId,
  onChange,
  onContinue,
}: PairStudentPickerProps) {
  const [students, setStudents] = React.useState<CourseStudent[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/courses/${courseId}`, { cache: "no-store" })
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error ?? "No se pudieron cargar los alumnos")
        if (!cancelled) setStudents(body.course?.students ?? [])
      } catch {
        if (!cancelled) setStudents([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [courseId])

  const toggle = (studentId: string) => {
    if (studentAId === studentId) return onChange(null, studentBId)
    if (studentBId === studentId) return onChange(studentAId, null)
    if (!studentAId) return onChange(studentId, studentBId)
    if (!studentBId) return onChange(studentAId, studentId)
    // Ya hay 2 seleccionados: reemplaza el último (B)
    return onChange(studentAId, studentId)
  }

  const selectedCount = [studentAId, studentBId].filter(Boolean).length
  const canContinue = selectedCount === 2

  const labelFor = (id: string) => {
    if (studentAId === id) return "Alumno A"
    if (studentBId === id) return "Alumno B"
    return null
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Selecciona la pareja</h2>
        <p className="text-sm text-muted-foreground">
          Elige exactamente 2 alumnos inscritos al curso para evaluarlos juntos.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando alumnos…</p>
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay alumnos inscritos en este curso. Agrégalos desde el detalle del curso.
        </p>
      ) : (
        <div className="space-y-2">
          {students.map((student) => {
            const label = labelFor(student.id)
            return (
              <Button
                key={student.id}
                type="button"
                variant={label ? "secondary" : "outline"}
                className="w-full justify-start text-left"
                onClick={() => toggle(student.id)}
                aria-pressed={Boolean(label)}
              >
                <UsersIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {student.firstName} {student.lastName}
                </span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {student.email}
                </span>
                {label && <Badge variant="default">{label}</Badge>}
              </Button>
            )
          })}
        </div>
      )}

      <Button onClick={onContinue} disabled={!canContinue} className="w-full sm:w-auto">
        {canContinue ? "Continuar" : "Selecciona 2 alumnos"}
      </Button>
    </div>
  )
}