"use client"

import * as React from "react"
import { toast } from "sonner"
import { Section, SectionHeader } from "@/components/ui/section"
import { EmptyState } from "@/components/padel/empty-state"
import { CourseCard, type CourseListItem } from "@/components/padel/course-card"
import { CreateCourseModal } from "@/components/padel/create-course-modal"
import { JoinCourseModal } from "@/components/padel/join-course-modal"
import { BottomNav } from "@/components/padel/bottom-nav"

/**
 * /cursos — P05 (coach) y A01 "Mis cursos" (alumno) en una sola pantalla.
 * El endpoint /api/courses es guardAdmin; el alumno usa /api/dashboard/student.
 */
export default function CursosPage() {
  const [role, setRole] = React.useState<"ADMIN" | "USER" | null>(null)
  const [courses, setCourses] = React.useState<CourseListItem[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard/teacher", { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setRole("ADMIN")
            setCourses(data.courses ?? [])
          }
          return
        }
        // 403 → alumno: usa dashboard/student
        const studentRes = await fetch("/api/dashboard/student", { cache: "no-store" })
        const studentData = await studentRes.json()
        if (studentRes.ok && !cancelled) {
          setRole("USER")
          setCourses((studentData.courses ?? []).map((c: { id: string; name: string; level: string; schedule: string | null; days: string[]; inviteCode: string; joinedAt: string }) => ({
            id: c.id,
            name: c.name,
            level: c.level as CourseListItem["level"],
            schedule: c.schedule,
            days: c.days,
            inviteCode: c.inviteCode,
            status: "active",
            studentCount: 0,
          })))
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

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-5xl pb-16 md:pb-0">
        <SectionHeader
          title="Cursos"
          subtitle={role === "ADMIN" ? "Gestiona tus cursos y códigos de invitación" : "Tus cursos activos"}
        />
        <div className="mb-6 flex justify-end">
          {role === "ADMIN" ? <CreateCourseModal /> : <JoinCourseModal />}
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando cursos…</p>
        ) : courses.length === 0 ? (
          <EmptyState
            title={role === "ADMIN" ? "No tienes cursos todavía" : "No estás en ningún curso"}
            description={role === "ADMIN" ? "Crea tu primer curso para empezar." : "Pídele el código a tu coach para unirte."}
            action={role === "ADMIN" ? <CreateCourseModal /> : <JoinCourseModal />}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        )}
      </div>
      {role && <BottomNav role={role} />}
    </Section>
  )
}