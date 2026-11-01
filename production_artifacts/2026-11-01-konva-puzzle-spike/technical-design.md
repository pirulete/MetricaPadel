# Technical Design — Spike: Konva + Transición de Puzzle (PadelChess)

> change_id: 2026-11-01-konva-puzzle-spike
> release: spike (no productivo) · module: padel · date: 2026-11-01
> loop-metrics module: infra
> status: proposed → in-progress al iniciar D1
> inputs: `feature-spec.md` (D1-D8, AC-01..AC-13, E1-E11), `release-scope.md` (D1-D4, go/no-go)

---

## 1. Resumen de la solución técnica

Spike 100% client-side, aislado en una ruta privada nueva. **Cero DB, cero endpoints, cero cambios de auth.ts/guards, cero variables de entorno de runtime.** El riesgo real a despejar es de integración (Konva en App Router + React 19.2) y de rendimiento (animar sin re-render de React).

Estrategia de arquitectura (3 reglas duras):

1. **Todo el árbol Konva detrás de `"use client"` + `next/dynamic({ ssr: false })` desde un Client Component.** El `page.tsx` **no** importa Konva ni `react-konva` de forma estática (si no, el módulo se evalúa en el server/build y rompe el build).
2. **Animación sólo por refs a nodos Konva** (`node.to()` / `Konva.Tween` sobre `stageRef`/`layerRef`); el estado React guarda únicamente `pasoActivo` y `containerSize`. Nunca `requestAnimationFrame` + `setState` por frame.
3. **Lógica pura (geometría, máquina de pasos, dashoffset, clamp) vive en `lib/padel/court/*`** — sin imports de `konva`, `react` ni `"use client"` — para poder testearse en Jest (`testEnvironment: node`) y sumar a la cobertura de `lib/**`.

---

## 2. Decisiones técnicas (D-T)

| # | Decisión | Justificación / verificación |
|---|----------|------------------------------|
| **D-T1** | **`react-konva` pineado exacto en `19.2.7`** (no `^19.2.7`) | Verificado en registry: `react-konva@19.3.x` declara `peerDependencies.react: ^19.3.0` y el repo tiene `react@19.2.0` → instalar 19.3.x rompe peers. `19.2.5/19.2.6/19.2.7` declaran `react: ^19.2.0`. Se elige el techo de esa línea (19.2.7). **Sin caret** para que un futuro `pnpm up` no salte a la línea 19.3. |
| **D-T2** | **`konva@^10.9.1`** | El peer de `react-konva@19.2.7` acepta `konva ^7 \|\| ^8 \|\| ^9 \|\| ^10`. Konva 10.9.1 es latest. Sus peers `canvas`/`skia-canvas` son opcionales (sólo para Node rendering), no aplican en browser. |
| **D-T3** | **Patrón de integración (obligatorio)**: `page.tsx` = Server Component con guard → renderiza `PuzzleDemo` (Client) → `CourtStage` entra sólo por `dynamic(..., { ssr: false })` con **default export** | En Next 16, `ssr: false` en `next/dynamic` **sólo es válido dentro de un Client Component** (en un Server Component lanza error de build). El page debe quedarse server porque necesita `await auth()`. Default export evita el `.then(m => m.X)` que el lint de simplicidad penaliza (D-T8). |
| **D-T4** | **`CourtStage` no se importa estáticamente en ningún otro archivo** (sólo vía `dynamic`) | Si `page.tsx` o `PuzzleDemo.tsx` lo importan estáticamente, konva+react-konva colapsan en el chunk de la ruta/entrada y se pierde AC-05. Regla verificable por grep en el gate manual de D4. |
| **D-T5** | **Lógica pura → `lib/padel/court/`**, hook/componentes → `components/court/` | `jest.config.js` sólo recolecta cobertura de `lib/**/*.ts` y `testEnvironment: node` (sin canvas). La lógica en `components/` no sería testeable ni cubierta (D8 de la spec). |
| **D-T6** | **Sin contratos API** (ninguno nuevo, ninguno modificado). `lib/api-docs/spec.ts` **no se toca** | No hay endpoints ni DB. Excepción AC-13 documentada §7 y en `FEATURES.md`. Riesgo de falso negativo del gate `--api-docs` / `--api-integration`: se deja constancia en `evidence-manifest.json` y en el release report. |
| **D-T7** | **Sin variables de entorno nuevas de runtime.** Un único flag build-only `ANALYZE=true` documentado como comentario en `.env.example` | Ver §8. No hay secretos, ni URLs, ni flags de producto. |
| **D-T8** | **Fallback E11**: si `react-konva@19.2.7` falla (build o runtime), se sustituye **sólo `CourtStage`** por un wrapper con `konva` puro + refs, manteniendo su interfaz pública (`props`) | El contrato de `CourtStage` es el punto de desacople: `PuzzleDemo`/`CourtLayers` deben depender sólo de esa interfaz para que el fallback no se propague. Coste estimado: +1 archivo (`CourtStageKonva.tsx`), `pnpm remove react-konva`. Se documenta en `release-report.md` como desviación. |
| **D-T9** | **Sin entrada en navegación** (no se toca `bottom-nav.tsx`) | Ruta alcanzable por URL; es spike borrable. Evita diffs en componentes compartidos (menos riesgo de regresión de UI). |
| **D-T10** | **`ARCHITECTURE.md` y `AGENTS.md` NO se actualizan en este change** | Decisión explícita de `release-scope.md` §Notas: no hay decisión de adoptar Konva como stack permanente. Se actualizarán en el go/no-go (o se elimina todo). No cambian roles de agente, workflows, gates ni estructura permanente. |

---

## 3. Archivos a tocar (estructura propuesta, estimación de líneas)

| # | Archivo | Tipo | Líneas est. | Contenido |
|---|---------|------|------------:|-----------|
| 1 | `app/(app)/puzzle-demo/page.tsx` | nuevo | ~35 | Server Component: `validateUser()` + check explícito `status !== "ACTIVE"` → `redirect("/dashboard")`; renderiza `<PuzzleDemo />` con `Section` |
| 2 | `components/court/PuzzleDemo.tsx` | nuevo (client) | ~130 | `"use client"`; `dynamic(() => import("./CourtStage"), { ssr: false, loading })`; estado `pasoActivo`; botones Siguiente/Anterior con clamp; `aria-live` con el texto alternativo del paso |
| 3 | `components/court/CourtStage.tsx` | nuevo (client, **default export**) | ~140 | `Stage` de react-konva; `ResizeObserver` sobre el contenedor; `pixelRatio: devicePixelRatio`; orquesta `CourtLayers`; expone refs de nodos para los tweens en `useEffect`; `cleanup` que hace `node.stop()`/destruye tweens (E2) |
| 4 | `components/court/CourtLayers.tsx` | nuevo (client) | ~150 | 3 capas z-ordered: cancha (estática), actores (4 marcadores), anotaciones (flecha con `strokeDasharray`/`strokeDashoffset`). Props derivadas de `lib/padel/court` — sin lógica de negocio propia |
| 5 | `components/court/useCourtConfig.ts` | nuevo (hook client) | ~80 | Mide contenedor (`ResizeObserver`) + DPR; delega el cálculo en `lib/padel/court/geometry.ts`; devuelve `{ width, height, scale, offsetX, offsetY, courtToPx, dpr }` |
| 6 | `lib/padel/court/types.ts` | nuevo (puro) | ~40 | `CourtPoint`, `PlayerPositions`, `Paso` (data serializable, AC-07), `CourtScenario`, `CourtViewport` |
| 7 | `lib/padel/court/geometry.ts` | nuevo (puro) | ~70 | `computeScale`, `computeOffsets`, `courtToPx`, `applyDpr` — sin `window` (viewport por parámetro) |
| 8 | `lib/padel/court/steps.ts` | nuevo (puro) | ~60 | `clampStepIndex` (E4), `resolveStepTransition(from, to)` (E1/E7), `isSameStep` |
| 9 | `lib/padel/court/annotation.ts` | nuevo (puro) | ~50 | `computeArrowGeometry`, `computeDashProgress(progress)` → `{ dashArray, dashOffset }` (forward/reverse) |
| 10 | `lib/padel/court/demo-scenario.ts` | nuevo (puro, data) | ~70 | Escenario demo 3 pasos en unidades de cancha (20×10 m) + trayectorias; exportable a JSON (AC-07) |
| 11 | `tests/unit/padel/court-geometry.test.ts` | nuevo | ~70 | AC-08: escala/offsets/`courtToPx`/DPR |
| 12 | `tests/unit/padel/court-steps.test.ts` | nuevo | ~60 | AC-08: máquina N→M determinista, clamp 0..N, no-op en extremos |
| 13 | `tests/unit/padel/court-annotation.test.ts` | nuevo | ~50 | AC-08: `strokeDashoffset` progresivo y reverso |
| 14 | `tests/e2e/puzzle-demo.spec.ts` | nuevo | ~80 | AC-09: seed usuario ACTIVE (patrón `pair-evaluation.spec.ts`), login, `/puzzle-demo`, click "Siguiente paso", assert `aria-live` cambia |
| 15 | `package.json` + `pnpm-lock.yaml` | modificado | — | `konva`, `react-konva@19.2.7`, `-D @next/bundle-analyzer`; script `"analyze": "ANALYZE=true next build"` |
| 16 | `next.config.mjs` | modificado (reversible) | +6 | `withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" })` envolviendo `nextConfig` |
| 17 | `.env.example` | modificado (1 comentario) | +3 | `# ANALYZE=true` (build-only, opcional) |
| 18 | `FEATURES.md` | modificado | +40 | Entrada del spike con metadata, marcada **no productiva / borrable** (AC-11) |

**Ningún archivo supera 300 líneas estimadas → no se requiere split por tamaño.** El split aplica por **límite de archivos por agente** (§9), no por longitud.

**Archivos explícitamente NO tocados**: `lib/db/schema.ts`, `drizzle/**`, `auth.ts`, `lib/auth/**`, `lib/audit/**`, `lib/api-docs/spec.ts`, `components/ui/**`, `components/layout/**`, `components/padel/**`, `scripts/validate-harness.js`.

---

## 4. Patrón de integración exacto (contrato de desacople)

```
app/(app)/puzzle-demo/page.tsx                    ← SERVER ("use client" NO)
  └─ components/court/PuzzleDemo.tsx              ← "use client"  (wrapper contenedor)
       └─ next/dynamic(() => import("./CourtStage"), { ssr: false })   ← ÚNICO punto de entrada a Konva
            └─ components/court/CourtStage.tsx    ← "use client" + export default
                 └─ components/court/CourtLayers.tsx  ← nodos Konva (Rect/Line/Circle/Arrow)
       └─ useCourtConfig()  →  lib/padel/court/geometry.ts (puro)
```

```tsx
// app/(app)/puzzle-demo/page.tsx  (Server Component)
import { redirect } from "next/navigation"
import { validateUser } from "@/lib/auth/admin-guard"
import { PuzzleDemo } from "@/components/court/PuzzleDemo"

export default async function PuzzleDemoPage() {
  const session = await validateUser()               // no session → /login ; LOCKED → /login
  if (session.user.status !== "ACTIVE") redirect("/dashboard")  // TEMPORARY fuera (D7 / AC-12 / E10)
  return <PuzzleDemo />                              // USER y ADMIN/SUPER_ADMIN permitidos
}
```

```tsx
// components/court/PuzzleDemo.tsx
"use client"
import dynamic from "next/dynamic"
const CourtStage = dynamic(() => import("./CourtStage"), {
  ssr: false,
  loading: () => <div className="aspect-[2/1] w-full animate-pulse rounded-lg bg-muted" />,
})
```

Reglas verificables (gate manual en D4):
- `grep -r "react-konva\|from \"konva\"" app/ components/ | grep -v CourtStage` → **sin resultados** (D-T4).
- `page.tsx` no contiene `"use client"` ni `dynamic(`.
- `CourtStage.tsx` no recibe callbacks que disparen `setState` por frame.

---

## 5. Impacto por área

### Auth (bajo — reutilización, sin cambios)

| Aspecto | Estado |
|---|---|
| Archivos de auth modificados | **Ninguno** (`auth.ts`, `lib/auth/**` intactos) |
| Mecanismo | `app/(app)/layout.tsx` ya aplica `validateUser()` + bloqueo de `TEMPORARY`; la página **refuerza explícitamente** `status === "ACTIVE"` (defensa en profundidad + declaración legible, AC-12) |
| Estados de ruta | **`ACTIVE`** (status) para **USER** y **ADMIN/SUPER_ADMIN** (roles). `TEMPORARY` → `redirect("/dashboard")`; `LOCKED` → `redirect("/login")` (vía `validateUser`). `LOCKED` nunca permitido. |
| Roles | Ambos roles ven la demo (D7). No se usa `validateAdmin` (no es back-office) |
| Auditoría | **No aplica**: no hay mutación de datos, no hay recurso de negocio, ruta de lectura de una demo estática. Registrar auditoría sería ruido (no hay `audit_logs` relevante) |
| `lib/auth/protected-routes.ts` | **No se toca**: es un registro de *route handlers* (claves `'GET /api/...'`), no de páginas. Añadir una clave de página rompería su contrato y es un archivo auth-sensible. La declaración de estados vive en el JSDoc de `page.tsx` + este artifact + `FEATURES.md` |
| ⚠️ Nota harness | `lib/policy/risk-rules.js` marca el patrón `admin-guard` como sensible. La página lo **importa en modo lectura**; ningún archivo de guard se modifica. Evidencia para el revisor: el diff no toca `lib/auth/**` |

### DB (ninguno)

Sin schema, sin migración, sin queries, sin `db:generate`/`db:migrate`. No se instala `@db-engineer`.

### UI (nuevo, aislado)

- Una ruta nueva en `app/(app)/puzzle-demo`, sin entrada en `bottom-nav` (D-T9).
- 4 componentes nuevos en `components/court/` (carpeta nueva, no colisiona con `components/padel/`).
- Sin cambios en `components/ui/**` ni en el design system: se reutilizan `Section`, `Button`, `Card` existentes para marco y controles.
- Accesibilidad mínima: `aria-live="polite"` con el texto del paso activo + `aria-label` en botones (`Anterior`/`Siguiente` deshabilitados en extremos, E4).
- Marcado como **borrable** en comentarios de cabecera y en `FEATURES.md`.

### Dependencias

- `konva@^10.9.1`, `react-konva@19.2.7` (exacto), `-D @next/bundle-analyzer`.
- Verificación previa obligatoria (D1, antes de `pnpm add`): `pnpm view react-konva@19.2.7 peerDependencies` debe mostrar `react: ^19.2.0`. Si el registry cambió, repetir el análisis de la línea y volver a este artifact (`-v2`).
- Rollback: `pnpm remove konva react-konva @next/bundle-analyzer` (verificado en el release report).

---

## 6. Plan de tests (mapeo a AC)

| Test | Archivo | Cubre | Qué se asevera |
|---|---|---|---|
| Unit | `tests/unit/padel/court-geometry.test.ts` | **AC-08**, AC-02 (cálculo), AC-03 (cálculo) | `computeScale` mantiene aspect 20:10; offsets centran la cancha; `courtToPx(0,0)`/`courtToPx(20,10)` caen en esquinas del viewport; `applyDpr` no deforma; viewport 0×0 no produce `NaN`/`Infinity` (E5) |
| Unit | `tests/unit/padel/court-steps.test.ts` | **AC-08**, E1, E4, E7 | `clampStepIndex(-1)=0`, `clampStepIndex(N+5)=N`; `resolveStepTransition(0,3)` es idéntico a la composición 0→1→2→3 (mismo estado final, sin pasos intermedios); no-op cuando `from===to` |
| Unit | `tests/unit/padel/court-annotation.test.ts` | **AC-08**, AC-07 | `computeDashProgress(0)` → `dashOffset = totalLength`; `(1)` → `0`; monotonicidad y reverso simétrico; geometría de flecha determinista desde el escenario serializable |
| E2E | `tests/e2e/puzzle-demo.spec.ts` | **AC-09**, AC-12, E10 | (a) sin sesión → `/puzzle-demo` redirige a `/login`; (b) usuario ACTIVE: abre la ruta, `aria-live` muestra "Paso 1"; click "Siguiente paso" → `aria-live` pasa a "Paso 2"; "Anterior" vuelve a "Paso 1"; botón deshabilitado en el paso 0 |
| Manual D4 | DevTools Performance + Safari iOS | AC-01, AC-02, AC-03, AC-04, AC-06 | 60fps en la transición, nitidez retina, resize sin recrear (paso activo preservado), 20 toggles convergentes, touch scroll no secuestrado |
| Build | `pnpm analyze` (`ANALYZE=true next build`) | **AC-05** | chunk `court-stage` separado; konva+react-konva ≤100KB gzip; ausentes del entry de home/`/dashboard` |

**No se testea**: renderizado de Konva en jsdom (D8 de la spec — requiere canvas nativo, frágil). Ningún test toca DB ni endpoints → **no hay happy-path con SQL** (excepción AC-13).

**Cobertura**: los 5 archivos puros de `lib/padel/court/` están cubiertos por los 3 unit tests → `lib/**` sube, no baja. Sin regresión esperada vs `.validation/coverage-baseline.json` (riesgo: nulo; si el redondeo global bajara, se documentaría como riesgo aceptado en este artifact).

---

## 7. Contratos API

**Ninguno.** No se añaden ni modifican route handlers. No hay request/response schema, no hay Zod nuevo, no hay entrada en `lib/api-docs/spec.ts`.

**Excepción documentada (AC-13)**: este change **no toca** `lib/api-docs/spec.ts` ni requiere happy-path con SQL. Al correr `node scripts/validate-harness.js --all`, los gates `--api-docs` y `--api-integration` deben evaluarse como **N/A**, no como fail. Evidencia a registrar en `evidence-manifest.json` (`gates.api_docs = "n/a (spike sin endpoints, AC-13)"`).

Retrocompatibilidad: no aplica (no hay superficie API). Nada de este change puede romper consumidores existentes; es puramente aditivo (nueva ruta + nueva carpeta + 2 deps).

---

## 8. Variables de entorno

- **Nuevas variables de runtime: ninguna.** No hace falta `.env.local` para correr la demo; el spike no lee configuración.
- **Único flag build-only**: `ANALYZE=true` (activa `@next/bundle-analyzer` en `next build`). No es config de app, no se commitea valor, no lo lee código de producción (sólo `next.config.mjs` en build local). Aun así se documenta en `.env.example` como comentario para que nadie lo invente como var de Vercel.
- **`.env.example`**: se añade únicamente el bloque comentado `# Bundle analysis (build local, no Vercel) — ANALYZE=true`. **Nunca** se sobrescribe el archivo (regla del repo: Edit puntual).
- **Vercel**: sin cambios de Environment Variables. La ruta nueva corre con las vars ya existentes (`DATABASE_URL`, `NEXTAUTH_SECRET`).

---

## 9. Agentes requeridos y orden de ejecución

| Orden | Agente | Entrega | Sub-tasks (≤5 archivos / ≤400 líneas) |
|---|---|---|---|
| 0 | @architect | este `technical-design.md` + `change-map.md` | — |
| 1 | **@app-engineer** | Dependencias + lógica pura | **T1** (5 arch.): `pnpm view` verificación → `pnpm add konva react-konva@19.2.7` + `-D @next/bundle-analyzer`; `lib/padel/court/{types,geometry,steps,annotation,demo-scenario}.ts` |
| 2 | **@app-engineer** | Tests unitarios | **T2** (3 arch.): `tests/unit/padel/court-{geometry,steps,annotation}.test.ts` (no corre Jest — sólo escribe; el orquestador ejecuta) |
| 3 | **@app-engineer** | Componentes Konva | **T3** (4 arch.): `components/court/{CourtStage,CourtLayers,useCourtConfig,PuzzleDemo}.tsx|ts` — **no ejecuta `next build` ni dev server** (anti-loop) |
| 4 | **@app-engineer** | Ruta + E2E + docs | **T4** (3 arch.): `app/(app)/puzzle-demo/page.tsx`, `tests/e2e/puzzle-demo.spec.ts`, `FEATURES.md`; + `next.config.mjs`/`.env.example` (opt-in analyze) |
| 5 | @ponytail-reviewer | Podar boilerplate (p. ej. `CourtLayers` inflado, wrappers innecesarios) | `ponytail-review-report.md` — **sin añadir deps** |
| 6 | **@qa-release** | Ejecuta E2E, build, medición de bundle, go/no-go | `release-report.md`, `test-matrix.md`, `90-metrics.json`, `evidence-manifest.json` |

**No intervienen (y por qué):**

| Agente | Excluido porque |
|---|---|
| **@db-engineer** | Sin schema, sin migración, sin query, sin índice, sin enum. Nada que preservar en el modelo de datos: el escenario es data en memoria (`demo-scenario.ts`) y no se persiste (out-of-scope explícito). Invocarlo generaría ruido de gates sin diff que validar |
| **@auth-security** | No se crea ni modifica ningún guard, schema de sesión, callback JWT, flujo de password ni `auth.ts`. La ruta **reutiliza** `validateUser()` ya auditado y refuerza `status === "ACTIVE"` en una línea. No hay mutación que auditar. El riesgo de seguridad del change es nulo (ruta privada detrás de guard existente) |
| **@admin-engineer** | No es back-office; `/puzzle-demo` vive en `app/(app)` y no usa `guardAdmin` |
| **@ui-designer** | Sin design pass (out-of-scope del spike); se reutilizan primitivos existentes |

**Aislamiento anti-loop**: @app-engineer no ejecuta `next build`, `pnpm dev`, `playwright test` ni `db:migrate`; sólo escribe código y specs. Build/E2E/bundle-analysis los corre @qa-release. Circuit breaker: 1 intento por sub-task, output ≤4 líneas.

---

## 10. Gates aplicables

| Gate | Aplica | Nota |
|---|---|---|
| `typecheck` / `lint` / `build` | ✅ | Obligatorios (AC-10). `build` es el que detecta el fallo de SSR/Konva |
| `unit` | ✅ | 3 archivos nuevos; sin Konva en jsdom |
| E2E | ✅ | 1 happy-path navegable (AC-09) |
| `coverage` | ✅ | Sin regresión >3%; los archivos puros están testeados |
| `api-docs` / `api_integration` | ❌ **N/A** | Excepción AC-13 (§7) |
| `secrets` / `sast` | ✅ | Sin secretos nuevos; `sast` escanea `lib/` y `app/` → sin superficie nueva de riesgo |
| `audit_deps` | ✅ | Revisar advisories de `konva`/`react-konva` al instalar |
| `features` / `docs` | ✅ | Entrada en `FEATURES.md` con `module: padel`, `change_id`, status propuesto |
| Bundle (AC-05) | ✅ manual | `pnpm analyze`, medición registrada en `release-report.md` |

Mejora de proceso potencial (fuera de este change): que `validate-harness.js` acepte un `N/A` declarado en `evidence-manifest.json` para spikes sin API. No se implementa aquí.

---

## 11. Riesgos técnicos residuales

| Riesgo | Prob. | Mitigación en diseño |
|---|---|---|
| `react-konva` 19.2.7 incompatibilidad real en runtime con React 19.2.0 | Media | Fallback E11 (D-T8) con `konva` puro; interfaz de `CourtStage` aislada |
| El chunk de konva se filtra al entry | Baja | D-T3/D-T4 + verificación por grep + `pnpm analyze` en D4 |
| `ResizeObserver` duplicado entre montajes (E9) | Media | `useCourtConfig` devuelve `disconnect()` en cleanup; el stage se monta limpio en el paso 0 |
| Tween huérfano al desmontar (E2) | Media | `useEffect` cleanup llama `node.stop()` y `Konva.Tween` destroy; sin `setState` desde callbacks de tween al desmontar |
| Contenedor 0px al montar (E5) | Media | primer `ResizeObserver`/`useLayoutEffect` fija tamaño; no se renderiza `Stage` con 0×0 |
| Que el spike se "produccionalice" | Baja | Marcado borrable + `status: released (spike)` + decisión go/no-go obligatoria |

---

## 12. Versioning de este artifact (regla)

- `technical-design.md` vive **siempre** dentro de `production_artifacts/2026-11-01-konva-puzzle-spike/` (nunca en la raíz de `production_artifacts/`).
- **Revisión del mismo change_id** (p. ej. cambiar el pin de `react-konva` o activar el fallback E11): se **sobrescribe este archivo** y se añade una fila al `## Changelog` de abajo con fecha + motivo. No se crean `technical-design-v2.md` dentro de la misma carpeta.
- **Nueva iteración del cambio** (nuevo alcance, p. ej. "puzzle module v1"): carpeta nueva `production_artifacts/YYYY-MM-DD-<slug>/` o sufijo `-v2` en la carpeta si se reusa el slug.
- `change-map.md` sigue la **misma** regla (mismo `change_id` → revisión in-place + changelog; nuevo alcance → carpeta nueva).

### Changelog
| Fecha | Versión | Autor | Cambio |
|---|---|---|---|
| 2026-11-01 | v1 | @architect | Diseño inicial del spike: 18 archivos, patrón client-only, pin `react-konva@19.2.7`, excepción AC-13, orden de agentes |
