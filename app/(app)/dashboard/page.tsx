import { auth } from "@/auth"
import { Section } from "@/components/ui/section"
import { TeacherDashboard } from "@/components/padel/teacher-dashboard"
import { StudentDashboard } from "@/components/padel/student-dashboard"
import { BottomNav } from "@/components/padel/bottom-nav"

/**
 * /dashboard — una sola ruta que ramifica por rol (D5).
 * P01 si ADMIN (coach), A01 si USER (alumno). El layout (app) ya valida sesión.
 */
export default async function DashboardPage() {
  const session = await auth()
  const role = session?.user?.role === "ADMIN" ? "ADMIN" : "USER"

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-5xl pb-16 md:pb-0">
        {role === "ADMIN" ? <TeacherDashboard /> : <StudentDashboard />}
      </div>
      <BottomNav role={role} />
    </Section>
  )
}