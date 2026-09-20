---
description: Revisa features existentes con la Escalera Ponytail, elimina sobreingeniería y genera reporte
template: |
  Ejecuta el workflow ponytail-review para: {ARGUMENTS}

   Secuencia:
  1. Pre-flight: validar que el proyecto no esté en estado fail
  2. @ponytail-reviewer: leer archivo(s), aplicar Escalera Ponytail, refactorizar, generar reporte
  3. Post-flight: unit tests + typecheck + lint + API tests del área afectada
  4. Generar 90-metrics.json

  Reglas:
  - solo tocar los archivos dentro del <path> indicado
  - no cambiar lógica de negocio ni alterar comportamiento
  - priorizar eliminar código sobre agregar
---

Cuando el usuario escriba:

/ponytail-review <path>

seguir esta secuencia:

## 0. Inicialización

- Crear directorio `production_artifacts/YYYY-MM-DD-ponytail-review-slug/` (con sufijo -v2, -v3 si ya existe)
- Slug sugerido: nombre del directorio o archivo a revisar (ej: `ponytail-review-admin-payments`)

## 0.5 Pre-Flight Gate Check

Antes de iniciar el workflow, leer `.validation/status.json`:

```
Si status = "fail":
  - NOTIFICAR al usuario: "❌ No puedes ejecutar ponytail-review mientras el validation gate esté en estado 'fail'."
  - Mostrar los gates fallidos.
  - DETENER el workflow.
  - Recomendar: ejecuta /validate primero.
Si status = "pass" o "none":
  - CONTINUAR con el workflow.
```

## 1. @ponytail-reviewer — Revisión de feature existente

Invoca:

```
task(description="Ponytail review feature existente", subagent_type="ponytail-reviewer", prompt="
  Actúa como @ponytail-reviewer. Sigue las reglas de AGENTS.md y .opencode/agents/ponytail-reviewer.md para @ponytail-reviewer.

  Revisa el código existente en: {ARGUMENTS}.

  NO es una revisión de diffs — es una revisión de código ya escrito.
  Lee el contenido actual de los archivos, entiende qué hacen, y aplica la Escalera Ponytail:

  1. YAGNI — ¿esta abstracción, variable, función, o archivo realmente necesita existir?
  2. Plataforma Nativa — ¿TypeScript/Node.js/Next.js (App Router, Server Actions, URL params) ya resuelven esto sin código personalizado?
  3. Dependencias Existentes — ¿Zod, Drizzle, Radix (ya en package.json) ya cubren este patrón?
  4. Regla de la Línea Única — ¿esta función de 15+ líneas puede reducirse a 1-2 líneas?

  Refactoriza aplicando los cambios directamente.
  No introduzcas nuevas dependencias.
  No cambies lógica de negocio ni comportamiento observable.
  Prioriza eliminar código sobre agregar.

  Después de refactorizar, genera production_artifacts/YYYY-MM-DD-ponytail-review-slug/ponytail-review-report.md con:
  - Archivos revisados y líneas tocadas
  - Abstracciones eliminadas o simplificadas
  - Líneas eliminadas vs agregadas (net negative preferido)
  - Beneficio en mantenibilidad/rendimiento
  - Excepciones: si NO se eliminó código, explicar por qué (el código ya era mínimo)
")
```

## 2. Post-Flight — Tests + Typecheck + Lint

Después de que @ponytail-reviewer complete la refactorización:

```
task(description="Validación post-ponytail", subagent_type="general", prompt="
  Valida que los cambios de ponytail-review no rompen el proyecto.

  1. Corre los unit tests del área afectada:
     - Usa npx jest —testPathPatterns=<palabra_clave_del_path> --no-coverage
     - Si fallan: revisa primero si es un failure pre-existente (verifica con git stash y re-ejecutando). Si es pre-existente, documenta en el reporte. Si es nuevo, NOTIFICA al usuario y DETENTE.

  2. Ejecuta: npx tsc --noEmit
     - Si hay errores de tipo: NOTIFICA al usuario los errores exactos y DETENTE. El reviewer debe corregirlos.

  3. Ejecuta: pnpm run lint (solo hard errors, warnings se documentan)
     - Si hay errores de lint (no warnings): NOTIFICA al usuario los errores exactos.

  4. Si hay API tests relevantes (testPathPatterns que matchee el path), ejecútalos con:
     npx playwright test <test_file>
     - Si fallan: mismo análisis de pre-existencia que en step 1.

  5. Genera production_artifacts/YYYY-MM-DD-ponytail-review-slug/90-metrics.json con:
  {
    \"change_id\": \"YYYY-MM-DD-ponytail-review-slug\",
    \"change_class\": \"refactor\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"files_changed\": <count>,
    \"lines_removed\": <count>,
    \"lines_added\": <count>,
    \"tests_run\": <count>,
    \"tests_passed\": <count>,
    \"tests_failed\": <count>,
    \"gates_passed\": <4|3|2|1|0>,
    \"gates_failed\": <0|1|2|3|4>
  }

  6. Reporta al usuario:
  - Archivos modificados
  - Líneas eliminadas vs agregadas
  - Unit tests: pass/fail (cuántos)
  - API tests: pass/fail (cuántos, si aplica)
  - Typecheck: pass/fail
  - Lint: pass/fail
")
```

## Reglas

- solo tocar los archivos dentro del <path> indicado
- no cambiar lógica de negocio ni alterar comportamiento observable
- priorizar eliminar código sobre agregar
- si el archivo ya es mínimo, documentarlo en el reporte como excepción
- todos los artifacts van en production_artifacts/YYYY-MM-DD-ponytail-review-slug/
