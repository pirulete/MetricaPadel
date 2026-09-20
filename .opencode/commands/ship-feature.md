---
description: Feature end-to-end desde spec hasta release report
template: |
  Ejecuta el workflow ship-feature para la siguiente idea: {ARGUMENTS}

  Sigue esta secuencia:
  1. @pm: crear feature-spec.md + release-scope.md
  2. @architect: crear technical-design.md + change-map.md
  3. @db-engineer: intervenir solo si hay cambios de schema
  4. @auth-security: intervenir si hay impacto en auth
  5. @app-engineer o @admin-engineer: implementar
  6. @qa-release: validar acceptance criteria y generar release-report.md

  Todos los artifacts van en production_artifacts/YYYY-MM-DD-short-slug/

  Reglas:
  - nunca asumir que una ruta privada admite ACTIVE si no fue definido explícitamente
  - toda acción admin debe auditarse
  - todo cambio sensible debe listar impacto en tests
  - iteration counter: 3 por grupo, 5 globales, luego escalamiento
---

Cuando el usuario escriba:

/ship-feature <idea>

seguir esta secuencia:

## Engram Memory Protocol

This workflow integrates with Engram for cross-session decision memory.

1. **Session start**: `mem_context` is auto-injected by the plugin. Call `mem_search(type="rule")` to load project rules.
2. **Before implementation**: Search for relevant past decisions with `mem_search(type="decision")`.
3. **After implementation**: Save a memory with `mem_save(type="feature", ...)` documenting the change.
4. **Session close**: Call `mem_session_summary` before exiting.

## 0. Inicialización

- Crear directorio `production_artifacts/YYYY-MM-DD-short-slug/` (con sufijo -v2, -v3 si ya existe)
- Inicializar contadores: `iteracion_grupo = 0`, `iteracion_global = 0`

## 0.5 Pre-Flight Gate Check

Antes de iniciar el workflow, leer `.validation/status.json`:

```
Leer .validation/status.json
Si status = "fail":
  - NOTIFICAR al usuario: "❌ No puedes iniciar un workflow mientras el validation gate esté en estado 'fail'."
  - Mostrar los gates fallidos: .failed_gates
  - DETENER el workflow.
  - Recomendar: ejecuta /validate primero para diagnosticar y resolver.
Si status = "pass" o "none":
  - CONTINUAR con el workflow.
```

**Gate de bloqueo:** Si `.validation/status.json.status === "fail"`, el workflow se detiene inmediatamente.

## 1. @pm — Especificación

Invoca:
```
task(description="Spec de feature", subagent_type="pm", prompt="
  Actúa como @pm. Sigue las reglas de AGENTS.md para @pm.
  Lee la idea: {ARGUMENTS}.
  Contrasta con FEATURES.md (si existe) para identificar si ya está parcial o totalmente implementada.
  Define: problema, objetivo, alcance, acceptance criteria, edge cases, riesgos, dependencias y out-of-scope.
  Si la idea ya está parcialmente implementada, especifica el gap exacto entre estado actual y estado deseado.
  Genera production_artifacts/YYYY-MM-DD-short-slug/feature-spec.md
  Genera production_artifacts/YYYY-MM-DD-short-slug/release-scope.md
")
```

**Quality Gate 1:** Validar que feature-spec.md tiene:
- [ ] Problema definido
- [ ] Objetivo claro
- [ ] Alcance delimitado
- [ ] Acceptance criteria (mínimo 3)
- [ ] Edge cases identificados
- [ ] Out-of-scope explícito

Si NO pasa el gate → devolver a @pm con feedback específico sobre qué falta.

## 1.5 @ui-designer — Diseño UX/UI (solo si `--with-design`)

Si el usuario incluyó `--with-design` en el comando, ejecutar diseño antes del architect:

```
task(description="Diseño UX/UI", subagent_type="ui-designer", prompt="
  Actúa como @ui-designer. Sigue las reglas de AGENTS.md para @ui-designer.
  Lee feature-spec.md generada por @pm.

  Paso 1 — UI Kit Audit:
  - Audita componentes existentes contra los requerimientos de la spec.
  - Genera production_artifacts/YYYY-MM-DD-short-slug/ui-kit-audit.md

  Paso 2 — Alternativas con Tradeoffs:
  - Presenta 2-3 alternativas con tabla comparativa.
  - Cada alternativa: wireframe ASCII, componentes a reutilizar, estados (default/empty/loading/error), responsive breakpoints.
  - Recomendar una opción con justificación.
  - Generar production_artifacts/YYYY-MM-DD-short-slug/design-exploration.md

  Paso 3 — Mockup Navegable:
  - Crear components/preview/${slug}.tsx con PreviewShell.
  - Incluir todos los estados, responsive, datos mock.
  - Generar production_artifacts/YYYY-MM-DD-short-slug/mockup-spec.md
")
```

**Quality Gate 1.5:** Validar que design-exploration.md tiene:
- [ ] UI kit audit completado
- [ ] Mínimo 2 alternativas con tradeoffs
- [ ] Mockup creado en components/preview/

El architect recibirá design-exploration.md como referencia visual adicional.

## 2. @architect — Diseño técnico

Con la spec validada, invoca:
```
task(description="Diseño técnico", subagent_type="architect", prompt="
  Actúa como @architect. Sigue las reglas de AGENTS.md para @architect.
  Lee feature-spec.md y release-scope.md generados por @pm.
  Si existe design-exploration.md (paso 1.5), úsalo como referencia visual obligatoria.
  Define:
  - Archivos probables a tocar en app/, components/, hooks/, lib/, auth y DB.
  - Impacto en auth, db, ui y tests.
  - Si requiere intervención de @db-engineer (cambios de schema).
  - Si requiere intervención de @auth-security (roles, guards, sesiones).
  - Si corresponde @app-engineer o @admin-engineer.
  - Contratos API con estándar contract-first.
  - Verifica que las nuevas variables de entorno estén documentadas en .env.example.
  Genera production_artifacts/YYYY-MM-DD-short-slug/technical-design.md
  Genera production_artifacts/YYYY-MM-DD-short-slug/change-map.md
")
```

**Quality Gate 2:** Validar que technical-design.md tiene:
- [ ] Lista de archivos a tocar
- [ ] Impacto en auth/db/ui/tests
- [ ] Contratos API definidos
- [ ] Agentes requeridos identificados

Si NO pasa el gate → devolver a @architect con feedback específico.

## 3. @db-engineer — Schema (solo si aplica)

Si el architect determinó cambios de DB, invoca:
```
task(description="Cambios de schema", subagent_type="db-engineer", prompt="
  Actúa como @db-engineer. Sigue las reglas de AGENTS.md para @db-engineer.
  Siguiendo technical-design.md y change-map.md:
  - Prepara cambios de schema, índices, queries o nuevas tablas si aplica.
  - Genera migraciones Drizzle correspondientes (pnpm run db:generate).
  Genera production_artifacts/YYYY-MM-DD-short-slug/db-plan.md
  Genera production_artifacts/YYYY-MM-DD-short-slug/migration-notes.md
")
```

## 4. @auth-security — Auth (solo si aplica)

Si el architect determinó impacto en auth, invoca:
```
task(description="Seguridad y auth", subagent_type="auth-security", prompt="
  Actúa como @auth-security. Sigue las reglas de AGENTS.md para @auth-security.
  Siguiendo technical-design.md:
  - Intervén si hay impacto en roles, estados, guards, sesiones, auditoría o flujos auth.
  Genera production_artifacts/YYYY-MM-DD-short-slug/auth-impact.md
  Genera production_artifacts/YYYY-MM-DD-short-slug/security-checklist.md
")
```

## 5. @app-engineer o @admin-engineer — Implementación con Cross-Agent Review

Antes de implementar, validar si se activa cross-agent review:

**Trigger de cross-agent review:** Si el change-map indica que la implementación requiere:
- Cambiar más de 5 archivos
- Modificar contratos de API existentes
- Romper compatibilidad con features existentes

→ Activar cross-agent review:
```
task(description="Review de viabilidad", subagent_type="general", prompt="
  Actúa como <app-engineer|admin-engineer>. Sigue las reglas de AGENTS.md para ese rol.
  Lee technical-design.md y change-map.md.
  Valida viabilidad de implementación:
  - ¿El diseño es implementable con los archivos propuestos?
  - ¿Los contratos API son consistentes con los existentes?
  - ¿Hay riesgo de romper features existentes?
  Si hay observaciones, genera design-review.md con detalles.
  Genera production_artifacts/YYYY-MM-DD-short-slug/app-notes.md (o admin-notes.md)
")
```

Si hay observaciones en design-review.md:
```
task(description="Revisión de diseño", subagent_type="architect", prompt="
  Actúa como @architect. Sigue las reglas de AGENTS.md para @architect.
  Lee design-review.md generado por el engineer.
  Revisa las observaciones de viabilidad.
  Ajusta technical-design.md y change-map.md si es necesario.
  Genera production_artifacts/YYYY-MM-DD-short-slug/technical-design-v2.md (si aplica)
")
```

Si NO se activa cross-agent review, implementar directamente:
```
task(description="Implementación", subagent_type="general", prompt="
  Actúa como <app-engineer|admin-engineer>. Sigue las reglas de AGENTS.md para ese rol.
  Siguiendo change-map.md y technical-design.md:
  - Implementa la feature priorizando reutilización de hooks, components y patterns existentes.
  - No dupliques lógica que ya viva en hooks o lib/.
  - Actualiza lib/api-docs/spec.ts con los nuevos endpoints.
  - Incluye unit tests (tests/unit/) y API tests (tests/api/) con al menos 1 happy-path por endpoint.
  - Actualiza FEATURES.md con change_id, módulo, tags y status.
  Genera production_artifacts/YYYY-MM-DD-short-slug/app-notes.md (o admin-notes.md)
")
```

**Validación post-implementación:**
- Incrementar `iteracion_grupo` y `iteracion_global`
- Correr `pnpm run build` (typecheck) + lint del área afectada

**5a. Auto-Fix Post-Implementación**

Antes de decidir si hay errores, ejecutar auto-fix:

1. **Lint --fix**: `pnpm run lint --fix` — corrige automáticamente imports sin usar, prefijo `_` en vars no usadas, formateo y reglas auto-fixables de `@typescript-eslint/*`.
2. **TypeScript**: NO existe `--fix` para `tsc`. Los errores TS reportados por `npx tsc --noEmit` requieren intervención manual.
3. **Re-evaluar**: Volver a correr `npx tsc --noEmit` y `pnpm run lint`:
   - Si **0 errores** → continuar workflow (saltar re-triage, ir a Step 5.5)
   - Si **persisten errores** → proceder con re-triage normal

- Si hay errores después del auto-fix:
  - Si `iteracion_grupo < 3` Y `iteracion_global < 5`:
    - Re-triage con @qa-fix
    - Re-aplicar fix
  - Si `iteracion_global >= 5`:
    - Generar `escalation-report.md`
    - DETENER workflow
    - Notificar al usuario

## 5.5 @ponytail-reviewer — Filtro de simplicidad

Después de la implementación y antes de la validación final, ejecutar el filtro de simplicidad:

```
task(description="Ponytail review", subagent_type="ponytail-reviewer", prompt="
  Actúa como @ponytail-reviewer. Sigue las reglas de AGENTS.md para @ponytail-reviewer.
  Lee los diffs de código generados por <app-engineer|admin-engineer>.
  Aplica la Escalera Ponytail:
  1. YAGNI — ¿esta abstracción realmente necesita existir?
  2. Plataforma Nativa — ¿TypeScript/Node.js/Next.js ya lo resuelve?
  3. Dependencias Existentes — ¿Zod, Drizzle, Radix ya cubren esto?
  4. Regla de la Línea Única — ¿puede reducirse a 1-2 líneas?
  Refactoriza el código para eliminar sobreingeniería.
  Genera production_artifacts/YYYY-MM-DD-short-slug/ponytail-review-report.md
")
```

## 5.75 Preview Cleanup — Eliminar mockup navegable

Si el paso 1.5 (@ui-designer) creó un mockup en `components/preview/${slug}.tsx`, eliminarlo ahora que la feature ya está implementada:

```
slug = extraer de production_artifacts/YYYY-MM-DD-short-slug/ (último segmento)
preview_file = "components/preview/${slug}.tsx"
Si preview_file existe:
  rm preview_file
  echo "🧹 Preview cleanup: eliminado ${slug}.tsx (mockup → feature implementada)"
```

Los mockups son prototipos efímeros. Una vez que la feature está en producción, el preview ya no tiene propósito.

## 6. @qa-release — Validación final

Invoca:
```
task(description="Validación release", subagent_type="qa-release", prompt="
  Actúa como @qa-release. Sigue las reglas de AGENTS.md para @qa-release.
  Valida la feature implementada:
  - Valida acceptance criteria de feature-spec.md.
  - Corre regresión del dominio afectado.
  - Verifica cobertura de lib/api-docs/spec.ts.
  - Genera tests de playwright para la feature si corresponde.
  Genera production_artifacts/YYYY-MM-DD-short-slug/release-report.md
  Genera production_artifacts/YYYY-MM-DD-short-slug/test-matrix.md
  Genera production_artifacts/YYYY-MM-DD-short-slug/acceptance-criteria.md
")
```

**Artifact Completeness Validator:**
Verificar que existen todos los deliverables esperados:
- [ ] feature-spec.md
- [ ] release-scope.md
- [ ] ui-kit-audit.md (si aplicó @ui-designer)
- [ ] design-exploration.md (si aplicó @ui-designer)
- [ ] design-approved.md (si aplicó @ui-designer)
- [ ] mockup-spec.md (si aplicó @ui-designer)
- [ ] technical-design.md
- [ ] change-map.md
- [ ] db-plan.md / migration-notes.md (si aplicó @db-engineer)
- [ ] auth-impact.md / security-checklist.md (si aplicó @auth-security)
- [ ] app-notes.md / admin-notes.md
- [ ] ponytail-review-report.md
- [ ] release-report.md
- [ ] test-matrix.md
- [ ] acceptance-criteria.md
- [ ] 90-metrics.json
- [ ] 91-gate-results.json
- [ ] 92-improvement-notes.md (solo si hay observaciones)

Si falta alguno → generarlo o notificar al usuario.

## 7. Post-Flight @qa-validator

Después de que @qa-release complete la validación final, ejecutar el validation gate:

```
task(description="Post-flight validation gate", subagent_type="qa-validator", prompt="
  Actúa como @qa-validator. Sigue las reglas de AGENTS.md para @qa-validator.
  Ejecuta el script de validación local:
  ```
  node scripts/validate-harness.js --all
  ```

  Lee .validation/status.json para conocer el resultado.

  Genera production_artifacts/YYYY-MM-DD-short-slug/91-gate-results.json con:
  {
    \"change_id\": \"YYYY-MM-DD-short-slug\",
    \"change_class\": \"feature\",
    \"validated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"typecheck\": \"(pass|fail)\",
    \"lint\": \"(pass|fail)\",
    \"unit_tests\": \"(pass|fail)\",
    \"api_tests\": \"(pass|fail|skipped)\",
    \"features_check\": \"(pass|fail)\",
    \"artifact_completeness\": \"(pass|fail)\",
    \"build\": \"(pass|fail)\",
    \"gates_passed\": <number>,
    \"gates_failed\": <number>,
    \"overall\": \"(pass|fail)\"
  }

  Genera production_artifacts/YYYY-MM-DD-short-slug/90-metrics.json con:
  {
    \"change_id\": \"YYYY-MM-DD-short-slug\",
    \"change_class\": \"feature\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"files_changed\": <count de archivos tocados según change-map.md>,
    \"tests_added\": <count>,
    \"tests_updated\": <count>,
    \"test_coverage_delta\": null,
    \"gates_passed\": <number>,
    \"gates_failed\": <number>
  }

  Si hay observaciones de mejora, genera production_artifacts/YYYY-MM-DD-short-slug/92-improvement-notes.md.

  Reporta al usuario el resultado de la validación final.
")
```

## Reglas

- nunca asumir que una ruta privada admite ACTIVE si no fue definido explícitamente
- toda acción admin debe auditarse
- todo cambio sensible debe listar impacto en tests
- **todo cambio de código debe incluir unit tests (Jest) en `tests/unit/` y API tests (Playwright) en `tests/api/`**
- **no se acepta merge sin tests para lógica de negocio, validaciones, guards o endpoints**
- todos los artifacts van en production_artifacts/YYYY-MM-DD-short-slug/ siguiendo la regla de versioning

## Iteration Limits

| Límite | Valor | Acción al alcanzar |
|--------|-------|-------------------|
| Iteraciones por grupo | 3 | Escalar grupo, continuar con siguiente |
| Iteraciones globales | 5 | Detener workflow, escalar al humano |
| Fix > 5 archivos | - | Activar cross-agent review |

## Escalamiento al Humano

Cuando se alcanza un límite de iteraciones:
1. Generar `production_artifacts/.../escalation-report.md`
2. Notificar al usuario explícitamente con resumen y link al artifact
