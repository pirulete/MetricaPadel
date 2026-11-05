"use client";

import * as React from "react";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { isValidTime } from "@/lib/padel/class-agenda";

export type WeeklySlotView = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  label: string | null;
  isActive: boolean;
};

export type WeeklySlotInput = {
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  label: string | null;
  isActive?: boolean;
};

/** Índice 0 = lunes ⇒ `index + 1` = ISO dayOfWeek (1–7, D4). */
const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function dayLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek - 1] ?? `Día ${dayOfWeek}`;
}

export type WeeklySlotManagerProps = {
  slots: WeeklySlotView[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  disabled?: boolean;
  onCreate: (input: WeeklySlotInput) => Promise<void> | void;
  onUpdate: (slotId: string, input: Partial<WeeklySlotInput>) => Promise<void> | void;
  onDelete: (slotId: string) => Promise<void> | void;
};

/** Panel "Plantilla semanal" del tab Agenda: días fijos del curso (A1–A4). */
export function WeeklySlotManager({
  slots,
  loading = false,
  error = null,
  onRetry,
  disabled = false,
  onCreate,
  onUpdate,
  onDelete,
}: WeeklySlotManagerProps) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WeeklySlotView | null>(null);
  const [dayOfWeek, setDayOfWeek] = React.useState("1");
  const [startTime, setStartTime] = React.useState("18:00");
  const [durationMinutes, setDurationMinutes] = React.useState("90");
  const [name, setName] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const openCreate = () => {
    setEditing(null);
    setDayOfWeek("1");
    setStartTime("18:00");
    setDurationMinutes("90");
    setName("");
    setIsActive(true);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (slot: WeeklySlotView) => {
    setEditing(slot);
    setDayOfWeek(String(slot.dayOfWeek));
    setStartTime(slot.startTime);
    setDurationMinutes(String(slot.durationMinutes));
    setName(slot.label ?? "");
    setIsActive(slot.isActive);
    setFormError(null);
    setOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const day = Number(dayOfWeek);
    const duration = Number(durationMinutes);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      setFormError("Elige un día válido.");
      return;
    }
    if (!isValidTime(startTime)) {
      setFormError("La hora debe tener formato HH:mm.");
      return;
    }
    if (!Number.isInteger(duration) || duration < 15 || duration > 180) {
      setFormError("La duración debe estar entre 15 y 180 minutos.");
      return;
    }
    const input: WeeklySlotInput = {
      dayOfWeek: day,
      startTime,
      durationMinutes: duration,
      label: name.trim() ? name.trim() : null,
      isActive,
    };
    setSaving(true);
    try {
      if (editing) await onUpdate(editing.id, input);
      else await onCreate(input);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border bg-card" aria-label="Plantilla semanal">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Settings2 className="size-3.5 text-muted-foreground" aria-hidden />
          Plantilla semanal
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-xs"
          onClick={openCreate}
          disabled={disabled}
          aria-label="Añadir día a la plantilla"
        >
          <Plus className="size-3.5" /> Nuevo día
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2 border-t px-3 py-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 w-24 rounded bg-muted" />
              <div className="h-2 w-16 rounded bg-muted" />
            </div>
          ))}
          <span className="sr-only">Cargando plantilla…</span>
        </div>
      ) : error ? (
        <div role="alert" className="border-t px-3 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <AlertTriangle className="size-3.5 text-destructive" aria-hidden />
            No se pudo cargar la plantilla
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-2 h-9 text-xs" onClick={onRetry}>
              <RotateCcw className="size-3" /> Reintentar
            </Button>
          )}
        </div>
      ) : slots.length === 0 ? (
        <div className="border-t px-3 py-4 text-center">
          <p className="text-sm font-medium">Sin días configurados</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Define los días y horas fijos del curso para poder habilitar semanas.
          </p>
          <Button size="sm" className="mt-2 h-9 text-xs" onClick={openCreate} disabled={disabled}>
            <Plus className="size-3.5" /> Añadir día
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border border-t">
          {slots.map((slot) => (
            <li key={slot.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{dayLabel(slot.dayOfWeek)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {slot.startTime} · {slot.durationMinutes} min
                  {slot.label ? ` · ${slot.label}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant={slot.isActive ? "outline" : "secondary"} className="text-[10px]">
                  {slot.isActive ? "Activo" : "Pausado"}
                </Badge>
                <Switch
                  checked={slot.isActive}
                  disabled={disabled}
                  onCheckedChange={(checked) => void onUpdate(slot.id, { isActive: checked })}
                  aria-label={`${slot.isActive ? "Desactivar" : "Activar"} plantilla del ${dayLabel(slot.dayOfWeek)}`}
                  className="scale-90"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground"
                  onClick={() => openEdit(slot)}
                  disabled={disabled}
                  aria-label={`Editar día ${dayLabel(slot.dayOfWeek)}`}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-muted-foreground hover:text-destructive"
                      disabled={disabled}
                      aria-label={`Eliminar día ${dayLabel(slot.dayOfWeek)}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        ¿Eliminar el {dayLabel(slot.dayOfWeek).toLowerCase()} de la plantilla?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Las semanas ya habilitadas no cambian: los bloques creados se conservan.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void onDelete(slot.id)}>
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}

      {disabled && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          El curso está archivado: la plantilla es de solo lectura.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar día" : "Nuevo día de la plantilla"}</DialogTitle>
            <DialogDescription>
              Los días activos se convierten en clases al habilitar cada semana.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="slot-day">Día</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger id="slot-day" className="w-full">
                  <SelectValue placeholder="Elige un día" />
                </SelectTrigger>
                <SelectContent>
                  {DAY_LABELS.map((label, index) => (
                    <SelectItem key={label} value={String(index + 1)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="slot-time">Hora</Label>
                <Input
                  id="slot-time"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slot-duration">Duración (min)</Label>
                <Input
                  id="slot-duration"
                  type="number"
                  min={15}
                  max={180}
                  step={5}
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slot-name">Etiqueta (opcional)</Label>
              <Input
                id="slot-name"
                maxLength={100}
                placeholder="Ej. Pista 2"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">Día activo</span>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                aria-label="Día activo en la plantilla"
              />
            </div>
            {formError && (
              <p role="alert" className="text-xs text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {editing ? "Guardar cambios" : "Añadir día"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
