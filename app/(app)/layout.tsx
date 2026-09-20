import { validateUser } from "@/lib/auth/admin-guard"
import { HeaderWithNotifications } from "@/components/layout/header-with-notifications"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await validateUser()

  return (
    <div className="min-h-screen">
      <HeaderWithNotifications />
      {children}
    </div>
  )
}
