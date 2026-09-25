# Technical Design — P0 Core + P1 Course Management

> **Change ID:** p0-core-p1-courses | **Release:** v0.5

## Architecture Decisions

1. **Sidebar:** Use shadcn/ui `Sidebar` component (already installed in `components/ui/sidebar.tsx`). Wrap `(app)` layout with `SidebarProvider`.
2. **Logout:** Use `signOut` from `next-auth/react` (client component). No need to call custom `/api/auth/logout` route.
3. **Edit Course Modal:** Create new `EditCourseModal` component reusing Zod schema from `lib/validations/padel.ts`.
4. **No DB changes, no new endpoints, no new env vars.**

## Files to Modify

| File | Change | Feature |
|------|--------|---------|
| `app/(app)/layout.tsx` | Wrap with `SidebarProvider` + add `AppSidebar` | P0.2 |
| `components/layout/header-with-notifications.tsx` | Add user dropdown with logout | P0.1 |
| `components/padel/profile-form.tsx` | Add logout button at bottom | P0.1 |
| `auth.ts` | Add 2 console.log lines for diagnostics | P0.3 |
| `components/padel/course-detail.tsx` | Add "Editar" + "Archivar" buttons | P1.1, P1.2 |
| `app/(app)/cursos/page.tsx` | Add empty state when no courses | P1.3 |

## New Files

| File | Purpose | Feature |
|------|---------|---------|
| `components/layout/app-sidebar.tsx` | Desktop sidebar navigation | P0.2 |
| `components/padel/edit-course-modal.tsx` | Edit course form modal | P1.1 |

## Agent Assignment

| Agent | Responsibility |
|-------|---------------|
| @app-engineer | P0.1, P0.2, P1.1, P1.2, P1.3 (all UI) |
| @auth-security | P0.3 (logging only, no security impact) |

## API Contracts

No new endpoints. Existing endpoints used:
- `PUT /api/courses/[id]` — edit course (already exists)
- `DELETE /api/courses/[id]` — archive course (already exists)
- `signOut` from next-auth — logout (already exists)

## Testing Strategy

- **Unit:** Schema validation for edit course form
- **E2E:** Logout flow, sidebar navigation, edit course, archive course
