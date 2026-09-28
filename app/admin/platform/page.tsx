import { Users, Building2, ClipboardList, BookOpen, FileText, Activity } from "lucide-react";
import { validateSuperAdmin } from "@/lib/auth/admin-guard";
import { getPlatformMetrics } from "@/lib/db/queries/padel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ownerName(firstName: string | null, lastName: string | null, email: string | null) {
  const name = [firstName, lastName].filter(Boolean).join(" ");
  return name || email || "—";
}

export default async function AdminPlatformPage() {
  await validateSuperAdmin();

  const metrics = await getPlatformMetrics();

  const summary = [
    {
      label: "Usuarios",
      icon: Users,
      value: metrics.users.total,
      detail: `${metrics.users.active} activos · ${metrics.users.admins} admins · ${metrics.users.superAdmins} super admins`,
    },
    {
      label: "Academias",
      icon: Building2,
      value: metrics.academies.total,
      detail: `${metrics.academies.active} activas`,
    },
    {
      label: "Evaluaciones",
      icon: ClipboardList,
      value: metrics.evaluations.total,
      detail: `${metrics.evaluations.published} publicadas`,
    },
    {
      label: "Cursos",
      icon: BookOpen,
      value: metrics.courses.total,
      detail: `${metrics.courses.active} activos`,
    },
    {
      label: "Rúbricas",
      icon: FileText,
      value: metrics.rubrics.total,
      detail: `${metrics.rubrics.personal} personales · ${metrics.rubrics.institutional} institucionales`,
    },
  ];

  const rubricTotal = metrics.rubrics.total || 1;
  const personalPct = Math.round((metrics.rubrics.personal / rubricTotal) * 100);
  const institutionalPct = Math.round((metrics.rubrics.institutional / rubricTotal) * 100);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Plataforma</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Métricas globales de Métrica Pádel en tiempo real (solo SUPER_ADMIN).
      </p>

      {/* Resumen */}
      <section aria-label="Resumen" className="mt-6">
        <h2 className="text-lg font-semibold">Resumen</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {summary.map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <s.icon className="h-3.5 w-3.5" aria-hidden /> {s.label}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{s.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Rúbricas */}
      <section aria-label="Rúbricas" className="mt-8">
        <h2 className="text-lg font-semibold">Rúbricas</h2>
        <Card className="mt-3">
          <CardHeader>
            <CardDescription>Distribución por scope</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>Personales</span>
                <span className="text-muted-foreground">
                  {metrics.rubrics.personal} ({personalPct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${personalPct}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>Institucionales</span>
                <span className="text-muted-foreground">
                  {metrics.rubrics.institutional} ({institutionalPct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${institutionalPct}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Actividad reciente */}
      <section aria-label="Actividad reciente" className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Activity className="h-4 w-4" aria-hidden /> Actividad reciente
        </h2>
        <Card className="mt-3">
          <CardContent className="p-0">
            {metrics.recentActivity.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Sin actividad registrada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Entidad</TableHead>
                    <TableHead className="text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.recentActivity.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {ownerName(log.userFirstName, log.userLastName, log.userEmail)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.actionType}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {log.entityName}
                        {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Academias */}
      <section aria-label="Academias" className="mt-8">
        <h2 className="text-lg font-semibold">Academias</h2>
        <Card className="mt-3">
          <CardContent className="p-0">
            {metrics.academyBreakdown.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Sin academias registradas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Academia</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Miembros</TableHead>
                    <TableHead className="text-right">Evaluaciones</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.academyBreakdown.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {ownerName(a.ownerFirstName, a.ownerLastName, a.ownerEmail)}
                      </TableCell>
                      <TableCell className="text-right">{a.memberCount}</TableCell>
                      <TableCell className="text-right">{a.evaluationCount}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === "active" ? "default" : "outline"}>
                          {a.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}