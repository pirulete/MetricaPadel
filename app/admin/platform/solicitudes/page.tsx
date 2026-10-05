import { validateSuperAdmin } from "@/lib/auth/admin-guard"
import { AcademyRequestTable } from "@/components/admin/platform/academy-request-table"

export default async function AdminPlatformSolicitudesPage() {
  await validateSuperAdmin()

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Solicitudes de acceso</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aprueba o rechaza solicitudes de coaches (ADMIN) para unirse o crear academias.
        </p>
      </div>
      <AcademyRequestTable />
    </main>
  )
}
