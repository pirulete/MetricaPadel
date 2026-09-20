---
description: description: Ejecuta una feature end-to-end desde spec hasta release report
---

Cuando el usuario escriba:

/ship-feature <idea>

seguir esta secuencia:
<!-- engram-step -->
### @engram — Decision Memory
Before implementation:
- `mem_search(type="decision")` for prior architecture decisions
- `mem_search(type="contract")` for API contracts

After completion:
- `mem_save(type="feature", ...)` documenting the change
- `mem_session_summary` before closing

## 0. Inicialización

- Crear directorio `production_artifacts/YYYY-MM-DD-short-slug/` (con sufijo -v2, -v3 si ya existe)
- Inicializar contadores: `iteracion_grupo = 0`, `iteracion_global = 0`

## 1. @pm

- leer <idea>
- contrastar con FEATURES.md (si existe)
- generar production_artifacts definidos
- incluir: problema, objetivo, alcance, acceptance criteria, edge cases, riesgos, out-of-scope
- si la idea ya está parcialmente implementada, especificar gap exacto entre estado actual y estado deseado
- Quality Gate: spec debe tener problema, alcance, acceptance criteria (mínimo 3), out-of-scope

## 2. @architect

- leer feature-spec.md
- generar production_artifacts definidos
- definir: archivos probables a tocar, impacto en auth/db/ui/tests, si requiere @db-engineer, si requiere @auth-security, si corresponde @app-engineer o @admin-engineer
- Quality Gate: design debe tener lista de archivos, impacto, contratos API

## 3. @db-engineer

- intervenir solo si hay cambios de schema, índices, queries o nuevas tablas
- generar production_artifacts definidos

## 4. @auth-security

- intervenir si hay impacto en roles, estados, guards, sesiones, auditoría o flujos auth
- generar production_artifacts definidos

## 5. @app-engineer o @admin-engineer

- implementar según dominio principal de la feature
- priorizar reutilización de hooks, components y patterns existentes
- Cross-Agent Review: si requiere >5 archivos, modificar contratos existentes, o romper compatibilidad → activar review con @architect antes de implementar
- Validación post-implementación: build + lint, si errores y iteracion_global < 5: re-triage
- si iteracion_global >= 5: generar escalation-report.md, detener, notificar
- generar production_artifacts definidos

## 6. @ponytail-reviewer

- revisar diffs de código generados por @app-engineer o @admin-engineer
- aplicar la escalera Ponytail (YAGNI, plataforma nativa, dependencias existentes, regla de línea única)
- refactorizar para eliminar sobreingeniería
- generar production_artifacts/ponytail-review-report.md

## 7. @qa-release

- validar acceptance criteria
- correr regresión del dominio afectado
- validar artifact completeness (incluyendo ponytail-review-report.md y evidence-manifest.json)
- generar production_artifacts definidos

## 8. Post-Flight — Generar evidence-manifest.json

### Paso obligatorio — Generar evidence-manifest.json

El orquestador DEBE generar `production_artifacts/<entry>/evidence-manifest.json` al cierre del workflow:

1. Derivar de `.validation/evidence.json` (gatesRun + completionClaim + riskLevel) o del último `--all` del harness.
2. Usar la plantilla `.agents/templates/evidence-manifest.template.json`.
3. Incluir TODOS los error-gates: typecheck, lint, unit_tests, build, secrets, sast, migrations (y migrations_check como alias — el harness acepta ambos; usa migrations_check que es el id canónico que escribe el harness, y si el risk_policy exige `migrations` el harness ya lo resuelve con resolveGateId).
4. `completionClaim` se deriva (todos los error-gates en pass); si HIGH risk, exigir escalation-report.md.
5. Verificar que el entry del change_id es el último de `production_artifacts/` (si no, el gate --evidence validará otro entry).
6. Registrar métricas del loop: `node scripts/loop-metrics.js --start <change_id>` al abrir el workflow y `node scripts/loop-metrics.js --finish <change_id> --iterations <n>` al cerrarlo (computa la duración real del loop).

Reglas:
- nunca asumir que una ruta privada admite ACTIVE si no fue definido explícitamente
- toda acción admin debe auditarse
- todo cambio sensible debe listar impacto en tests
- iteration limits: 3 por grupo, 5 globales, luego escalamiento
