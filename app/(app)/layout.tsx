import { validateUser } from "@/lib/auth/admin-guard"
import { AppLayoutClient } from "@/components/layout/app-layout-client"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await validateUser()
  const role = (session.user.role === "ADMIN" ? "ADMIN" : "USER") as "ADMIN" | "USER"

  return <AppLayoutClient role={role}>{children}</AppLayoutClient>
}
