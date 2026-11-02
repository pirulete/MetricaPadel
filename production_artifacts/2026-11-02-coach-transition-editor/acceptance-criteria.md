# Acceptance Criteria — Editor de Transiciones (coach)

> change_id: `2026-11-02-coach-transition-editor`
> date: 2026-11-02 · @qa-release
> Referencia: `feature-spec.md` §4 (AC-01..AC-06) y §5 (EC-01..EC-12)
> Nota: `AC-07` no existe en esta feature-spec (es un AC del spike `2026-11-01-konva-puzzle-spike`, aquí absorbido por AC-02).

## 1. Estado por criterio

| ID | Criterio | Estado | Evidencia / motivo |
|----|----------|--------|--------------------|
| AC-01 | Mobile-first 375×667: sin scroll horizontal, targets ≥44×44 px, canvas+toolbar+filmstrip visibles | ❌ **FAIL** | Editor con `scrollWidth=383` a 375 px (botón "Guardar" `right=383.4`). Lista y persistencia OK. Targets ≥44 px: **manual pendiente** (checklist §2). |
| AC-02 | Modelo compatible `CourtScenario`, sin transformaciones ad hoc, round-trip test | ✅ pass | `toCourtScenario` único adaptador; `transition-serialization.test.ts` 13/13. |
| AC-03 | Preview reutiliza `components/court/` sin animación nueva | ✅ pass | `ScenarioPreview` → `CourtStage` (dynamic ssr:false); 0 `requestAnimationFrame`/`setInterval` nuevos; `puzzle-demo` 2/2. |
| AC-04 | Guard ADMIN server-side en ruta y 5 endpoints; USER/TEMPORARY 403; LOCKED nunca | ✅ pass | `validateAdmin` en las 3 páginas, `guardAdmin` en los 5 handlers, 5 entradas en `protected-routes.ts` con `ACTIVE`; 9 tests de guard + E2E USER. |
| AC-05 | Persistencia DB con CRUD + auditoría + anti-IDOR 404 + happy-path SQL + api-docs | ✅ pass | Migración `0012`, tabla `coach_transitions`; happy spec (SQL real) CRUD + `audit_logs` + IDOR; 5 operaciones en `lib/api-docs`. |
| AC-06 | Gates verdes: unit, API, E2E, tsc, eslint, build, cobertura, FEATURES.md | ❌ **FAIL (parcial)** | unit 849/849 ✅, API 10/10 ✅, tsc 0 ✅, cobertura módulo ✅; E2E 1/2 ❌; eslint/build no ejecutados por @qa-release; `FEATURES.md` estaba obsoleto → actualizado en esta pasada. |

Resumen: **4/6 AC pass**, 2 fail (ambos trazables a 1 bug de UI de 8.4 px + 1 línea del spec E2E + gates de lint/build pendientes).

## 2. Checklist de verificación manual (lo no automatizable)

### AC-01 — targets táctiles y ergonomía en pista (375×667, dispositivo real o DevTools touch)
- [ ] Cada acción del context bar ("Probar", "Guardar", ±0.5 m ×4, "Fijar tiro", "Borrar tiro") mide **≥44×44 px** (inspeccionar `getBoundingClientRect`, incluir padding/hit-area).
- [ ] Cada thumb del filmstrip "Paso N" y el botón "Añadir paso" miden ≥44×44 px.
- [ ] Canvas, toolbar y filmstrip visibles simultáneamente sin colapsar ni scroll vertical obligatorio.
- [ ] **EC-04**: arrastrar un jugador/pelota sobre el canvas **no** desplaza la página; fuera del canvas el scroll vertical sigue funcionando.
- [ ] Tras el fix de H-1: `document.documentElement.scrollWidth === 375` en `/transiciones/nueva`, `/transiciones/<id>` y con el toast "Transición guardada" en pantalla.

### AC-01 (variante manual) — sin scroll horizontal en toasts
- [ ] Disparar feedback de error (p. ej. guardar sin título) y confirmar que el toast no excede el viewport.

### EC-11 — abandono con cambios sin guardar
- [ ] Editar título o mover un jugador, navegar fuera (back / link "Transiciones") → aparece confirmación explícita de pérdida de cambios.
- [ ] Sin cambios pendientes, la salida es directa (sin diálogo).

### EC-12 — concurrencia (last-write-wins, decisión documentada)
- [ ] Dos pestañas abren la misma transición; guardar en A y luego en B → gana B sin error de servidor; documentado en `technical-design-v2.md`.

### EC-02 — paso idéntico al anterior
- [ ] "Añadir paso" sin cambios → el paso se marca visualmente como "sin cambios" y no genera tiro.

### EC-05 — borrar el último paso
- [ ] Intentar borrar el único paso → bloqueado con feedback Sonner; el escenario conserva ≥1 paso.

### EC-10 — destino fuera de la cancha
- [ ] Arrastrar la manija de arco más allá de X 0..10 / Y 0..20 → se clampea o rechaza con feedback, sin romper el render.

### AC-04 — LOCKED (no hay E2E dedicado)
- [ ] Setear un usuario LOCKED en DB e intentar abrir `/transiciones` y llamar `GET /api/transitions` → redirección/`403`, nunca `200`.

## 3. Criterios de aceptación adicionales propuestos (edge cases no cubiertos por el spec)

| ID | Criterio adicional | Justificación | Tipo |
|----|--------------------|---------------|------|
| ACX-01 | `DELETE /api/transitions/[id]` repetido sobre el mismo id → segundo intento `404` (no `500`) y sin fila en `audit_logs` duplicada | Idempotencia de borrado y no dejar rastro de auditoría falso | API · automatizable |
| ACX-02 | `POST /api/transitions` con `steps: []` o `title: "   "` → `400` y **0 filas** insertadas | EC-03/EC-08 en servidor, verificar que la transacción no deja basura | API+DB · automatizable |
| ACX-03 | `PUT` con `initialStepIndex >= steps.length` → `400` (o clamp documentado), nunca índice fuera de rango persistido | El preview usa `clampStepIndex`; la DB debería rechazar lo que rompería el render | API · automatizable |
| ACX-04 | Renombrar/guardar una transición con título de 200 chars exactos → `201/200`; 201 chars → `400` | Límite `varchar(200)` en DB y en Zod: evitar error 500 por truncamiento | API · automatizable |
| ACX-05 | Undo/redo tras guardar y recargar → historial vacío (no resucita estado previo a la carga) | Evita que un undo en sesión nueva revierta a un estado que el usuario no editó | Unit · automatizable |
| ACX-06 | El listado `/transiciones` con >20 transiciones muestra "Cargar más" y el cursor `updatedAt` no duplica ni salta elementos tras un update | Paginación por cursor coherente con un campo mutado (`updatedAt`) | API+E2E · automatizable |
| ACX-07 | Reordenar pasos no cambia `initialStepIndex` ni los ids de los pasos (los `id` viajan con el paso) | Evita que el reorden rompa la animación/preview y las referencias del filmstrip | Unit · automatizable |
