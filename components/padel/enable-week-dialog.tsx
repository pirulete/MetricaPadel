"use client";

import { CalendarDays, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBlockDateTime } from "@/lib/padel/class-agenda";

export type PlannedBlock = {
  blockDate: string;
  startTime: string;
  durationMinutes: number;
};

export type EnableWeekDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekLabel: string;
  weekRange: string;
  plannedBlocks: PlannedBlock[];
  submitting?: boolean;
  courseArchived?: boolean;
  onConfirm: () => void;
};

/**
 * Confirmación de materialización de semana (A5).
 * Idempotente: los bloques que ya existen no se duplican ni se sobrescriben (EC-01/EC-09).
 */
export function EnableWeekDialog({
  open,
  onOpenChange,
  weekLabel,
  weekRange,
  plannedBlocks,
  submitting = false,
  courseArchived = false,
  onConfirm,
}: EnableWeekDialogProps) {
  const count = plannedBlocks.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            Habilitar {weekLabel}
          </DialogTitle>
          <DialogDescription>
            {weekRange} · {count === 0 ? "sin días activos en la plantilla" : `${count} ${count === 1 ? "día" : "días"} de la plantilla`}
          </DialogDescription>
        </DialogHeader>

        {count === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            Añade al menos un día activo en la plantilla semanal para poder habilitar la semana.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {plannedBlocks.map((block) => (
              <li
                key={`${block.blockDate}-${block.startTime}`}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {formatBlockDateTime(block.blockDate, block.startTime)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {block.durationMinutes} min
                </span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  crear
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Se crearán {count} {count === 1 ? "bloque" : "bloques"} en estado Programada. Los bloques
          ya editados no se sobrescriben.
        </p>

        {courseArchived && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            El curso está archivado: no se pueden crear bloques.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={submitting || count === 0 || courseArchived}>
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Habilitar {count > 0 ? count : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
