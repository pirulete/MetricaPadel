---
description: Ejecuta la validación completa del proyecto (typecheck, lint, tests, FEATURES.md)
---

Cuando el usuario escriba:

/validate

seguir esta secuencia:

## Engram Memory Protocol

This workflow integrates with Engram for cross-session decision memory.

1. **Session start**: `mem_context` is auto-injected by the plugin. Call `mem_search(type="rule")` to load project rules.
2. **Before implementation**: Search for relevant past decisions with `mem_search(type="decision")`.
3. **After implementation**: Save a memory with `mem_save(type="rule", ...)` documenting the change.
4. **Session close**: Call `mem_session_summary` before exiting.

## 1. @qa-validator — Validación completa

Invoca:
```
task(description="Validación completa del proyecto", subagent_type="qa-validator", prompt="
  Actúa como @qa-validator. Sigue las reglas de AGENTS.md para @qa-validator.
  Ejecuta el script de validación local:
  ```
  node scripts/validate-harness.js --all
  ```
  NOTA: `--all` tarda 5-6 min (build ~97s, tests con workers). Si el comando se
  ejecuta desde el bash tool de opencode, pasar timeout explícito amplio (≥ 10 min)
  para que opencode no corte el shell a los 120s y huérfane el harness (ver patrón
  "Procesos node huérfanos" en recurring-issues.md).

  Lee el archivo .validation/status.json generado.
  Lee el archivo scripts/validate-harness.js para entender qué gates se ejecutaron.

  Si status = 'pass':
    - Confirma al usuario: '✅ Todos los gates pasaron'
    - Resume gates pasados/totales
  Si status = 'fail':
    - Reporta al usuario: '❌ Validación falló'
    - Lista los gates fallidos con el error exacto
    - NO permitas iniciar ningún workflow hasta que se resuelva

  Si hubo errores de typecheck:
    - Recomienda: '/fix-problems <alcance>'
  Si hubo errores de lint:
    - Recomienda: ejecutar 'pnpm run lint --fix'
  Si hubo tests fallando:
    - Recomienda: '/fix-failing-test <test-name>'
")
```

## Reglas

- No iniciar ningún workflow si `.validation/status.json` contiene `status: "fail"`
- El comando `/validate` es la única forma de resetear el estado de validación a "pass"
- Después de ejecutar `/validate`, leer .validation/status.json y reportar resultado al usuario
