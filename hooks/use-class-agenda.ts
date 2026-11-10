"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  addDays,
  buildMaterializationPlan,
  buildWeekInfo,
  mondayOf,
  resolveCapacityRemaining,
} from "@/lib/padel/class-agenda"
import type { AgendaBlockView } from "@/components/padel/agenda-week-list"
import type {
  AvailableStudent,
  BlockEnrollmentView,
} from "@/components/padel/block-enrollment-row"
import type {
  WeeklySlotInput,
  WeeklySlotView,
} from "@/components/padel/weekly-slot-manager"

type ApiError = { error?: string; code?: string }
type EnrollmentDto = {
  id: string
  studentId: string
  firstName: string | null
  lastName: string | null
  status: "scheduled" | "completed" | "cancelled"
  attended: boolean | null
  notes: string | null
}
type BlockDetailResponse = { block?: AgendaBlockView; enrollments?: EnrollmentDto[] }
type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string }

/** Fecha local del navegador (`YYYY-MM-DD`); el server sigue siendo la autoridad de `isPast`. */
function localTodayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`
}

function shortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(year as number, (month as number) - 1, day as number))
    .toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" })
    .replace(/\./g, "")
}

function toEnrollmentView(row: EnrollmentDto): BlockEnrollmentView {
  return {
    id: row.id,
    studentId: row.studentId,
    firstName: row.firstName,
    lastName: row.lastName,
    status: row.status === "scheduled" ? "assigned" : row.status,
    attended: row.attended,
    notes: row.notes,
  }
}

const CODE_MESSAGES: Record<string, string> = {
  AGENDA_COURSE_ARCHIVED: "El curso está archivado: no se pueden hacer cambios.",
  AGENDA_SLOT_DUPLICATE: "Ya existe un día con esa hora en la plantilla.",
  AGENDA_NO_SLOTS: "Añade al menos un día activo en la plantilla.",
  AGENDA_CAPACITY: "El bloque no tiene cupo disponible.",
  AGENDA_STUDENT_NOT_ENROLLED: "Hay alumnos que no están inscritos al curso.",
  AGENDA_BLOCK_CANCELLED: "La clase está cancelada.",
  AGENDA_BLOCK_HAS_ENROLLMENTS: "El bloque tiene alumnos asignados: cancélalo en lugar de borrarlo.",
}

function messageFor(status: number, data: ApiError): string {
  return (
    (data.code ? CODE_MESSAGES[data.code] : undefined) ??
    data.error ??
    (status === 404 ? "No encontrado" : "No se pudo completar la acción")
  )
}

async function request<T>(url: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init })
    const data = (await res.json().catch(() => ({}))) as T & ApiError
    if (!res.ok) return { ok: false, status: res.status, message: messageFor(res.status, data) }
    return { ok: true, data }
  } catch {
    return { ok: false, status: 0, message: "Error de conexión" }
  }
}

export type UseClassAgendaOptions = {
  courseId: string
  students: AvailableStudent[]
  courseArchived?: boolean
}

/**
 * Agenda del coach (A1–A12): semana visible, plantilla, materialización y
 * asignación/asistencia de bloques. Sin lógica de autorización: el server
 * (`guardAdmin` + ownership + 409 archivado) es la única autoridad; aquí sólo
 * se traducen respuestas a estados de UI y toasts.
 */
export function useClassAgenda({
  courseId,
  students,
  courseArchived = false,
}: UseClassAgendaOptions) {
  const router = useRouter()
  const [weekStart, setWeekStart] = React.useState(() => mondayOf(localTodayIso()))
  const week = React.useMemo(() => buildWeekInfo(weekStart), [weekStart])
  const weekRange = React.useMemo(
    () => `${shortDate(week.weekStart)} – ${shortDate(week.weekEnd)}`,
    [week]
  )

  const [blocks, setBlocks] = React.useState<AgendaBlockView[]>([])
  const [slots, setSlots] = React.useState<WeeklySlotView[]>([])
  const [blocksLoading, setBlocksLoading] = React.useState(true)
  const [slotsLoading, setSlotsLoading] = React.useState(true)
  const [blocksError, setBlocksError] = React.useState<string | null>(null)
  const [slotsError, setSlotsError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [enableWeekOpen, setEnableWeekOpen] = React.useState(false)
  const [selectedBlock, setSelectedBlock] = React.useState<AgendaBlockView | null>(null)
  const [enrollments, setEnrollments] = React.useState<BlockEnrollmentView[]>([])
  const [sheetLoading, setSheetLoading] = React.useState(false)
  const [sheetError, setSheetError] = React.useState<string | null>(null)

  const loadWeek = React.useCallback(
    async (start: string) => {
      setBlocksLoading(true)
      const info = buildWeekInfo(start)
      const result = await request<{ blocks?: AgendaBlockView[] }>(
        `/api/courses/${courseId}/agenda/blocks?from=${info.weekStart}&to=${info.weekEnd}`
      )
      if (result.ok) {
        setBlocks(result.data.blocks ?? [])
        setBlocksError(null)
      } else {
        setBlocksError(result.message)
      }
      setBlocksLoading(false)
    },
    [courseId]
  )

  const loadSlots = React.useCallback(async () => {
    setSlotsLoading(true)
    const result = await request<{ items?: WeeklySlotView[] }>(
      `/api/courses/${courseId}/agenda/slots`
    )
    if (result.ok) {
      setSlots(result.data.items ?? [])
      setSlotsError(null)
    } else {
      setSlotsError(result.message)
    }
    setSlotsLoading(false)
  }, [courseId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWeek(weekStart)
  }, [loadWeek, weekStart])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSlots()
  }, [loadSlots])

  const refresh = React.useCallback(async () => {
    await Promise.all([loadWeek(weekStart), loadSlots()])
    router.refresh()
  }, [loadSlots, loadWeek, router, weekStart])

  const run = React.useCallback(
    async <T,>(
      url: string,
      method: "POST" | "PUT" | "DELETE",
      body: unknown,
      after?: (data: T) => void,
      success?: string | ((data: T) => string)
    ): Promise<void> => {
      setBusy(true)
      const result = await request<T>(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      setBusy(false)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      after?.(result.data)
      await refresh()
      if (success) toast.success(typeof success === "function" ? success(result.data) : success)
    },
    [refresh]
  )

  const loadBlockDetail = React.useCallback(
    async (blockId: string) => {
      setSheetLoading(true)
      const result = await request<BlockDetailResponse>(
        `/api/courses/${courseId}/agenda/blocks/${blockId}`
      )
      // A8 expone GET de detalle: el server hidrata bloque + inscripciones al abrir.
      if (result.ok) {
        if (result.data.block) setSelectedBlock(result.data.block)
        setEnrollments((result.data.enrollments ?? []).map(toEnrollmentView))
        setSheetError(null)
      } else if (result.status !== 404 && result.status !== 405) {
        setSheetError(result.message)
      }
      setSheetLoading(false)
    },
    [courseId]
  )

  const openBlock = (block: AgendaBlockView) => {
    setSelectedBlock(block)
    setEnrollments([])
    setSheetError(null)
    void loadBlockDetail(block.id)
  }

  const closeBlock = () => {
    setSelectedBlock(null)
    setEnrollments([])
    setSheetError(null)
  }

  const assignStudents = (studentIds: string[]) => {
    const blockId = selectedBlock?.id
    if (!blockId) return
    return run<{ assigned?: string[]; enrolledCount?: number }>(
      `/api/courses/${courseId}/agenda/blocks/${blockId}/enrollments`,
      "POST",
      { studentIds },
      (data) => {
        const added = data.assigned ?? []
        const rows = added.map((studentId) => {
          const student = students.find((item) => item.id === studentId)
          return {
            id: `${blockId}:${studentId}`,
            studentId,
            firstName: student?.firstName ?? null,
            lastName: student?.lastName ?? null,
            status: "assigned" as const,
            attended: null,
            notes: null,
          }
        })
        const merged = [
          ...enrollments,
          ...rows.filter((row) => !enrollments.some((item) => item.studentId === row.studentId)),
        ]
        setEnrollments(merged)
        const enrolledCount = data.enrolledCount ?? merged.length
        setSelectedBlock((prev) =>
          prev
            ? {
                ...prev,
                enrolledCount,
                capacityRemaining: resolveCapacityRemaining(prev.maxCapacity, enrolledCount),
              }
            : prev
        )
      },
      (data) => {
        const added = data.assigned?.length ?? 0
        return added === 0
          ? "Los alumnos ya estaban asignados"
          : `${added} ${added === 1 ? "alumno asignado" : "alumnos asignados"}`
      }
    )
  }

  const markAttendance = (studentId: string, attended: boolean | null) => {
    const blockId = selectedBlock?.id
    if (!blockId) return
    return run<{ enrollment?: EnrollmentDto; block?: AgendaBlockView }>(
      `/api/courses/${courseId}/agenda/blocks/${blockId}/enrollments/${studentId}`,
      "PUT",
      { attended },
      (data) => {
        if (data.enrollment) {
          const updated = toEnrollmentView(data.enrollment)
          setEnrollments((prev) =>
            prev.map((row) => (row.studentId === studentId ? updated : row))
          )
        }
        if (data.block) setSelectedBlock(data.block)
      }
    )
  }

  const removeStudent = (studentId: string) => {
    const blockId = selectedBlock?.id
    if (!blockId) return
    return run(
      `/api/courses/${courseId}/agenda/blocks/${blockId}/enrollments/${studentId}`,
      "DELETE",
      undefined,
      () => {
        setEnrollments((prev) => prev.filter((row) => row.studentId !== studentId))
        setSelectedBlock((prev) => {
          if (!prev) return prev
          const enrolledCount = Math.max(0, prev.enrolledCount - 1)
          return {
            ...prev,
            enrolledCount,
            capacityRemaining: resolveCapacityRemaining(prev.maxCapacity, enrolledCount),
          }
        })
      },
      "Alumno quitado de la clase"
    )
  }

  const changeBlockStatus = (status: "completed" | "cancelled") => {
    const blockId = selectedBlock?.id
    if (!blockId) return
    return run<{ block?: AgendaBlockView; notified?: number }>(
      `/api/courses/${courseId}/agenda/blocks/${blockId}`,
      "PUT",
      { status },
      (data) => {
        if (data.block) setSelectedBlock(data.block)
      },
      (data) =>
        status === "cancelled"
          ? `Clase cancelada${data.notified ? ` · ${data.notified} avisados` : ""}`
          : "Clase completada"
    )
  }

  const confirmEnableWeek = () =>
    run<{ created?: number }>(
      `/api/courses/${courseId}/agenda/weeks`,
      "POST",
      { weekStart },
      () => setEnableWeekOpen(false),
      (data) => {
        const created = data.created ?? 0
        return created === 0
          ? "La semana ya estaba habilitada"
          : `Semana habilitada · ${created} ${created === 1 ? "bloque" : "bloques"}`
      }
    )

  const createSlot = (input: WeeklySlotInput) =>
    run(`/api/courses/${courseId}/agenda/slots`, "POST", input, undefined, "Día añadido a la plantilla")

  const updateSlot = (slotId: string, input: Partial<WeeklySlotInput>) =>
    run(`/api/courses/${courseId}/agenda/slots/${slotId}`, "PUT", input, undefined, "Plantilla actualizada")

  const deleteSlot = (slotId: string) =>
    run(`/api/courses/${courseId}/agenda/slots/${slotId}`, "DELETE", undefined, undefined, "Día eliminado de la plantilla")

  const plannedBlocks = React.useMemo(() => {
    const existingKeys = blocks
      .filter((block) => block.weeklySlotId)
      .map((block) => `${block.weeklySlotId}:${block.blockDate}`)
    return buildMaterializationPlan(slots, weekStart, existingKeys).candidates
  }, [blocks, slots, weekStart])

  return {
    week,
    weekRange,
    courseArchived,
    blocks,
    blocksLoading,
    blocksError,
    slots,
    slotsLoading,
    slotsError,
    templateCount: slots.length,
    plannedBlocks,
    plannedCount: plannedBlocks.length,
    weekEnabled: blocks.length > 0,
    busy,
    enableWeekOpen,
    setEnableWeekOpen,
    selectedBlock,
    enrollments,
    availableStudents: students,
    sheetLoading,
    sheetError,
    reload: () => void loadWeek(weekStart),
    reloadSlots: () => void loadSlots(),
    reloadBlock: () => {
      if (selectedBlock) void loadBlockDetail(selectedBlock.id)
    },
    goToPreviousWeek: () => setWeekStart((prev) => addDays(prev, -7)),
    goToNextWeek: () => setWeekStart((prev) => addDays(prev, 7)),
    openBlock,
    closeBlock,
    confirmEnableWeek,
    createSlot,
    updateSlot,
    deleteSlot,
    assignStudents,
    markAttendance,
    removeStudent,
    changeBlockStatus,
  }
}
