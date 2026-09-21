"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/padel/empty-state"
import { JoinCourseModal } from "@/components/padel/join-course-modal"

type StudentCourse = {
  id: string
  name: string
  level: "iniciacion" | "intermedio" | "avanzado"
  schedule: string | null
  days: string[]
  inviteCode: string
  joinedAt: string
}

type NotificationItem = {
  id: string
  title: string
  body: string | null
  read: number
  createdAt: string
}

const LEVEL_LABELS: Record<StudentCourse["level"], string> = {
  iniciacion: "Iniciación",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
}

/** Home del alumno (A01): nivel + cursos + notificaciones. */
export function StudentDashboard() {
  const [level, setLevel] = React.useState<StudentCourse["level"] | null>(null)
  const [courses, setCourses] = React.useState<StudentCourse[]>([])
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard/student", { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "Error al cargar el dashboard")
          return
        }
        if (!cancelled) {
          setLevel(data.level)
          setCourses(data.courses ?? [])
          setNotifications(data.notifications ?? [])
        }
      } catch {
        toast.error("Error de conexión")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando dashboard…</p>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Hola, jugador</h1>
          <p className="text-sm text-muted-foreground">Tu progreso en el pádel</p>
        </div>
        <JoinCourseModal />
      </div>

      {level && (
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tu nivel actual</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" className="text-base">
              {LEVEL_LABELS[level]}
            </Badge>
          </CardContent>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Mis cursos</h2>
        {courses.length === 0 ? (
          <EmptyState
            title="No estás en ningún curso"
            description="Pídele el código de invitación a tu coach para unirte."
            action={<JoinCourseModal />}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <Card key={c.id}>
                <CardHeader className="gap-1">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <Badge variant="secondary" className="w-fit">
                    {LEVEL_LABELS[c.level]}
                  </Badge>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {c.schedule && <p>{c.schedule}</p>}
                  {c.days.length > 0 && <p className="mt-1">{c.days.join(" · ")}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {notifications.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Notificaciones</h2>
          <Card>
            <CardContent className="divide-y divide-border">
              {notifications.map((n) => (
                <div key={n.id} className="py-2.5">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
          <Button asChild variant="outline" size="sm">
            <Link href="/notifications">Ver todas</Link>
          </Button>
        </section>
      )}
    </div>
  )
}