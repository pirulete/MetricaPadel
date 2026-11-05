"use client";

import * as React from "react";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Loader2, Plus, RotateCcw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/padel/empty-state";
import {
  WeeklySlotManager,
  type WeeklySlotManagerProps,
} from "@/components/padel/weekly-slot-manager";
import { addMinutes, formatBlockDateTime } from "@/lib/padel/class-agenda";

export type AgendaBlockView = {
  id: string;
  weeklySlotId: string | null;
  blockDate: string;
  startTime: string;
  durationMinutes: number;
  status: "scheduled" | "completed" | "cancelled";
  maxCapacity: number | null;
  label: string | null;
  enrolledCount: number;
  attendedCount: number;
  capacityRemaining: number | null;
  isPast: boolean;
  canEditTiming: boolean;
};

export type AgendaWeekListProps = {
  weekNumber: number;
  weekRange: string;
  blocks: AgendaBlockView[];
  templateCount: number;
  plannedCount: number;
  weekEnabled: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onEnableWeek: () => void;
  onBlockOpen: (block: AgendaBlockView) => void;
  onConfigureTemplate?: () => void;
  courseArchived?: boolean;
  slotManager: WeeklySlotManagerProps;
};

export const BLOCK_STATUS_META: Record<
  AgendaBlockView["status"],
  { label: string; variant: "secondary" | "outline" | "destructive" }
> = {
  scheduled: { label: "Programada", variant: "secondary" },
  completed: { label: "Completada", variant: "outline" },
  cancelled: { label: "Cancelada", variant: "destructive" },
};

/** "Lun 3 nov" a partir de `YYYY-MM-DD` (sin depender del TZ del runtime). */
function formatDayHeading(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  const label = date.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(/\./g, "");
}

/** Lista semanal de bloques del curso + plantilla (tab Agenda del coach, Paquete A). */
export function AgendaWeekList({
  weekNumber,
  weekRange,
  blocks,
  templateCount,
  plannedCount,
  weekEnabled,
  loading = false,
  error = null,
  onRetry,
  onPreviousWeek,
  onNextWeek,
  onEnableWeek,
  onBlockOpen,
  onConfigureTemplate,
  courseArchived = false,
  slotManager,
}: AgendaWeekListProps) {
  const byDay = React.useMemo(() => {
    const groups = new Map<string, AgendaBlockView[]>();
    for (const block of blocks) {
      const list = groups.get(block.blockDate);
      if (list) list.push(block);
      else groups.set(block.blockDate, [block]);
    }
    return Array.from(groups.entries());
  }, [blocks]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border bg-card px-2 py-1.5">
        <Button variant="ghost" size="icon" className="size-11" onClick={onPreviousWeek} aria-label="Semana anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <p className="text-xs font-semibold">Semana {weekNumber}</p>
          <p className="text-[11px] text-muted-foreground">{weekRange}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-11" onClick={onNextWeek} aria-label="Semana siguiente">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {templateCount === 0 && !loading ? (
        <EmptyState
          title="Sin agenda todavía"
          description="Configura la plantilla semanal del curso (día y hora). Después podrás habilitar cada semana en un toque."
          action={
            <Button size="sm" onClick={onConfigureTemplate}>
              <Plus className="size-4" /> Configurar plantilla
            </Button>
          }
        />
      ) : weekEnabled ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold">
              {blocks.length} {blocks.length === 1 ? "bloque" : "bloques"} esta semana
            </p>
            <p className="text-[11px] text-muted-foreground">Semana habilitada · nada pendiente</p>
          </div>
          <Button variant="outline" size="sm" className="h-11 shrink-0 text-xs" disabled>
            <Check className="size-3.5" /> Habilitada
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed px-3 py-4 text-center">
          <p className="text-sm font-medium">La Semana {weekNumber} no está habilitada</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {plannedCount === 0
              ? "No hay días activos en la plantilla: añade uno primero."
              : `Se crearán ${plannedCount} ${plannedCount === 1 ? "bloque" : "bloques"} desde la plantilla.`}
          </p>
          <Button
            size="sm"
            className="mt-2 h-11 text-xs"
            onClick={onEnableWeek}
            disabled={plannedCount === 0 || courseArchived}
          >
            <CalendarDays className="size-3.5" /> Habilitar Sem {weekNumber}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-1.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1.5 rounded-lg border bg-card px-3 py-2.5">
              <div className="h-2.5 w-24 rounded bg-muted" />
              <div className="h-2 w-16 rounded bg-muted" />
            </div>
          ))}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Cargando agenda…
          </p>
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <AlertTriangle className="size-3.5 text-destructive" aria-hidden />
            No se pudo cargar la agenda
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Revisa tu conexión. El resto del curso sigue disponible.
          </p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-2 h-11 text-xs" onClick={onRetry}>
              <RotateCcw className="size-3" /> Reintentar
            </Button>
          )}
        </div>
      ) : templateCount > 0 && weekEnabled && byDay.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
          (sin clases)
        </p>
      ) : (
        <div className="space-y-3">
          {byDay.map(([date, dayBlocks]) => (
            <section key={date} className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="inline-block size-1.5 rounded-full bg-primary" aria-hidden />
                {formatDayHeading(date)}
              </h3>
              <ul className="space-y-1.5">
                {dayBlocks.map((block) => {
                  const status = BLOCK_STATUS_META[block.status];
                  const empty = block.enrolledCount === 0;
                  return (
                    <li key={block.id}>
                      <button
                        type="button"
                        onClick={() => onBlockOpen(block)}
                        className="w-full rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Abrir bloque ${formatBlockDateTime(block.blockDate, block.startTime)}, ${status.label}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {block.startTime}–{addMinutes(block.startTime, block.durationMinutes)}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                              {block.label ?? `${block.durationMinutes} min`}
                            </p>
                          </div>
                          <Badge variant={status.variant} className="shrink-0">
                            {status.label}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Users className="size-3" aria-hidden />
                            {block.maxCapacity === null
                              ? `${block.enrolledCount} asignados`
                              : `${block.enrolledCount}/${block.maxCapacity} alumnos`}
                          </span>
                          {block.attendedCount > 0 ? (
                            <span className="text-[11px] font-medium text-primary">
                              {block.attendedCount} asistieron
                            </span>
                          ) : empty ? (
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Sin alumnos · Asignar alumnos
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Separator />
      <WeeklySlotManager {...slotManager} disabled={slotManager.disabled || courseArchived} />
    </div>
  );
}
