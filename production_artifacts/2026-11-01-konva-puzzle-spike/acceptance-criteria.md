# Acceptance Criteria — Spike Konva + Transición de Puzzle

> change_id: `2026-11-01-konva-puzzle-spike`
> fecha: 2026-11-01 · validador: @qa-release
> Fuente: `feature-spec.md` (AC-01..AC-13, E1..E11) · `technical-design.md` §6
> Regla de este documento: un AC sólo se marca `PASS` con evidencia reproducible. Los AC que dependen de juicio visual/humano quedan **PENDING (D4)** con checklist concreto — no se dan por buenos por inferencia.

---

## 1. Tabla de estado

| AC | Criterio (resumen) | Estado | Evidencia / bloqueo |
|---|---|---|---|
| AC-01 | 60fps sostenidos en la transición | 🔶 **PENDING (D4)** | Arquitectura refs-only verificada por lectura. Falta perfilado DevTools (§2.1) |
| AC-02 | Nitidez retina (DPR aplicado al canvas) | 🔶 **PENDING (D4)** | `setPixelRatio(dpr)` implementado + `normalizeDpr` testeado. Falta inspección visual/canvas.width (§2.2) |
| AC-03 | Resize sin recrear escena, paso preservado | ✅ **PASS (cálculo)** · 🔶 visual D4 | `ResizeObserver` + `disconnect()`; escala/offsets testeados (#1,4,5,6,7,9); paso activo en `PuzzleDemo` (§2.3) |
| AC-04 | 20 toggles convergen sin fantasmas | 🔶 **PENDING (D4)** | `move()` con update funcional + clamp; `tween.destroy()` previo a cada tween. Falta prueba visual (§2.4) |
| AC-05 | Bundle combinado ≤100KB gzip, fuera del entry | ✅ **PASS (medido 2026-11-01)** | 99KB gzip combinado (chunk `3wbx` 96KB konva+react-konva lazy + `01c3` 3KB); grep confirma ausencia en entry de `/dashboard` y home |
| AC-06 | Chrome desktop + Safari iOS, touch scroll libre | 🔶 **PENDING (D4)** | Chrome: cubierto por E2E (chromium). `listening={false}` + `pointerEvents:"none"`. Safari iOS sin validar (§2.6) |
| AC-07 | Estado serializable y reversible vía JSON | ✅ **PASS** | Tipos planos en `types.ts`; `demo-scenario.ts` sin funciones; test round-trip JSON (#37) |
| AC-08 | Unit tests de lógica pura | ✅ **PASS** | 38 tests (geometry 14 / steps 12 / annotation 12), 0 rendering Konva en jsdom |
| AC-09 | E2E happy path navegable | ✅ **PASS** | `tests/e2e/puzzle-demo.spec.ts` 2/2 passed |
| AC-10 | typecheck + lint + build + coverage sin regresión | ✅ **PASS** (coverage ⏳ harness) | tsc 0 errores · eslint 0 errores · `next build` OK · unit 750/750. Gate `--coverage` lo corre @qa-validator |
| AC-11 | Entrada en `FEATURES.md` con metadata | ✅ **PASS** | Entrada con `status/release/module/tags/change_id/date`, problema, solución, archivos, tests, excepción AC-13 |
| AC-12 | Ruta privada declarada + alt text accesible | ✅ **PASS** | `page.tsx:9-17` (`validateUser` + `ACTIVE`, nunca LOCKED) · `aria-live="polite"` fuera del canvas · E1/E2 |
| AC-13 | Excepción api-docs / happy-path SQL documentada | ✅ **PASS** | `git diff lib/api-docs/spec.ts` vacío, 0 endpoints nuevos; excepción en técnico §7, FEATURES.md y release report |

**Totales: 7 PASS · 0 FAIL · 5 PENDING D4 · 0 BLOCKED.**

Edge cases E1–E11: E1/E4/E5/E7 automatizados en unit; E2/E3/E8/E9 mitigados en código (cleanup de tweens, `disconnect()`, resize sin animar, DPR en `measure()`); E6/E10/E11 dentro de los checklists manuales.

---

## 2. Checklists de verificación manual (D4)

Ejecutar con `pnpm dev` y usuario `ACTIVE` (`e2e-puzzle-*.test.local` / `TestPass123!` o cualquier usuario activo). URL: `http://localhost:3000/puzzle-demo`.
Tiempo estimado: **~60–90 min** (AC-05 y AC-06 son los que dominan).

### 2.1 — AC-01: 60fps en la transición

1. Chrome → DevTools → **Performance** → settings: CPU `No throttling`, screenshots off.
2. `Cmd+E` (record) → pulsar **"Siguiente paso"** 3 veces con ~1s entre cada una → detener.
3. En el track **Frames**: FPS medio del tramo de animación (0.5s por paso) **≥ 55**.
4. En **Main**: ninguna **long task > 50 ms** en la ventana de animación (el tween no debe disparar trabajo de React).
5. En **Bottom-Up**: no debe aparecer `ReactDOM`/`commitRoot` durante el tween; sólo Konva/`requestAnimationFrame`.
6. Repetir con **CPU throttle 4×**: puede bajar a ~30fps — **aceptable** (es emulación, no hardware objetivo). Registrar el número.

**Criterio pass**: FPS ≥55 sin throttle y 0 long tasks >50ms atribuibles a React en el tramo animado. **Si falla** → registrar número real en `release-report.md` y abrir evaluación NO-GO.

### 2.2 — AC-02: nitidez retina

1. En pantalla con `devicePixelRatio ≥ 2` (MacBook/iPad retina), o DevTools → **Device toolbar** → DPR `2`.
2. Consola:
   ```js
   const c = document.querySelector("canvas");
   [c.width, c.height, window.devicePixelRatio, c.getBoundingClientRect().width];
   ```
   **Criterio**: `c.width ≈ rect.width * dpr` (y lo mismo en alto). Con DPR 2 y ancho CSS 768 → `c.width ≈ 1536`.
3. Zoom del navegador al **200%** y observar: líneas de cancha, red y punta de la flecha **sin pixelado ni halo gris**.
4. Comparar contra DevTools → Rendering → **Emulate CSS media: DPR 1**: la versión DPR 2 debe verse claramente más fina.

**Criterio pass**: canvas.width escalado por DPR y sin blur perceptible al 200%.

### 2.3 — AC-03: resize sin recrear escena

1. Con el paso **3** activo, arrastrar el borde de la ventana de 1440px a 800px y volver.
2. **Criterio visual**: la cancha se re-encaja centrada (letterbox), sin cortarse, sin desbordar el contenedor, y el indicador sigue en `3 / 3` con el texto del paso 3.
3. Consola antes de redimensionar: `document.querySelector("canvas").dataset.pid = "x"` (marcar el nodo). Tras el resize: **el atributo debe seguir** → mismo canvas, no recreado.
4. Repetir con el contenedor a **0px** (DevTools → ocultar el div padre con `display:none` y volver): al reaparecer, la escena se ve correctamente (E5).

**Criterio pass**: paso activo preservado + mismo nodo canvas + sin desbordes.

### 2.4 — AC-04: estabilidad ante 20 toggles

1. Pulsar alternando **"Siguiente paso"** / **"Paso anterior"** 20 veces seguidas lo más rápido posible.
2. **Criterio**: los 4 marcadores quedan exactamente en las posiciones del paso final pedido; ninguno queda a mitad de camino ni duplicado ("fantasma"); la flecha converge completa o ausente según el paso.
3. Esperar 1s y volver a mirar: **no debe haber movimiento residual** (tween huérfano).
4. Repetir llegando al último paso y "machacando" **"Siguiente paso"** 20 veces: se queda en `3 / 3`, botón deshabilitado, sin animaciones (E4).
5. Navegar a `/dashboard` **a mitad de tween** y volver: consola sin warnings tipo `node destroyed while tweening` (E2).

**Criterio pass**: convergencia exacta + 0 movimiento residual + 0 warnings de consola.

### 2.5 — AC-05: bundle (único AC con riesgo real de NO-GO)

1. Build con analyzer (**nota**: `pnpm analyze` no existe → BUG-01):
   ```bash
   ANALYZE=true pnpm build
   ```
2. Abrir `.next/analyze/client.html` (o el reporte que imprima).
3. Localizar el chunk de `CourtStage` / `node_modules/konva` / `node_modules/react-konva`.
4. **Criterio 1 — tamaño**: suma de `konva` + `react-konva` (gzip) **≤ 100 KB**.
5. **Criterio 2 — aislamiento**: `konva` **no aparece** en el chunk de entrada de `/` ni de `/dashboard` (sólo en el chunk lazy de `court-stage`).
6. Grep de control:
   ```bash
   grep -rn --include='*.ts' --include='*.tsx' -E 'from "konva"|from "react-konva"' app components lib
   ```
   **Criterio**: exactamente 1 archivo (`components/court/CourtStage.tsx`).

**Si falla criterio 1 o 2** → NO-GO inmediato (pivot a SVG + anime.js) y registrar el peso medido.

### 2.6 — AC-06: plataformas y touch scroll (+ E10)

**Chrome desktop** (ya cubierto por E2E, confirmar visualmente):
1. `/puzzle-demo` carga, se ve la cancha, los 4 marcadores y los controles funcionan.

**Safari iOS** (iPhone real o BrowserStack; Safari Responsive Design Mode **no** valida touch):
2. Login con usuario `ACTIVE` → abrir `/puzzle-demo`.
3. Tap en **"Siguiente paso"** → avanza y anima. Tap en **"Paso anterior"** → retrocede.
4. **Swipe vertical sobre el canvas** → la **página debe scrollear** (no debe quedar atrapada por el canvas). Es el punto crítico de AC-06.
5. Doble tap y pinch sobre el canvas: sin zoom accidental ni salto de layout.
6. Rotar a horizontal: la cancha se re-encaja sin cortarse.

**E10 — estados de ruta** (consola SQL o admin):
7. Usuario `TEMPORARY`: `UPDATE users SET status='TEMPORARY' WHERE email='…'` → `/puzzle-demo` debe redirigir a `/dashboard`.
8. Usuario `LOCKED`: `UPDATE users SET status='LOCKED' WHERE email='…'` → debe redirigir a `/login` y **nunca** renderizar la demo.
9. Sin sesión (ventana privada): `/puzzle-demo` → `/login` (ya automatizado en E1).

**Criterio pass**: touch scroll libre + controles operativos en Safari iOS + los 3 estados de ruta se comportan como se declara en `page.tsx`.

### 2.7 — E8 (observación, no bloqueante): DPR en caliente

1. Con la demo abierta, mover la ventana de un monitor retina a uno no-retina (o cambiar el zoom del sistema).
2. **Criterio mínimo (E8)**: el layout del Stage no se rompe. La nitidez sólo se re-ajusta si hay resize (limitación conocida, OBS-02). No es bloqueante del spike.

---

## 3. Criterios de aceptación adicionales propuestos (edge cases no cubiertos por la spec)

Sugeridos para el módulo real (no bloquean el spike):

| # | Criterio propuesto | Razón |
|---|---|---|
| **AC-EXT-01** | La ruta debe responder con un fallback skeleton (`dynamic` loading) que ocupe la misma altura que el Stage, para evitar CLS al montar en conexiones lentas | Hoy el `loading` es `h-full w-full` dentro de un contenedor `aspect-[2/1]`; en producción hay que garantizar que no haya salto de layout medible (CLS < 0.1) |
| **AC-EXT-02** | `prefers-reduced-motion: reduce` debe forzar duración 0 (snap al paso) preservando el resultado final | Accesibilidad obligatoria antes de produccionalizar; hoy los tweens son siempre 0.5s |
| **AC-EXT-03** | El escenario cargado desde backend debe validarse con Zod antes de renderizar (schema de `Paso[]`), rechazando coordenadas fuera de `0..20 / 0..10` o `steps` vacío | `clampStepIndex` cubre índices, pero no coordenadas ni payload corrupto; hoy el escenario es hardcodeado |
| **AC-EXT-04** | El componente debe soportar `steps.length === 0` renderizando un estado vacío (no un Stage en blanco) | `DEMO_SCENARIO` siempre tiene 3 pasos; el módulo real puede recibir 0 |
| **AC-EXT-05** | Desmontar y remontar la ruta 5 veces no debe acumular `ResizeObserver` ni nodos Konva (medir con DevTools → Performance/Memory: contador de observers estable) | E9 está mitigado por `observer.disconnect()` pero no hay test que lo demuestre |
| **AC-EXT-06** | La duración del tween debe respetar el rango 300–600 ms y ser configurable por escenario, sin salir del rango por defecto | La spec exige 300–600ms; hoy está fijo en 0.5s sin validación ni contrato |
| **AC-EXT-07** | Si `devicePixelRatio` cambia sin resize, el canvas debe re-ajustarse (listener `matchMedia('(resolution: Xdppx)')`) | Cierra OBS-02 antes de producción |

---

## 4. Firma del validador

- Gates automatizados: **typecheck ✅ · lint ✅ · unit 750/750 ✅ · E2E 2/2 ✅ · build ✅**
- Regresión de dominio: `components/padel/**` y `lib/api-docs/**` sin diff; `auth.ts`, `lib/auth/**`, `lib/db/**`, `drizzle/**` intactos
- Bloqueantes: **0** · Bugs abiertos: **1 Low** (BUG-01, script `analyze`)
- **Veredicto: GO PRELIMINAR** — el spike está listo para cerrar en D4 con los 4 AC manuales restantes (AC-01/AC-02/AC-04/AC-06). AC-05 ya medido y aprobado (99KB gzip). No se declara `released` hasta completar la verificación manual de D4.
