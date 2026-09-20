"use client";

import { useState } from "react";
import {
  Award,
  BookOpen,
  Copy,
  Loader2,
  Sparkles,
  Target,
  Trophy,
  WifiOff,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PreviewShell, type PreviewScreen } from "./preview-shell";

/* ------------------------------------------------------------------ */
/* Datos mock: plantillas predefinidas                                 */
/* ------------------------------------------------------------------ */

const TEMPLATES = [
  {
    title: "Nivel Inicial",
    category: "Técnica",
    criteria: 4,
    levels: 4,
    desc: "Saque, bandeja, víbora y posicionamiento para alumnos que empiezan.",
    icon: Target,
  },
  {
    title: "Saque y Resto",
    category: "Técnica",
    criteria: 3,
    levels: 4,
    desc: "Enfoque específico en saque, resto y devolución con control de errores.",
    icon: Zap,
  },
  {
    title: "Competición Avanzada",
    category: "Táctica",
    criteria: 5,
    levels: 4,
    desc: "Toma de decisiones, presión en red y juego por parejas en partido.",
    icon: Trophy,
  },
];

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
/* P04 — Templates (rúbricas predefinidas)                             */
/* ------------------------------------------------------------------ */

function TemplatesScreen({ state }: { state: MockState }) {
  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">Plantillas de rúbricas</h2>
        <p className="text-xs text-muted-foreground">
          Empieza con una plantilla validada y adáptala a tu curso.
        </p>
      </div>

      {state === "empty" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <BookOpen className="size-10 text-muted-foreground" />
            <p className="text-sm font-semibold">No hay plantillas disponibles</p>
            <p className="text-xs text-muted-foreground">
              Vuelve más tarde o crea tu propia rúbrica desde cero.
            </p>
            <Button size="sm">Crear rúbrica propia</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <Card key={t.title} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <t.icon className="size-5" aria-hidden />
                  </div>
                  <Badge variant="secondary">{t.category}</Badge>
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">{t.criteria} criterios</Badge>
                  <Badge variant="outline">{t.levels} niveles</Badge>
                </div>
                <Button size="sm" className="mt-auto w-full">
                  <Copy className="size-3.5" />
                  Usar plantilla
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SCR-01 — Splash (bienvenida / marca)                                */
/* ------------------------------------------------------------------ */

function SplashScreen({ state }: { state: MockState }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col items-center justify-center gap-6 px-4 text-center">
      {/* Logo */}
      <div className="flex size-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg">
        <Target className="size-10" aria-hidden />
      </div>

      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">PadelPro</h1>
        <p className="text-sm text-muted-foreground">
          Evaluaciones de pádel para profesores y alumnos
        </p>
      </div>

      {state === "loading" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Cargando…
        </div>
      ) : state === "empty" ? (
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-3 p-6">
            <WifiOff className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">Sin conexión</p>
            <p className="text-xs text-muted-foreground">
              Comprueba tu conexión e inténtalo de nuevo.
            </p>
            <Button size="sm" variant="outline" className="w-full">
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="w-full space-y-3">
          <Button className="w-full" size="lg">
            <Sparkles className="size-4" />
            Comenzar
          </Button>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Award className="size-3.5" aria-hidden />
            <span>Rúbricas validadas por entrenadores WPT</span>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">v0.1 · MVP</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Export: mockup navegable Etapa 4                                    */
/* ------------------------------------------------------------------ */

export default function Etapa4TemplatesPolish() {
  const [state, setState] = useState<MockState>("default");

  const screens: PreviewScreen[] = [
    { id: "p04", label: "P04 Templates", node: <TemplatesScreen state={state} /> },
    { id: "scr01", label: "SCR-01 Splash", node: <SplashScreen state={state} /> },
  ];

  return (
    <PreviewShell
      title="Etapa 4 · Templates y Polish"
      screens={screens}
      toolbar={<StateBar state={state} onChange={setState} />}
    />
  );
}