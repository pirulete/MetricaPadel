"use client";

/**
 * Mockup efímero — Fix del Editor de Transiciones (coach).
 * change_id: 2026-11-03-fix-problems · se elimina al implementar.
 *
 * Cubre: FAB A3 en el dashboard (entry point), strip de flujo 1→5 + hint
 * contextual (onboarding O1) y los estados vacío / sin selección / seleccionado
 * / guardado del editor. Reproduce el patrón de `etapa3-dashboard-management.tsx`.
 */

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Bell,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  History,
  Home,
  LayoutGrid,
  Play,
  Plus,
  Redo2,
  Route,
  Shield,
  Target,
  Trash2,
  Undo2,
  User,
  Users,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/padel/empty-state";
import { COURT_COLORS } from "@/components/court/CourtLayers";
import { cn } from "@/lib/utils";
import { PreviewShell, type PreviewScreen } from "./preview-shell";

type EditorState = "empty" | "default" | "selected" | "saved";

/* ------------------------------------------------------------------ */
/* Primitivas del mockup                                               */
/* ------------------------------------------------------------------ */

/** Marco de dispositivo: 375 px de ancho, alto mínimo 667 px. */
function Phone({
  children,
  nav = false,
  label,
}: {
  children: React.ReactNode;
  nav?: boolean;
  label: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[375px]">
      <div
        className="relative flex min-h-[667px] w-full flex-col overflow-hidden rounded-2xl border bg-background shadow-sm"
        role="group"
        aria-label={label}
      >
        <div className="flex-1">{children}</div>
        {nav && <MiniBottomNav active="dashboard" />}
      </div>
    </div>
  );
}

function MiniBottomNav({ active }: { active: string }) {
  const items = [
    { id: "dashboard", label: "Inicio", icon: Home },
    { id: "cursos", label: "Cursos", icon: BookOpen },
    { id: "academias", label: "Academias", icon: Building2 },
    { id: "evaluar", label: "Evaluar", icon: ClipboardList },
    { id: "historial", label: "Historial", icon: History },
    { id: "admin", label: "Admin", icon: Shield },
    { id: "settings", label: "Perfil", icon: User },
  ];
  return (
    <nav
      className="border-t bg-background/95 backdrop-blur"
      aria-label="Navegación principal"
    >
      <div className="grid grid-cols-7">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[9px] font-medium transition-colors",
              active === it.id ? "text-primary" : "text-muted-foreground"
            )}
            aria-current={active === it.id ? "page" : undefined}
          >
            <it.icon className="size-[18px]" />
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** FAB A3 — 56 px, esquina inferior derecha, sobre el bottom-nav. */
function Fab({ extended = false, novelty = false }: { extended?: boolean; novelty?: boolean }) {
  return (
    <div className="absolute bottom-[4.75rem] right-4 z-40">
      <button
        type="button"
        aria-label="Crear transición"
        className={cn(
          "relative inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg ring-primary/20 shadow-primary/30 transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          extended ? "px-5" : "w-14"
        )}
      >
        <Route className="size-6" aria-hidden />
        {extended && <span className="text-sm font-semibold">Nueva transición</span>}
        {novelty && (
          <span
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-destructive ring-2 ring-background"
            aria-label="Novedad"
          />
        )}
      </button>
    </div>
  );
}

/** Strip de flujo 1→5 (onboarding O1). */
const FLOW = [
  { n: 1, label: "Paso", hint: "añade una foto" },
  { n: 2, label: "Mueve", hint: "coloca jugadores" },
  { n: 3, label: "Tiro", hint: "dirige el golpe" },
  { n: 4, label: "Prueba", hint: "vista previa" },
  { n: 5, label: "Guarda", hint: "en tu biblioteca" },
] as const;

function FlowStrip({ current }: { current: number }) {
  return (
    <div className="border-b bg-card/60 px-2 py-1.5">
      <ol className="flex items-center gap-1" aria-label="Pasos para crear una transición">
        {FLOW.map((step, index) => {
          const done = step.n < current;
          const active = step.n === current;
          return (
            <li key={step.n} className="flex min-w-0 flex-1 items-center gap-1">
              <div
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1",
                  active && "bg-primary/10"
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-2.5" /> : step.n}
                </span>
                <span
                  className={cn(
                    "truncate text-[10px] font-medium",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < FLOW.length - 1 && (
                <span className="h-px w-1 shrink-0 bg-border" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-0.5 truncate px-1 text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          {current}. {FLOW[current - 1]?.label}
        </span>{" "}
        · {FLOW[current - 1]?.hint}
      </p>
    </div>
  );
}

/** Cancha estática en SVG (sin Konva) con jugadores, tiro y manija del arco. */
function CourtMock({
  selected,
  withShot = true,
}: {
  selected?: "A" | "B" | "C" | "D" | null;
  withShot?: boolean;
}) {
  const players: { id: "A" | "B" | "C" | "D"; x: number; y: number }[] = [
    { id: "A", x: 60, y: 300 },
    { id: "B", x: 140, y: 320 },
    { id: "C", x: 62, y: 100 },
    { id: "D", x: 142, y: 78 },
  ];

  return (
    <div className="flex justify-center">
      <div
        className="relative aspect-[1/2] w-full max-w-[230px] overflow-hidden rounded-xl border shadow-sm"
        role="img"
        aria-label="Cancha de pádel con cuatro jugadores y un tiro curvo"
      >
        <svg viewBox="0 0 200 400" className="h-full w-full" aria-hidden>
          {/* piso */}
          <rect x="0" y="0" width="200" height="400" fill={COURT_COLORS.floor} />
          {/* paredes */}
          <rect
            x="6"
            y="6"
            width="188"
            height="388"
            fill="none"
            stroke={COURT_COLORS.line}
            strokeOpacity="0.85"
            strokeWidth="2"
          />
          {/* líneas de servicio */}
          <line x1="6" y1="120" x2="194" y2="120" stroke={COURT_COLORS.line} strokeOpacity="0.75" strokeWidth="1.5" />
          <line x1="6" y1="280" x2="194" y2="280" stroke={COURT_COLORS.line} strokeOpacity="0.75" strokeWidth="1.5" />
          <line x1="100" y1="120" x2="100" y2="280" stroke={COURT_COLORS.line} strokeOpacity="0.75" strokeWidth="1.5" />
          {/* red */}
          <line x1="0" y1="200" x2="200" y2="200" stroke={COURT_COLORS.netTape} strokeWidth="4" />
          <line
            x1="0"
            y1="200"
            x2="200"
            y2="200"
            stroke={COURT_COLORS.netTapeBottom}
            strokeWidth="1"
            strokeDasharray="2 3"
          />

          {withShot && (
            <>
              {/* tiro */}
              <path
                d="M 60 300 Q 150 215 142 110"
                fill="none"
                stroke={COURT_COLORS.shot}
                strokeWidth="3"
                strokeDasharray="8 5"
                strokeLinecap="round"
              />
              <circle cx="142" cy="110" r="5" fill={COURT_COLORS.zone} stroke={COURT_COLORS.labelBg} strokeWidth="1.5" />
              {/* manija del arco (affordance nueva: anillo + grip) */}
              <circle
                cx="150"
                cy="215"
                r="9"
                fill={COURT_COLORS.labelBg}
                stroke={COURT_COLORS.shot}
                strokeWidth="3"
              />
              <line x1="146" y1="215" x2="154" y2="215" stroke={COURT_COLORS.labelInk} strokeWidth="1.5" />
              <line x1="150" y1="211" x2="150" y2="219" stroke={COURT_COLORS.labelInk} strokeWidth="1.5" />
            </>
          )}

          {players.map((p) => {
            const isSel = selected === p.id;
            return (
              <g key={p.id}>
                {isSel && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="17"
                    fill="none"
                    stroke={COURT_COLORS.zone}
                    strokeWidth="3"
                    strokeDasharray="4 3"
                  />
                )}
                <circle cx={p.x} cy={p.y} r="12" fill={COURT_COLORS.labelBg} stroke={COURT_COLORS.labelInk} strokeWidth="1.5" />
                <text
                  x={p.x}
                  y={p.y + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={COURT_COLORS.labelInk}
                >
                  {p.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function StepFilmstripMock({ total = 3, active = 1 }: { total?: number; active?: number }) {
  if (total === 0) return null;
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold">Secuencia · {total} pasos</p>
          <p className="truncate text-[10px] text-muted-foreground">
            Cada paso es una foto de la jugada
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-11" aria-label="Añadir paso">
            <Plus className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-11" aria-label="Colapsar pasos">
            <ChevronDown className="size-5" />
          </Button>
        </div>
      </div>
      <div
        role="tablist"
        aria-label="Pasos de la transición"
        className="flex items-center gap-1.5 overflow-x-auto px-2 pb-2"
      >
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Paso ${i + 1}${i === active ? " (activo)" : ""}`}
            className={cn(
              "relative flex size-11 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold",
              i === active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground"
            )}
          >
            {i + 1}
            {i === active && (
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" aria-hidden />
            )}
          </button>
        ))}
        <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label="Añadir paso al final">
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="flex items-center gap-1.5 border-t px-2 py-1.5">
        <Button variant="outline" size="sm" className="h-11 flex-1" disabled={active <= 0}>
          ← Antes
        </Button>
        <Button variant="outline" size="sm" className="h-11 flex-1" disabled={active >= total - 1}>
          Después →
        </Button>
        <Button variant="outline" size="icon" className="size-11" aria-label="Duplicar paso activo">
          <Copy className="size-4" />
        </Button>
        <Button variant="outline" size="icon" className="size-11" aria-label="Borrar paso activo">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ContextBarMock({
  selection,
  stepNumber,
  dirty,
  saved,
}: {
  selection: "A" | "B" | "C" | "D" | null;
  stepNumber: number;
  dirty: boolean;
  saved: boolean;
}) {
  const disabled = selection === null;
  return (
    <div className="sticky bottom-0 z-20 mt-2 rounded-t-xl border border-b-0 bg-card/95 pb-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <p className="truncate text-xs font-medium" aria-live="polite">
          {disabled ? "Toca un jugador en la cancha" : `Jugador ${selection} · Paso ${stepNumber}`}
        </p>
        <span className="shrink-0 text-[10px] text-muted-foreground">±0,5 m</span>
      </div>

      <div className="flex items-center gap-1.5 px-2 py-2">
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Ajuste fino de posición">
          {[
            { icon: ArrowLeft, label: "Mover a la izquierda" },
            { icon: ArrowUp, label: "Mover arriba" },
            { icon: ArrowDown, label: "Mover abajo" },
            { icon: ArrowRight, label: "Mover a la derecha" },
          ].map(({ icon: Icon, label }) => (
            <Button
              key={label}
              variant="outline"
              size="icon"
              className="size-11"
              disabled={disabled}
              aria-label={label}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </div>
        <Separator orientation="vertical" className="mx-0.5 h-9" />
        <div className="flex flex-1 gap-1.5">
          <Button variant="outline" size="icon" className="size-11 flex-1" disabled={disabled} aria-label="Fijar tiro">
            <Target className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-11 flex-1" disabled aria-label="Quitar tiro">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-2 pb-1">
        <Button variant="ghost" size="icon" className="size-11" aria-label="Deshacer">
          <Undo2 className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-11" aria-label="Rehacer">
          <Redo2 className="size-5" />
        </Button>
        <Badge variant={dirty ? "secondary" : "outline"} className="min-w-0 flex-1 justify-center gap-1 truncate text-[10px]">
          {dirty ? "● Cambios sin guardar" : saved ? "✓ Guardado" : "Sin cambios"}
        </Badge>
        <Button variant="outline" className="h-11 px-2" aria-label="Probar la jugada sin guardar">
          <Play className="size-4" />
          Probar
        </Button>
        <Button className="h-11 px-2" disabled={!dirty}>
          <Check className="size-4" />
          {saved ? "Guardado" : "Guardar"}
        </Button>
      </div>
      <p className="px-2 pb-1 text-[10px] text-muted-foreground">
        Probar reproduce en memoria · Guardar guarda en tu biblioteca
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pantallas                                                          */
/* ------------------------------------------------------------------ */

function DashboardScreen() {
  return (
    <Phone label="Dashboard del coach con FAB de transiciones" nav>
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Viernes 20 sep</p>
            <h2 className="text-lg font-semibold">Hola, coach</h2>
            <p className="text-xs text-muted-foreground">Resumen de tu actividad</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-9" aria-label="Notificaciones">
              <Bell className="size-4" />
            </Button>
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              CR
            </div>
          </div>
        </div>

        {/* CTA actual — se mantiene junto al FAB (A3) */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-10">
            <Route className="size-4" /> Preparar jugada
          </Button>
          <Button size="sm" className="h-10">
            <Target className="size-4" /> Evaluar ahora
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Users, value: "24", label: "Alumnos" },
            { icon: ClipboardList, value: "38", label: "Evaluaciones" },
            { icon: TrendingUp, value: "7.8", label: "Promedio" },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="p-3 text-center">
                <m.icon className="mx-auto size-4 text-primary" aria-hidden />
                <p className="mt-1 text-lg font-bold">{m.value}</p>
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Mis cursos</h3>
            <Button variant="ghost" size="sm" className="h-8">
              <Plus className="size-3.5" /> Nuevo
            </Button>
          </div>
          {[
            { name: "Iniciación Lunes", meta: "12 alumnos · Lun 18:00" },
            { name: "Intermedio Miércoles", meta: "8 alumnos · Mié 19:30" },
            { name: "Competición Sábado", meta: "4 alumnos · Sáb 10:00" },
          ].map((c) => (
            <Card key={c.name}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-[11px] font-bold text-accent-foreground">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{c.meta}</p>
                </div>
                <LayoutGrid className="size-4 text-muted-foreground" aria-hidden />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="rounded-lg border border-dashed p-2 text-[10px] text-muted-foreground">
          ↓ FAB nuevo (56 px) — visible en dashboard, cursos, evaluar, historial y academias.
        </div>
      </div>
      <Fab novelty />
    </Phone>
  );
}

function EditorScreen({ state }: { state: EditorState }) {
  const empty = state === "empty";
  const selected = state === "selected" ? ("A" as const) : null;
  const dirty = state === "selected" || state === "default";
  const saved = state === "saved";
  const current = empty ? 1 : state === "selected" ? 3 : state === "saved" ? 5 : 2;

  return (
    <Phone label="Editor de transiciones con strip de flujo">
      <div className="flex flex-col">
        {/* cabecera */}
        <div className="flex items-center gap-2 px-2 py-2">
          <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Volver a transiciones">
            <ArrowLeft className="size-5" />
          </Button>
          <Input
            defaultValue={empty ? "" : "Mi jugada de saque"}
            placeholder="Título de la transición"
            aria-label="Título de la transición"
            className="h-11"
          />
        </div>

        <FlowStrip current={current} />

        <div className="space-y-2 px-2 py-2">
          {/* lienzo */}
          <div className="relative">
            <CourtMock selected={selected} withShot={!empty} />
            {!empty && !selected && (
              <div
                role="status"
                className="pointer-events-none absolute inset-x-3 top-2 rounded-lg bg-background/95 px-2 py-1.5 text-center text-[11px] font-medium shadow-sm"
              >
                👆 Toca un jugador para moverlo
              </div>
            )}
            {!empty && selected && (
              <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/95 px-2 py-1 text-[10px] font-medium shadow-sm">
                Arrastra el arco para curvar el tiro
              </div>
            )}
          </div>

          {empty ? (
            <EmptyState
              title="Aún no hay pasos"
              description="Añade el primero para colocar jugadores y dirigir el tiro."
              action={
                <Button size="sm">
                  <Plus className="size-4" /> Añadir paso
                </Button>
              }
            />
          ) : (
            <StepFilmstripMock total={3} active={state === "selected" ? 2 : 1} />
          )}

          <ContextBarMock
            selection={selected}
            stepNumber={state === "selected" ? 2 : 1}
            dirty={dirty}
            saved={saved}
          />
        </div>

        {saved && (
          <div
            role="status"
            className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs"
          >
            <Check className="size-4 text-primary" aria-hidden />
            <span className="flex-1 font-medium">Transición guardada</span>
            <Badge variant="secondary" className="text-[10px]">
              en tu biblioteca
            </Badge>
          </div>
        )}

        <p className="px-2 pb-2 text-[10px] text-muted-foreground">
          Modo foco: sin bottom-nav ni FAB · el editor ocupa la pantalla completa.
        </p>
      </div>
    </Phone>
  );
}

/* ------------------------------------------------------------------ */
/* Export                                                             */
/* ------------------------------------------------------------------ */

export default function CoachTransitionEditorMockup() {
  const screens: PreviewScreen[] = [
    { id: "dashboard", label: "P01 · FAB", node: <DashboardScreen /> },
    { id: "empty", label: "Editor · Vacío", node: <EditorScreen state="empty" /> },
    { id: "default", label: "Editor · Sin selección", node: <EditorScreen state="default" /> },
    { id: "selected", label: "Editor · Seleccionado", node: <EditorScreen state="selected" /> },
    { id: "saved", label: "Editor · Guardado", node: <EditorScreen state="saved" /> },
  ];

  return (
    <PreviewShell
      title="Fix · Editor de Transiciones (FAB + onboarding)"
      screens={screens}
      toolbar={
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="secondary">A3 · FAB flotante</Badge>
          <Badge variant="secondary">O1 · strip 1→5</Badge>
          <span>375×667 · targets ≥44 px · sólo tokens de globals.css</span>
        </div>
      }
    />
  );
}
