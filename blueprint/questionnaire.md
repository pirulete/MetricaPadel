# Project Blueprint — Questionnaire

Guía de 15 preguntas para configurar un nuevo proyecto desde `skeleton_base`. Las respuestas se exportan a `answers.json` y se consumen con `init-project.mjs`.

---

## Bloque A — Identidad (obligatorio, bloquea clonación)

Estas 5 preguntas son **requeridas**. Sin respuesta completa, el script no ejecuta.

### Q1 — Nombre del proyecto

- **Pregunta**: ¿Cómo se llama el proyecto?
- **Tipo**: `string` (kebab-case)
- **Ejemplo**: `"fit-tracker"`
- **Default**: (ninguno — obligatorio)
- **Afecta**: `package.json`, `.engram/config.json`, `app/layout.tsx`, `lib/api-docs/spec.ts`

### Q2 — Descripción del proyecto

- **Pregunta**: ¿Qué es el proyecto en una línea?
- **Tipo**: `string` (texto plano)
- **Ejemplo**: `"Plataforma SaaS para entrenadores fitness"`
- **Default**: (vacío — opcional)
- **Afecta**: `app/layout.tsx` (metadata.description), `package.json` (description)

### Q3 — Tipo de proyecto (pattern)

- **Pregunta**: ¿Qué tipo de proyecto es?
- **Tipo**: `enum`
- **Opciones**: `saas`, `ecommerce`, `blog`, `services`, `education`, `none`
- **Default**: `none`
- **Afecta**: Patrón de schema, queries, API y UI que se genera

### Q4 — Colores del brand

- **Pregunta**: ¿Cuáles son los colores principales? (formato oklch o hex)
- **Tipo**: `object { primary, primaryDark }`
- **Ejemplo**: `{ "primary": "#2563eb", "primaryDark": "#1d4ed8" }`
- **Default**: `{ "primary": "#6366f1", "primaryDark": "#4f46e5" }`
- **Afecta**: `app/globals.css` (variables `--primary`, `--ring`, `--chart-*`)

### Q5 — Idioma y timezone

- **Pregunta**: ¿Idioma y zona horaria del proyecto?
- **Tipo**: `object { lang, timezone }`
- **Ejemplo**: `{ "lang": "es", "timezone": "America/Argentina/Buenos_Aires" }`
- **Default**: `{ "lang": "es", "timezone": "UTC" }`
- **Afecta**: `app/layout.tsx` (html lang), `.env.local` (APP_TIMEZONE)

---

## Bloque B — Features del skeleton (opcional)

Estas preguntas son **opcionales**. El skeleton incluye todo por defecto; el usuario puede desactivar lo que no necesita.

### Q6 — Features del skeleton a activar

- **Pregunta**: ¿Qué features del skeleton necesitas?
- **Tipo**: `multi-select`
- **Opciones**: `cms`, `push`, `notifications`, `blog`, `shop`, `terms`, `avatar`
- **Default**: todas activas
- **Afecta**: Features incluidas en el clon

### Q7 — Integración de pagos

- **Pregunta**: ¿Qué proveedor de pagos usarás?
- **Tipo**: `enum | null`
- **Opciones**: `stripe`, `mercadopago`, `lemon-squeezy`, `none`
- **Default**: `none`
- **Afecta**: Dependencias a instalar, schema si aplica

### Q8 — Emails transaccionales

- **Pregunta**: ¿Qué emails transaccionales necesitas?
- **Tipo**: `string` (lista separada por `+`)
- **Opciones**: `verify`, `welcome`, `reset`, `invoice`, `notification`
- **Default**: `verify+reset`
- **Afecta**: Templates en `lib/email/`, triggers en `lib/notifications/triggers.ts`

### Q9 — Analytics

- **Pregunta**: ¿Qué herramienta de analytics usarás?
- **Tipo**: `enum | null`
- **Opciones**: `gtm`, `ga4`, `plausible`, `umami`, `none`
- **Default**: `none`
- **Afecta**: `.env.local`, scripts de tracking

### Q10 — Error tracking

- **Pregunta**: ¿Qué herramienta de error tracking usarás?
- **Tipo**: `enum | null`
- **Opciones**: `sentry`, `highlight`, `logrocket`, `none`
- **Default**: `none`
- **Afecta**: `.env.local`, integración

---

## Bloque C — Dominio (refinable)

Estas preguntas son **opcionales** y refinables en Fase 1. Sirven para dimensionar el alcance inicial.

### Q11 — Entidades de dominio

- **Pregunta**: ¿Qué entidades de negocio tiene el proyecto?
- **Tipo**: `string[]`
- **Ejemplo**: `["rutinas", "ejercicios", "progresos", "clientes"]`
- **Default**: `[]`
- **Afecta**: `lib/db/schema.ts`, `lib/db/queries/`

### Q12 — Relaciones entre entidades

- **Pregunta**: ¿Cuáles son las relaciones entre entidades?
- **Tipo**: `Record<string, string[]>` (formato `hasMany:entidad` o `belongsTo:entidad`)
- **Ejemplo**: `{ "rutinas": ["hasMany:ejercicios"], "clientes": ["hasMany:rutinas"] }`
- **Default**: `{}`
- **Afecta**: Foreign keys en schema

### Q13 — Roles de usuario

- **Pregunta**: ¿Qué roles de usuario necesitas?
- **Tipo**: `string[]`
- **Ejemplo**: `["USER", "TRAINER", "ADMIN"]`
- **Default**: `["USER", "ADMIN"]`
- **Afecta**: RBAC, guards, UI condicional

### Q14 — Páginas públicas

- **Pregunta**: ¿Qué páginas públicas necesitas?
- **Tipo**: `string[]`
- **Opciones**: `home`, `pricing`, `about`, `blog`, `shop`, `contact`, `faq`, `docs`
- **Default**: `["home"]`
- **Afecta**: `app/(public)/`, routing

### Q15 — Métricas del dominio

- **Pregunta**: ¿Qué métricas clave quiere ver en el dashboard?
- **Tipo**: `object { metrics: string[] }`
- **Ejemplo**: `{ "metrics": ["clientes_activos", "rutinas_creadas", "tasa_completado"] }`
- **Default**: `{ "metrics": [] }`
- **Afecta**: Dashboard cards, queries de agregación

---

## Template de answers.json

Copia este template y completa tus respuestas:

```json
{
  "Q1": "",
  "Q2": "",
  "Q3": "none",
  "Q4": { "primary": "#6366f1", "primaryDark": "#4f46e5" },
  "Q5": { "lang": "es", "timezone": "UTC" },
  "Q6": ["cms", "push", "notifications"],
  "Q7": "none",
  "Q8": "verify+reset",
  "Q9": "none",
  "Q10": "none",
  "Q11": [],
  "Q12": {},
  "Q13": ["USER", "ADMIN"],
  "Q14": ["home"],
  "Q15": { "metrics": [] }
}
```

### Uso

```bash
# Guardar como blueprint/answers.json y ejecutar:
node scripts/init-project.mjs --from-blueprint blueprint/answers.json
```

### Validación mínima

El script valida que existan: `Q1` (string no vacío), `Q3` (enum válido). Los demás campos son opcionales con defaults.
