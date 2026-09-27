import { validateSuperAdmin } from "@/lib/auth/admin-guard";
import { listAllAcademies, listAdmins, countActiveSuperAdmins } from "@/lib/db/queries/padel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminPlatformPage() {
  await validateSuperAdmin();

  const [academies, admins, superAdminCount] = await Promise.all([
    listAllAcademies(),
    listAdmins(),
    countActiveSuperAdmins(),
  ]);

  const stats = [
    { label: "Admins (ADMIN + SUPER_ADMIN)", value: admins.length },
    { label: "SUPER_ADMIN activos", value: superAdminCount },
    { label: "Academias", value: academies.length },
    { label: "Academias activas", value: academies.filter((a) => a.status === "active").length },
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Plataforma</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Overview read-only de la plataforma (v0.7). Los settings de mantenimiento se difieren a una iteración posterior.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Conteo global en tiempo real.
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}