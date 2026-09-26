# /fix-problems Workflow

## Engram Memory Protocol

This workflow integrates with Engram for cross-session decision memory.

1. **Session start**: `mem_context` is auto-injected by the plugin. Call `mem_search(type="rule")` to load project rules.
2. **Before implementation**: Search for relevant past decisions with `mem_search(type="decision")`.
3. **After implementation**: Save a memory with `mem_save(type="fix", ...)` documenting the change.
4. **Session close**: Call `mem_session_summary` before exiting.

## 0. Inicialización + Tier Detection

- Crear directorio `production_artifacts/YYYY-MM-DD-fix-problems/` (con sufijo -v2, -v3 si ya existe)
- Inicializar contadores: `iteracion_grupo = 0`, `iteracion_global = 0`
- Consultar `.agents/patterns/recurring-issues.md` para detectar si el problema matchea un patrón conocido

**Tier Detection:** El orquestador determina el tier automáticamente con esta lógica:

1. Contar archivos afectados (de la salida de Problems/linter/typecheck)
2. Verificar si el error matchea un patrón conocido en `recurring-issues.md`
3. Aplicar reglas:

   | Condición | Tier | Pipeline |
   |-----------|------|----------|
   | 1-2 archivos **o** matchea patrón conocido | **S** (simple) | @qa-fix → implement → @qa-validator. 1 artifact (`app-notes.md`). Scoped tests. |
   | 3-5 archivos, sin patrón conocido | **M** (moderate) | @qa-fix → implement → @ponytail-reviewer → @qa-validator. 4 artifacts. Full tests. |
   | 5+ archivos **o** clasificación sistémica | **L** (large) | Full pipeline: @qa-fix → @architect-fix → implement → @ponytail-reviewer → @qa-release → @qa-validator. 10+ artifacts. |

4. El usuario puede override con `--tier L` para forzar Tier L
5. Si `iteracion_global > 0` (re-triage), el tier escala automáticamente a M mínimo

**Lo que omite cada Tier:**
- **Tier S**: @architect-fix (Step 2), @ponytail-reviewer (Step 3.5), @qa-release (Step 4), pattern detection (Step 6)
- **Tier M**: @architect-fix (Step 2), @qa-release (Step 4)
- **Tier L**: Pipeline completo

## 0.5 Pre-Flight Gate Check

Antes de iniciar el workflow, leer `.validation/status.json`:

```
Si status = "fail":
  - NOTIFICAR al usuario: "No puedes iniciar un workflow mientras el validation gate esté en estado 'fail'."
  - Mostrar los gates fallidos.
  - DETENER el workflow.
  - Recomendar: ejecuta /validate primero.
Si status = "pass" o "none":
  - CONTINUAR con el workflow.
```

## 0.55 Producción → Dev (Gap 3 Loop Engineering — G5 triage autónomo)

Si `SENTRY_AUTH_TOKEN` o `VERCEL_TOKEN` están disponibles, ejecutar el triage de producción ANTES del triage de errores:

```bash
node scripts/sentry-triage.js --days 7
```

Esto genera `production_artifacts/YYYY-MM-DD-sentry-triage/problems-triage.md` con issues de Sentry + logs de Vercel, severidad y perfil sugerido. Los issues critical/high se incluyen POR DEFECTO en el alcance del triage de @qa-fix. Si no hay tokens, el paso se omite sin bloquear.

## 1. @qa-fix — Triage de errores

Invoca:
```
task(description="Triage de errores", subagent_type="qa-fix", prompt="
  Actúa como @qa-fix. Sigue las reglas de AGENTS.md para @qa-fix.
  Lee el panel Problems y/o output del editor para el alcance: {ARGUMENTS}.
  Agrupa los errores por tipo: TypeScript, import/path, test, lint, runtime probable.
  Detecta archivos afectados.
  Propón fix mínimo por grupo.
  Si el problema matchea un patrón de .agents/patterns/recurring-issues.md, referencia el fix conocido.
  Genera production_artifacts/YYYY-MM-DD-fix-problems/problems-triage.md
  Genera production_artifacts/YYYY-MM-DD-fix-problems/test-matrix.md
")
```

**Quality Gate 1:** Validar que problems-triage.md tiene:
- [ ] Errores agrupados por tipo
- [ ] Archivos afectados listados
- [ ] Fix mínimo propuesto por grupo
- [ ] Clasificación de riesgo (low/medium/high)

Si NO pasa el gate → devolver a @qa-fix con feedback específico.

## 2. @architect-fix — Plan de reparación (solo Tier M/L)

> **Skip si Tier S.** Para Tier S, ir directamente a Step 3.

Con el triage validado, invoca:
```
task(description="Plan de reparación", subagent_type="architect-fix", prompt="
  Actúa como @architect-fix. Sigue las reglas de AGENTS.md para @architect-fix.
  Con el contenido de problems-triage.md generado por @qa-fix:
  - Identifica causa raíz por grupo.
  - Clasifica cada grupo: fix local, fix por contrato, fix sistémico.
  - Ordena ejecución del menor riesgo al mayor.
  - Si el problema es sistémico, detén y recomienda workflow mayor (/ship-feature).
  - Define qué perfil debe corregir cada error (@app-engineer, @admin-engineer, @auth-security, @db-engineer).
  Genera production_artifacts/YYYY-MM-DD-fix-problems/repair-plan.md
")
```

**Quality Gate 2:** Validar que repair-plan.md tiene:
- [ ] Causa raíz identificada por grupo
- [ ] Clasificación (local/contrato/sistémico)
- [ ] Orden de ejecución
- [ ] Perfil asignado por grupo

Si NO pasa el gate → devolver a @architect-fix con feedback específico.
Si clasificación = "sistémico" → detener workflow, notificar al usuario, recomendar workflow mayor.

## 3. Agente de implementación — Resolver grupo por grupo

**Tier S:** Usar el triage directamente (no hay repair-plan). Invocar el agente según el tipo de error:
- Errores de UI/layout/dashboard → `app-engineer`
- Errores de admin → `admin-engineer`
- Errores de auth/seguridad → `auth-security`
- Errores de DB/queries → `db-engineer`

**Tier M/L:** Con el repair-plan validado, invoca el agente correspondiente para cada grupo.

Para cada grupo N en el repair-plan (o en el triage para Tier S):

```
task(description="Implementar fix grupo N", subagent_type="general", prompt="
  Actúa como <app-engineer|auth-security|admin-engineer|db-engineer>. Sigue las reglas de AGENTS.md para ese rol.
  Siguiendo el {{repair-plan.md o problems-triage.md según Tier}}:
  - Resuelve el grupo N de errores.
  - No mezcles refactors cosméticos.
  - Después de aplicar el fix, valida que no queden errores de ese grupo.
  Genera production_artifacts/YYYY-MM-DD-fix-problems/app-notes.md (o auth-impact.md, admin-notes.md, db-plan.md según agente)
")
```

**Validación post-grupo:**
- Incrementar `iteracion_grupo` y `iteracion_global`
- Correr `pnpm run build` (typecheck) + lint del área afectada

**3a. Auto-Fix Post-Grupo**

Antes de decidir si hay errores, ejecutar auto-fix:

1. **Lint --fix**: `pnpm run lint --fix` — corrige reglas auto-fixables.
2. **Re-evaluar**: Volver a correr `npx tsc --noEmit` y `pnpm run lint`:
   - Si **0 errores** → continuar workflow (grupo resuelto, saltar re-triage)
   - Si **persisten errores** → proceder con re-triage normal

- Si hay nuevos errores después del auto-fix:
  - Si `iteracion_grupo < 3` Y `iteracion_global < 5`:
    - Re-invocar @qa-fix para re-triage de los nuevos errores
    - Volver a @architect-fix con el re-triage
    - Re-aplicar fix con el agente correspondiente
  - Si `iteracion_grupo >= 3` (límite por grupo):
    - Generar `escalation-report.md` para este grupo
    - Notificar al usuario y continuar con el siguiente grupo si existe
  - Si `iteracion_global >= 5` (límite global):
    - Generar `escalation-report.md`
    - DETENER workflow completo
    - Notificar al usuario con resumen y recomendación

## 3.5 @ponytail-reviewer — Filtro de simplicidad (solo Tier M/L)

> **Skip si Tier S.** Para Tier S, ir directamente a Step 5 (Post-Flight @qa-validator).

Después de resolver todos los grupos de fix y antes de la validación final:

```
task(description="Ponytail review", subagent_type="ponytail-reviewer", prompt="
  Actúa como @ponytail-reviewer. Sigue las reglas de AGENTS.md para @ponytail-reviewer.
  Lee los diffs de código generados por <app-engineer|auth-security|admin-engineer|db-engineer>.
  Aplica la Escalera Ponytail:
  1. YAGNI — ¿esta abstracción realmente necesita existir?
  2. Plataforma Nativa — ¿TypeScript/Node.js/Next.js ya lo resuelve?
  3. Dependencias Existentes — ¿Zod, Drizzle, Radix ya cubren esto?
  4. Regla de la Línea Única — ¿puede reducirse a 1-2 líneas?
  Refactoriza el código para eliminar sobreingeniería.
  Genera production_artifacts/YYYY-MM-DD-fix-problems/ponytail-review-report.md
")
```

## 4. @qa-release — Validación final (solo Tier L)

> **Skip si Tier S o Tier M.** Para Tier S/M, ir directamente a Step 5.

Con todos los grupos resueltos, invoca:
```
task(description="Validación release", subagent_type="qa-release", prompt="
  Actúa como @qa-release. Sigue las reglas de AGENTS.md para @qa-release.
  Valida que los fixes aplicados no rompan flujos críticos:
  - Rerun typecheck
  - Rerun lint del área afectada
  - Smoke test o test puntual si aplica
  Genera production_artifacts/YYYY-MM-DD-fix-problems/release-report.md
  Genera production_artifacts/YYYY-MM-DD-fix-problems/test-matrix.md
  Genera production_artifacts/YYYY-MM-DD-fix-problems/acceptance-criteria.md
  Si es fix, genera production_artifacts/YYYY-MM-DD-fix-problems/repair-report.md
")
```

**Artifact Completeness Validator (según Tier):**

**Tier S:** problems-triage.md, app-notes.md, 91-gate-results.json, 90-metrics.json

**Tier M:** problems-triage.md, repair-plan.md, app-notes.md/auth-impact.md/admin-notes.md/db-plan.md, ponytail-review-report.md, 91-gate-results.json, 90-metrics.json

**Tier L:** problems-triage.md, repair-plan.md, test-matrix.md, release-report.md, acceptance-criteria.md, repair-report.md (si es fix), app-notes.md/auth-impact.md/admin-notes.md/db-plan.md, ponytail-review-report.md, 91-gate-results.json, 90-metrics.json, 92-improvement-notes.md (si hay observaciones)

Si falta alguno → generarlo o notificar al usuario.

## 4.5 Features.md Update (Tier M/L)

> **Skip si Tier S.**

Después de resolver todos los grupos de fix, actualizar FEATURES.md agregando una entry al INICIO:

```markdown
## Fix: <descripción corta> ✨ (YYYY-MM-DD)

> **Status:** released | **Release:** vX.XX | **Module:** <módulo> | **Tags:** [fix, ...]
> **Change ID:** `fix-<slug>-YYYY-MM-DD`

### Problema
<descripción del problema tomada del problems-triage.md>

### Solución Implementada
<descripción de la solución tomada del repair-plan.md>

### Archivos Modificados
| Archivo | Acción |
|---------|--------|
| <archivo> | 🔧 <cambio> |

### Tests
<tests ejecutados y resultado>
```

**Reglas:**
- La entry DEBE incluir `Release: vX.XX`
- El Change ID DEBE ser único (formato: `fix-<slug>-YYYY-MM-DD`)
- El Module DEBE ser uno de: auth, dashboard, admin, db, infra, marketing, legal

## 5. Post-Flight @qa-validator

```
task(description="Post-flight validation gate", subagent_type="qa-validator", prompt="
  Actúa como @qa-validator. Sigue las reglas de AGENTS.md para @qa-validator.
  node scripts/validate-harness.js --all
  Genera production_artifacts/YYYY-MM-DD-fix-problems/91-gate-results.json con change_class='fix'
  Genera production_artifacts/YYYY-MM-DD-fix-problems/90-metrics.json con change_class='fix'
  Si hay observaciones, genera production_artifacts/YYYY-MM-DD-fix-problems/92-improvement-notes.md
  Reporta al usuario el resultado de la validación final.
")
```

### Paso obligatorio — Generar evidence-manifest.json

El orquestador DEBE generar `production_artifacts/<entry>/evidence-manifest.json` al cierre del workflow:

1. Derivar de `.validation/evidence.json` o del último `--all` del harness.
2. Usar la plantilla `.agents/templates/evidence-manifest.template.json`.
3. Incluir TODOS los error-gates.
4. `completionClaim` se deriva (todos los error-gates en pass).
5. Verificar que el entry del change_id es el último de `production_artifacts/`.

## 6. Pattern Detection (auto-update, solo Tier M/L)

> **Skip si Tier S.**

Después de cerrar el workflow:
- Revisar si el tipo de error fixado ya existe en `.agents/patterns/recurring-issues.md`
- Si es un patrón nuevo → agregarlo automáticamente con: síntoma, fix aplicado, archivos afectados, fecha
- Si es un patrón conocido → incrementar contador de ocurrencias

## Reglas

- nunca corregir 20 errores a ciegas en una sola pasada
- siempre agrupar por causa raíz
- preferir fix mínimo
- si un error revela un contrato obsoleto, actualizar test o tipos con justificación
- si aparecen más errores después de corregir el primero, re-triage antes de seguir
- **todo fix de código debe incluir o actualizar tests correspondientes**
- todos los artifacts van en production_artifacts/YYYY-MM-DD-fix-problems/ siguiendo la regla de versioning

## Iteration Limits

| Límite | Valor | Acción al alcanzar |
|--------|-------|-------------------|
| Iteraciones por grupo | 3 | Escalar grupo, continuar con siguiente |
| Iteraciones globales | 5 | Detener workflow, escalar al humano |
| Fix > 5 archivos | - | Escalar a @pm para re-evaluar alcance |

## Commit y Push (Post-Flight)

### REGLA CRITICA — PRODUCCION ESTA PROHIBIDA

**`/fix-problems` NUNCA ejecuta `git checkout main`, `git merge`, ni `git push origin main`.**

**El flujo correcto es:**
```
/fix-problems → commitea y pushea a rama-preview
  → Notifica al usuario: "Cambios listos en rama-preview. Ejecuta /supercommitpro cuando quieras deploy"
  → El usuario decide cuándo deploy
```

### Gate de Confirmacion ANTES de commit+push

**ANTES de ejecutar `git commit` o `git push`, DEBES preguntar al usuario:**

```
¿Commiteo y pusheo estos cambios a rama-preview? (si/no)
```

**Solo si el usuario responde "si" o "procede", ejecutar:**

```bash
git add <archivos_modificados>
git commit -m "fix: <descripción>"
git push origin rama-preview
```

Después del push a `rama-preview`, notificar al usuario:
> "Cambios commiteados y pusheados a rama-preview. Ejecuta `/supercommitpro` cuando quieras hacer merge a main y deploy."

## Escalamiento al Humano

Cuando se alcanza un límite de iteraciones:
1. Generar `production_artifacts/.../escalation-report.md` con:
   - Qué se intentó en cada iteración
   - Por qué falló cada intento
   - Archivos tocados
   - Recomendación de próximo paso
2. Notificar al usuario explícitamente con resumen y link al artifact
