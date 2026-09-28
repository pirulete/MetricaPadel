import Link from "next/link";
import { Users, Building2, BookOpen, ClipboardList, Shield, Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { validateAdmin } from "@/lib/auth/admin-guard";
import { isSuperAdminRole } from "@/lib/auth/role-utils";
import { getPlatformStats } from "@/lib/db/queries/padel/super-admin";

export default async function AdminPage() {
  const session = await validateAdmin();
  const isSuperAdmin = isSuperAdminRole(session.user.role);

  const stats = isSuperAdmin ? await getPlatformStats() : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-3xl font-bold">Administración</h1>
      <p className="mt-1 text-muted-foreground">
        {isSuperAdmin
          ? "Vista global de la plataforma Métrica Pádel."
          : "Gestión de usuarios y entidades."}
      </p>

      {stats && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Usuarios
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.users.total}</div>
              <p className="text-xs text-muted-foreground">
                {stats.users.active} activos · {stats.users.admins} admins · {stats.users.superAdmins} super admins
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Academias
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.academies.total}</div>
              <p className="text-xs text-muted-foreground">
                {stats.academies.active} activas
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" /> Evaluaciones
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.evaluations.total}</div>
              <p className="text-xs text-muted-foreground">
                {stats.evaluations.published} publicadas
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Cursos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.courses.total}</div>
              <p className="text-xs text-muted-foreground">
                {stats.courses.active} activos
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/users" className="transition-opacity hover:opacity-80">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" aria-hidden /> Usuarios
              </CardTitle>
              <CardDescription>
                Crear, editar, bloquear/desbloquear y promover jugadores.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        {isSuperAdmin && (
          <>
            <Link href="/admin/admins" className="transition-opacity hover:opacity-80">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" aria-hidden /> Admins
                  </CardTitle>
                  <CardDescription>
                    Gestionar roles de administrador. Promover y demotear.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/admin/platform" className="transition-opacity hover:opacity-80">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" aria-hidden /> Plataforma
                  </CardTitle>
                  <CardDescription>
                    Métricas globales, auditoría y configuración de plataforma.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
