"use client"

import * as React from "react"

import type { TournamentRunSlot } from "@/hooks/use-tournament-run"

/** Bloque de calendario tal como lo devuelve `GET /api/torneos/[id]`. */
export type AgendaGridBlock = {
  idx: number
  dayLabel: string
  startTime: string
  phase: "previa" | "final"
  isExtension: boolean
  capacity: number
}

/**
 * Paleta fija del prototipo (`motor_torneo/correr.py::COLORES`). La grilla
 * colorea por categoría, igual que el `grilla.html` original.
 */
const CATEGORY_COLORS: Record<string, string> = {
  "2da": "#4e79a7",
  "3ra": "#f28e2b",
  "4ta": "#59a14f",
  "5ta": "#e15759",
  "6ta": "#76b7b2",
  A: "#b07aa1",
  B: "#edc948",
  C: "#ff9da7",
}

/** Categorías fuera del prototipo (`1ra`, `D`…) caen aquí de forma determinista. */
const FALLBACK_COLORS = Object.values(CATEGORY_COLORS)

function hashOf(value: string): number {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return hash
}

function colorForCategory(code: string): string {
  return CATEGORY_COLORS[code] ?? FALLBACK_COLORS[hashOf(code) % FALLBACK_COLORS.length]!
}

/** Texto legible sobre el fondo: `#edc948` (amarillo) no admite blanco. */
function readableText(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1a1a1a" : "#ffffff"
}

/** Previa: `3ra-G1-P2` → `G1`. Cuadro: la ronda ya viene en `slot.round`. */
function cellLabel(slot: TournamentRunSlot): string {
  if (slot.phase !== "previa") return slot.round
  return slot.code.split("-")[1] ?? slot.round
}

type DayGroup = {
  key: string
  dayLabel: string
  phase: string
  blocks: AgendaGridBlock[]
}

/** Agrupa bloques consecutivos por `día · fase` (mismo criterio que el prototipo). */
function groupBlocks(blocks: readonly AgendaGridBlock[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const block of blocks) {
    const key = `${block.dayLabel}|${block.phase}`
    const last = groups[groups.length - 1]
    if (last?.key === key) last.blocks.push(block)
    else groups.push({ key, dayLabel: block.dayLabel, phase: block.phase, blocks: [block] })
  }
  return groups
}

/**
 * Grilla canchas × bloques del run de agenda: color por categoría, tooltip con
 * el código del partido, fila de ocupación `n/cap` y leyenda de categorías.
 * Scroll horizontal contenido (legible a 375 px) con la columna de cancha fija.
 */
export function AgendaGrid({
  slots,
  blocks,
  courts,
}: {
  slots: readonly TournamentRunSlot[]
  blocks: readonly AgendaGridBlock[]
  courts: number
}) {
  const byCell = React.useMemo(() => {
    const map = new Map<string, TournamentRunSlot>()
    for (const slot of slots) map.set(`${slot.court}:${slot.blockIdx}`, slot)
    return map
  }, [slots])

  const occupancy = React.useMemo(() => {
    const map = new Map<number, number>()
    for (const slot of slots) map.set(slot.blockIdx, (map.get(slot.blockIdx) ?? 0) + 1)
    return map
  }, [slots])

  const legend = React.useMemo(() => {
    const codes = [...new Set(slots.map((slot) => slot.categoryCode))]
    return codes.sort(
      (a, b) => Object.keys(CATEGORY_COLORS).indexOf(a) - Object.keys(CATEGORY_COLORS).indexOf(b),
    )
  }, [slots])

  if (slots.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Aún no hay agenda generada para este torneo.
      </p>
    )
  }

  const groups = groupBlocks(blocks)
  const courtNumbers = Array.from({ length: Math.max(courts, 1) }, (_, index) => index + 1)

  return (
    <div className="space-y-3">
      {/* `w-0 min-w-full`: aporta 0 al max-content para que la cadena de flex
          items (`div.flex-1.flex-col`, `min-width:auto`) pueda acotarse al
          viewport, y luego ocupa el 100% del espacio disponible. La tabla sigue
          midiendo su ancho natural DENTRO del scroll horizontal. */}
      <div className="w-0 min-w-full max-w-full overflow-x-auto rounded-lg border">
        <table className="min-w-max border-collapse text-[11px] sm:text-xs">
          <caption className="sr-only">
            Agenda propuesta: canchas por bloque horario, agrupados por día y fase
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                rowSpan={2}
                className="sticky left-0 z-20 bg-card px-2 py-1 text-left align-bottom font-medium whitespace-nowrap"
              >
                Cancha
              </th>
              {groups.map((group) => (
                <th
                  key={group.key}
                  scope="colgroup"
                  colSpan={group.blocks.length}
                  className="border-l bg-muted px-1 py-1 font-semibold whitespace-nowrap"
                >
                  {group.dayLabel} · {group.phase}
                </th>
              ))}
            </tr>
            <tr>
              {blocks.map((block) => (
                <th
                  key={block.idx}
                  scope="col"
                  aria-label={
                    block.isExtension
                      ? `${block.startTime} (extensión)`
                      : block.startTime
                  }
                  className={
                    block.isExtension
                      ? "border-l bg-destructive/10 px-1 py-1 font-normal text-muted-foreground whitespace-nowrap"
                      : "border-l px-1 py-1 font-normal text-muted-foreground whitespace-nowrap"
                  }
                >
                  {block.startTime}
                  {block.isExtension ? <span className="sr-only"> extensión</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {courtNumbers.map((court) => (
              <tr key={court}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-t bg-card px-2 py-1 text-left font-medium"
                >
                  {court}
                </th>
                {blocks.map((block) => {
                  const slot = byCell.get(`${court}:${block.idx}`)
                  if (!slot) {
                    return (
                      <td
                        key={block.idx}
                        className="border-t border-l px-1 py-1 text-center text-muted-foreground/40"
                      >
                        ·
                      </td>
                    )
                  }
                  const background = colorForCategory(slot.categoryCode)
                  return (
                    <td
                      key={block.idx}
                      title={slot.code}
                      className="border-t border-l p-0 text-center align-middle"
                    >
                      <span
                        className="block px-1 py-1 leading-tight"
                        style={{ backgroundColor: background, color: readableText(background) }}
                      >
                        <span className="block font-semibold">{slot.categoryCode}</span>
                        <span className="block">{cellLabel(slot)}</span>
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 border-t bg-card px-2 py-1 text-left font-medium whitespace-nowrap"
              >
                Ocup.
              </th>
              {blocks.map((block) => (
                <td
                  key={block.idx}
                  className="border-t border-l px-1 py-1 text-center text-muted-foreground whitespace-nowrap"
                >
                  {occupancy.get(block.idx) ?? 0}/{block.capacity}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Categorías:</span>
        {legend.map((code) => (
          <span
            key={code}
            className="rounded px-2 py-0.5 font-medium"
            style={{ backgroundColor: colorForCategory(code), color: readableText(colorForCategory(code)) }}
          >
            {code}
          </span>
        ))}
      </div>
    </div>
  )
}
