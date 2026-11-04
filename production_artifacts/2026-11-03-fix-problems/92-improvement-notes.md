# Improvement Notes — 2026-11-03-fix-problems

> Observaciones NO bloqueantes detectadas al cerrar la validación. `overall: pass`, `risk_level: LOW`.

## 1. Pendientes de housekeeping (no bloquean merge)
- **Borrar el mockup efímero**: `components/preview/coach-transition-editor.tsx` + `app/preview/coach-transition-editor/` deben eliminarse al cierre según `design-approved.md` §4. El usuario pidió verlo navegable → queda hasta su confirmación explícita.
- **Verificación manual pendiente (C6)**: manija del arco en `EditorStage` (Konva no es inspeccionable fiable con Playwright). Mitigación indirecta: `puzzle-demo.spec.ts` + `transition-editor.spec.ts` verdes ⇒ motor sin regresión.
- **Responsive >375 px**: los 3 E2E corren sólo a 375×667. Falta cobertura de la pill extendida del FAB en `md+` (1280 px) y del `md:sticky` del strip.

## 2. Riesgos de proceso
- **secrets/SAST no se ejecutaron en la pasada de @qa-release** (0 dependencias, 0 `.env`, 0 superficie de red). El `validate-harness.js --all` del orquestador los re-ejecuta; si no, correr antes de `/supercommitpro`.
- **Falso verde potencial en E2E**: los specs hacen `test.skip(!process.env.DATABASE_URL)`. Documentar en el harness que los E2E deben correr con `DATABASE_URL` inyectado (ya aplicado en esta pasada, 0 skipped).

## 3. Aprendizaje reutilizable (patrón nuevo)
- **`Button asChild` + hijo con clase de `position`**: `Slot` fusiona classNames y Tailwind resuelve por orden del stylesheet (`.relative` después de `.fixed`) ⇒ gana la del hijo y el `fixed` del padre se pierde silenciosamente. Regla: no poner clases de `position` en el hijo de un `asChild` cuando el padre la define. Añadir a `.agents/patterns/recurring-issues.md` y blindar con assert geométrico en E2E (`box.y + box.height <= vh - offset`), no sólo `toBeVisible()`.
- **Anti-colisión de locators**: elementos de onboarding nuevos deben usar `aria-current="step"` + `<ol>/<li>`, nunca `role="tab"` ni nombres "Paso N", para no romper los locators históricos de Playwright en strict mode.
