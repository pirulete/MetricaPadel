"use client";

import * as React from "react";
import { AlertTriangle, CalendarDays, Check, Loader2, RotateCcw, X } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  AvailableStudentList,
  BlockEnrollmentRow,
  type AvailableStudent,
  type BlockEnrollmentView,
} from "@/components/padel/block-enrollment-row";
import {
  BLOCK_STATUS_META,
  type AgendaBlockView,
} from "@/components/padel/agenda-week-list";
import { addMinutes, formatBlockDateTime } from "@/lib/padel/class-agenda";

export type { AvailableStudent, BlockEnrollmentView };

export type BlockAssignmentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: AgendaBlockView | null;
  enrollments: BlockEnrollmentView[];
  availableStudents: AvailableStudent[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  busy?: boolean;
  courseArchived?: boolean;
  onAssign: (studentIds: string[]) => Promise<void> | void;
  onAttendance: (studentId: string, attended: boolean | null) => Promise<void> | void;
  onRemove: (studentId: string) => Promise<void> | void;
  onStatusChange: (status: "completed" | "cancelled") => Promise<void> | void;
};

/** Sheet del bloque: ocupación, asignados con asistencia, disponibles del curso y estado (A8, A10–A12). */
export function BlockAssignmentSheet({
  open,
  onOpenChange,
  block,
  enrollments,
  availableStudents,
  loading = false,
  error = null,
  onRetry,
  busy = false,
  courseArchived = false,
  onAssign,
  onAttendance,
  onRemove,
  onStatusChange,
}: BlockAssignmentSheetProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const blockId = block?.id ?? null;

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds([]);
  }, [blockId, open]);

  if (!block) return null;

  const assignedIds = new Set(enrollments.map((row) => row.studentId));
  const remaining = block.capacityRemaining;
  const full = remaining !== null && remaining <= 0;
  const cancelled = block.status === "cancelled";
  const exceedsCapacity = remaining !== null && selectedIds.length > remaining;
  const canAssign =
    !busy && !courseArchived && !full && !cancelled && selectedIds.length > 0 && !exceedsCapacity;
  const status = BLOCK_STATUS_META[block.status];
  const timeRange = `${block.startTime}–${addMinutes(block.startTime, block.durationMinutes)}`;
  const capacityLabel =
    remaining !== null ? `${block.enrolledCount + selectedIds.length}/${block.maxCapacity}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">
            {formatBlockDateTime(block.blockDate, block.startTime)}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden />
            {timeRange}
            {block.label ? ` · ${block.label}` : ""}
            <Badge variant={status.variant}>{status.label}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
          <span className="text-sm font-medium">Ocupación</span>
          <span className="text-xs text-muted-foreground">
            {block.enrolledCount} / {block.maxCapacity ?? "sin cupo"} alumnos
          </span>
        </div>

        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-1.5 rounded-lg border bg-card px-3 py-2.5">
                <div className="h-2.5 w-28 rounded bg-muted" />
                <div className="h-2 w-20 rounded bg-muted" />
              </div>
            ))}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Cargando alumnos del bloque…
            </p>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <AlertTriangle className="size-3.5 text-destructive" aria-hidden />
              No se pudo cargar el bloque
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
            {onRetry && (
              <Button variant="outline" size="sm" className="mt-2 h-9 text-xs" onClick={onRetry}>
                <RotateCcw className="size-3" /> Reintentar
              </Button>
            )}
          </div>
        ) : (
          <>
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Asignados ({enrollments.length})
              </h3>
              {enrollments.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
                  Sin alumnos asignados. Elige alumnos del curso para esta clase.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {enrollments.map((enrollment) => (
                    <BlockEnrollmentRow
                      key={enrollment.id}
                      enrollment={enrollment}
                      onAttendance={(attended) => void onAttendance(enrollment.studentId, attended)}
                      onRemove={() => void onRemove(enrollment.studentId)}
                      disabled={courseArchived || cancelled}
                      busy={busy}
                    />
                  ))}
                </ul>
              )}
            </section>

            <AvailableStudentList
              students={availableStudents}
              assignedIds={assignedIds}
              selectedIds={selectedIds}
              disabled={cancelled || courseArchived}
              full={full}
              onToggle={(studentId) =>
                setSelectedIds((prev) =>
                  prev.includes(studentId)
                    ? prev.filter((id) => id !== studentId)
                    : [...prev, studentId]
                )
              }
            />

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estado de la clase
              </h3>
              {block.status !== "completed" && (
                <Button
                  variant="outline"
                  className="h-11 w-full justify-start text-xs"
                  onClick={() => void onStatusChange("completed")}
                  disabled={busy || courseArchived || cancelled}
                >
                  <Check className="size-4" /> Marcar como completada
                </Button>
              )}
              {!cancelled && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-11 w-full justify-start text-xs text-destructive"
                      disabled={busy || courseArchived}
                    >
                      <X className="size-4" /> Cancelar clase
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Cancelar esta clase?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se avisará a{" "}
                        {block.enrolledCount === 1
                          ? "1 alumno asignado"
                          : `${block.enrolledCount} alumnos asignados`}
                        . La cancelación no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Volver</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void onStatusChange("cancelled")}>
                        Cancelar clase
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </section>
          </>
        )}

        <DialogFooter className="sticky bottom-0 -mx-6 border-t bg-background px-6 pb-1 pt-2">
          {exceedsCapacity && (
            <p role="alert" className="w-full text-xs text-destructive">
              Supera el cupo: quedan {remaining} {remaining === 1 ? "lugar" : "lugares"}.
            </p>
          )}
          <Button className="h-11 w-full text-xs" onClick={() => void onAssign(selectedIds)} disabled={!canAssign}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Asignar {selectedIds.length > 0 ? selectedIds.length : ""}
            {capacityLabel ? ` · ${capacityLabel}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
