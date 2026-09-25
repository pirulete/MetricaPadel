# Release Scope — P0 Core + P1 Course Management

> **Change ID:** p0-core-p1-courses | **Release:** v0.5 | **Date:** 2026-09-25

## Scope Summary

| Feature | Priority | Files Changed | New Files | API Changes | DB Changes |
|---------|----------|---------------|-----------|-------------|------------|
| P0.1 Logout | P0 | 2 | 0 | None | None |
| P0.2 Desktop Sidebar | P0 | 1 | 1 | None | None |
| P0.3 Login Logging | P0 | 1 | 0 | None | None |
| P1.1 Edit Course | P1 | 1 | 1 | None | None |
| P1.2 Archive Course | P1 | 1 | 0 | None | None |
| P1.3 Empty Courses | P1 | 1 | 0 | None | None |
| **TOTAL** | | **7 modified** | **2 new** | **0** | **0** |

## Dependency Graph

```
P0.3 (auth logging) ← standalone, no dependencies
P0.1 (logout) ← depends on next-auth/react (already installed)
P0.2 (sidebar) ← depends on shadcn/ui Sidebar (already installed)
P1.1 (edit course) ← depends on existing PUT /api/courses/[id]
P1.2 (archive course) ← depends on existing DELETE /api/courses/[id]
P1.3 (empty list) ← standalone
```

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Sidebar breaks mobile layout | Medium | Test responsive breakpoints; bottom-nav preserved |
| Logout doesn't clear session | Low | signOut from next-auth handles cookie cleanup |
| Edit modal reuses wrong schema | Low | Verify Zod schema matches API contract |

## Deployment Notes

- No DB migrations needed
- No new env vars needed
- No new API endpoints needed
- All changes are UI + logging only
