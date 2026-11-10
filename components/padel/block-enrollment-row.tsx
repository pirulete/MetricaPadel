"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BlockEnrollmentView = {
  id: string;
  studentId: string;
  firstName: string | null;
  lastName: string | null;
  status: "assigned" | "cancelled" | "completed";
  attended: boolean | null;
  notes: string | null;
};

export type AvailableStudent = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

export type BlockEnrollmentRowProps = {
  enrollment: BlockEnrollmentView;
  onAttendance: (attended: boolean | null) => void;
  onRemove: () => void;
  disabled?: boolean;
  busy?: boolean;
};

const ATTENDANCE_OPTIONS = [
  { value: true, label: "Sí", pressed: "asistió" },
  { value: false, label: "No", pressed: "no asistió" },
  { value: null, label: "Sin marcar", pressed: "sin marcar" },
] as const;

/** Fila de alumno asignado a un bloque con asistencia tri-estado (AC-04). */
export function BlockEnrollmentRow({
  enrollment,
  onAttendance,
  onRemove,
  disabled = false,
  busy = false,
}: BlockEnrollmentRowProps) {
  const name = studentName(enrollment);

  return (
    <li className="rounded-lg border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{name}</p>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          disabled={disabled || busy}
          aria-label={`Quitar a ${name} del bloque`}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5" role="group" aria-label={`Asistencia de ${name}`}>
        <span className="mr-0.5 text-xs text-muted-foreground">Asistencia</span>
        {ATTENDANCE_OPTIONS.map((option) => {
          const selected = enrollment.attended === option.value;
          return (
            <Button
              key={option.label}
              type="button"
              size="sm"
              variant={!selected ? "outline" : option.value === false ? "destructive" : "default"}
              className="h-11 px-3 text-xs"
              aria-pressed={selected}
              aria-label={`Marcar a ${name} como ${option.pressed}`}
              onClick={() => onAttendance(option.value)}
              disabled={disabled || busy}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
      {enrollment.notes && <p className="mt-1 text-xs text-muted-foreground">{enrollment.notes}</p>}
    </li>
  );
}

export type AvailableStudentListProps = {
  students: AvailableStudent[];
  assignedIds: Set<string>;
  selectedIds: string[];
  disabled?: boolean;
  full?: boolean;
  onToggle: (studentId: string) => void;
};

function studentName(student: { firstName: string | null; lastName: string | null }): string {
  return [student.firstName, student.lastName].filter(Boolean).join(" ") || "Alumno sin nombre";
}

/** Buscador + selección de alumnos inscritos al curso, sin duplicar asignados (EC-11). */
export function AvailableStudentList({
  students,
  assignedIds,
  selectedIds,
  disabled = false,
  full = false,
  onToggle,
}: AvailableStudentListProps) {
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const candidates = students
    .filter(
      (student) =>
        !normalizedQuery ||
        studentName(student).toLowerCase().includes(normalizedQuery) ||
        student.email.toLowerCase().includes(normalizedQuery)
    )
    .sort((a, b) => studentName(a).localeCompare(studentName(b), "es"));

  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Disponibles en el curso ({candidates.length})
      </h3>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar alumno…"
          aria-label="Buscar alumno del curso"
          className="h-11 pl-9"
        />
      </div>
      {candidates.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {students.length === 0
            ? "No hay alumnos disponibles: agrégalos al curso desde el tab Alumnos."
            : "Ningún alumno coincide con la búsqueda."}
        </p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {candidates.map((student) => {
            const alreadyAssigned = assignedIds.has(student.id);
            const selected = selectedIds.includes(student.id);
            const locked = alreadyAssigned || full || disabled;
            return (
              <li key={student.id}>
                <label
                  className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 ${
                    locked ? "opacity-60" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={alreadyAssigned || selected}
                    disabled={locked}
                    onChange={() => onToggle(student.id)}
                    aria-label={`Asignar a ${studentName(student)}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{studentName(student)}</span>
                  {alreadyAssigned && (
                    <Badge variant="secondary" className="text-[10px]">
                      Ya asignado
                    </Badge>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Solo aparecen alumnos inscritos en el curso.</p>
    </section>
  );
}
