# Patrones Recurrentes Detectados

> Este archivo se actualiza automáticamente después de cada `/fix-problems` o `/fix-failing-test`.
> El orquestador consulta este archivo antes de cada fix para detectar patrones conocidos.

## Formato de entrada

```markdown
### <nombre-del-patron>
- **Síntoma:** Descripción del error visible
- **Causa raíz:** Qué lo provoca
- **Fix:** Solución aplicada
- **Archivos afectados:** Lista de archivos donde aparece
- **Primera detección:** YYYY-MM-DD
- **Ocurrencias:** N
- **Última vez:** YYYY-MM-DD
```

---

## Patrones Detectados

<!-- Los patrones se agregan automáticamente aquí después de cada fix. -->

### Elemento `fixed` fuera del viewport por conflicto relative/fixed vía Slot
- **Síntoma:** Playwright `element is outside of the viewport` (o `y` negativo medido con `boundingBox`) en un botón/fijo montado con `Button asChild` + `Link className="relative"`; el click nunca sucede aunque el elemento esté "visible".
- **Causa raíz:** `Slot` de Radix fusiona el className del Button (la declaración `fixed bottom` del Button) con el del Link (`relative`); Tailwind emite `.relative` DESPUÉS de `.fixed` en el stylesheet → gana `position: relative` y `bottom`/`right` pasan a ser offsets relativos → el elemento queda fuera del viewport (p. ej. y = −76 px).
- **Fix:** eliminar `className="relative"` del hijo (el `fixed` del padre ya sirve de contexto de posicionamiento para los descendientes `absolute`); blindar con assert geométrico en el E2E (`box.y + box.height ≤ viewport.height − alto_nav`).
- **Archivos afectados:** `components/layout/app-layout-client.tsx`
- **Primera detección:** 2026-11-03
- **Ocurrencias:** 1
- **Última vez:** 2026-11-03
- **Nota anti-regresión:** Tailwind v4 escanea `.md` dentro de `production_artifacts/` — NUNCA escribir sintaxis de clase candidata de Tailwind con placeholders (env con puntos suspensivos, ni clases de bottom entre corchetes con valores inventados) en documentación; para referenciar clases, usar texto sin corchetes o la forma completa `env(safe-area-inset-bottom)` (esa sí genera CSS válido).

### DB Connection Crash on Layout Import
- **Síntoma:** `password authentication failed for user 'user'` when DB is unreachable; app crashes on any public page
- **Causa raíz:** `app/(public)/layout.tsx` calls `getCachedNavigation()` which queries DB at request time; when NeonDB is unreachable, the query throws and the entire layout fails
- **Fix:** Add try/catch in layout with `DEFAULT_NAVIGATION` fallback when `getCachedNavigation()` throws
- **Archivos afectados:** `app/(public)/layout.tsx`
- **Primera detección:** 2026-09-20
- **Ocurrencias:** 1
- **Última vez:** 2026-09-20
