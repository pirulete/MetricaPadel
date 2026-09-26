# Feature Spec — Eliminar tema "gratuito"/"gratis" del home page

> status: proposed
> release: v0.4
> date: 2026-09-24
> change_id: remove-gratuito-home
> module: marketing
> tags: [ui, copy, landing]

## Problema

El home page (landing) comunica un posicionamiento de precio ("Gratuito para alumnos", "Crear mi cuenta gratis") que ya no refleja la propuesta de valor del producto. El commit `26ac2a5` ("fix: landing text — 'Gratuito para alumnos' + CTA 'Empezar'") ajustó parcialmente el hero, pero quedaron menciones residuales de "gratis"/"gratuito" en el fallback estático y en el seed del CMS. El mensaje debe enfocarse en valor (evaluación, evolución, cursos), no en precio.

## Objetivo

Eliminar toda mención de "gratuito"/"gratis" del home page (código + seed), reemplazándola por copy orientado a valor, sin cambiar la estructura visual ni la lógica de negocio.

## Alcance

### Archivos a tocar

| Archivo | Cambio |
|---------|--------|
| `app/(public)/page.tsx` | L86: badge hero `Gratuito para alumnos` → copy de valor (ej: `Para coaches y academias`). L174: CTA `Crear mi cuenta gratis` → `Crear mi cuenta` |
| `scripts/seed-marketing.ts` | L78: CTA hero seed `Empezar gratis` → `Empezar` (evita reintroducir el término en DB al re-seedear) |

### Textos afectados (3 ocurrencias en código)

1. `app/(public)/page.tsx:86` — `Gratuito para alumnos`
2. `app/(public)/page.tsx:174` — `Crear mi cuenta gratis`
3. `scripts/seed-marketing.ts:78` — `Empezar gratis`

### Verificado limpio (sin cambios)

- `components/layout/header.tsx` — sin menciones (Entrar / Registrarse)
- `components/layout/footer.tsx` — sin menciones
- `components/marketing/blocks/*` — sin menciones de "gratis"/"gratuito" en código

## Acceptance Criteria

1. **Cero ocurrencias en código**: `rg -i "gratis|gratuito" app/\(public\)/page.tsx scripts/seed-marketing.ts` devuelve 0 resultados.
2. **Badge hero sin precio**: el badge del hero muestra copy de valor (no "Gratuito para alumnos") y el CTA final muestra `Crear mi cuenta` (sin "gratis").
3. **Seed no reintroduce el término**: tras ejecutar `pnpm run seed:marketing` en DB vacía, la home CMS no contiene "gratis"/"gratuito" en ninguna sección.
4. **E2E de regresión de copy**: test en `tests/e2e/` (nuevo o extendiendo `marketing-public.spec.ts`) que navega a `/` y verifica que el texto visible NO contiene "gratis" ni "gratuito" y sí contiene el nuevo CTA.
5. **Sin regresión visual**: el fallback estático y la home CMS renderizan sin errores (typecheck + build + E2E existentes pasan).

## Edge Cases

- **Home CMS existente en DB**: si la página `home` ya existe publicada (ej: creada por seed previo), el home visible es el CMS y el cambio en `page.tsx` no aplica. El "Empezar gratis" persistirá en DB hasta editar el contenido vía admin o re-seedear. → Documentar como paso de rollout, no como cambio de código.
- **Pricing block "$0"**: el seed incluye un bloque `pricing` con plan Starter `$0`. Es contenido demo genérico (Acme), no copy padel. Se considera parte del "tema gratis" solo si el usuario lo confirma; por defecto queda **out-of-scope**.
- **Variantes case-insensitive**: verificar con `rg -i` para cubrir "Gratis", "GRATIS", "Gratuito", "gratuito".
- **Término "free" en inglés**: no presente en el home; no aplica.
- **Otras páginas**: login/register/blog/shop no contienen "gratis" (grep global solo arrojó los 3 matches del alcance). No se tocan.

## Out-of-scope

- Cambios al modelo de precios, planes o lógica de billing.
- Edición del contenido CMS en DB de producción (se hace vía admin, no código) — solo se documenta como rollout.
- Bloque `pricing` del seed (plan `$0`) salvo confirmación explícita del usuario.
- Otras páginas públicas (login, register, blog, shop).
- Header/footer (ya limpios).

## Dependencias

- Ninguna técnica. El cambio es copy-only en 2 archivos.
- Rollout: si existe home CMS publicada con "Empezar gratis", actualizar su hero vía admin o re-ejecutar seed.

## Tests requeridos

- **Unit (Jest)**: no aplica lógica de negocio nueva; opcional test de snapshot del fallback si existe infraestructura.
- **API (Playwright)**: no aplica (sin endpoints nuevos).
- **E2E (Playwright)**: 1 test en `tests/e2e/` (extender `marketing-public.spec.ts` o nuevo `home-copy.spec.ts`) verificando ausencia de "gratis"/"gratuito" y presencia del nuevo CTA en `/`.

## Implementación sugerida (para @app-engineer)

- Reemplazar texto en `page.tsx` L86 y L174; reemplazar en `seed-marketing.ts` L78.
- Correr `rg -i "gratis|gratuito"` sobre los archivos del alcance para validar AC1.
- Extender/crear E2E y correr `pnpm run test:e2e` + `npx tsc --noEmit` + `pnpm run lint`.