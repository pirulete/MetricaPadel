# Feature Spec — P0 Core + P1 Course Management

> **Status:** proposed | **Release:** v0.5 | **Date:** 2026-09-25 | **Change ID:** `p0-core-p1-courses` | **Module:** dashboard | **Tags:** [ui, auth, navigation, courses]

## Problema

La app Metrica Pádel tiene el mínimo viable pero carece de features core que impiden el uso diario:
- No hay forma de cerrar sesión desde la UI
- No hay navegación en desktop (solo bottom-nav en mobile)
- El login en producción falla silenciosamente cuando la cuenta está LOCKED o no existe
- Los coaches no pueden editar ni archivar cursos desde la UI
- La lista de cursos no muestra estado vacío

## Objetivo

Hacer la app usable para coaches y alumnos con navegación completa, gestión de cursos funcional, y diagnóstico de auth robusto.

## Alcance

### P0.1 — Logout Button
- **Archivos:** `components/layout/header-with-notifications.tsx`, `components/padel/profile-form.tsx`
- **Cambio:** Agregar botón "Cerrar sesión" que llame `signOut` de next-auth/react → redirect a `/login`
- **Header:** Dropdown con avatar + nombre + opción logout
- **Perfil:** Botón logout al final del form

### P0.2 — Desktop Navigation (Sidebar)
- **Archivos:** `app/(app)/layout.tsx`, nuevo `components/layout/app-sidebar.tsx`
- **Cambio:** Sidebar colapsable con shadcn/ui Sidebar
- **Items ADMIN:** Inicio (Dashboard), Cursos, Evaluar, Historial, Perfil
- **Items USER:** Inicio (Dashboard), Cursos, Mis evaluaciones, Evolución, Perfil
- **Responsive:** Sidebar en md+, bottom-nav existente se mantiene en mobile
- **Estado:** Colapsado por defecto, expandible con toggle

### P0.3 — Fix Login Diagnostic Logging
- **Archivo:** `auth.ts`
- **Cambio:** Agregar console.log en líneas 39-41 (usuario no encontrado) y 46-48 (cuenta LOCKED)
- **Sin cambio de comportamiento**, solo logging diagnóstico

### P1.1 — Edit Course
- **Archivos:** `components/padel/course-detail.tsx`, nuevo `components/padel/edit-course-modal.tsx`
- **Cambio:** Modal/Sheet con formulario de edición (nombre, nivel, horario, días)
- **API existente:** PUT `/api/courses/[id]`
- **Schema:** Reutilizar Zod schema de CreateCourseModal

### P1.2 — Archive Course
- **Archivo:** `components/padel/course-detail.tsx`
- **Cambio:** Botón "Archivar" con AlertDialog de confirmación
- **API existente:** DELETE `/api/courses/[id]`
- **Post-redirect:** Redirige a `/cursos`

### P1.3 — Empty Course List
- **Archivo:** `app/(app)/cursos/page.tsx`
- **Cambio:** Estado vacío cuando no hay cursos: illustration + CTA "Crear primer curso"
- **Reutilizar:** Patrón de `components/notifications/empty-state.tsx`

## Acceptance Criteria

### P0.1 — Logout
1. Botón visible en header del área privada (dropdown con avatar)
2. Botón visible en perfil/settings
3. Click → `signOut()` → redirect a `/login`
4. Sesión eliminada de DB (sessions table)

### P0.2 — Desktop Sidebar
1. Sidebar visible en desktop (md+) con items de navegación
2. Items correctos según rol (ADMIN vs USER)
3. Click en item → navegación a la ruta correspondiente
4. Sidebar colapsable/expandible
5. Bottom-nav sigue funcionando en mobile (sm)
6. Active state.highlighted en el item actual

### P0.3 — Login Logging
1. Si usuario no existe en DB → log "[auth] Usuario no encontrado: email"
2. Si cuenta LOCKED → log "[auth] Cuenta LOCKED: email"
3. Login exitoso sigue funcionando igual

### P1.1 — Edit Course
1. Botón "Editar" visible en course-detail para coaches
2. Click → abre modal con datos actuales del curso
3. Submit → PUT /api/courses/[id] → curso actualizado
4. Cierre de modal → refresca datos del curso

### P1.2 — Archive Course
1. Botón "Archivar" visible en course-detail para coaches
2. Click → AlertDialog con confirmación
3. Confirmar → DELETE /api/courses/[id] → redirect a /cursos
4. Curso aparece como archived (no visible en listado activo)

### P1.3 — Empty Course List
1. Cuando no hay cursos → muestra estado vacío con CTA
2. CTA → abre CreateCourseModal

## Edge Cases

- **P0.1:** Logout con sesión expirada → redirigir a login sin error
- **P0.2:** Usuario temporal (TEMPORARY) → solo ver "Verifica tu email"
- **P0.2:** Admin en /admin → sidebar se mantiene, items de admin disponibles
- **P1.1:** Curso con estudiantes inscritos → puede editar nombre/nivel pero no borrar
- **P1.2:** Curso con evaluaciones publicadas → archivar pero no borrar (soft delete)
- **P1.3:** Primera carga después de registro → mostrar empty state

## Out-of-scope

- Modelo de academia/club (P3)
- Super admin role (P2)
- Audit logs viewer (P2)
- Session management (P2)
- Admin dashboard analytics (P2)
- Bulk student operations
- Course calendar view
- Course duplication
- Cambios de schema/DB
- Nuevos endpoints API

## Tests requeridos

- **Unit:** P0.3 (logging), P1.1 (schema validación)
- **API:** No aplica (no hay nuevos endpoints)
- **E2E:** P0.1 (logout flow), P0.2 (navigation), P1.1 (edit course), P1.2 (archive course)
