# Ponytail Review Report — P0+P1 Core + Course Management

**Date:** 2026-09-25
**Reviewer:** @ponytail-reviewer
**Change ID:** 2026-09-25-p0-core-p1-courses

## Cambios Revisados

| Archivo | Acción | Líneas antes → después |
|---------|--------|----------------------|
| `components/layout/app-sidebar.tsx` | Refactorizado | 138 → 121 |
| `components/layout/app-layout-client.tsx` | Sin cambios | 26 |
| `components/padel/edit-course-modal.tsx` | Sin cambios | 152 |
| `app/(app)/layout.tsx` | Sin cambios | 13 |
| `components/layout/header-with-notifications.tsx` | Simplificado | 32 → 32 |
| `components/padel/profile-form.tsx` | Sin cambios | 213 |
| `components/padel/course-detail.tsx` | Sin cambios | 247 |
| `auth.ts` | Limpiado | 263 → 261 |
| `lib/constants/navigation.ts` | **NUEVO** (const compartida) | 0 → 21 |
| `components/padel/bottom-nav.tsx` | Refactorizado | 60 → 42 |

## Abstracciones Eliminadas o Simplificadas

### 1. DRY: Nav items duplicados → const compartida
**Peldaño: Dependencias Existentes** — Los arrays `ADMIN_ITEMS`/`USER_ITEMS` estaban idénticos en `app-sidebar.tsx` y `bottom-nav.tsx`. Extraídos a `lib/constants/navigation.ts` como `ADMIN_NAV_ITEMS`/`USER_NAV_ITEMS` con tipo `NavItem`. Eliminada 18 líneas de duplicación.

### 2. Logout redundante en header (desktop)
**Peldaño: YAGNI** — El header mostraba botón de logout en desktop donde el sidebar ya tiene uno. Agregado `md:hidden` al botón del header. En desktop solo hay 1 logout (sidebar); en mobile, 1 logout (header). Zero overengineering.

### 3. Debug console.log en auth.ts
**Peldaño: YAGNI** — 2 líneas `console.log` agregadas al diff para debugging (`Usuario no encontrado`, `Cuenta LOCKED`). El caller ya loguea el resultado. Eliminadas — no aportan valor en producción.

## Líneas Eliminadas vs Agregadas

| Concepción | Líneas |
|-----------|--------|
| Eliminadas (duplicación nav items) | -18 |
| Eliminadas (debug console.log) | -2 |
| Eliminadas (imports no usados en sidebar) | -7 |
| Agregadas (navigation.ts const) | +21 |
| **Net** | **-6** ✅ |

## Beneficio en Mantenibilidad

- **Nav items centralizados**: cambiar un ítem de navegación ahora es un solo edit en `lib/constants/navigation.ts`, no 2 archivos sincronizados manualmente.
- **Logout no duplicado**: UX limpia — 1 punto de logout por breakpoint, no 2 visibles simultáneamente.
- **auth.ts más limpio**: 2 líneas de debug noise eliminadas del hot path de autenticación.

## Excepciones

Ninguna. Todos los archivos están bajo 500 líneas. No se eliminó lógica de negocio. No se agregaron dependencias.
