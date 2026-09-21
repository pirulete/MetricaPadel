import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-3xl font-bold">Administración</h1>
      <p className="mt-1 text-muted-foreground">Gestión de usuarios, entidades y métricas.</p>

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
            <CardContent className="text-sm text-muted-foreground">
              Gestión completa de cuentas de jugadores.
            </CardContent>
          </Card>
        </Link>
      </div>
    </main>
  );
}