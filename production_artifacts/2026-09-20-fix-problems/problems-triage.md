# Problems Triage — 2026-09-20

## Error Summary

**Runtime DB connection failure** when NeonDB is unreachable. The app crashes on any public page because the layout eagerly queries the database.

## Errors by Type

### 1. Runtime — DB Connection Failure (HIGH)

**Error:**
```
password authentication failed for user 'user'
at async getPageBySlug (lib/db/queries/marketing/pages.ts:25:16)
at async DynamicPage (app/(public)/[slug]/page.tsx:30:16)
```

**Root Cause:**
- `lib/db/index.ts` creates an **eager Pool** at module import time (line 5)
- `app/(public)/layout.tsx` calls `getCachedNavigation()` → `getSettingsMap()` → DB query
- When NeonDB endpoint is unreachable, the Pool is created but all queries fail at runtime

**Affected Files:**
| File | Impact |
|------|--------|
| `lib/db/index.ts:5` | Eager Pool creation at import time |
| `app/(public)/layout.tsx:12` | DB query in layout (affects ALL public pages) |

**Risk Classification:** LOW — fix is local, no contract changes

## Fix Proposal

### Group 1: Lazy DB Pool Initialization
**File:** `lib/db/index.ts`
**Action:** Convert eager Pool to lazy initialization using getter function

### Group 2: Graceful Fallback in Layout
**File:** `app/(public)/layout.tsx`
**Action:** Add try/catch with fallback to DEFAULT_NAVIGATION when DB is unreachable

## Test Matrix

| Test | Type | Expected |
|------|------|----------|
| Typecheck | `npx tsc --noEmit` | 0 errors |
| Lint | `pnpm run lint` | 0 errors |
| Build | `pnpm run build` | Success |
| Unit tests | `pnpm run test:unit` | Pass |
