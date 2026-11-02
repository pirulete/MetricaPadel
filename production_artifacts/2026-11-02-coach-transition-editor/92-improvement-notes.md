# Improvement Notes — 2026-11-02-coach-transition-editor

> Generado por @qa-validator al cerrar el workflow. No bloqueante.

## 1. Cobertura global `lib` (83.42% vs baseline 88.6%)
- La caída no proviene del módulo afectado (`lib/padel` 96.51%, `lib/padel/court` 99.04%, `transitions.ts` 97.67%).
- Archivos que arrastran el agregado son preexistentes y ajenos: `lib/db/queries/padel/courses.ts` 61.9%, `super-admin.ts` 40.74%, `lib/neon/branching.ts` 73.19%.
- **Acción sugerida**: refrescar `.validation/coverage-baseline.json` o evaluar cobertura por módulo en lugar de global.

## 2. Gate `--coverage` no implementado en el harness
- `scripts/validate-harness.js` menciona `--coverage` en el header de ayuda pero no lo ejecuta; la medición fue manual en este change.
- **Acción sugerida**: implementar el gate (comparación contra baseline con umbral de −3pp por módulo).

## 3. `hooks/use-transitions.ts` sin unit test
- 153 líneas de wiring fetch (list/create/update) sin test propio; la lógica de negocio vive en `lib/` y sí está cubierta (96.51%/97.67%), pero el repo testea otros hooks (`use-notifications`, `use-push-subscription`).
- **Acción sugerida**: añadir `tests/unit/hooks/use-transitions.test.ts` con MSW/fetch mock (deuda menor).

## 4. Verificaciones manuales pendientes de AC-01/EC-04/EC-11
- Targets ≥44×44 px, drag que no secuestra el scroll de página (EC-04) y confirmación al abandonar con cambios (EC-11) no están automatizados.
- **Acción sugerida**: cubrir EC-11 con un E2E y añadir asserts de `getBoundingClientRect` ≥44 px en `transition-editor.spec.ts`.

## 5. E2E: helper de login ADMIN
- El fallo inicial (H-2) fue un spec desactualizado (`waitForURL("**/dashboard")` para un ADMIN que aterriza en `/admin`), ya corregido.
- **Acción sugerida**: extraer un helper compartido `loginAsAdmin`/`loginAsUser` en `tests/e2e/` para evitar la repetición del patrón en cada spec.
