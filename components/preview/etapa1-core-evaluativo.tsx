"use client";

import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  GripVertical,
  MoreHorizontal,
  Plus,
  Send,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PreviewShell, type PreviewScreen } from "./preview-shell";

/* ------------------------------------------------------------------ */
/* Datos mock realistas de pádel                                       */
/* ------------------------------------------------------------------ */

const LEVELS = [
  { name: "Excelente", score: 4 },
  { name: "Bueno", score: 3 },
  { name: "Aceptable", score: 2 },
  { name: "En desarrollo", score: 1 },
] as const;

type Criterion = {
  name: string;
  selected: number; // índice en LEVELS
  descriptors: string[];
};

const CRITERIA: Criterion[] = [
  {
    name: "Saque",
    selected: 0,
    descriptors: [
      "Saque con efecto y colocación constante, gana puntos directos",
      "Saque sólido con buena dirección, pocos errores",
      "Saque correcto pero sin profundidad constante",
      "Saque inconsistente, dobles faltas frecuentes",
    ],
  },
  {
    name: "Bandeja",
    selected: 1,
    descriptors: [
      "Bandeja profunda y precisa, neutraliza al rival",
      "Bandeja correcta con buena altura",
      "Bandeja con altura irregular",
      "Bandeja corta, deja la red al rival",
    ],
  },
  {
    name: "Víbora",
    selected: 1,
    descriptors: [
      "Víbora con efecto y ángulo, define puntos",
      "Víbora efectiva en salida de pared",
      "Víbora con poco efecto",
      "Víbora sin control, errores no forzados",
    ],
  },
  {
    name: "Posicionamiento",
    selected: 1,
    descriptors: [
      "Anticipación perfecta, siempre en red",
      "Buen posicionamiento en la red",
      "Posicionamiento correcto en el fondo",
      "Fuera de posición, pierde la red",
    ],
  },
];

const MAX_SCORE = CRITERIA.length * 4; // 16
const TOTAL_SCORE = CRITERIA.reduce((acc, c) => acc + LEVELS[c.selected].score, 0); // 13

type MockState = "default" | "loading" | "empty";

/* ------------------------------------------------------------------ */
/* Toolbar de estado + Skeleton                                        */
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

/* ------------------------------------------------------------------ */
/* P09 — Evaluar Alumno (canvas)                                       */
/* ------------------------------------------------------------------ */

function EvaluarScreen({ state }: { state: MockState }) {
  const [selected, setSelected] = useState<number[]>(CRITERIA.map((c) => c.selected));
  const [openNotes, setOpenNotes] = useState<Record<number, boolean>>({});

  const liveScore = selected.reduce((acc, idx) => acc + LEVELS[idx].score, 0);

  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-md space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Sticky header: alumno + rúbrica + score en vivo */}
      <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8" aria-label="Volver">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Lucía Fernández</p>
            <p className="truncate text-xs text-muted-foreground">
              Rúbrica · Nivel Inicial — Curso Iniciación Lunes
            </p>
          </div>
          <Badge className="shrink-0 bg-primary text-primary-foreground">
            {liveScore}/{MAX_SCORE} pts
          </Badge>
        </div>
      </div>

      {/* Criterios con selector de nivel */}
      <div className="space-y-3 px-4 py-4">
        {CRITERIA.map((c, i) => (
          <Card key={c.name}>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {i + 1}. {c.name}
                </p>
                <button
                  type="button"
                  onClick={() => setOpenNotes((n) => ({ ...n, [i]: !n[i] }))}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors",
                    openNotes[i]
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-expanded={!!openNotes[i]}
                >
                  <StickyNote className="size-3.5" />
                  Nota
                </button>
              </div>

              <div
                className="grid grid-cols-4 gap-1.5"
                role="radiogroup"
                aria-label={`Nivel de ${c.name}`}
              >
                {LEVELS.map((lvl, li) => {
                  const isSel = selected[i] === li;
                  return (
                    <button
                      key={lvl.name}
                      type="button"
                      role="radio"
                      aria-checked={isSel}
                      onClick={() =>
                        setSelected((s) => s.map((v, vi) => (vi === i ? li : v)))
                      }
                      className={cn(
                        "relative rounded-lg border p-2 text-left transition-colors",
                        isSel
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:border-primary/50"
                      )}
                    >
                      {isSel && <Check className="absolute right-1 top-1 size-3" />}
                      <p className="text-[11px] font-semibold leading-tight">{lvl.name}</p>
                      <p
                        className={cn(
                          "text-[10px]",
                          isSel ? "text-primary-foreground/80" : "text-muted-foreground"
                        )}
                      >
                        {lvl.score} pts
                      </p>
                    </button>
                  );
                })}
              </div>

              {openNotes[i] && (
                <Textarea
                  className="h-16 text-xs"
                  placeholder={`Comentario sobre ${c.name}…`}
                  aria-label={`Comentario de ${c.name}`}
                />
              )}
            </CardContent>
          </Card>
        ))}

        {/* Comentario global */}
        <Card>
          <CardContent className="space-y-1.5 p-3">
            <Label htmlFor="global-comment" className="text-xs font-semibold">
              Comentario global
            </Label>
            <Textarea
              id="global-comment"
              className="min-h-20 text-sm"
              placeholder="Resumen de la evaluación, próximos objetivos…"
            />
          </CardContent>
        </Card>
      </div>

      {/* Barra inferior: Guardar Borrador + Publicar */}
      <div className="sticky bottom-0 z-10 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="outline" className="flex-1">
          Guardar Borrador
        </Button>
        <Button className="flex-1">
          <Send className="size-4" />
          Publicar
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* P03 — Editor Rúbrica                                                */
/* ------------------------------------------------------------------ */

function EditorScreen({ state }: { state: MockState }) {
  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Nueva rúbrica</h2>
          <p className="text-xs text-muted-foreground">
            Define niveles y descriptores por criterio
          </p>
        </div>
        <Badge variant="secondary">Borrador</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rubric-title">Título</Label>
          <Input id="rubric-title" defaultValue="Nivel Inicial" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rubric-category">Categoría</Label>
          <Select defaultValue="tecnica">
            <SelectTrigger id="rubric-category">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tecnica">Técnica</SelectItem>
              <SelectItem value="tactica">Táctica</SelectItem>
              <SelectItem value="fisica">Física</SelectItem>
              <SelectItem value="actitud">Actitud</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Niveles horizontales */}
      <div className="space-y-1.5">
        <Label>Niveles de puntuación</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LEVELS.map((lvl) => (
            <div
              key={lvl.name}
              className={cn(
                "rounded-lg border p-2.5",
                lvl.score === 4 ? "border-primary bg-primary/5" : "border-border bg-card"
              )}
            >
              <p className="text-xs font-semibold">{lvl.name}</p>
              <p className="text-[10px] text-muted-foreground">{lvl.score} pts</p>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Criterios con matriz de descriptores */}
      <div className="space-y-3">
        {CRITERIA.slice(0, 3).map((c, i) => (
          <Card key={c.name}>
            <CardHeader className="flex-row items-center gap-2 space-y-0 p-3">
              <GripVertical className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle className="flex-1 text-sm">{c.name}</CardTitle>
              <Badge variant="secondary">Criterio {i + 1}</Badge>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="overflow-x-auto">
                <div className="grid min-w-[560px] grid-cols-4 gap-1.5">
                  {LEVELS.map((lvl, li) => (
                    <div key={lvl.name} className="rounded-md border bg-muted/40 p-2">
                      <p className="text-[10px] font-semibold">
                        {lvl.name} · {lvl.score} pts
                      </p>
                      <Textarea
                        className="mt-1 h-16 text-xs"
                        defaultValue={c.descriptors[li]}
                        aria-label={`Descriptor ${lvl.name} de ${c.name}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button variant="outline" className="w-full border-dashed">
        <Plus className="size-4" />
        Añadir Criterio
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A03 — Detalle Evaluación (alumno, read-only)                        */
/* ------------------------------------------------------------------ */

function DetalleScreen({ state }: { state: MockState }) {
  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-md space-y-3">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <BookOpen className="size-10 text-muted-foreground" />
            <p className="text-sm font-semibold">Aún no tienes evaluaciones</p>
            <p className="text-xs text-muted-foreground">
              Cuando tu profesor publique una evaluación, aparecerá aquí con tu puntaje y
              comentarios.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      {/* Hero card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Evaluación · Nivel Inicial</p>
              <p className="text-sm font-semibold">Lucía Fernández</p>
              <p className="text-xs text-muted-foreground">
                Curso Iniciación Lunes · 18 sep 2026
              </p>
            </div>
            <Badge>Publicada</Badge>
          </div>
          <div className="flex items-end gap-3">
            <p className="text-4xl font-bold text-primary">
              {TOTAL_SCORE}
              <span className="text-base font-medium text-muted-foreground">/{MAX_SCORE}</span>
            </p>
            <div className="flex-1 space-y-1 pb-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(TOTAL_SCORE / MAX_SCORE) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Muy buen nivel general</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comentario del profesor */}
      <Card>
        <CardContent className="space-y-1.5 p-4">
          <p className="text-xs font-semibold text-muted-foreground">Comentario del profesor</p>
          <p className="text-sm">
            Gran evolución en el saque y la bandeja. Sigue trabajando la víbora en salida de
            pared y la anticipación en la red. ¡Muy buen partido hoy!
          </p>
        </CardContent>
      </Card>

      {/* Desglose por criterio */}
      {CRITERIA.map((c, i) => (
        <Card key={c.name}>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{c.name}</p>
              <Badge
                className={cn(
                  i === 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                {LEVELS[c.selected].name} · {LEVELS[c.selected].score} pts
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{c.descriptors[c.selected]}</p>
          </CardContent>
        </Card>
      ))}

      <Button className="w-full">
        <Check className="size-4" />
        Marcar como leído
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* P02 — Biblioteca Rúbricas                                           */
/* ------------------------------------------------------------------ */

const RUBRICS = [
  {
    title: "Nivel Inicial",
    category: "Técnica",
    criteria: 4,
    levels: 4,
    status: "Activa",
  },
  {
    title: "Saque y Resto",
    category: "Técnica",
    criteria: 3,
    levels: 4,
    status: "Activa",
  },
  {
    title: "Competición Avanzada",
    category: "Táctica",
    criteria: 5,
    levels: 4,
    status: "Activa",
  },
] as const;

function BibliotecaScreen({ state }: { state: MockState }) {
  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Biblioteca de rúbricas</h2>
          <p className="text-xs text-muted-foreground">
            {RUBRICS.length} activas · 1 archivada
          </p>
        </div>
        <Button size="sm">
          <Plus className="size-4" />
          Nueva Rúbrica
        </Button>
      </div>

      <Tabs defaultValue="activas">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="activas">Activas</TabsTrigger>
          <TabsTrigger value="archivadas">Archivadas</TabsTrigger>
        </TabsList>

        <TabsContent value="activas" className="space-y-2 pt-3">
          {state === "empty" ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <BookOpen className="size-10 text-muted-foreground" />
                <p className="text-sm font-semibold">No hay rúbricas todavía</p>
                <p className="text-xs text-muted-foreground">
                  Crea tu primera rúbrica o usa una plantilla para empezar a evaluar.
                </p>
                <Button size="sm">
                  <Plus className="size-4" />
                  Crear primera rúbrica
                </Button>
              </CardContent>
            </Card>
          ) : (
            RUBRICS.map((r) => (
              <Card key={r.title}>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{r.title}</p>
                      <Badge className="shrink-0 bg-primary text-primary-foreground">
                        {r.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.category} · {r.criteria} criterios · {r.levels} niveles
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Menú de ${r.title}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="archivadas" className="space-y-2 pt-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">Clase Junior</p>
                  <Badge variant="secondary">Archivada</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Actitud · 3 criterios · 4 niveles
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Menú de Clase Junior">
                <MoreHorizontal className="size-4" />
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Export: mockup navegable Etapa 1                                    */
/* ------------------------------------------------------------------ */

export default function Etapa1CoreEvaluativo() {
  const [state, setState] = useState<MockState>("default");

  const screens: PreviewScreen[] = [
    { id: "p09", label: "P09 Evaluar", node: <EvaluarScreen state={state} /> },
    { id: "p03", label: "P03 Editor", node: <EditorScreen state={state} /> },
    { id: "a03", label: "A03 Detalle", node: <DetalleScreen state={state} /> },
    { id: "p02", label: "P02 Biblioteca", node: <BibliotecaScreen state={state} /> },
  ];

  return (
    <PreviewShell
      title="Etapa 1 · Core Evaluativo"
      screens={screens}
      toolbar={<StateBar state={state} onChange={setState} />}
    />
  );
}