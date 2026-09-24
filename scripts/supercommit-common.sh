#!/bin/bash
# supercommit-common.sh — Shared logic for /supercommitpre and /supercommitpro
# Source this file: source scripts/supercommit-common.sh

set -euo pipefail

# ── 1. Verify branch ──────────────────────────────────────────────────────────
verify_branch() {
  local current
  current=$(git rev-parse --abbrev-ref HEAD)
  if [ "$current" != "rama-preview" ]; then
    echo "➡️  Cambiando a rama-preview..."
    git checkout rama-preview
  fi
}

# ── 2. Stage + analyze diff ───────────────────────────────────────────────────
stage_and_analyze() {
  git add .
  git reset HEAD coverage/ 2>/dev/null; git reset HEAD production_artifacts/ 2>/dev/null; true

  DIFF_STATS=$(git diff --cached --name-status)

  if [ -z "$DIFF_STATS" ]; then
    echo "⚠️  No hay cambios staged. Nada que commitear."
    exit 0
  fi

  ADDED=$(echo "$DIFF_STATS" | grep -c "^A" || true)
}

# ── 3. Classify prefix (feat/fix) ─────────────────────────────────────────────
classify_prefix() {
  if [ "$ADDED" -gt 0 ]; then
    PREFIX="feat"
  elif echo "$DIFF_STATS" | grep -q "test"; then
    PREFIX="fix"
  else
    PREFIX="feat"
  fi
}

# ── 4. Generate commit message description ────────────────────────────────────
generate_description() {
  local HAS_AGENTS HAS_COMMANDS HAS_FEATURES HAS_ARCH HAS_APP
  HAS_AGENTS=$(echo "$DIFF_STATS" | grep -c "\.opencode/agents\|\.agents/agents\|AGENTS\.md" || true)
  HAS_COMMANDS=$(echo "$DIFF_STATS" | grep -c "\.opencode/commands" || true)
  HAS_FEATURES=$(echo "$DIFF_STATS" | grep -c "FEATURES\.md" || true)
  HAS_ARCH=$(echo "$DIFF_STATS" | grep -c "ARCHITECTURE" || true)
  HAS_APP=$(echo "$DIFF_STATS" | grep -Ec "^app/|^components/|^tests/|^lib/" || true)

  local PARTS=""
  [ "$HAS_AGENTS" -gt 0 ] && PARTS="${PARTS}agents, "
  [ "$HAS_COMMANDS" -gt 0 ] && PARTS="${PARTS}commands, "
  [ "$HAS_FEATURES" -gt 0 ] && PARTS="${PARTS}features-md, "
  [ "$HAS_ARCH" -gt 0 ] && PARTS="${PARTS}architecture, "
  [ "$HAS_APP" -gt 0 ] && PARTS="${PARTS}app, "

  DESCRIPTION=$(echo "$PARTS" | sed 's/, $//')

  if [ -z "$DESCRIPTION" ]; then
    DESCRIPTION=$(echo "$DIFF_STATS" | sed 's/^[A-Z][[:space:]]*//' | grep -oE '^[^/]+' | sort -u | head -4 | tr '\n' ', ' | sed 's/, $//')
  fi

  MESSAGE="${PREFIX}: ${DESCRIPTION}"
}

# ── 5. Drizzle generate + validate (if schema.ts changed) ─────────────────────
drizzle_generate_if_needed() {
  local HAS_SCHEMA
  HAS_SCHEMA=$(echo "$DIFF_STATS" | grep -c "lib/db/schema.ts" || true)

  if [ "$HAS_SCHEMA" -gt 0 ]; then
    echo ""
    echo "🔍  Detectado cambio en lib/db/schema.ts — generando migración..."
    pnpm run db:generate 2>&1 | tail -5
    MIGRATE_EXIT=$?
    if [ "$MIGRATE_EXIT" -ne 0 ]; then
      echo "❌  Error al generar migración. Abortando."
      exit 1
    fi
    echo "✅  Migración generada correctamente"
    echo ""
    echo "🔍  Validando consistencia del journal de migraciones..."
    node scripts/validate-harness.js --migrations 2>&1 | tail -10
    VALIDATE_EXIT=$?
    if [ "$VALIDATE_EXIT" -ne 0 ]; then
      echo "❌  Migraciones inconsistentes. Revisa drizzle/meta/_journal.json."
      exit 1
    fi
    echo "✅  Journal de migraciones consistente"

    # Re-stage after db:generate (created new files)
    git add .
    git reset HEAD coverage/ 2>/dev/null; git reset HEAD production_artifacts/ 2>/dev/null; true
  fi
}

# ── 6. Verify evidence-manifest.json ──────────────────────────────────────────
verify_evidence() {
  local LATEST_ENTRY
  LATEST_ENTRY=$(ls -td production_artifacts/*/ 2>/dev/null | head -1)

  if [ -z "$LATEST_ENTRY" ] || [ ! -f "${LATEST_ENTRY}evidence-manifest.json" ]; then
    echo "❌  No se encontró evidence-manifest.json en ${LATEST_ENTRY:-production_artifacts/}."
    echo "   Genera el evidence-manifest.json en production_artifacts/<entry>/ antes de commitear."
    echo "   Alternativa: valida con node scripts/validate-harness.js --evidence"
    exit 1
  fi
  echo "✅  evidence-manifest.json presente — verificando gate --evidence..."
  node scripts/validate-harness.js --evidence 2>&1 | tail -5
  EVIDENCE_EXIT=$?
  if [ "$EVIDENCE_EXIT" -ne 0 ]; then
    echo "❌  Gate --evidence falló. Genera el evidence-manifest.json antes de commitear."
    exit 1
  fi
  echo "✅  Gate --evidence pasó (completionClaim=true)"
}

# ── 7. Version bump (FEATURES.md → version.ts + ARCHITECTURE) ────────────────
version_bump() {
  echo ""
  echo "🔢  Verificando versión de release..."

  local FEATURES_VERSION CURRENT_VERSION TODAY
  FEATURES_VERSION=$(grep -m1 'Release' FEATURES.md | grep -o 'v[0-9]\+\.[0-9]\+' | head -1 | sed 's/^v//')
  CURRENT_VERSION=$(grep "APP_VERSION" lib/constants/version.ts | sed "s/.*'v\(.*\)'.*/\1/")

  if [ -z "$FEATURES_VERSION" ]; then
    echo "⚠️  No se pudo extraer versión de FEATURES.md — omitiendo version bump"
  elif [ "$FEATURES_VERSION" = "$CURRENT_VERSION" ]; then
    echo "✅  Versión al día: v${CURRENT_VERSION}"
    TODAY=$(date +%Y-%m-%d)
    # Sync ARCHITECTURE.md if out of date
    if grep -q "Último Release" ARCHITECTURE.md; then
      local ARCH_VER
      ARCH_VER=$(grep "Último Release" ARCHITECTURE.md | grep -o 'v[0-9]\+\.[0-9]\+' | head -1 | sed 's/^v//')
      if [ "$ARCH_VER" != "$FEATURES_VERSION" ]; then
        echo "🔄  Sincronizando ARCHITECTURE.md: v${ARCH_VER:-?} → v${FEATURES_VERSION}"
        sed -i '' "s/\*\*Último Release\*\*: v[0-9]*\.[0-9]*.*/\*\*Último Release\*\*: v${FEATURES_VERSION} (${TODAY})/" ARCHITECTURE.md
        git add ARCHITECTURE.md
      fi
    fi
  else
    echo "🔄  Actualizando versión: v${CURRENT_VERSION} → v${FEATURES_VERSION}"
    TODAY=$(date +%Y-%m-%d)
    sed -i '' "s/APP_VERSION = 'v${CURRENT_VERSION}'/APP_VERSION = 'v${FEATURES_VERSION}'/" lib/constants/version.ts
    sed -i '' "s/BUILD_DATE = '.*'/BUILD_DATE = '${TODAY}'/" lib/constants/version.ts
    git add lib/constants/version.ts
    echo "✅  version.ts actualizado: v${FEATURES_VERSION} · ${TODAY}"
    if grep -q "Último Release" ARCHITECTURE.md; then
      sed -i '' "s/\*\*Último Release\*\*: v[0-9]*\.[0-9]*.*/\*\*Último Release\*\*: v${FEATURES_VERSION} (${TODAY})/" ARCHITECTURE.md
      git add ARCHITECTURE.md
      echo "✅  ARCHITECTURE.md sincronizado: v${FEATURES_VERSION} · ${TODAY}"
    fi
  fi
}

# ── 8. Commit + push ──────────────────────────────────────────────────────────
commit_and_push() {
  echo ""
  echo "📦  Commiteando a rama-preview..."
  git commit -m "$MESSAGE"
  if [ $? -ne 0 ]; then
    echo "❌  Error al commitear."
    exit 1
  fi
  echo "⬆️  Pusheando a rama-preview..."
  git push origin rama-preview 2>&1 | tail -3
  if [ $? -ne 0 ]; then
    echo "❌  Error al pushear."
    exit 1
  fi
  echo "✅  $MESSAGE commiteado y pusheado a rama-preview"
}

# ── Run all common steps (used by both pre and pro) ───────────────────────────
run_common() {
  verify_branch
  stage_and_analyze
  classify_prefix
  generate_description
  drizzle_generate_if_needed
  verify_evidence
  version_bump
  commit_and_push
}
