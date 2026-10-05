import { validateSuperAdmin } from "@/lib/auth/admin-guard"
import { AcademyAdminTable } from "@/components/admin/platform/academy-admin-table"

export default async function AdminPlatformAcademiesPage() {
  await validateSuperAdmin()

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Academias</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          CRUD global de academias de la plataforma (solo SUPER_ADMIN).
        </p>
      </div>
      <AcademyAdminTable />
    </main>
  )
}
