# Project Blueprint

## Que es

El blueprint es un sistema de scaffolding que reduce el setup de un nuevo proyecto desde `skeleton_base` de ~2 horas a <5 minutos. Consta de un questionnaire de 15 preguntas + script de scaffolding + 5 templates de proyecto (patterns).

## Cómo usarlo

### 1. Responder el questionnaire

Abre `blueprint/questionnaire.md` y completa las 15 preguntas. Las respuestas van en un archivo JSON:

```bash
cp blueprint/answers-example.json blueprint/answers.json
# Editar blueprint/answers.json con tus respuestas
```

### 2. Ejecutar init-project.mjs

```bash
# Opcion A: desde answers.json
node scripts/init-project.mjs --from-blueprint blueprint/answers.json

# Opcion B: con flags directos
node scripts/init-project.mjs --name "mi-app" --pattern saas --lang es

# Opcion C: solo ver que haria (dry-run)
node scripts/init-project.mjs --from-blueprint blueprint/answers.json --dry-run
```

### 3. Verificar

```bash
cd ../mi-app
npx tsc --noEmit
pnpm run lint
node scripts/validate-harness.js --all
```

### 4. Empezar Fase 1

Seguir `production_artifacts/2026-08-23-new-project/new-project-plan.md` - Fase 1 (Core domain).

## Ejemplo rapido - FitTracker (SaaS fitness)

| # | Pregunta | Respuesta |
|---|----------|-----------|
| Q1 | Nombre | fit-tracker |
| Q2 | Descripcion | Plataforma SaaS para entrenadores fitness |
| Q3 | Pattern | saas |
| Q4 | Colores | primary: #2563eb, primaryDark: #1d4ed8 |
| Q5 | Locale | lang: es, timezone: America/Argentina/Buenos_Aires |
| Q6 | Features | cms, push, notifications |
| Q7 | Pagos | stripe |
| Q8 | Emails | welcome + reset |
| Q9 | Analytics | gtm |
| Q10 | Error tracking | sentry |
| Q11 | Entidades | rutinas, ejercicios, progresos, clientes |
| Q12 | Relaciones | rutinas hasMany ejercicios, clientes hasMany rutinas |
| Q13 | Roles | USER, TRAINER, ADMIN |
| Q14 | Paginas publicas | home, pricing, about, blog |
| Q15 | Metricas | clientes_activos, rutinas_creadas, tasa_completado |

Ver `blueprint/answers-example.json` para el JSON completo.

## Patrones disponibles

| Pattern | Tablas | Paginas | Uso ideal |
|---------|--------|---------|-----------|
| saas | plans, subscriptions, projects, api_keys | /pricing, /dashboard/projects, /dashboard/billing, /dashboard/api-keys | SaaS con suscripciones y planes |
| ecommerce | products, orders, order_items, carts | /shop, /product/[slug], /cart, /account/orders | Tienda online |
| blog | posts, post_categories, post_tags, comments | /blog, /blog/[slug], /admin/posts, /admin/comments | Blog o revista digital |
| services | services, providers, bookings, reviews | /services, /services/[slug], /account/bookings | Plataforma de servicios reservables |
| education | courses, lessons, enrollments, quizzes | /courses, /courses/[slug], /learn/[courseSlug], /account/courses | Plataforma educativa / LMS |
| none | - | - | Skeleton base sin dominio predefinido |

## Preguntas frecuentes

### Puedo agregar un pattern despues de clonar?

Si. El pattern solo agrega archivos nuevos (schema append, queries, API, UI). Puedes ejecutar `init-project.mjs --pattern <name>` en un clon existente o agregar los snippets manualmente desde `blueprint/patterns/<name>.md`.

### Que pasa si no respondo las preguntas de dominio (Q11-Q15)?

Nada. Son opcionales y refinables en Fase 1. El script genera el clon con el pattern seleccionado (o sin pattern) y puedes agregar entidades despues.

### Puedo usar el blueprint sin el script?

Si. Copia `blueprint/answers-example.json` como referencia y sigue la guia manual en `QUICKSTART.md` o `clone-guide.md`.

### Que features del skeleton vienen incluidas por defecto?

Auth completo, marketing CMS (10 block types), push notifications, inbox, terms & conditions, avatar, rate limiting, audit logging, quality gates y agent team. Q6 permite desactivar lo que no necesites.

### Como agrego un pattern nuevo?

1. Crear `blueprint/patterns/<name>.md` con schema, queries, API, UI, tests, triggers
2. Agregar snippets en `blueprint/templates/*-snippets.ts`
3. Agregar entry en el JSON de `blueprint/config-mapping.md`
4. No hay que modificar el script (es data-driven)

### Que pasa si mi proyecto no es ningun pattern?

Usa `--pattern none` o `"Q3": "none"`. El clon tendra el skeleton base sin dominio predefinido. Puedes construir tu dominio desde cero en Fase 1.

### Donde reporto bugs del script?

En el repositorio del proyecto, bajo issues. Inclui el output completo de `init-project.mjs` y tu `answers.json`.

## Referencias

- `QUICKSTART.md` - Guia minima de setup manual
- `production_artifacts/2026-08-23-clone-skeleton/clone-guide.md` - Guia detallada de clonacion
- `production_artifacts/2026-08-23-new-project/new-project-plan.md` - Plan por fases de un proyecto real
- `blueprint/questionnaire.md` - Las 15 preguntas
- `blueprint/config-mapping.md` - Mapeo respuestas a acciones
- `production_artifacts/2026-09-16-project-blueprint/feature-spec.md` - Spec de la feature
- `production_artifacts/2026-09-16-project-blueprint/technical-design.md` - Diseno tecnico
