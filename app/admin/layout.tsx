import Link from "next/link";
import { validateAdmin } from "@/lib/auth/admin-guard"
import { isSuperAdminRole } from "@/lib/auth/role-utils"

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await validateAdmin()
  const isSuperAdmin = isSuperAdminRole(session.user.role)

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium">Back-office</p>
          <nav aria-label="Navegación admin" className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-muted-foreground transition-colors hover:text-foreground">
              Inicio
            </Link>
            <Link href="/admin/users" className="text-muted-foreground transition-colors hover:text-foreground">
              Usuarios
            </Link>
            {isSuperAdmin && (
              <>
                <Link href="/admin/admins" className="text-muted-foreground transition-colors hover:text-foreground">
                  Admins
                </Link>
                <Link href="/admin/platform" className="text-muted-foreground transition-colors hover:text-foreground">
                  Plataforma
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {children}
    </div>
  )
}