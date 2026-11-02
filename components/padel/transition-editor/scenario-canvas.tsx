"use client"

/**
 * Contenedor medido del stage interactivo del editor (un paso).
 *
 * Regla D-T4: `EditorStage` importa `konva`/`react-konva` y es la ÚNICA puerta
 * del editor a Konva; entra exclusivamente por `dynamic({ ssr: false })`.
 *
 * Gestos (EC-04/AC-06): `touch-action: none` vive SÓLO en el `div` del canvas,
 * así el arrastre de jugadores/tiro no secuestra el scroll del resto de la
 * página. El ancho sale del alto (cancha 1:2) con el contenedor en `flex`, de
 * modo que el `Stage` recibe un viewport ya medido y sin letterbox.
 */

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import { useCourtConfig } from "@/components/court/useCourtConfig"
import type { CourtPoint, Paso, PlayerId, PlayerPositions } from "@/lib/padel/court/types"

const EditorStage = dynamic(() => import("@/components/court/EditorStage"), {
  ssr: false,
  loading: () => <CanvasLoading />,
})

/** Parche del tiro (destino y/o control de la curva) — mismo contrato que `EditorStage`. */
export type ShotPatch = { control?: CourtPoint; to?: CourtPoint }

export type ScenarioCanvasProps = {
  /** Paso activo. */
  step: Paso
  /** F7: `steps[i-1]?.positions ?? steps[i].positions`. */
  originPositions: PlayerPositions
  /** Jugador seleccionado (F8: sin `"ball"`). */
  selected: PlayerId | null
  onSelect: (target: PlayerId | null) => void
  onMovePlayer: (id: PlayerId, point: CourtPoint) => void
  onMoveShot: (patch: ShotPatch) => void
}

function CanvasLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground"
    >
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-xs">Cargando cancha…</span>
    </div>
  )
}

export function ScenarioCanvas({
  step,
  originPositions,
  selected,
  onSelect,
  onMovePlayer,
  onMoveShot,
}: ScenarioCanvasProps) {
  const { containerRef, isReady, width, height, dpr } = useCourtConfig()

  return (
    <div
      className="flex w-full justify-center"
      style={{ height: "clamp(300px, 54vh, 520px)" }}
    >
      <div
        ref={containerRef}
        role="group"
        aria-label={`Cancha del paso ${step.id}: arrastra los jugadores para moverlos`}
        className="relative h-full aspect-[1/2] touch-none select-none overflow-hidden rounded-xl border bg-muted shadow-sm"
      >
        {isReady ? (
          <EditorStage
            step={step}
            originPositions={originPositions}
            selected={selected}
            viewport={{ width, height, dpr }}
            onSelect={onSelect}
            onMovePlayer={onMovePlayer}
            onMoveShot={onMoveShot}
          />
        ) : (
          <CanvasLoading />
        )}
      </div>
    </div>
  )
}
