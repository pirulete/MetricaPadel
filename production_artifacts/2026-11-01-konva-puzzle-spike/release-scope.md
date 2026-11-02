# Release Scope — Spike: Konva + Transición de Puzzle tipo PadelChess

> change_id: 2026-11-01-konva-puzzle-spike
> release: spike (no productivo)
> date: 2026-11-01
> module: padel
> tags: [ui, spike, konva, canvas, padel, animation]
> loop-metrics module: infra
> status: proposed

## Alcance del Spike

Este "release" **no es un release de producto**. Es una ventana de 2-4 días para validar el camino técnico de canvas/Konva antes de comprometerse con el módulo de puzzles. El entregable real es una **decisión go/no-go documentada**, y el código es desechable por diseño.

### Entra

| # | Entregable | Evidencia |
|---|-----------|-----------|
| 1 | `konva` + `react-konva` instalados con pnpm, importados solo client-side (`next/dynamic`, `ssr: false`) | Bundle analyzer / build |
| 2 | Escena estática de cancha de padel (líneas proporcionales, 3 capas z-ordered) | Demo corriendo |
| 3 | Puzzle de ejemplo con 2+ pasos, escenario en **unidades de cancha** (data serializable) | `PuzzleDemo.tsx` / tipo `Paso[]` |
| 4 | Transición forward: desplazamiento 300-600ms + easing in-out + flecha con `strokeDashoffset` progresivo | Demo + DevTools Performance |
| 5 | Transición rewind (paso anterior) determinista | Demo |
| 6 | Nitidez retina (DPR) y resize sin recrear escena | Demo + Safari iOS |
| 7 | Controles avanzar/retroceder con clamp de índice y `stop()` antes de cada tween | Demo + unit tests |
| 8 | Texto alternativo del paso activo accesible fuera del canvas | DOM inspeccionable / E2E |
| 9 | Unit tests de lógica pura (escala/`courtToPx`, máquina de pasos N→M, dashoffset, clamp) | `tests/unit/` |
| 10 | 1 E2E happy path navegable en `/puzzle-demo` | `tests/e2e/*.spec.ts` |
| 11 | Entrada en `FEATURES.md` con metadata del change_id | `FEATURES.md` |
| 12 | Reporte go/no-go con datos (FPS, bundle, compatibilidad) | `release-report.md` / `90-metrics.json` |

### No entra

- Editor de puzzles, formato de datos de puzzle, backend de puzzles, carga desde DB/API.
- Persistencia de puzzles, sesiones de puzzle, multi-usuario/colaboración.
- Conexión con evaluaciones, cursos, alumnos, rúbricas o cualquier dato del dominio.
- Responsive/layout de producto, design system pass, estados de error y loading de producto.
- Endpoints, tablas, migraciones, `lib/api-docs/spec.ts` (**excepción de gate documentada**).
- Interacción sobre jugadores (clicks/hit regions), analytics, i18n.
- Fade del estado anterior (bonus opcional, no bloqueante).

## Módulos Afectados

| Módulo | Archivos esperados | Impacto |
|--------|--------------------|---------|
| UI (nuevo) | `app/(app)/puzzle-demo/page.tsx`, `components/court/{CourtStage,CourtLayers,PuzzleDemo}.tsx`, `components/court/useCourtConfig.ts` | Medio — todo nuevo y aislado en `components/court/` |
| Lógica pura | Lógica de pasos/escala/dashoffset (extraída para testear sin Konva) | Bajo |
| Auth/guard | Declaración de estados permitidos para `/puzzle-demo` (`ACTIVE` + `ADMIN`) reutilizando guard existente | Bajo — sin cambios en auth.ts ni en guards |
| Dependencias | `package.json` + `pnpm-lock.yaml` (`konva`, `react-konva`; `@next/bundle-analyzer` para medición) | Medio — primera lib de canvas del repo |
| Tests | `tests/unit/`, `tests/e2e/` | Bajo-medio |
| Docs | `FEATURES.md` (entrada del spike), nota de decisión final en el artifact del change | Bajo |
| DB / API / Auditoría | **Ninguno** | Nulo |

## Plan día a día (D1-D4)

### D1 — Setup + escena estática
- `pnpm add konva react-konva` verificando compatibilidad con React 19.2.
- Montar el patrón client-only: contenedor client → `next/dynamic(ssr:false)` → `CourtStage`.
- `useCourtConfig`: escala, offsets, `courtToPx`, manejo de DPR.
- Escena de cancha estática con líneas proporcionales + 4 marcadores de jugador en posiciones del paso 0.
- **Salida**: la cancha se ve, nítida, y el build pasa (sin SSR break).

### D2 — Avanzar / retroceder
- Tipo `Paso` (data serializable) + puzzle de ejemplo con 2-3 pasos.
- Estado React solo para `pasoActivo`; animación por refs a nodos Konva en `useEffect`.
- `stop()` previo a cada tween; clamp de índice; controles "Siguiente"/"Anterior".
- **Salida**: forward y rewind funcionan; toggles rápidos convergen sin fantasmas.

### D3 — Polish
- Flecha de trayectoria con `strokeDasharray` + `strokeDashoffset` animado (dibujo progresivo, y contracción en rewind).
- Resize con `ResizeObserver` sin recrear escena; DPR en caliente.
- Texto alternativo del paso activo (`aria-live`), validación de touch scroll en Safari iOS.
- Unit tests de lógica pura extraída.
- **Salida**: AC-01..AC-04 y AC-06 verificables; unit tests verdes.

### D4 — Buffer + checklist
- E2E happy path en `/puzzle-demo`.
- Medición de bundle (`@next/bundle-analyzer`) → AC-05 (≤ 100KB gzip combinado, ausente del entry de home/`/dashboard`).
- Correr gates: `typecheck`, `lint`, `build`, `coverage` (≤3% regresión), `FEATURES.md`.
- Escribir el **reporte go/no-go** con datos.
- **Salida**: decisión documentada.

## Criterio de Go / No-Go

Al terminar D4, la decisión se toma con la demo en mano y estos datos:

### GO (continuar con canvas/Konva para el módulo de puzzles) si:
- AC-01..AC-07 se cumplen sin parches frágiles (60fps, retina, resize, estabilidad, bundle ≤100KB gzip combinado con dynamic import, Chrome + Safari iOS, estado serializable).
- El patrón refs-vs-estado resultó mantenible y no generó "puentes" feos entre React y Konva.
- Los 4 días alcanzaron sin deuda crítica; el camino para el módulo real es extrapolable.

### NO-GO (pivotar a SVG/anime.js) si:
- No se sostienen 60fps sin optar por trabajo off-main-thread o reescrituras no triviales.
- La integración con Next 16 / React 19.2 exige hacks (wrapper propio sobre `konva`, workarounds de SSR, versiones forzadas) que el equipo no quiere cargar a largo plazo.
- El bundle combinado supera 100KB gzip con dynamic import, o se cuela en el entry bundle.
- El manejo de accesibilidad o touch iOS resulta inviable sin soluciones ad-hoc.

### Salida intermedia
Si falla en D2/D3 por incompatibilidad de `react-konva` con React 19.2, se evalúa **Konva puro** (sin capa React) antes de declarar no-go: el criterio es validar *canvas*, no *react-konva*.

## Rollout y limpieza

- **Sin migraciones, sin variables de entorno nuevas, sin cambios de contract API.** No requiere fase de DB ni de backend.
- La ruta `app/(app)/puzzle-demo`, `components/court/*` y su E2E **son borrables** tras la decisión: si el go/no-go es NO-GO o si el módulo real los reemplaza, se eliminan junto con las dependencias (`pnpm remove konva react-konva` si no se adoptan) y la entrada de `FEATURES.md` queda marcada como `deprecated` con referencia al reporte.
- Commit a `rama-preview` (regla del repo); nada de merge a `main` desde este workflow.
- **Regla de gate**: `lib/api-docs/spec.ts` y el happy-path con SQL **no aplican** — se documenta la excepción (AC-13) para que `validate-harness.js --api-docs` / `--api-integration` no reporten un falso negativo.

## Notas

- `module: padel` para la entry de `FEATURES.md`; para `scripts/loop-metrics.js` usar `--module infra` (el spike no toca lógica de dominio).
- `status` del change_id evoluciona: `proposed` → `in-progress` (D1) → `released` (solo al cerrar con go/no-go documentado y gates verdes).
- Sin impacto en `ARCHITECTURE.md` hasta que haya decisión de adoptar Konva como dependencia permanente.
