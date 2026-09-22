import { auth } from "@/auth"
import { Section } from "@/components/ui/section"
import { TeacherDashboard } from "@/components/padel/teacher-dashboard"
import { StudentDashboard } from "@/components/padel/student-dashboard"
import { BottomNav } from "@/components/padel/bottom-nav"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/**
 * /dashboard — una sola ruta que ramifica por rol (D5).
 * P01 si ADMIN (coach), A01 si USER (alumno). El layout (app) ya valida sesión.
 * TEMPORARY users see a "verify email" banner instead of the full dashboard.
 */
export default async function DashboardPage() {
  const session = await auth()
  const role = session?.user?.role === "ADMIN" ? "ADMIN" : "USER"
  const isTemporary = session?.user?.status === "TEMPORARY"

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-5xl pb-16 md:pb-0">
        {role === "ADMIN" ? (
          <TeacherDashboard />
        ) : isTemporary ? (
          <Card className="p-8 text-center">
            <Badge variant="secondary" className="mb-4">Email pendiente</Badge>
            <h2 className="text-xl font-semibold mb-2">Verificá tu email para empezar</h2>
            <p className="text-muted-foreground">
              Revisa tu casilla de correo y completa la verificación para acceder a tu dashboard, evaluaciones y cursos.
            </p>
          </Card>
        ) : (
          <StudentDashboard />
        )}
      </div>
      <BottomNav role={role} />
    </Section>
  )
}