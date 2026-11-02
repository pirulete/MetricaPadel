"use client"

/**
 * Medición del contenedor del canvas (ResizeObserver + devicePixelRatio).
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * El cálculo vive en `lib/padel/court/geometry.ts` (puro); este hook sólo mide
 * el DOM y expone el resultado ya en píxeles CSS. Sin Konva: lo consumen
 * `PuzzleDemo` (layout) y `CourtStage` (props).
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import {
  computeOffsets,
  computeScale,
  courtToPx as courtToPxWithViewport,
  normalizeDpr,
} from "@/lib/padel/court/geometry"
import type { CourtPoint, CourtViewport } from "@/lib/padel/court/types"

export type CourtConfig = {
  /** Contenedor a medir (`aspect-[1/2]` en el markup). */
  containerRef: RefObject<HTMLDivElement | null>
  /** `false` mientras el contenedor mide 0×0: el Stage no debe renderizarse (E5). */
  isReady: boolean
  width: number
  height: number
  scale: number
  offsetX: number
  offsetY: number
  dpr: number
  /** Punto de cancha (metros) → píxeles del contenedor. */
  courtToPx: (point: CourtPoint) => CourtPoint
}

const INITIAL_VIEWPORT: CourtViewport = { width: 0, height: 0, dpr: 1 }

export function useCourtConfig(): CourtConfig {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState<CourtViewport>(INITIAL_VIEWPORT)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const measure = () => {
      const rect = element.getBoundingClientRect()
      const next: CourtViewport = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        dpr: normalizeDpr(window.devicePixelRatio),
      }
      // Evita renders con el mismo tamaño (el observer dispara de más).
      setViewport((prev) =>
        prev.width === next.width && prev.height === next.height && prev.dpr === next.dpr
          ? prev
          : next
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect() // E9: ni observers ni listeners huérfanos
  }, [])

  const courtToPx = useCallback(
    (point: CourtPoint) => courtToPxWithViewport(point, viewport),
    [viewport]
  )

  const { offsetX, offsetY } = computeOffsets(viewport)

  return {
    containerRef,
    isReady: viewport.width > 0 && viewport.height > 0,
    width: viewport.width,
    height: viewport.height,
    scale: computeScale(viewport),
    offsetX,
    offsetY,
    dpr: viewport.dpr,
    courtToPx,
  }
}
