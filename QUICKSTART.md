# QUICKSTART — Partir un proyecto nuevo desde el skeleton

Guía mínima para llevar este skeleton a un proyecto real. Detalle completo en `README.md`.

## 1. Copiar el skeleton

```bash
# Desde la carpeta que contiene los proyectos
cp -R skeleton_base mi-proyecto-nuevo
cd mi-proyecto-nuevo
rm -rf node_modules pnpm-lock.yaml .next .git   # .git → historial limpio
git init -b main && git add -A && git commit -m "chore: init desde skeleton_base"
```

> El skeleton usa pnpm. Si usas otro gestor, elimina `pnpm-lock.yaml` y borra `node_modules` antes de instalar.

## 2. Renombrar el proyecto a tu dominio

| Archivo | Qué cambiar |
|---------|-------------|
| `package.json` | `"name": "mi-proyecto-nuevo"` |
| `.engram/config.json` | `project_name: "mi-proyecto-nuevo"` |
| `app/layout.tsx` | `metadata.title` y `metadata.description` |
| `app/globals.css` | Color primario: variables `--primary`, `--ring`, `--chart-*` |
| `lib/api-docs/spec.ts` | `info.title` y `info.version` |
| `scripts/lighthouse.mjs` | `BASE_URL` y lista `PAGES` |
| `scripts/pagespeed.mjs` | `BASE_URL` y lista `PAGES` |

## 3. Instalar dependencias

```bash
# Node 20 no soporta pnpm 11; fija pnpm 9
corepack enable
corepack prepare pnpm@9.15.0 --activate

pnpm install
```

## 4. Configurar entorno

```bash
cp .env.example .env.local
```

Editar `.env.local` como mínimo:
- `DATABASE_URL` — cadena de conexión de NeonDB
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `RESEND_API_KEY` y `RESEND_FROM_EMAIL` — si usas verificación por email

## 5. Migraciones y dev server

```bash
pnpm run db:migrate   # crea las tablas base (users, email_verifications, sessions, audit_logs)
pnpm run dev          # http://localhost:3000
```

## 6. Verificar que todo está bien

```bash
npx tsc --noEmit
pnpm run lint
pnpm run security:all
node scripts/validate-harness.js --all
```

## 7. Primer usuario ADMIN

Con una conexión a la DB (ej: `pnpm run db:studio`), crea un usuario con estado `ACTIVE` y rol `ADMIN`, o registra uno en `/register`, verifica el email en `/login` y promuévelo a `ADMIN` desde la DB.

## 8. Siguientes pasos

- Agregar tablas del dominio en `lib/db/schema.ts` → `pnpm run db:generate` → `pnpm run db:migrate`
- Crear features con `/ship-feature <idea>` (ver `README.md` → Agent Team)
- Ajustar la parte pública en `app/(public)`, el área privada en `app/(app)`, el back-office en `app/admin`

## 9. Actualizar el harness desde el proyecto fuente (StreetMove)

Cuando cambies algo en el harness de StreetMove (agentes, workflows, scripts, configs) y quieras traerlo al skeleton:

```bash
# Ver qué cambiaría sin tocar nada
node scripts/sync-harness.mjs --src ../StreetMove/StreetMoveWebsite --dry-run

# Copiar archivos COPY + generar reporte de REVIEW + commit
node scripts/sync-harness.mjs --src ../StreetMove/StreetMoveWebsite --apply
```

Cómo funciona:
- **COPY** — archivos genéricos que se sobrescriben directo (configs, `components/ui`, lib genérico, scripts). El script omite los que ya son idénticos.
- **REVIEW** — archivos que fueron **adaptados/generificados** en el skeleton (`AGENTS.md`, `opencode.json`, `auth.ts`, `lib/db/schema.ts`, `scripts/validate-harness.js`, etc.). **NO se copian**: el script genera `production_artifacts/sync/YYYY-MM-DD/sync-report.md` con el `git diff` de StreetMove *desde la última sync* para que portes a mano los cambios manteniendo el whitelabel.
- El script recuerda el último SHA de StreetMove en `.validation/sync-state.json`; solo reporta lo que cambió desde entonces.

> La primera vez todo lo de REVIEW aparece como "primera sync — revisar adaptación" (es el diff intencional de generificación). En las siguientes corridas solo verás cambios nuevos.

---

## Opcion rapida: Blueprint

Si prefieres un setup automatizado:

```bash
# 1. Preparar respuestas
cp blueprint/answers-example.json blueprint/answers.json
# Editar blueprint/answers.json con tus respuestas

# 2. Ejecutar scaffolding
node scripts/init-project.mjs --from-blueprint blueprint/answers.json

# 3. Verificar
cd ../mi-proyecto
node scripts/validate-harness.js --all
```

O con flags directos:

```bash
node scripts/init-project.mjs --name "mi-app" --pattern saas --lang es --dry-run
```

Detalle completo en `blueprint/README.md`.
