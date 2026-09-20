"use client";

import { useState, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  Filter,
  Home,
  LayoutGrid,
  Plus,
  Search,
  Target,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PreviewShell, type PreviewScreen } from "./preview-shell";

/* ------------------------------------------------------------------ */
/* Datos mock realistas de pádel                                       */
/* ------------------------------------------------------------------ */

const COURSES = [
  { name: "Iniciación Lunes", students: 12, day: "Lun · 18:00", next: "Hoy 18:00" },
  { name: "Intermedio Miércoles", students: 8, day: "Mié · 19:30", next: "Mié 19:30" },
  { name: "Competición Sábado", students: 4, day: "Sáb · 10:00", next: "Sáb 10:00" },
];

const STUDENTS = [
  { name: "Lucía Fernández", level: "Iniciación" },
  { name: "Marcos Gil", level: "Iniciación" },
  { name: "Ana Torres", level: "Intermedio" },
  { name: "Diego Martín", level: "Intermedio" },
  { name: "Paula Vega", level: "Competición" },
  { name: "Sergio Ortiz", level: "Competición" },
];

const RUBRICS = [
  { title: "Nivel Inicial", category: "Técnica", criteria: 4 },
  { title: "Saque y Resto", category: "Técnica", criteria: 3 },
  { title: "Competición Avanzada", category: "Táctica", criteria: 5 },
];

const HISTORY = [
  {
    student: "Lucía Fernández",
    rubric: "Nivel Inicial",
    course: "Iniciación Lunes",
    date: "18 sep 2026",
    score: "13/16",
    level: "Bueno",
  },
  {
    student: "Marcos Gil",
    rubric: "Saque y Resto",
    course: "Iniciación Lunes",
    date: "16 sep 2026",
    score: "9/12",
    level: "Bueno",
  },
  {
    student: "Ana Torres",
    rubric: "Competición Avanzada",
    course: "Intermedio Miércoles",
    date: "14 sep 2026",
    score: "15/20",
    level: "Excelente",
  },
  {
    student: "Diego Martín",
    rubric: "Nivel Inicial",
    course: "Intermedio Miércoles",
    date: "11 sep 2026",
    score: "8/16",
    level: "Aceptable",
  },
  {
    student: "Paula Vega",
    rubric: "Competición Avanzada",
    course: "Competición Sábado",
    date: "09 sep 2026",
    score: "18/20",
    level: "Excelente",
  },
];

const NOTIFICATIONS = [
  {
    title: "Nueva evaluación publicada",
    body: "Carlos Ruiz publicó tu evaluación de Nivel Inicial",
    time: "hace 2 h",
    unread: true,
  },
  {
    title: "Clase mañana",
    body: "Iniciación Lunes · 18:00 en Pista 3",
    time: "hace 1 d",
    unread: false,
  },
];

type MockState = "default" | "loading" | "empty";

/* ------------------------------------------------------------------ */
/* Toolbar de estado + Skeleton + BottomNav                            */
/* ------------------------------------------------------------------ */

function StateBar({
  state,
  onChange,
}: {
  state: MockState;
  onChange: (s: MockState) => void;
}) {
  const options: { id: MockState; label: string }[] = [
    { id: "default", label: "Default" },
    { id: "loading", label: "Loading" },
    { id: "empty", label: "Empty" },
  ];
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Estado del mockup">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            state === o.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          )}
          aria-pressed={state === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

function BottomNav({ active }: { active: string }) {
  const items = [
    { id: "home", label: "Inicio", icon: Home },
    { id: "cursos", label: "Cursos", icon: LayoutGrid },
    { id: "historial", label: "Historial", icon: ClipboardList },
    { id: "perfil", label: "Perfil", icon: User },
  ];
  return (
    <nav
      className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur"
      aria-label="Navegación principal"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={cn(
              "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
              active === it.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            aria-current={active === it.id ? "page" : undefined}
          >
            <it.icon className="size-5" />
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/* Marco de modal simulado (backdrop + card centrada) */
function ModalFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-xl bg-muted/50 p-4">
      <div className="overflow-hidden rounded-xl border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Cerrar modal">
            <X className="size-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* P01 — Home Profesor                                                 */
/* ------------------------------------------------------------------ */

function HomeProfesorScreen({ state }: { state: MockState }) {
  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-md space-y-3">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Viernes 20 sep</p>
          <h2 className="text-lg font-semibold">Hola, Carlos 👋</h2>
          <p className="text-xs text-muted-foreground">Tienes 2 clases hoy</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="size-9" aria-label="Notificaciones">
            <Bell className="size-4" />
          </Button>
          <div className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            CR
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="mx-auto size-4 text-primary" aria-hidden />
            <p className="mt-1 text-lg font-bold">24</p>
            <p className="text-[10px] text-muted-foreground">Alumnos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <ClipboardList className="mx-auto size-4 text-primary" aria-hidden />
            <p className="mt-1 text-lg font-bold">38</p>
            <p className="text-[10px] text-muted-foreground">Evaluaciones</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="mx-auto size-4 text-primary" aria-hidden />
            <p className="mt-1 text-lg font-bold">7.8</p>
            <p className="text-[10px] text-muted-foreground">Promedio</p>
          </CardContent>
        </Card>
      </div>

      {/* CTA evaluar */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Target className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Evaluar ahora</p>
            <p className="text-xs text-muted-foreground">
              Elige un alumno y registra su nivel
            </p>
          </div>
          <Button size="sm" aria-label="Empezar evaluación">
            <Plus className="size-4" />
            Evaluar
          </Button>
        </CardContent>
      </Card>

      {/* Cursos */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Mis cursos</h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            Ver todos
          </Button>
        </div>
        {state === "empty" ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
              <LayoutGrid className="size-8 text-muted-foreground" />
              <p className="text-sm font-semibold">Aún no tienes cursos</p>
              <p className="text-xs text-muted-foreground">
                Crea tu primer curso para empezar a evaluar alumnos.
              </p>
              <Button size="sm" className="mt-1">
                <Plus className="size-4" />
                Crear curso
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {COURSES.map((c) => (
              <Card key={c.name}>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Calendar className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.students} alumnos · {c.day}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {c.next}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="home" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A01 — Home Alumno                                                   */
/* ------------------------------------------------------------------ */

function HomeAlumnoScreen({ state }: { state: MockState }) {
  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-md space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Viernes 20 sep</p>
          <h2 className="text-lg font-semibold">Hola, Lucía 👋</h2>
          <p className="text-xs text-muted-foreground">Nivel · Iniciación</p>
        </div>
        <div className="relative">
          <Button variant="outline" size="icon" className="size-9" aria-label="Notificaciones">
            <Bell className="size-4" />
          </Button>
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
            2
          </span>
        </div>
      </div>

      {/* CTA unirse */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <Plus className="size-4 text-primary" aria-hidden />
            <p className="text-sm font-semibold">Únete a un curso</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Pide el código a tu profesor y empieza a recibir evaluaciones.
          </p>
          <div className="flex gap-2">
            <Input
              className="h-9 text-sm uppercase tracking-widest"
              placeholder="PAD-XXXX"
              aria-label="Código del curso"
            />
            <Button className="h-9 shrink-0">Unirme</Button>
          </div>
        </CardContent>
      </Card>

      {/* Notificaciones */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Notificaciones</h3>
        {state === "empty" ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
              <Bell className="size-8 text-muted-foreground" />
              <p className="text-sm font-semibold">Sin notificaciones</p>
              <p className="text-xs text-muted-foreground">
                Cuando tu profesor publique algo, lo verás aquí.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {NOTIFICATIONS.map((n) => (
              <Card key={n.title}>
                <CardContent className="flex items-start gap-3 p-3">
                  <div
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      n.unread ? "bg-primary" : "bg-muted-foreground/40"
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{n.time}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Mis cursos */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Mis cursos</h3>
        {state === "empty" ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
              <LayoutGrid className="size-8 text-muted-foreground" />
              <p className="text-sm font-semibold">No estás en ningún curso</p>
              <p className="text-xs text-muted-foreground">
                Únete con el código que te comparta tu profesor.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Calendar className="size-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Iniciación Lunes</p>
                <p className="text-xs text-muted-foreground">
                  Prof. Carlos Ruiz · Lun 18:00 · Pista 3
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </CardContent>
          </Card>
        )}
      </div>

      <BottomNav active="home" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* P06 — Modal Crear Curso                                             */
/* ------------------------------------------------------------------ */

function CrearCursoScreen({ state }: { state: MockState }) {
  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-md space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  return (
    <ModalFrame title="Crear curso">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="course-name">Nombre del curso</Label>
          <Input id="course-name" defaultValue="Iniciación Lunes" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="course-level">Nivel</Label>
            <Select defaultValue="iniciacion">
              <SelectTrigger id="course-level">
                <SelectValue placeholder="Nivel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="iniciacion">Iniciación</SelectItem>
                <SelectItem value="intermedio">Intermedio</SelectItem>
                <SelectItem value="avanzado">Avanzado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-time">Horario</Label>
            <Input id="course-time" defaultValue="18:00" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Días de clase</Label>
          <div className="flex gap-1.5" role="group" aria-label="Días de clase">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
              <button
                key={d}
                type="button"
                className={cn(
                  "flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors",
                  d === "Lun"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={d === "Lun"}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Código invite */}
        <div className="space-y-1.5">
          <Label htmlFor="invite-code">Código de invitación</Label>
          <div className="flex gap-2">
            <Input
              id="invite-code"
              className="text-center font-mono text-sm tracking-[0.2em]"
              defaultValue="PAD-7K2M"
              readOnly
            />
            <Button variant="outline" size="icon" className="size-9 shrink-0" aria-label="Copiar código">
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Comparte este código para que tus alumnos se unan al curso.
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1">
            Cancelar
          </Button>
          <Button className="flex-1">
            <Check className="size-4" />
            Crear curso
          </Button>
        </div>
      </div>
    </ModalFrame>
  );
}

/* ------------------------------------------------------------------ */
/* P08 — Modal Asignar Rúbrica                                         */
/* ------------------------------------------------------------------ */

function AsignarRubricaScreen({ state }: { state: MockState }) {
  const [selectedRubric, setSelectedRubric] = useState(0);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([0, 1]);

  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-md space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  const toggleStudent = (i: number) =>
    setSelectedStudents((s) =>
      s.includes(i) ? s.filter((x) => x !== i) : [...s, i]
    );

  return (
    <ModalFrame title="Asignar rúbrica">
      <div className="space-y-4">
        {/* Paso 1: rúbrica */}
        <div className="space-y-1.5">
          <Label>1. Elige la rúbrica</Label>
          <div className="space-y-1.5" role="radiogroup" aria-label="Rúbrica a asignar">
            {RUBRICS.map((r, i) => {
              const isSel = selectedRubric === i;
              return (
                <button
                  key={r.title}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  onClick={() => setSelectedRubric(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    isSel
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/50"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border",
                      isSel ? "border-primary bg-primary" : "border-muted-foreground/50"
                    )}
                    aria-hidden
                  >
                    {isSel && <Check className="size-3 text-primary-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.category} · {r.criteria} criterios
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Paso 2: alumnos */}
        <div className="space-y-1.5">
          <Label>2. Selecciona alumnos</Label>
          {state === "empty" ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
                <Users className="size-8 text-muted-foreground" />
                <p className="text-sm font-semibold">Este curso no tiene alumnos</p>
                <p className="text-xs text-muted-foreground">
                  Añade alumnos al curso antes de asignar una rúbrica.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {STUDENTS.map((s, i) => {
                const isSel = selectedStudents.includes(i);
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => toggleStudent(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                      isSel
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/50"
                    )}
                    aria-pressed={isSel}
                  >
                    <div
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        isSel ? "border-primary bg-primary" : "border-muted-foreground/50"
                      )}
                      aria-hidden
                    >
                      {isSel && <Check className="size-3 text-primary-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {s.level}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1">
            Cancelar
          </Button>
          <Button className="flex-1" disabled={state === "empty"}>
            Asignar a {selectedStudents.length} alumnos
          </Button>
        </div>
      </div>
    </ModalFrame>
  );
}

/* ------------------------------------------------------------------ */
/* P10 — Historial                                                     */
/* ------------------------------------------------------------------ */

function HistorialScreen({ state }: { state: MockState }) {
  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Historial de evaluaciones</h2>
          <p className="text-xs text-muted-foreground">
            {HISTORY.length} evaluaciones publicadas
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Filter className="size-4" />
          Filtros
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs defaultValue="todos" className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="mes">Este mes</TabsTrigger>
            <TabsTrigger value="curso">Por curso</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-8" placeholder="Buscar alumno…" aria-label="Buscar alumno" />
        </div>
      </div>

      {/* Lista */}
      {state === "empty" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <BookOpen className="size-10 text-muted-foreground" />
            <p className="text-sm font-semibold">No hay evaluaciones todavía</p>
            <p className="text-xs text-muted-foreground">
              Las evaluaciones que publiques aparecerán aquí con su puntaje y fecha.
            </p>
            <Button size="sm">
              <Target className="size-4" />
              Evaluar ahora
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {HISTORY.map((h) => (
            <Card key={`${h.student}-${h.date}`}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                  {h.student
                    .split(" ")
                    .map((w) => w[0])
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{h.student}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {h.rubric} · {h.course} · {h.date}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge
                    className={cn(
                      h.level === "Excelente"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {h.score}
                  </Badge>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{h.level}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Export: mockup navegable Etapa 3                                    */
/* ------------------------------------------------------------------ */

export default function Etapa3DashboardManagement() {
  const [state, setState] = useState<MockState>("default");

  const screens: PreviewScreen[] = [
    { id: "p01", label: "P01 Home Prof", node: <HomeProfesorScreen state={state} /> },
    { id: "a01", label: "A01 Home Alumno", node: <HomeAlumnoScreen state={state} /> },
    { id: "p06", label: "P06 Crear Curso", node: <CrearCursoScreen state={state} /> },
    { id: "p08", label: "P08 Asignar", node: <AsignarRubricaScreen state={state} /> },
    { id: "p10", label: "P10 Historial", node: <HistorialScreen state={state} /> },
  ];

  return (
    <PreviewShell
      title="Etapa 3 · Dashboard y Management"
      screens={screens}
      toolbar={<StateBar state={state} onChange={setState} />}
    />
  );
}