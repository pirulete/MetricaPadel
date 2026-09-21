"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CopyIcon, UsersIcon, BookOpenIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/padel/empty-state"
import { AssignRubricModal } from "@/components/padel/assign-rubric-modal"
import { AddStudentModal } from "@/components/padel/add-student-modal"

export type CourseDetailData = {
  course: {
    id: string
    name: string
    level: "iniciacion" | "intermedio" | "avanzado"
    schedule: string | null
    days: string[]
    inviteCode: string
    status: "active" | "archived"
  }
  students: Array<{
    id: string
    firstName: string | null
    lastName: string | null
    email: string
    joinedAt: string
  }>
  rubrics: Array<{
    id: string
    rubricId: string
    title: string
    assignedAt: string
  }>
}

const LEVEL_LABELS: Record<CourseDetailData["course"]["level"], string> = {
  iniciacion: "Iniciación",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
}

/** Detalle de curso P07: tabs Alumnos / Rúbricas + código invite + acciones. */
export function CourseDetail({ course }: { course: CourseDetailData }) {
  const router = useRouter()
  const [copied, setCopied] = React.useState(false)
  const [removingId, setRemovingId] = React.useState<string | null>(null)

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(course.course.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("No se pudo copiar el código")
    }
  }

  const handleRemoveStudent = async (studentId: string) => {
    if (!window.confirm("¿Quitar a este alumno del curso? Sus evaluaciones se conservan.")) return
    setRemovingId(studentId)
    try {
      const res = await fetch(`/api/courses/${course.course.id}/students/${studentId}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo quitar al alumno")
        return
      }
      toast.success("Alumno quitado del curso")
      router.refresh()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{course.course.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{LEVEL_LABELS[course.course.level]}</Badge>
            {course.course.schedule && (
              <span className="text-sm text-muted-foreground">{course.course.schedule}</span>
            )}
            {course.course.days.length > 0 && (
              <span className="text-sm text-muted-foreground">{course.course.days.join(" · ")}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyCode} aria-label="Copiar código de invitación">
            <CopyIcon className="size-4" />
            {copied ? "Copiado" : course.course.inviteCode}
          </Button>
          <Button asChild size="sm">
            <Link href={`/evaluar?courseId=${course.course.id}`}>Evaluar</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Alumnos</TabsTrigger>
          <TabsTrigger value="rubrics">Rúbricas</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-4">
          <div className="mb-4">
            <AddStudentModal courseId={course.course.id} onAdded={() => router.refresh()} />
          </div>
          {course.students.length === 0 ? (
            <EmptyState
              title="Sin alumnos todavía"
              description="Comparte el código de invitación o agrega alumnos manualmente."
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UsersIcon className="size-4" />
                  {course.students.length} alumnos
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {course.students.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium">
                        {s.firstName} {s.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {new Date(s.joinedAt).toLocaleDateString("es-ES")}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => void handleRemoveStudent(s.id)}
                        disabled={removingId === s.id}
                        aria-label={`Quitar a ${s.firstName} ${s.lastName} del curso`}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rubrics" className="mt-4">
          <div className="mb-4">
            <AssignRubricModal courseId={course.course.id} onAssigned={() => router.refresh()} />
          </div>
          {course.rubrics.length === 0 ? (
            <EmptyState
              title="Sin rúbricas asignadas"
              description="Asigna una rúbrica activa para evaluar a los alumnos de este curso."
            />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border">
                {course.rubrics.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <BookOpenIcon className="size-4 text-muted-foreground" />
                      <p className="text-sm font-medium">{r.title}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.assignedAt).toLocaleDateString("es-ES")}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}