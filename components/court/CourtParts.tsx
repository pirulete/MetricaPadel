"use client"

/**
 * Componentes de presentación de la escena Konva (figuras de jugador,
 * burbujas de etiqueta y red). SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * Extraídos de `CourtStage.tsx` para mantenerlo bajo 500 líneas (regla
 * ponytail). Siguen siendo parte del único árbol que importa
 * `konva`/`react-konva` (regla D-T4): sólo se montan a través de CourtStage,
 * que entra al bundle vía `dynamic(..., { ssr: false })`.
 */

import { Arc, Circle, Group, Line, Path, Rect, Text } from "react-konva"
import type Konva from "konva"
import { COURT_COLORS, type NetProps, type PlayerFigureProps } from "./CourtLayers"

export const LIMB_SELECTORS = [".arm-l", ".arm-r", ".leg-l", ".leg-r"] as const

export function PlayerFigure({
  figure,
  groupRef,
}: {
  figure: PlayerFigureProps
  groupRef: (node: Konva.Group | null) => void
}) {
  const h = figure.height
  const headR = h * 0.105
  const headY = -h * 0.885
  const shoulderY = -h * 0.74
  const shoulderX = h * 0.16

  return (
    <Group x={figure.x} y={figure.y} listening={false} ref={groupRef}>
      {/* Sombra en el piso */}
      <Circle x={0} y={0} radiusX={h * 0.28} radiusY={h * 0.085} fill={COURT_COLORS.groundShadow} />
      {/* Pierna izquierda (pivote en la cadera) */}
      <Group x={-h * 0.05} y={-h * 0.42} name="leg-l">
        <Rect x={-h * 0.04} y={0} width={h * 0.075} height={h * 0.38} fill={figure.skin} cornerRadius={h * 0.03} />
        <Rect x={-h * 0.05} y={h * 0.35} width={h * 0.095} height={h * 0.05} fill={COURT_COLORS.shoe} cornerRadius={h * 0.02} />
      </Group>
      {/* Pierna derecha (pivote en la cadera) */}
      <Group x={h * 0.05} y={-h * 0.42} name="leg-r">
        <Rect x={-h * 0.035} y={0} width={h * 0.075} height={h * 0.38} fill={figure.skin} cornerRadius={h * 0.03} />
        <Rect x={-h * 0.045} y={h * 0.35} width={h * 0.095} height={h * 0.05} fill={COURT_COLORS.shoe} cornerRadius={h * 0.02} />
      </Group>
      {/* Short */}
      <Rect x={-h * 0.12} y={-h * 0.52} width={h * 0.24} height={h * 0.15} fill={figure.shorts} cornerRadius={h * 0.04} />
      {/* Torso (camiseta del kit) */}
      <Rect x={-h * 0.13} y={-h * 0.77} width={h * 0.26} height={h * 0.27} fill={figure.jersey} cornerRadius={h * 0.07} />
      {/* Brazo izquierdo (pivote en el hombro) */}
      <Group x={-shoulderX} y={shoulderY} name="arm-l">
        <Rect x={-h * 0.045} y={0} width={h * 0.09} height={h * 0.1} fill={figure.jersey} cornerRadius={h * 0.03} />
        <Rect x={-h * 0.032} y={h * 0.07} width={h * 0.064} height={h * 0.2} fill={figure.skin} cornerRadius={h * 0.03} />
      </Group>
      {/* Brazo derecho con pala (pivote en el hombro) */}
      <Group x={shoulderX} y={shoulderY} name="arm-r">
        <Rect x={-h * 0.045} y={0} width={h * 0.09} height={h * 0.1} fill={figure.jersey} cornerRadius={h * 0.03} />
        <Rect x={-h * 0.032} y={h * 0.07} width={h * 0.064} height={h * 0.17} fill={figure.skin} cornerRadius={h * 0.03} />
        {/* Pala: mango + marco */}
        <Line
          points={[h * 0.02, h * 0.2, h * 0.09, h * 0.3]}
          stroke={COURT_COLORS.shoe}
          strokeWidth={Math.max(1, h * 0.022)}
          lineCap="round"
        />
        <Arc
          x={h * 0.13}
          y={h * 0.36}
          innerRadius={h * 0.045}
          outerRadius={h * 0.085}
          angle={280}
          rotation={200}
          fill={COURT_COLORS.racket}
        />
        <Arc
          x={h * 0.13}
          y={h * 0.36}
          innerRadius={h * 0.058}
          outerRadius={h * 0.074}
          angle={280}
          rotation={200}
          fill={COURT_COLORS.racketStrings}
        />
      </Group>
      {/* Cabeza: pelo + cara (o sólo pelo en vista trasera) */}
      <Circle x={0} y={headY} r={headR} fill={COURT_COLORS.hair} />
      {figure.view === "face" ? (
        <>
          <Circle x={0} y={headY + headR * 0.18} r={headR * 0.86} fill={figure.skin} />
          <Circle x={-headR * 0.33} y={headY + headR * 0.1} r={Math.max(0.8, headR * 0.13)} fill="#171717" />
          <Circle x={headR * 0.33} y={headY + headR * 0.1} r={Math.max(0.8, headR * 0.13)} fill="#171717" />
        </>
      ) : null}
    </Group>
  )
}


export function Bubble({
  x,
  y,
  text,
  fill,
  ink,
  fontSize,
  nodeRef,
}: {
  x: number
  y: number
  text: string
  fill: string
  ink: string
  fontSize: number
  nodeRef: (node: Konva.Group | null) => void
}) {
  const width = Math.max(36, text.length * fontSize * 0.6) + fontSize
  const height = fontSize * 1.7
  const fontFamily = "Impact, 'Arial Narrow', 'Avenir Next Condensed', sans-serif"
  return (
    <Group x={x} y={y} listening={false} ref={nodeRef}>
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill={fill}
        cornerRadius={height / 2}
        shadowColor="rgba(12,29,68,0.25)"
        shadowBlur={6}
        shadowOffsetY={2}
      />
      <Text
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        text={text}
        fill={ink}
        fontFamily={fontFamily}
        fontSize={fontSize}
        align="center"
        verticalAlign="middle"
      />
    </Group>
  )
}


export function Net({ net }: { net: NetProps }) {
  return (
    <Group listening={false}>
      <Rect
        x={net.band.x}
        y={net.band.y}
        width={net.band.width}
        height={net.band.height}
        fill={COURT_COLORS.netBand}
      />
      {net.meshV.map((points, i) => (
        <Line key={`v${i}`} points={points} stroke={COURT_COLORS.netMesh} strokeWidth={1} />
      ))}
      {net.meshH.map((points, i) => (
        <Line key={`h${i}`} points={points} stroke={COURT_COLORS.netMesh} strokeWidth={1} />
      ))}
      <Line
        points={net.tapeBottom}
        stroke={COURT_COLORS.netTapeBottom}
        strokeWidth={2}
        lineCap="round"
      />
      <Path data={net.tapeTop} stroke={COURT_COLORS.netTape} strokeWidth={2} lineCap="round" />
      {net.posts.map((post) => (
        <Rect
          key={post.key}
          x={post.x}
          y={post.y}
          width={post.width}
          height={post.height}
          fill={post.fill}
          cornerRadius={3}
        />
      ))}
    </Group>
  )
}

