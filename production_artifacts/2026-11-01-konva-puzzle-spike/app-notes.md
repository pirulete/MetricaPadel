# App Notes — Spike Konva + Transición de Puzzle (T1: deps + lógica pura)

> change_id: 2026-11-01-konva-puzzle-spike · sub-task: **T1 de 4** · agente: @app-engineer
> date: 2026-11-01 · status: completed
> input: `technical-design.md` §3 (filas 6-10), §5, §9 (T1)

---

## 1. Paso A — Dependencias

### Verificación de peer (obligatoria, D1 / D-T1)

```
$ pnpm view react-konva@19.2.7 peerDependencies
{
  konva: '^8.0.1 || ^7.2.5 || ^9.0.0 || ^10.0.0',
  react: '^19.2.0',
  'react-dom': '^19.2.0'
}
```

Repo: `react@19.2.0` → **compatible** (`^19.2.0`). `react-konva@19.3.x` exige `react ^19.3.0` y se evita (sin caret, pin exacto).

### Instalación ejecutada

```
$ pnpm add konva react-konva@19.2.7
$ pnpm add -D @next/bundle-analyzer
```

| Paquete | Versión instalada | Spec en `package.json` |
|---|---|---|
| `konva` | **10.9.1** | `^10.9.1` |
| `react-konva` | **19.2.7** | `19.2.7` (exacto, sin caret — D-T1) |
| `@next/bundle-analyzer` | **16.4.3** | `^16.4.3` (dev) |
| `react` (existente) | 19.2.0 | `19.2.0` |

- `packages: +7`, sin errores de peer por konva/react-konva.
- Los 2 warnings de peers preexistentes (`eslint-plugin-react` ↔ eslint 10, `@sentry/nextjs` ↔ next 16) **no los introduce este change** (ya estaban antes).
- No se aplicó fallback E11: el peer match fue exacto, `react-konva` se instala.

---

## 2. Paso B — Archivos creados (5, todos puros)

| Archivo | Exports | Notas |
|---|---|---|
| `lib/padel/court/types.ts` | `COURT_WIDTH_M` (20), `COURT_DEPTH_M` (10), `CourtPoint`, `PlayerId`, `PlayerPositions`, `Trajectory`, `Paso`, `CourtScenario`, `CourtViewport` | Data plana → serializable (AC-07) |
| `lib/padel/court/geometry.ts` | `computeScale`, `computeOffsets`, `courtToPx`, `normalizeDpr`, `applyDpr`, `MAX_DPR` | Sin `window`; viewport por parámetro; viewport 0×0 → 0 sin `NaN`/`Infinity` (E5) |
| `lib/padel/court/steps.ts` | `clampStepIndex`, `resolveStepTransition`, `isSameStep` (+ tipos) | `path` = concatenación de pasos unitarios ⇒ salto N→M determinista (E1/E7) |
| `lib/padel/court/annotation.ts` | `computeArrowGeometry`, `computeDashProgress` (+ tipos) | Flecha en px vía `courtToPx`; dash forward `len→0`, backward `0→len` |
| `lib/padel/court/demo-scenario.ts` | `DEMO_SCENARIO` | 3 pasos, 4 jugadores, solo data; `label` alimenta `aria-live` |

Reglas respetadas: 0 imports de `konva`/`react`, sin `"use client"`, sin `any`, JSDoc breve en funciones públicas, estilo de `lib/padel/{score,evolution,radar}.ts`.

### Verificación

- `npx tsc --noEmit` → **exit 0** (0 errores, repo completo).

---

## 3. Desviaciones del diseño (menores, todas dentro del contrato)

1. **`computeDashProgress` recibe `totalLength` y un `direction` opcional** (`"forward" | "backward"`). El diseño lo escribió como `computeDashProgress(progress)` → `{ dashArray, dashOffset }`, pero el offset sólo tiene sentido respecto del largo real del tramo, que se conoce en píxeles vía `computeArrowGeometry`. Se mantiene la forma de retorno `{ dashArray, dashOffset }` y el default `forward`.
2. **`computeArrowGeometry(from, to, viewport)`** devuelve la flecha ya en píxeles (`x1,y1,x2,y2,length`) para que el renderer no recalcule nada. Misma firma de entrada que el diseño + viewport explícito (la pureza se mantiene: viewport por parámetro).
3. **`clampStepIndex(index, totalSteps)` acota a `0..totalSteps-1`** (índice válido de array), no a `0..N`. El diseño (§6) lo enunciaba como `clampStepIndex(N+5)=N`; devolver `N` con `N` pasos sería un índice fuera de rango y rompería E4. Documentado en el JSDoc.
4. **`PlayerPositions` es `Record<PlayerId, CourtPoint>`** con `PlayerId = "A"|"B"|"C"|"D"` (4 jugadores obligatorios), coherente con el escenario demo.
5. `next.config.mjs`, `.env.example` y el script `analyze` **no** se tocan en T1 (pertenecen a T4 según §9).

---

## 4. Pendientes para siguientes sub-tasks

- ~~**T2**~~ (hecho, ver §5).
- **T3**: `components/court/{CourtStage,CourtLayers,useCourtConfig,PuzzleDemo}` — `CourtStage` **default export** y único punto de entrada a Konva.
- **T4**: ruta `app/(app)/puzzle-demo/page.tsx`, `tests/e2e/puzzle-demo.spec.ts`, `FEATURES.md`, `next.config.mjs` + `.env.example` (opt-in `ANALYZE`).

---

## 5. T2 — Tests unitarios de lógica pura (3 archivos, escritos; NO ejecutados aquí)

> sub-task: **T2 de 4** · agente: @app-engineer · status: completed (code/tests escritos, ejecución pendiente del orquestador)
> input: `technical-design.md` §6 + firmas reales de `lib/padel/court/*` (desviaciones T1 documentadas en §3).

| Archivo | Cubre | Qué asevera |
|---|---|---|
| `tests/unit/padel/court-geometry.test.ts` | AC-08, AC-02, AC-03, E5 | `computeScale` usa el eje limitante y conserva 20:10; `computeOffsets` centra (0 en viewport 2:1, `offsetX`/`offsetY` en letterbox); `courtToPx(0,0)` y `courtToPx(20,10)` caen en las esquinas y el centro en el centro; `normalizeDpr` acota `[1, MAX_DPR]`; `applyDpr` escala ambos ejes con el mismo factor (aspect intacto); viewport 0×0/negativo/NaN/Infinity → escala 0 y 0 NaN/Infinity |
| `tests/unit/padel/court-steps.test.ts` | AC-08, E1, E4, E7 | `clampStepIndex(-1)=0`, `clampStepIndex(N+5)=N-1`, truncado de decimales, `totalSteps<=0 → 0`; `resolveStepTransition(0,3).path === [0,1,2,3]` y es idéntico a la concatenación de `0→1`, `1→2`, `2→3`; estado final coincide con la composición; determinismo (misma entrada → mismo resultado); reverso `3→0`; no-op `from===to` (`direction: "none"`, `path:[i]`); `isSameStep` |
| `tests/unit/padel/court-annotation.test.ts` | AC-08, AC-07, E5 | `computeDashProgress(0, L)` → `dashOffset=L` y `(1, L)` → `0`; `dashArray=[L,L]`; monotonicidad forward (500→0) y backward (0→500); complementariedad forward+backward=`L`; clamp de progreso y `length<=0/inválido` sin NaN; `computeArrowGeometry` convierte a px (esquinas y tramo diagonal con `hypot`); repetibilidad y round-trip JSON del escenario demo (`AC-07`); viewport 0×0 → longitud 0 finita |

Notas técnicas:
- 100% lógica pura (`testEnvironment` node vía docblock `@jest-environment node`), sin Konva, sin jsdom, sin snapshots.
- Sin dependencias nuevas ni helpers compartidos; estilo de `tests/unit/padel/pair.test.ts` (imports `@/lib/...`, `describe`/`it` en español).
- **No se ejecutó Jest/build/E2E en esta sub-task** (anti-loop, §9 del technical design); la ejecución de `pnpm run test:unit` corresponde al orquestador.

---

## 6. T3 — Componentes Konva (4 archivos, escritos; NO ejecutados aquí)

> sub-task: **T3 de 4** · agente: @app-engineer · status: completed (código escrito, build/E2E pendientes de @qa-release)
> input: `technical-design.md` §4 (patrón de integración) + §3 filas 2-5 + firmas reales de `lib/padel/court/*`.

| Archivo | Tipo | Exports | Notas |
|---|---|---|---|
| `components/court/useCourtConfig.ts` | hook client | `useCourtConfig`, `CourtConfig` | `ResizeObserver` + `devicePixelRatio` normalizado; delega en `geometry.ts`; devuelve `{ containerRef, isReady, width, height, scale, offsetX, offsetY, dpr, courtToPx }`. Cleanup `observer.disconnect()` (E9); `isReady=false` mientras 0×0 (E5) |
| `components/court/CourtLayers.ts` | puro (sin canvas) | `PLAYER_IDS`, `buildCourtLines`, `buildPlayerMarkers`, `buildArrow` (+ tipos de props) | 3 capas como **prop-builders planos**: perímetro 20×10 + red + 2 líneas de servicio (3,05 m de la red) + 2 líneas centrales; 4 marcadores `name="jugador-a..d"`; flecha con `dash`/`dashOffset` inicial (trazo oculto) |
| `components/court/CourtStage.tsx` | client, **default export** | `default CourtStage`, `CourtStageProps` | **Único** importador de `konva`/`react-konva`. `Stage` con `pixelRatio` por capa (`layer.getCanvas().setPixelRatio(dpr)`), 3 `Layer` z-ordered, tweens por refs (`node.to({duration:0.5, easing:Konva.Easings.EaseInOut})`), flecha con `dashOffset` animado, cleanup destruye tweens (E2) |
| `components/court/PuzzleDemo.tsx` | client | `PuzzleDemo` | `dynamic(() => import("./CourtStage"), { ssr: false, loading })`; `pasoActivo` + `clampStepIndex` (E4); botones deshabilitados en extremos; `aria-live="polite"` con `step.label` **fuera** del canvas (AC-12); `Card/Button` reutilizados |

### Verificación ejecutada

- `npx tsc --noEmit` → **exit 0** (0 errores en todo el repo).
- `npx eslint components/court` → **0 errores, 0 warnings**.
- Gate D-T4 por grep: `grep -rln "react-konva\|from \"konva\"" app/ components/` → **solo `components/court/CourtStage.tsx`**.
- No se ejecutó `next build`, `pnpm dev`, `jest` ni `playwright` (anti-loop §9).

### Desviaciones del diseño (todas dentro del contrato)

1. **`CourtLayers.ts` no es JSX.** §3/§4 lo describen como "nodos Konva", pero la regla dura D-T4 (y su gate grep) exige que `CourtStage` sea el único archivo que importa `konva`/`react-konva`. Se resolvió como **prop-builder puro** (`buildCourtLines`/`buildPlayerMarkers`/`buildArrow`) y `CourtStage` los mapea a `<Line>/<Circle>/<Arrow>`; así el archivo sigue sin lógica de negocio y sin canvas, y el gate queda verde. Documentado aquí para el revisor de D4.
2. **Konva 10 eliminó `Node#stop()`.** El "primero `node.stop()`" del diseño se implementa destruyendo los tweens que poseemos (`Tween#destroy()` = `pause()` + libera atributos, idempotente) **antes** de crear los nuevos. Mismo efecto determinista (E1/E7) y mismo cleanup en desmontaje (E2).
3. **La transición se hace en `useLayoutEffect`, no en `useEffect`.** React deja los nodos en el destino al re-renderizar; el layout effect los reposiciona en el origen anterior y anima hasta el destino **antes del paint**, evitando un frame con el salto ya aplicado. En resize no se anima (se preserva el paso activo, `step.id` como identidad).
4. **`dash`/`dashOffset`** son los nombres de atributo de Konva; `annotation.ts` devuelve `dashArray`/`dashOffset` y aquí sólo se renombra (`dash={dashArray}`).
5. **"Clase" de jugador = `name`** en Konva (no hay `className`): `jugador-a` … `jugador-d`, inspeccionable desde DevTools.
6. **Colores en hex literales** (líneas, equipos, flecha): el canvas no resuelve CSS variables de `globals.css`. Son valores del spike, no design tokens.
7. **Fix colateral obligatorio para el gate `typecheck`**: `tests/unit/padel/court-steps.test.ts:67` tenía `resolveStepTransition(state.to, target)` con acumulador `number` (error TS2339 de T2). Se corrigió a `resolveStepTransition(state, target).to` — cambio semánticamente idéntico, 1 token, fuera de los 4 archivos de T3.
8. No se creó `app/(app)/puzzle-demo/page.tsx` (es T4, como indica el contrato).

---

## 7. T4 — Ruta, E2E, config de bundle y docs (última sub-task)

> sub-task: **T4 de 4** · agente: @app-engineer · status: completed (código/spec/docs escritos; build + E2E pendientes de @qa-release)
> input: `technical-design.md` §4 (patrón de integración), §8 (env), §6 (E2E), §9 (T4) + `feature-spec.md` AC-09/AC-11/AC-12/AC-13.

| Archivo | Tipo | Notas |
|---|---|---|
| `app/(app)/puzzle-demo/page.tsx` | nuevo (server) | `validateUser()` → `if (session.user.status !== "ACTIVE") redirect("/dashboard")` → `<PuzzleDemo />` en `Section` (mismo patrón que `evaluar/pareja` y `evolucion`). Sin `"use client"`, sin `dynamic(`. JSDoc declara estados permitidos (ACTIVE + USER/ADMIN; TEMPORARY→/dashboard; LOCKED→/login vía guard) |
| `tests/e2e/puzzle-demo.spec.ts` | nuevo | Patrón de seed/login de `pair-evaluation.spec.ts` (Pool + bcryptjs + inserción ACTIVE); (a) sin sesión → `/login`; (b) ACTIVE → `aria-live` paso 1, "Siguiente paso" → paso 2, "Paso anterior" → paso 1 y `toBeDisabled()` en el paso 0 |
| `next.config.mjs` | modificado (+6) | `withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" })(nextConfig)` como `analyzedConfig`; Sentry envuelve ese resultado (o se exporta tal cual sin `SENTRY_AUTH_TOKEN`). Con la var ausente el wrapper es no-op → reversible borrando 3 líneas |
| `.env.example` | modificado (+2) | Edit puntual: sólo se añadió `# Bundle analysis (build local, no Vercel) — ANALYZE=true`. Ninguna otra var tocada |
| `FEATURES.md` | modificado | Entrada del spike (misma `change_id` ⇒ revisión in-place, no duplicado): tags alineados con el contrato, archivos reales, tests reales y sección nueva **Excepción de Gates (AC-13)** |

### Verificación ejecutada

- `npx tsc --noEmit` → **exit 0**.
- Gate D-T4 por grep: `grep -rln "react-konva\|from \"konva\"" app/ components/` → sólo `components/court/CourtStage.tsx` (la página nueva no importa Konva ni `dynamic`).
- **No se ejecutó** `next build`, `pnpm dev`, `pnpm analyze` ni `playwright` (anti-loop §9). El build es el gate que valida AC-05/AC-10; lo corre @qa-release.

### Desviaciones / notas para el revisor

1. **No se añadió script `analyze` a `package.json` en T4**: §3 fila 15 lo ubicaba junto a las deps (T1). Se dejó fuera del change para no tocar `package.json` otra vez; el equivalente es `ANALYZE=true next build`. Si @qa-release prefiere el script, es una línea y no requiere código nuevo.
2. `Section` se importa de `@/components/ui/section` (mismo import que las demás páginas privadas), no hay `BottomNav` (D-T9: sin entrada en navegación).
3. El E2E no siembra cursos/rúbricas: `/puzzle-demo` es data en memoria (`DEMO_SCENARIO`), así que el `beforeAll` sólo crea el usuario ACTIVE y el `afterAll` lo borra.
4. La entrada de `FEATURES.md` ya existía (creada en la fase de spec con el mismo `change_id`); se actualizó in-place según la regla de versioning de artifacts, no se agregó una segunda.

### Pendientes (fuera de @app-engineer)

- @ponytail-reviewer: podar componentes según la escalera.
- @qa-release: `pnpm analyze` (AC-05), `playwright test tests/e2e/puzzle-demo.spec.ts`, `next build` (AC-10), medición de bundle y go/no-go.

---

## Iteración 2 (2026-11-01) — cancha FIP norte-sur + figuras de persona

Cambio directo del usuario tras revisar la demo v1 (validado con mockup ASCII en TUI antes de codificar).

### Qué cambió
- `lib/padel/court/types.ts`: constantes ahora `COURT_WIDTH_M=10` / `COURT_DEPTH_M=20` (vertical norte→sur) + `NET_Y_M=10`, `SERVICE_LINE_OFFSET_M=6.95` (FIP), `SERVICE_LINE_OVERSHOOT_M=0.2`. Nuevo tipo `Shot`; `Paso.trajectory` reemplazado por `Paso.shot` (el tiro de la pelota; la pelota NO se dibuja). Nuevo tipo `MovementArrow` (derivado, no persistido).
- `lib/padel/court/annotation.ts`: +`deriveMovementArrows(from, to, order)` — flechas negras derivadas de posiciones con epsilon 0.01 m y orden estable A,B,C,D.
- `lib/padel/court/geometry.ts`: sólo docs (aspect 1:2); la lógica ya era genérica por constantes.
- `lib/padel/court/demo-scenario.ts`: escenario nuevo "globo al noreste y cruzado al fondo" (3 pasos, norte A/B vs sur C/D).
- `components/court/CourtLayers.ts`: `COURT_COLORS` (piso `#4169E1`, líneas `#F8FAFC`, red `#0F172A`, norte blanco, sur `#F59E0B`, mov. `#000000`, tiro `#4ADE80`); `buildFloor` (rect azul); líneas FIP (servicio a 6.95 m, central red→servicio+0.2); `buildPlayerFigures` (figuras persona, altura 1.5 m proporcional acotada 16..110 px); `buildMovementArrow`/`buildShotArrow` con `progress` paramétrico. Se eliminó el perímetro pintado (FIP: las paredes son el límite).
- `components/court/CourtStage.tsx`: componente `PlayerFigure` (cabeza/torso/brazos con pala/piernas, pivotes en hombro/cadera); caminata con `Konva.Animation` sobre la capa de actores, activa sólo durante tweens de movimiento (se detiene a los TWEEN+100ms y resetea la pose); N flechas negras + 1 verde animadas por `dashOffset`; flechas en data de cancha (estado) con px derivado en render (firma `step|viewport` → re-animan en resize); **fix E3**: resize con tween activo hace snap determinista al paso activo en vez de congelar a medio camino.
- `components/court/PuzzleDemo.tsx`: contenedor `aspect-[1/2] max-w-sm` (portrait), copy "10×20 m (norte → sur)", leyenda de 4 items fuera del canvas.
- Tests: `court-geometry.test.ts` reescrito (viewports portrait, aspect 1:2); `court-annotation.test.ts` +6 tests de `deriveMovementArrows` y round-trip por `shot`; total 44 tests del spike (38→44).

### Verificación Iteración 2
- `tsc --noEmit` 0 errores · `eslint` área 0 errores/0 warnings · unit **756/756** (60 suites) · E2E `puzzle-demo.spec.ts` **2/2** · `next build` OK.
- Screenshots Playwright de los 3 pasos inspeccionados: orientación, colores, líneas FIP, figuras y flechas correctos.

---

## Iteración 3 (2026-11-01) — homologación total al look de PadelChess

Input del usuario: "olvida mi spec para este caso y homologa todo a lo que tiene PadelChess; si lo puedes mejorar, mejor". Análisis previo: HTML de padelchess.me + descarga de sus chunks JS (config `courtConfig`, sistema de sprites/poses, `tweenMs`, modelo de puzzles con `controlPoint`) + screenshots del home y `/puzzles?questionId=16`.

### Qué cambió
- `lib/padel/court/types.ts`: constantes de línea → estilo PadelChess (servicio a 7 m, overshoot 0,4 m). `Shot` ahora es Bézier cuadrática `{from, control, to, label}`. Eliminado `MovementArrow` (PadelChess no dibuja flechas de movimiento).
- `lib/padel/court/annotation.ts`: eliminados `deriveMovementArrows` y `computeArrowGeometry`; nuevos `quadraticPoint` (B(t) con t acotado) y `computeCurveGeometry` (muestrea 32 segmentos → polilínea px + longitud + punto medio).
- `lib/padel/court/demo-scenario.ts`: shots con `control` + `label` ("GLOBO", "CRUZADO").
- `components/court/CourtLayers.ts`: `COURT_COLORS` homologado a los tokens de PadelChess (`court #3b82f6`, `yellow #ffff04`, `green #68fec3`, kits, piel/pelo/pala, sombras); `buildFloor` con radius 8; `buildCourtLines` con sombra + tramo de centro atenuado bajo la red (5 segmentos); nuevos `buildWallPosts` (dashes laterales), `buildNet` (banda+malla+cinta con sag+postes), `buildShotView` (curva+etiqueta al midpoint+zona+ruta pelota+tag HIT). Eliminados `buildMovementArrow(s)`.
- `components/court/CourtParts.tsx` (nuevo): `PlayerFigure` (sombra elíptica, kit por equipo, cara/pelo, brazos con pala, piernas con zapatillas; pivotes cadera/hombro), `Bubble` (burbuja de etiqueta), `Net`. Extraído de CourtStage por la regla <500 líneas de ponytail.
- `components/court/CourtStage.tsx`: UN solo reloj `requestAnimationFrame` de 1000 ms (padelchess `tweenMs`) con `easeInOut` propio: interpola posiciones, cadencia de carrera (sin fase, ±0.55 rad), vuelo de la pelota por la polilínea, `dashOffset` de la curva, fade de etiquetas/zona. Resize/montaje → snap sin animación (E3). Eliminados tweens `node.to()` y refs de flechas de movimiento. D-T4 intacto: todo Konva entra por CourtStage (CourtParts es importado por él).
- `components/court/PuzzleDemo.tsx`: copy "estilo PadelChess" + leyenda nueva (kits, tiro con pelota, zona).
- `tests/unit/padel/court-annotation.test.ts`: reescrito para `quadraticPoint`/`computeCurveGeometry` (endpoints, punto medio fuera de la cuerda, longitud > cuerda, round-trip JSON, E5) — 18 tests.

### Bugs encontrados y corregidos en el camino
1. `quadraticPoint` usaba `t` crudo tras acotar `u` → t fuera de rango extrapolaba; corregido acotando `s` primero.
2. `Konva.Easings.EaseInOut(t)` exige 4 args (firma tween) → reemplazado por easing propio de 1 línea.
3. Brazo derecho dibujado en la misma X que el izquierdo (error de refactor) → corregido con `±shoulderX`.
4. `react-hooks/refs`: lectura de `drawnSigRef.current` en render → eliminado el estado `settled` (el snap del efecto cubre el caso).

### Verificación Iteración 3
- `tsc --noEmit` 0 errores · `eslint components/court lib/padel/court` **0 errores, 0 warnings** (max-lines resuelto con CourtParts) · unit **754/754** · E2E **2/2** · `next build` OK.
- Screenshots Playwright de los 3 pasos inspeccionados: piso redondeado, red con malla/sag/postes, postes laterales, kits morado/blanco con sombra y pala, curva amarilla discontinua, pelota lima en destino, burbujas GLOBO/CRUZADO + HIT, zona mint.
