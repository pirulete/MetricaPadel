import { validateUser } from "@/lib/auth/admin-guard"
import { AppLayoutClient } from "@/components/layout/app-layout-client"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await validateUser()

  if (session.user.status === "TEMPORARY") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card className="w-full max-w-md p-8 text-center">
          <Badge variant="secondary" className="mb-4">Email pendiente</Badge>
          <h2 className="text-xl font-semibold mb-2">Verifica tu email para empezar</h2>
          <p className="text-muted-foreground">
            Revisa tu casilla de correo y completa la verificación para acceder a tu dashboard, evaluaciones y cursos.
          </p>
        </Card>
      </div>
    )
  }

  const role = (session.user.role === "ADMIN" ? "ADMIN" : "USER") as "ADMIN" | "USER"

  return <AppLayoutClient role={role}>{children}</AppLayoutClient>
}
