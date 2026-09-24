---
description: Super commit a rama-preview + merge a main con validación local y migraciones Drizzle
mode: agent
permission:
  edit: allow
  bash: allow
---

# /supercommitpro

## 1. Ejecutar pasos comunes (stage, prefix, drizzle, evidence, version, commit, push)

```bash
source scripts/supercommit-common.sh
run_common
```

## 2. Validar migraciones en DB antes de merge a main

```bash
echo ""
echo "🔍  Validando migraciones contra DB antes de merge a main..."
if [ -n "$DATABASE_URL" ]; then
  pnpm run db:migrate 2>&1 | tail -5
  MIGRATE_EXIT=$?
  if [ "$MIGRATE_EXIT" -ne 0 ]; then
    echo "❌  Error en migraciones DB. Abortando merge."
    exit 1
  fi
  echo "✅  Migraciones validadas — DB al día"
else
  echo "ℹ️  DATABASE_URL no definida — no se validaron migraciones"
fi
```

## 3. Merge --no-ff rama-preview → main

```bash
echo ""
echo "🔀  Mergeando rama-preview → main (--no-ff)..."
git checkout main
git merge rama-preview --no-ff --no-edit
MERGE_EXIT=$?
if [ "$MERGE_EXIT" -ne 0 ]; then
  echo "❌  Conflicto de merge en main. Resuelve manualmente y reintenta."
  exit 1
fi
MERGE_SHA=$(git rev-parse HEAD)
echo "✅  Merge commit creado: $MERGE_SHA"
```

## 4. Validación local del merge (sin push a rama-preview)

```bash
echo ""
echo "🔍  Validando merge localmente con el validation harness..."
node scripts/validate-harness.js --typecheck --lint --tests --build 2>&1 | tail -10
VALIDATE_EXIT=$?
if [ "$VALIDATE_EXIT" -ne 0 ]; then
  echo "❌  Validación del merge falló. main NO será actualizado."
  echo "🔄  Revirtiendo merge local..."
  git merge --abort 2>/dev/null || git reset --hard HEAD@{1}
  git checkout rama-preview
  echo "ℹ️  Merge revertido. Corrige el error en rama-preview y vuelve a ejecutar /supercommitpro"
  exit 1
fi
echo "✅  Validación local pasó — typecheck, lint, tests, build OK"
```

## 5. Push a main

```bash
echo ""
echo "🔀  Pusheando merge commit a main..."
git push origin main 2>&1 | tail -3
echo "✅  main actualizado y pusheado"
```

## 6. Volver a rama-preview

```bash
git checkout rama-preview 2>/dev/null
echo "✅  Vuelto a rama-preview"
```

## 7. Confirmar al usuario

```bash
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  ✅ /supercommitpro completado                          │"
echo "│                                                         │"
echo "│  📝  $MESSAGE"
echo "│  🌿  rama-preview → main (validación local → push)     │"
echo "│  🔑  Merge SHA: $MERGE_SHA"
echo "│  🗄️   Migraciones DB: ✅                                 │"
echo "└─────────────────────────────────────────────────────────┘"
```
