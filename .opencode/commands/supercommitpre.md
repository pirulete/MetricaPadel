---
description: Super commit a rama-preview con prefix inteligente feat/fix y validación de migraciones
mode: agent
permission:
  edit: allow
  bash: allow
---

# /supercommitpre

Flags opcionales (al final del comando):
- `--amend` — usa `git commit --amend` en vez de commit nuevo
- `--dry-run` — muestra preview sin ejecutar commit/push
- `-v` — muestra el diff completo antes de commitear

> **Agent**: si el usuario incluyó `--amend`, cambiar el commit a `git commit --amend -m "$MESSAGE"`.
> Si incluyó `--dry-run`, saltar el commit+push (solo mostrar preview).
> Si incluyó `-v`, agregar `git diff --cached` después del stage.

## 1. Sync con main antes de commitear

```bash
echo "🔀  Sincronizando rama-preview con main..."
git fetch origin main 2>/dev/null
git merge origin/main --no-edit 2>&1 | tail -3
MERGE_EXIT=$?
if [ "$MERGE_EXIT" -ne 0 ]; then
  echo "❌  Conflicto al sincronizar con main. Resuelve manualmente y reintenta."
  exit 1
fi
```

## 2. Ejecutar migraciones pendientes contra DB preview

```bash
echo "🗄️  Ejecutando migraciones pendientes contra DB..."
if [ -n "$DATABASE_URL" ]; then
  pnpm run db:migrate 2>&1 | tail -5
  MIGRATE_EXIT=$?
  if [ "$MIGRATE_EXIT" -ne 0 ]; then
    echo "❌  Error al ejecutar migraciones. Abortando."
    exit 1
  fi
  echo "✅  Migraciones aplicadas correctamente"
else
  echo "ℹ️  DATABASE_URL no definida — no se ejecutaron migraciones"
fi
```

## 3. Ejecutar pasos comunes (stage, prefix, drizzle, evidence, version, commit, push)

```bash
source scripts/supercommit-common.sh
run_common
```

## 4. Confirmar al usuario

```bash
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  ✅ /supercommitpre completado                          │"
echo "│                                                         │"
echo "│  📝  $MESSAGE"
echo "│  🌿  rama-preview                                       │"
echo "│  🔀  Sync con main: ✅                                  │"
echo "│  🗄️   Migraciones DB: ✅                                 │"
echo "│  🗃️   $(echo "$DIFF_STATS" | wc -l | tr -d ' ') archivos"
echo "└─────────────────────────────────────────────────────────┘"
```
