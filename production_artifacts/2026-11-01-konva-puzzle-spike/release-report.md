# Release Report — Spike Konva + Transición de Puzzle (PadelChess)

> change_id: `2026-11-01-konva-puzzle-spike`
> module: `padel` (loop-metrics: `infra`)
> release: spike (no productivo)
> fecha: 2026-11-01
> validador: @qa-release
> branch: `rama-preview`
> **Decisión: GO PRELIMINAR — AC-05 medido y aprobado (99KB gzip); quedan 4 AC manuales para D4 (AC-01/02/04/06)**

---

## 1. Resumen ejecutivo

El spike entrega lo que prometía: una demo navegable en `/puzzle-demo` con Konva + `react-konva` integrados en Next 16.1.6 / React 19.2.0 sin romper SSR, animación por refs (no por estado de React) y lógica pura extraída a `lib/padel/court/` con 38 unit tests y cobertura 100%.

**Todos los AC automatizables (AC-05, AC-07..AC-13) pasan.** Los 4 AC que dependen de juicio visual/humano (AC-01, AC-02, AC-04, AC-06) **NO se dan por pasados**: quedan listados como pendientes de D4 con checklist ejecutable en `acceptance-criteria.md` §2. El AC-05 (bundle) se midió el 2026-11-01: 99KB gzip combinado, fuera del entry de dashboard/home → PASS.

Ningún hallazgo bloqueante. 1 bug menor de tooling (script `analyze` ausente, **ya fixeado** agregando el script) y 3 observaciones de limpieza.

---

## 2. Gates ejecutados (por el orquestador)

| Gate | Comando | Resultado | Estado |
|---|---|---|---|
| typecheck | `npx tsc --noEmit` | 0 errores | ✅ pass |
| lint | `pnpm run lint` | 0 errores (247 warnings preexistentes, 0 en archivos nuevos) | ✅ pass |
| unit | `pnpm run test:unit` | 750/750 tests, 60 suites | ✅ pass |
| unit (nuevos) | `tests/unit/padel/court-*.test.ts` | 38 tests, cobertura 100% de `lib/padel/court/` | ✅ pass |
| E2E | `npx playwright test tests/e2e/puzzle-demo.spec.ts` | 2/2 passed (server :3000, DB :5434) | ✅ pass |
| build | `pnpm run build` | OK, ruta `/puzzle-demo` presente | ✅ pass |
| code review (simplicidad) | @ponytail-reviewer | net zero (nada que podar sin romper contrato) | ✅ pass |
| coverage | `validate-harness.js --coverage` | **no ejecutado** (reservado a @qa-validator) | ⏳ pendiente |
| bundle (AC-05) | inspección de chunks de `next build` (Turbopack no genera stats de `@next/bundle-analyzer`) | **99KB gzip combinado**, fuera del entry | ✅ pass |
| api-docs | `lib/api-docs/spec.ts` | **N/A** — sin endpoints (AC-13) | ✅ n/a justificado |
| api_integration | happy-path con SQL | **N/A** — sin endpoints ni DB (AC-13) | ✅ n/a justificado |
| secrets / sast | `pnpm run security:*` | **no ejecutado en este turno**; sin secretos ni superficie nueva (`lib/padel/court/` puro, 1 página de lectura) | ⏳ pendiente harness |

Evidencia de regresión de dominio: `git diff --stat` sobre `components/padel/**` y `lib/api-docs/**` → **vacío**. No se tocó `auth.ts`, `lib/auth/**`, `lib/db/**`, `drizzle/**` ni `components/ui/**`.

---

## 3. Resultado por Acceptance Criterion

| AC | Criterio | Estado | Evidencia |
|---|---|---|---|
| AC-01 | 60fps en la transición | 🔶 **manual, pendiente D4** | Arquitectura refs-only verificada en `CourtStage.tsx:70-113` (1 `setState` por paso, tweens nativos). Falta perfilado DevTools. |
| AC-02 | Nitidez retina | 🔶 **manual, pendiente D4** | `layer.getCanvas().setPixelRatio(dpr)` en `CourtStage.tsx:54-61` + `normalizeDpr` con techo `MAX_DPR=4` (testeado). Falta inspección visual/canvas.width. |
| AC-03 | Resize sin recrear escena | ✅ pass (código + unit) | `useCourtConfig` con `ResizeObserver` + `disconnect()` en cleanup; `computeScale/computeOffsets` testeados para letterbox; el paso activo vive en `PuzzleDemo` (no se remonta). Verificación visual queda en D4. |
| AC-04 | 20 toggles convergen | 🔶 **manual, pendiente D4** | Mecanismo correcto: `move()` con update funcional + clamp (`PuzzleDemo.tsx:36-37`) y `tween.destroy()` antes de crear nuevos (`CourtStage.tsx:78-79`). Falta prueba visual de 20 alternancias. |
| AC-05 | Bundle combinado ≤100KB gzip, fuera del entry | ✅ **pass (medido 2026-11-01)** | Chunks Konva: `3wbx_manf0p5d.js` = **96KB gzip** (konva+react-konva, lazy, referenciado solo por `puzzle-demo/page/react-loadable-manifest.json`) + `01c3exzmssqch.js` = 3KB → **99KB ≤ 100KB**. Verificado por grep que `/dashboard` y home NO referencian esos chunks. Nota: `@next/bundle-analyzer` no produce stats bajo Turbopack (Next 16); la medición fue por inspección directa de chunks + `gzip -c`. |
| AC-06 | Chrome desktop + Safari iOS, touch scroll no secuestrado | 🔶 **manual, pendiente D4** | Mitigación implementada: `listening={false}` en Stage y todas las capas + `pointerEvents: "none"` (`CourtStage.tsx:127-129`). Chrome ya validado indirectamente por E2E (chromium). Safari iOS sin validar. |
| AC-07 | Estado serializable / reversible vía JSON | ✅ pass | `lib/padel/court/types.ts` solo data plana; `demo-scenario.ts` sin funciones; test round-trip JSON en `court-annotation.test.ts:104-114`. |
| AC-08 | Unit tests de lógica pura | ✅ pass | 38 tests: geometry 14, steps 12, annotation 12. Sin Konva en jsdom. |
| AC-09 | E2E happy path navegable | ✅ pass | `tests/e2e/puzzle-demo.spec.ts` 2/2; assert sobre `aria-live` ("Paso 1"→"Paso 2"→"Paso 1") y botón deshabilitado en el extremo. |
| AC-10 | typecheck/lint/build + coverage sin regresión | ✅ pass (coverage ⏳) | 3 gates verdes arriba. Coverage del módulo nuevo = 100%; gate `--coverage` vs baseline (88.6% líneas lib) lo corre @qa-validator. |
| AC-11 | Entrada en `FEATURES.md` | ✅ pass | Entrada con `status/release/module/tags/change_id/date`, problema, solución, archivos, tests, excepción AC-13. `status` actualizado a `in-progress` en este turno (no se marca `released` hasta cerrar D4). |
| AC-12 | Ruta privada declarada + alt text accesible | ✅ pass | `page.tsx:9-17` Server Component, `validateUser()` + `status !== "ACTIVE" → /dashboard`; JSDoc declara `ACTIVE + ADMIN`, nunca `LOCKED`. `aria-live="polite"` con `step.label` fuera del canvas (`PuzzleDemo.tsx:57-59`). Sin `"use client"` ni `dynamic(` en el page. |
| AC-13 | Excepción documentada (api-docs / SQL) | ✅ pass | `git diff lib/api-docs/spec.ts` vacío; 0 route handlers nuevos; excepción registrada en `technical-design.md` §7, `FEATURES.md` y este reporte. |

**Conteo: 8 pass · 0 fail · 4 manuales pendientes (D4) · 0 bloqueados.**

---

## 4. Bugs y observaciones

### BUG-01 — Script `analyze` inexistente (Low) — ✅ FIXED 2026-11-01
- **Repro**: `pnpm analyze` → `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "analyze" not found`.
- **Esperado**: existe `"analyze": "ANALYZE=true next build"` (lo referencian `FEATURES.md`, `technical-design.md` §D-T7 y el ponytail report).
- **Observado**: `package.json` solo tenía la devDependency `@next/bundle-analyzer` y el wrapper en `next.config.mjs`; el script no se añadía.
- **Fix aplicado**: script `"analyze": "ANALYZE=true next build"` agregado a `package.json` por el orquestador. AC-05 se midió igualmente por inspección directa de chunks (Turbopack no genera stats del analyzer).

### OBS-01 — `applyDpr`, `resolveStepTransition` e `isSameStep` no se usan en producción
Exportados y cubiertos por tests (AC-08 los exige), pero ningún componente los invoca: `CourtStage` resuelve la convergencia destruyendo tweens y `setPixelRatio` reemplaza a `applyDpr`. No es deuda grave (son helpers puros y baratos), pero si el módulo real los adopta debe usarlos o borrarlos para no arrastrar API muerta.

### OBS-02 — DPR en caliente (E8) solo se refresca en resize
`useCourtConfig` lee `devicePixelRatio` dentro de `measure()`, disparado por `ResizeObserver`. Mover la ventana entre monitores sin cambiar tamaño no actualiza el DPR. Cumple el mínimo de E8 ("como mínimo no rompe el layout"), se acepta para el spike.

### OBS-03 — E10 solo cubre el caso "sin sesión" de forma automatizada
El E2E verifica redirección a `/login` sin sesión, pero no hay test automatizado de `TEMPORARY` → `/dashboard` ni de `LOCKED`. El guard es explícito y de una línea (`page.tsx:17`), por lo que el riesgo es bajo; probarlo es parte del checklist manual de D4.

### OBS-04 — `react-konva` pineado exacto funciona con React 19.2.0
`19.2.7` resolvió sin conflicto de peers en el lock (`konva@10.9.1`). El fallback E11 (wrapper con Konva puro) **no fue necesario**. Desviación respecto al diseño: ninguna.

---

## 5. Decisión Go/No-Go (preliminar)

**GO PRELIMINAR.** Todos los criterios verificables sin ojo humano están verdes y el patrón de arquitectura (client-only + refs + lógica pura) se sostuvo sin hacks: sin workarounds de SSR, sin wrapper propio, sin versiones forzadas más allá del pin documentado de `react-konva`.

**Condiciones para declarar el GO definitivo (D4, ~2h de trabajo):**

1. **AC-05 obligatorio**: `ANALYZE=true pnpm build` y confirmar ≤100KB gzip combinados + ausencia de `konva` en el entry de `/dashboard` y home. Es el único AC con riesgo real de **NO-GO** (si se cuela en el entry o excede el tope, se reevalúa el pivot a SVG).
2. AC-01 (60fps), AC-02 (retina), AC-04 (20 toggles) y AC-06 (Safari iOS) verificados con el checklist de `acceptance-criteria.md`.
3. Gate `--coverage` de @qa-validator sin regresión >3% (esperado: nulo, cobertura nueva 100%).

Si cualquiera de AC-05/AC-01 falla → **NO-GO** y pivot a SVG + anime.js según `release-scope.md` §Criterio de Go/No-Go. Si el problema es específico de `react-konva` y no del canvas → evaluar Konva puro (E11) antes de descartar.

---

## 6. Rollout y limpieza

- Sin migraciones, sin variables de entorno nuevas, sin cambios de contrato API, sin impacto en auth.
- Commit a `rama-preview`. Nada de merge a `main` desde este workflow.
- Tras el go/no-go definitivo: si GO → el módulo real reutiliza `lib/padel/court/` y borra `components/court/*` + `/puzzle-demo`; si NO-GO → `pnpm remove konva react-konva @next/bundle-analyzer` + borrar `components/court/`, `app/(app)/puzzle-demo/`, `tests/e2e/puzzle-demo.spec.ts` y marcar la entrada de `FEATURES.md` como `deprecated`.

---

## 7. Artefactos de este cierre

- `release-report.md` (este archivo)
- `test-matrix.md`
- `acceptance-criteria.md`
- `FEATURES.md` (status actualizado)
- JSON de gates/evidence-manifest: **@qa-validator**
