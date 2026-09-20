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

### DB Connection Crash on Layout Import
- **Síntoma:** `password authentication failed for user 'user'` when DB is unreachable; app crashes on any public page
- **Causa raíz:** `app/(public)/layout.tsx` calls `getCachedNavigation()` which queries DB at request time; when NeonDB is unreachable, the query throws and the entire layout fails
- **Fix:** Add try/catch in layout with `DEFAULT_NAVIGATION` fallback when `getCachedNavigation()` throws
- **Archivos afectados:** `app/(public)/layout.tsx`
- **Primera detección:** 2026-09-20
- **Ocurrencias:** 1
- **Última vez:** 2026-09-20
