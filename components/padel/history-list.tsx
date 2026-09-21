"use client"

import * as React from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/padel/empty-state"

export type HistoryItem = {
  id: string
  studentName: string
  rubricTitle: string
  courseName: string | null
  date: string | null
  totalScore: number | null
  maxScore: number | null
  status: "draft" | "published"
}

type CourseOption = { id: string; name: string }
type StudentOption = { id: string; name: string }

/** Historial del coach (P10) con filtros curso/alumno/estado. */
export function HistoryList() {
  const [items, setItems] = React.useState<HistoryItem[]>([])
  const [courses, setCourses] = React.useState<CourseOption[]>([])
  const [students, setStudents] = React.useState<StudentOption[]>([])
  const [courseId, setCourseId] = React.useState<string>("all")
  const [studentId, setStudentId] = React.useState<string>("all")
  const [status, setStatus] = React.useState<string>("all")
  const [loading, setLoading] = React.useState(true)
  const firstLoad = React.useRef(true)

  const load = React.useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (courseId !== "all") params.set("courseId", courseId)
      if (studentId !== "all") params.set("studentId", studentId)
      if (status !== "all") params.set("status", status)
      const qs = params.toString()
      const res = await fetch(`/api/history${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Error al cargar el historial")
        return
      }
      setItems(data.evaluations ?? [])
    } catch {
      toast.error("Error de conexión")
    }
  }, [courseId, studentId, status])

  React.useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        const [coursesRes, studentsRes] = await Promise.all([
          fetch("/api/courses", { cache: "no-store" }),
          fetch("/api/admin/users", { cache: "no-store" }),
        ])
        const coursesData = await coursesRes.json()
        const studentsData = await studentsRes.json()
        if (!cancelled) {
          setCourses((coursesData.courses ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })))
          setStudents((studentsData.users ?? []).map((u: { id: string; firstName: string | null; lastName: string | null }) => ({
            id: u.id,
            name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
          })))
        }
      } catch {
        // Filtros opcionales: no bloquean la lista
      }
      try {
        const params = new URLSearchParams()
        const res = await fetch("/api/history", { cache: "no-store" })
        const data = await res.json()
        if (res.ok && !cancelled) setItems(data.evaluations ?? [])
      } catch {
        // ya se muestra empty state
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      return
    }
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger className="w-44" aria-label="Filtrar por curso">
            <SelectValue placeholder="Curso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los cursos</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={studentId} onValueChange={setStudentId}>
          <SelectTrigger className="w-44" aria-label="Filtrar por alumno">
            <SelectValue placeholder="Alumno" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los alumnos</SelectItem>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Filtrar por estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="published">Publicada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando historial…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Sin evaluaciones"
          description="Ajusta los filtros o crea tu primera evaluación."
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-medium">{item.studentName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.rubricTitle}
                    {item.courseName ? ` · ${item.courseName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {item.totalScore !== null && item.maxScore !== null && (
                    <span className="text-sm font-semibold">
                      {item.totalScore}/{item.maxScore}
                    </span>
                  )}
                  <Badge variant={item.status === "published" ? "secondary" : "outline"}>
                    {item.status === "published" ? "Publicada" : "Borrador"}
                  </Badge>
                  {item.date && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.date).toLocaleDateString("es-ES")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}