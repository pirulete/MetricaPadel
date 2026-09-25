# Change Map — P0 Core + P1 Course Management

> **Change ID:** p0-core-p1-courses

## Execution Order

| Step | Agent | File | Action |
|------|-------|------|--------|
| 1 | @app-engineer | `auth.ts` | P0.3: Add diagnostic logging (2 lines) |
| 2 | @app-engineer | `components/layout/app-sidebar.tsx` | P0.2: NEW — Sidebar navigation component |
| 3 | @app-engineer | `app/(app)/layout.tsx` | P0.2: Wrap with SidebarProvider + AppSidebar |
| 4 | @app-engineer | `components/layout/header-with-notifications.tsx` | P0.1: Add user dropdown with logout |
| 5 | @app-engineer | `components/padel/profile-form.tsx` | P0.1: Add logout button |
| 6 | @app-engineer | `components/padel/edit-course-modal.tsx` | P1.1: NEW — Edit course modal |
| 7 | @app-engineer | `components/padel/course-detail.tsx` | P1.1+P1.2: Add edit + archive buttons |
| 8 | @app-engineer | `app/(app)/cursos/page.tsx` | P1.3: Add empty state |

## Impact Analysis

- **Auth:** No changes (P0.3 is logging only)
- **DB:** No changes
- **API:** No new endpoints
- **Tests:** E2E tests for logout, navigation, edit/archive course
- **Build:** No impact (all client components)
