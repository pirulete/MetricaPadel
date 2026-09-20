---
description: Corrige un test roto con el cambio mínimo necesario y valida regresión acotada
template: |
  Ejecuta el workflow fix-failing-test para: {ARGUMENTS}

  Sigue esta secuencia:
  1. @qa-release: reproducir test fallido, capturar error y stack trace
  2. @architect: clasificar bug (local/sistémico), proponer fix mínimo
  3. @app-engineer/@auth-security/@admin-engineer: aplicar cambio mínimo
  4. @qa-release: rerun test, generar repair-report.md

  Reglas:
  - preferir cambio mínimo sobre refactor amplio
  - no tocar módulos no relacionados
  - iteration counter: 3 por grupo, 5 globales, luego escalamiento
---

Cuando el usuario escriba:

/fix-failing-test <test o error>

seguir esta secuencia:

## Engram Memory Protocol

This workflow integrates with Engram for cross-session decision memory.

1. **Session start**: `mem_context` is auto-injected by the plugin. Call `mem_search(type="rule")` to load project rules.
2. **Before implementation**: Search for relevant past decisions with `mem_search(type="decision")`.
3. **After implementation**: Save a memory with `mem_save(type="fix", ...)` documenting the change.
4. **Session close**: Call `mem_session_summary` before exiting.

## 0. Inicialización

- Crear directorio `production_artifacts/YYYY-MM-DD-short-slug/` (con sufijo -v2, -v3 si ya existe)
- Inicializar contadores: `iteracion_grupo = 0`, `iteracion_global = 0`

## 0.5 Pre-Flight Gate Check

Antes de iniciar el workflow, leer `.validation/status.json`:

```
Si status = "fail":
  - NOTIFICAR al usuario: "❌ No puedes iniciar un workflow mientras el validation gate esté en estado 'fail'."
  - Mostrar los gates fallidos.
  - DETENER el workflow.
  - Recomendar: ejecuta /validate primero.
Si status = "pass" o "none":
  - CONTINUAR con el workflow.
```

## 1. @qa-release — Reproducción

Invoca:
```
task(description="Reproducir test fallido", subagent_type="qa-release", prompt="
  Actúa como @qa-release. Sigue las reglas de AGENTS.md para @qa-release.
  Reproduce el test fallido: {ARGUMENTS}.
  Captura error exacto, archivo, stack trace y comportamiento esperado.
  Determina si parece bug real o test desactualizado.
  Genera production_artifacts/YYYY-MM-DD-short-slug/test-matrix.md
")
```

**Quality Gate 1:** Validar que test-matrix.md tiene:
- [ ] Error exacto documentado
- [ ] Stack trace incluido
- [ ] Comportamiento esperado definido
- [ ] Clasificación: bug real vs test desactualizado

Si NO pasa → devolver a @qa-release con feedback específico.

## 2. @architect — Clasificación

Con el error capturado, invoca:
```
task(description="Clasificar bug", subagent_type="architect", prompt="
  Actúa como @architect. Sigue las reglas de AGENTS.md para @architect.
  Revisa el impacto del test fallido reportado por @qa-release.
  Clasifica el bug:
  - Local y de bajo riesgo
  - Local pero sensible
  - Sistémico
  Si es sistémico, detén este workflow y recomienda /ship-feature.
  Si es local, propone fix mínimo.
  Genera production_artifacts/YYYY-MM-DD-short-slug/repair-plan.md
")
```

**Quality Gate 2:** Validar que repair-plan.md tiene:
- [ ] Clasificación del bug
- [ ] Fix mínimo propuesto
- [ ] Archivos a modificar

Si NO pasa → devolver a @architect con feedback específico.
Si clasificación = "sistémico" → detener workflow, notificar al usuario, recomendar workflow mayor.

## 3. @app-engineer o @auth-security o @admin-engineer — Fix

Según el repair-plan, invoca el agente correspondiente:
```
task(description="Aplicar fix mínimo", subagent_type="general", prompt="
  Actúa como <app-engineer|auth-security|admin-engineer>. Sigue las reglas de AGENTS.md para ese rol.
  Siguiendo repair-plan.md:
  - Aplica el cambio mínimo necesario para corregir el test.
  - No mezcles refactors no relacionados.
  - Si el test estaba mal por cambio de contrato válido, actualiza el test y documenta por qué.
  Genera production_artifacts/YYYY-MM-DD-short-slug/app-notes.md (o auth-impact.md, admin-notes.md según agente)
")
```

**Validación post-fix:**
- Incrementar `iteracion_grupo` y `iteracion_global`
- Rerun del test afectado

**3a. Auto-Fix Post-Fix**

Antes de decidir si el test sigue fallando, ejecutar auto-fix:

1. **Lint --fix**: `pnpm run lint --fix` — corrige reglas auto-fixables que podrían estar causando falsos positivos en el test (imports, tipos).
2. **TypeScript**: Re-ejecutar `npx tsc --noEmit` para detectar errores TS que `--fix` no puede resolver.
3. **Re-evaluar**: Volver a correr el test afectado:
   - Si **pasa** → continuar workflow
   - Si **sigue fallando** → proceder con re-triage normal

- Si el test sigue fallando después del auto-fix:
  - Si `iteracion_grupo < 3` Y `iteracion_global < 5`:
    - Re-invocar @qa-release para capturar nuevo error
    - Re-invocar @architect para re-clasificar
    - Re-aplicar fix
  - Si `iteracion_grupo >= 3` (límite por grupo):
    - Generar `escalation-report.md` para este fix
    - Notificar al usuario
  - Si `iteracion_global >= 5` (límite global):
    - Generar `escalation-report.md`
    - DETENER workflow completo
    - Notificar al usuario con resumen y recomendación

## 3.5 @ponytail-reviewer — Filtro de simplicidad

Después del fix y antes de la validación final, ejecutar el filtro de simplicidad:

```
task(description="Ponytail review", subagent_type="ponytail-reviewer", prompt="
  Actúa como @ponytail-reviewer. Sigue las reglas de AGENTS.md para @ponytail-reviewer.
  Lee los diffs de código generados por <app-engineer|auth-security|admin-engineer>.
  Aplica la Escalera Ponytail:
  1. YAGNI — ¿esta abstracción realmente necesita existir?
  2. Plataforma Nativa — ¿TypeScript/Node.js/Next.js ya lo resuelve?
  3. Dependencias Existentes — ¿Zod, Drizzle, Radix ya cubren esto?
  4. Regla de la Línea Única — ¿puede reducirse a 1-2 líneas?
  Refactoriza el código para eliminar sobreingeniería.
  Genera production_artifacts/YYYY-MM-DD-short-slug/ponytail-review-report.md
")
```

## 4. @qa-release — Validación

Con el test pasando, invoca:
```
task(description="Validar fix test", subagent_type="qa-release", prompt="
  Actúa como @qa-release. Sigue las reglas de AGENTS.md para @qa-release.
  - Rerun del test afectado.
  - Corre regresión acotada del módulo.
  Genera production_artifacts/YYYY-MM-DD-short-slug/release-report.md
  Genera production_artifacts/YYYY-MM-DD-short-slug/repair-report.md con:
  - Causa raíz
  - Archivos cambiados
  - Tests ejecutados
  - Resultado
")
```

**Artifact Completeness Validator:**
Verificar que existen todos los deliverables esperados:
- [ ] test-matrix.md
- [ ] repair-plan.md
- [ ] app-notes.md / auth-impact.md / admin-notes.md (según agente)
- [ ] ponytail-review-report.md
- [ ] release-report.md
- [ ] repair-report.md
- [ ] 91-gate-results.json
- [ ] 90-metrics.json
- [ ] 92-improvement-notes.md (solo si hay observaciones)

Si falta alguno → generarlo o notificar al usuario.

## 5. Post-Flight @qa-validator

Después de @qa-release, ejecutar el validation gate:

```
task(description="Post-flight validation gate", subagent_type="qa-validator", prompt="
  Actúa como @qa-validator. Sigue las reglas de AGENTS.md para @qa-validator.
  node scripts/validate-harness.js --all

  Genera production_artifacts/YYYY-MM-DD-short-slug/91-gate-results.json con change_class='fix'
  Genera production_artifacts/YYYY-MM-DD-short-slug/90-metrics.json con change_class='fix'
  Si hay observaciones, genera production_artifacts/YYYY-MM-DD-short-slug/92-improvement-notes.md

  Reporta al usuario el resultado de la validación final.
")
```

## Reglas

- preferir cambio mínimo sobre refactor amplio
- no tocar módulos no relacionados
- si aparece deuda técnica, anotarla pero no resolverla en el mismo fix salvo necesidad real
- si el fix cambia comportamiento esperado, actualizar test y documentación correspondiente
- **si el fix modifica código de producción, agregar o actualizar tests correspondientes**
- todos los artifacts van en production_artifacts/YYYY-MM-DD-short-slug/ siguiendo la regla de versioning

## Iteration Limits

| Límite | Valor | Acción al alcanzar |
|--------|-------|-------------------|
| Iteraciones por grupo | 3 | Escalar fix, notificar al humano |
| Iteraciones globales | 5 | Detener workflow, escalar al humano |

## Escalamiento al Humano

Cuando se alcanza un límite de iteraciones:
1. Generar `production_artifacts/.../escalation-report.md`
2. Notificar al usuario explícitamente con resumen y link al artifact
